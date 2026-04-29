import * as vscode from 'vscode';

import {
  readContinueConfig,
  getChatModels,
  findModelByTitle,
  type ContinueModel,
} from '../services/continueConfigReader';
import { getChatCompletion } from '../services/continueApiClient';
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
      'Continue Commit: Could not read ~/.continue/config.json (or config.yaml). ' +
      'Make sure Continue.dev is installed and has been configured at least once.'
    );
    return;
  }

  const chatModels = getChatModels(continueConfig);
  if (chatModels.length === 0) {
    vscode.window.showErrorMessage(
      'Continue Commit: No chat models are configured in your Continue config. ' +
      'Add a model under the "models" key in ~/.continue/config.json (or config.yaml).'
    );
    return;
  }

  // ── 3. Model selection ────────────────────────────────────────────────────
  let selectedModel: ContinueModel | undefined;

  if (showModelPicker) {
    selectedModel = await pickModel(chatModels);
    if (!selectedModel) {
      return; // user cancelled the QuickPick
    }
  } else if (preferredModel) {
    selectedModel = findModelByTitle(chatModels, preferredModel);
    if (!selectedModel) {
      Logger.log(
        `Preferred model "${preferredModel}" not found in config — using first available.`
      );
    }
  }

  selectedModel ??= chatModels[0];
  Logger.log(
    `Selected model: "${selectedModel.title ?? selectedModel.name}" (${selectedModel.provider} / ${selectedModel.model})`
  );

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

        const generated = await getChatCompletion({
          model: selectedModel!,
          messages,
          maxTokens,
        });

        setCommitMessage(repo, generated);
        Logger.log(`Commit message generated (${generated.length} chars).`);

        vscode.window.showInformationMessage(
          `Continue Commit: Message generated using "${selectedModel!.title ?? selectedModel!.name}" ✓`
        );
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
