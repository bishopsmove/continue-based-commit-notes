import * as assert from 'assert';
import {
  hasStagedChanges,
  hasAnyChanges,
  getCurrentBranch,
  setCommitMessage,
} from '../../src/services/gitService';
import type { Repository } from '../../typings/git';

// ---------------------------------------------------------------------------
// Helpers — build lightweight mock repositories
// ---------------------------------------------------------------------------

type RepoOpts = {
  indexChanges?: unknown[];
  workingTreeChanges?: unknown[];
  headName?: string;
};

function mockRepo(opts: RepoOpts = {}): Repository {
  return {
    rootUri: {} as never,
    diff: async (_cached?: boolean) => 'mock diff content',
    inputBox: { value: '', enabled: true },
    state: {
      HEAD: opts.headName ? { type: 0, name: opts.headName } : undefined,
      refs: [],
      indexChanges: (opts.indexChanges ?? []) as never[],
      workingTreeChanges: (opts.workingTreeChanges ?? []) as never[],
      mergeChanges: [],
    },
  };
}

// ---------------------------------------------------------------------------
// hasStagedChanges
// ---------------------------------------------------------------------------

suite('gitService — hasStagedChanges', () => {
  test('returns true when indexChanges is non-empty', () => {
    const repo = mockRepo({ indexChanges: [{}] });
    assert.strictEqual(hasStagedChanges(repo), true);
  });

  test('returns false when indexChanges is empty', () => {
    const repo = mockRepo({ indexChanges: [] });
    assert.strictEqual(hasStagedChanges(repo), false);
  });

  test('returns false when only workingTreeChanges exist', () => {
    const repo = mockRepo({ workingTreeChanges: [{}] });
    assert.strictEqual(hasStagedChanges(repo), false);
  });
});

// ---------------------------------------------------------------------------
// hasAnyChanges
// ---------------------------------------------------------------------------

suite('gitService — hasAnyChanges', () => {
  test('returns true when there are staged changes', () => {
    assert.ok(hasAnyChanges(mockRepo({ indexChanges: [{}] })));
  });

  test('returns true when there are working-tree changes', () => {
    assert.ok(hasAnyChanges(mockRepo({ workingTreeChanges: [{}] })));
  });

  test('returns true when both staged and unstaged changes exist', () => {
    assert.ok(
      hasAnyChanges(mockRepo({ indexChanges: [{}], workingTreeChanges: [{}] }))
    );
  });

  test('returns false when neither staged nor unstaged changes exist', () => {
    assert.strictEqual(hasAnyChanges(mockRepo()), false);
  });
});

// ---------------------------------------------------------------------------
// getCurrentBranch
// ---------------------------------------------------------------------------

suite('gitService — getCurrentBranch', () => {
  test('returns the branch name when HEAD is set', () => {
    const repo = mockRepo({ headName: 'feature/my-feature' });
    assert.strictEqual(getCurrentBranch(repo), 'feature/my-feature');
  });

  test('returns "unknown" when HEAD is undefined', () => {
    const repo = mockRepo();
    assert.strictEqual(getCurrentBranch(repo), 'unknown');
  });

  test('returns the branch name for "main"', () => {
    assert.strictEqual(getCurrentBranch(mockRepo({ headName: 'main' })), 'main');
  });
});

// ---------------------------------------------------------------------------
// setCommitMessage
// ---------------------------------------------------------------------------

suite('gitService — setCommitMessage', () => {
  test('writes the message into inputBox.value', () => {
    const repo = mockRepo();
    setCommitMessage(repo, 'feat: add awesome feature');
    assert.strictEqual(repo.inputBox.value, 'feat: add awesome feature');
  });

  test('overwrites any existing inputBox value', () => {
    const repo = mockRepo();
    repo.inputBox.value = 'old message';
    setCommitMessage(repo, 'fix: correct typo');
    assert.strictEqual(repo.inputBox.value, 'fix: correct typo');
  });

  test('accepts a multi-line commit message', () => {
    const repo = mockRepo();
    const msg = 'feat: add login\n\nCloses #42';
    setCommitMessage(repo, msg);
    assert.strictEqual(repo.inputBox.value, msg);
  });
});
