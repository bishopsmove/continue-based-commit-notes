import * as vscode from 'vscode';
import type { GitExtension, Repository } from '../../typings/git';
import { Logger } from '../utils/logger';

export type { Repository };

// ---------------------------------------------------------------------------
// Repository access
// ---------------------------------------------------------------------------

/**
 * Returns the first git repository found in the current workspace,
 * or `null` if the git extension is unavailable or no repo is open.
 */
export function getGitRepository(): Repository | null {
  try {
    const ext = vscode.extensions.getExtension<GitExtension>('vscode.git');
    if (!ext) {
      Logger.log('vscode.git extension not found.');
      return null;
    }
    if (!ext.isActive) {
      Logger.log('vscode.git extension is not yet active.');
      return null;
    }
    const api = ext.exports.getAPI(1);
    const repo = api.repositories[0];
    if (!repo) {
      Logger.log('No git repository found in the workspace.');
    }
    return repo ?? null;
  } catch (err) {
    Logger.error('Failed to access the vscode.git extension', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Change detection
// ---------------------------------------------------------------------------

/** Returns `true` when there are changes staged for commit (the index). */
export function hasStagedChanges(repo: Repository): boolean {
  return repo.state.indexChanges.length > 0;
}

/** Returns `true` when there are any changes — staged or unstaged. */
export function hasAnyChanges(repo: Repository): boolean {
  return (
    repo.state.indexChanges.length > 0 ||
    repo.state.workingTreeChanges.length > 0
  );
}

// ---------------------------------------------------------------------------
// Diff retrieval
// ---------------------------------------------------------------------------

/**
 * Returns the diff to use as context for generation.
 *
 * Prefers the staged diff (`git diff --cached`) because it represents exactly
 * what will be committed. Falls back to the full working-tree diff when
 * nothing is staged, warning the user.
 */
export async function getStagedDiff(repo: Repository): Promise<string> {
  if (hasStagedChanges(repo)) {
    Logger.log('Using staged diff (git diff --cached).');
    return repo.diff(true);
  }

  Logger.log('No staged changes — using working-tree diff (git diff).');
  vscode.window.showWarningMessage(
    'Continue Commit: No staged changes found. Using all working-tree changes as context.'
  );
  return repo.diff(false);
}

// ---------------------------------------------------------------------------
// Commit message
// ---------------------------------------------------------------------------

/** Writes `message` into the SCM input box so the user can review/edit before committing. */
export function setCommitMessage(repo: Repository, message: string): void {
  repo.inputBox.value = message;
}

// ---------------------------------------------------------------------------
// Branch info
// ---------------------------------------------------------------------------

/** Returns the current branch name, or `'unknown'` when HEAD is detached / unavailable. */
export function getCurrentBranch(repo: Repository): string {
  return repo.state.HEAD?.name ?? 'unknown';
}
