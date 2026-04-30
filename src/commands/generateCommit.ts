import * as vscode from 'vscode';

import {
  readContinueConfig,
  getChatModels,
  findModelByTitle,
  type ContinueModel,
} from '../services/continueConfigReader';
import {
  getChatCompletion,
  ProviderUnavailableError,
  ModelNotFoundError,
} from '../services/continueApiClient';
import {
  getGitRepository,
  getStagedDiff,
  setCommitMessage,
  getCurrentBranch,
  hasAnyChanges,
} from '../services/gitService';
import { buildPrompt, type CommitStyle } from '../utils/promptBuilder';
import { Logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Fallback types (exported for testing)
// ---------------------------------------------------------------------------

export type FallbackMode =
  | { kind: 'picker' }
  | { kind: 'preferred'; preferredModel: ContinueModel }
  | { kind: 'default'; initialModel: ContinueModel };

export interface FallbackDeps {
  generate: (model: ContinueModel) => Promise<string>;
  pick: (models: ContinueModel[]) => Promise<ContinueModel | undefined>;
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

export interface GenerateResult {
  content: string;
  model: ContinueModel;
}

// ---------------------------------------------------------------------------
// generateWithFallback
// ---------------------------------------------------------------------------

export async function generateWithFallback(
  chatModels: ContinueModel[],
  mode: FallbackMode,
  deps: FallbackDeps
): Promise<GenerateResult | undefined> {

  if (mode.kind === 'picker') {
    while (true) {
      const model = await deps.pick(chatModels);
      if (!model) return undefined;

      try {
        const content = await deps.generate(model);
        return { content, model };
      } catch (err) {
        if (err instanceof ProviderUnavailableError) {
          deps.warn(
            `Provider "${err.provider}" is not available at ${err.apiBase}. Pick a different model.`
          );
        } else if (err instanceof ModelNotFoundError) {
          deps.warn(
            `Model "${model.title ?? model.model}" was not found on provider "${model.provider}". Pick a different model.`
          );
        } else {
          throw err;
        }
      }
    }
  }

  // ── Preferred and default paths: linear fallback walk ─────────────────────
  const unavailableProviders = new Set<string>();
  const providerKey = (m: ContinueModel): string => `${m.provider}|${m.apiBase ?? ''}`;

  const initialModel =
    mode.kind === 'preferred' ? mode.preferredModel : mode.initialModel;
  const isPreferred = mode.kind === 'preferred';
  const modelDisplayName = (m: ContinueModel): string =>
    m.title ?? m.name ?? '(untitled)';
  const initialLabel = isPreferred
    ? `Preferred model "${modelDisplayName(initialModel)}" — provider`
    : 'Provider';

  // Attempt the initial model
  try {
    const content = await deps.generate(initialModel);
    return { content, model: initialModel };
  } catch (err) {
    if (err instanceof ProviderUnavailableError) {
      deps.warn(
        `${initialLabel} "${err.provider}" is not available at ${err.apiBase}. Trying next available model…`
      );
      unavailableProviders.add(providerKey(initialModel));
    } else if (err instanceof ModelNotFoundError) {
      const modelLabel = isPreferred
        ? `Preferred model "${modelDisplayName(initialModel)}"`
        : `Model "${modelDisplayName(initialModel)}"`;
      deps.warn(
        `${modelLabel} was not found on provider "${err.provider}". Trying next available model…`
      );
    } else {
      throw err;
    }
  }

  // Walk remaining models
  for (const candidate of chatModels) {
    if (candidate === initialModel) continue;
    if (unavailableProviders.has(providerKey(candidate))) continue;

    try {
      const content = await deps.generate(candidate);
      return { content, model: candidate };
    } catch (err) {
      if (err instanceof ProviderUnavailableError) {
        unavailableProviders.add(providerKey(candidate));
      } else if (err instanceof ModelNotFoundError) {
        // continue to next candidate
      } else {
        throw err;
      }
    }
  }

  // All models exhausted
  deps.error(
    'Continue Commit: No configured models are responding. Check that your providers are running.'
  );
  return undefined;
}

// ---------------------------------------------------------------------------
// Command handlers (registered in extension.ts)
// ---------------------------------------------------------------------------

/**
 * Primary command — uses configured model (or auto-selects first available).
 * The model picker is shown only when `continueCommit.showModelPicker` is true.
 */
export async function generateCommitCommand(): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('continueCommit');
  await runGenerate(cfg.get<boolean>('showModelPicker', false));
}

/**
 * Secondary command — always shows the QuickPick model selector regardless
 * of the `showModelPicker` setting. Useful for one-off model overrides.
 */
export async function generateCommitWithPickerCommand(): Promise<void> {
  await runGenerate(true);
}

// ---------------------------------------------------------------------------
// Core generate flow
// ---------------------------------------------------------------------------

async function runGenerate(showModelPicker: boolean): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('continueCommit');
  const commitStyle = cfg.get<CommitStyle>('commitStyle', 'conventional');
  const preferredModel = cfg.get<string>('preferredModel', '');
  const maxTokens = cfg.get<number>('maxTokens', 256);

  // ── 1. Git repository ────────────────────────────────────────────────────
  const repo = getGitRepository();
  if (!repo) {
    vscode.window.showErrorMessage(
      'Continue Commit: No git repository found. Open a folder that contains a git repository.'
    );
    return;
  }

  if (!hasAnyChanges(repo)) {
    vscode.window.showWarningMessage(
      'Continue Commit: No changes detected. Make some edits or stage files first.'
    );
    return;
  }

  // ── 2. Continue config ────────────────────────────────────────────────────
  const continueConfig = readContinueConfig();
  if (!continueConfig) {
    vscode.window.showErrorMessage(
      'Continue Commit: Could not read ~/.continue/config.yaml (or config.json). ' +
      'Make sure Continue.dev is installed and has been configured at least once.'
    );
    return;
  }

  const chatModels = getChatModels(continueConfig);
  if (chatModels.length === 0) {
    vscode.window.showErrorMessage(
      'Continue Commit: No chat models are configured in your Continue config. ' +
      'Add a model under the "models" key in ~/.continue/config.yaml (or config.json).'
    );
    return;
  }

  // ── 3. Determine mode ─────────────────────────────────────────────────────
  let mode: FallbackMode;

  if (showModelPicker) {
    mode = { kind: 'picker' };
  } else if (preferredModel) {
    const found = findModelByTitle(chatModels, preferredModel);
    if (!found) {
      Logger.log(
        `Preferred model "${preferredModel}" not found in config — using first available.`
      );
    }
    mode = found
      ? { kind: 'preferred', preferredModel: found }
      : { kind: 'default', initialModel: chatModels[0] };
  } else {
    mode = { kind: 'default', initialModel: chatModels[0] };
  }

  // ── 4. Generate ───────────────────────────────────────────────────────────
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.SourceControl,
      title: 'Continue Commit: generating message…',
      cancellable: false,
    },
    async () => {
      try {
        const diff = await getStagedDiff(repo);

        if (!diff.trim()) {
          vscode.window.showWarningMessage(
            'Continue Commit: The diff came back empty. Try staging some changes first.'
          );
          return;
        }

        const branch = getCurrentBranch(repo);
        const messages = buildPrompt({ diff, style: commitStyle, branch });

        const result = await generateWithFallback(chatModels, mode, {
          generate: (model) => getChatCompletion({ model, messages, maxTokens }),
          pick: pickModel,
          warn: (msg) => { void vscode.window.showWarningMessage(msg); },
          error: (msg) => { void vscode.window.showErrorMessage(msg); },
        });

        if (result) {
          const name = result.model.title ?? result.model.name ?? '(untitled)';
          setCommitMessage(repo, result.content);
          Logger.log(`Commit message generated using "${name}" (${result.content.length} chars).`);
          vscode.window.showInformationMessage(
            `Continue Commit: Message generated using "${name}" ✓`
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        Logger.error('Generation failed', err);
        vscode.window.showErrorMessage(`Continue Commit: ${msg}`);
      }
    }
  );
}

// ---------------------------------------------------------------------------
// Model picker QuickPick
// ---------------------------------------------------------------------------

async function pickModel(
  models: ContinueModel[]
): Promise<ContinueModel | undefined> {
  const items = models.map(m => ({
    label: m.title || m.name || '(untitled model)',
    description: `${m.provider} / ${m.model}`,
    detail: m.apiBase ? `API base: ${m.apiBase}` : undefined,
    model: m,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a Continue model to generate the commit message',
    matchOnDescription: true,
    matchOnDetail: false,
  });

  return picked?.model;
}
