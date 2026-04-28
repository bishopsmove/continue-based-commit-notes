import * as assert from 'assert';
import { buildPrompt, truncateDiff } from '../../src/utils/promptBuilder';

const SAMPLE_DIFF = `diff --git a/src/main.ts b/src/main.ts
index abc123..def456 100644
--- a/src/main.ts
+++ b/src/main.ts
@@ -1,5 +1,6 @@
 import * as fs from 'fs';
+import * as path from 'path';

 export function main() {
-  console.log('hello');
+  console.log(path.join('hello', 'world'));
 }`;

suite('promptBuilder — buildPrompt', () => {
  test('returns exactly two messages', () => {
    const msgs = buildPrompt({ diff: SAMPLE_DIFF, style: 'conventional' });
    assert.strictEqual(msgs.length, 2);
  });

  test('first message has role "system"', () => {
    const msgs = buildPrompt({ diff: SAMPLE_DIFF, style: 'conventional' });
    assert.strictEqual(msgs[0].role, 'system');
  });

  test('second message has role "user"', () => {
    const msgs = buildPrompt({ diff: SAMPLE_DIFF, style: 'conventional' });
    assert.strictEqual(msgs[1].role, 'user');
  });

  test('conventional style mentions "Conventional Commits"', () => {
    const msgs = buildPrompt({ diff: SAMPLE_DIFF, style: 'conventional' });
    assert.ok(
      msgs[0].content.includes('Conventional Commits'),
      'System prompt should reference Conventional Commits'
    );
  });

  test('freeform style does NOT mention "Conventional Commits"', () => {
    const msgs = buildPrompt({ diff: SAMPLE_DIFF, style: 'freeform' });
    assert.ok(
      !msgs[0].content.includes('Conventional Commits'),
      'Freeform prompt should not reference Conventional Commits'
    );
  });

  test('user message contains the full diff inside a code fence', () => {
    const msgs = buildPrompt({ diff: SAMPLE_DIFF, style: 'conventional' });
    assert.ok(
      msgs[1].content.includes(SAMPLE_DIFF),
      'Diff should appear verbatim in the user message'
    );
  });

  test('branch name is included when provided and not "unknown"', () => {
    const msgs = buildPrompt({
      diff: SAMPLE_DIFF,
      style: 'conventional',
      branch: 'feature/add-path',
    });
    assert.ok(msgs[1].content.includes('feature/add-path'));
  });

  test('branch context is omitted when branch is "unknown"', () => {
    const msgs = buildPrompt({
      diff: SAMPLE_DIFF,
      style: 'conventional',
      branch: 'unknown',
    });
    // "unknown" should not appear as a branch label
    assert.ok(
      !msgs[1].content.includes('Current branch: unknown'),
      '"unknown" branch should not be injected into the prompt'
    );
  });

  test('branch context is omitted when branch is undefined', () => {
    const msgs = buildPrompt({ diff: SAMPLE_DIFF, style: 'conventional' });
    assert.ok(!msgs[1].content.includes('Current branch'));
  });

  test('diff is wrapped in a ```diff code fence', () => {
    const msgs = buildPrompt({ diff: SAMPLE_DIFF, style: 'conventional' });
    assert.ok(msgs[1].content.includes('```diff'));
    assert.ok(msgs[1].content.includes('```'));
  });
});

suite('promptBuilder — truncateDiff', () => {
  test('returns the original string when it is under the limit', () => {
    const short = 'short diff content';
    assert.strictEqual(truncateDiff(short, 100), short);
  });

  test('returns the original string when it exactly equals the limit', () => {
    const exact = 'x'.repeat(100);
    assert.strictEqual(truncateDiff(exact, 100), exact);
  });

  test('truncates a string that exceeds the limit', () => {
    const long = 'x'.repeat(200);
    const result = truncateDiff(long, 50);
    assert.ok(result.length < long.length);
  });

  test('keeps exactly maxChars characters of content before the notice', () => {
    const long = 'x'.repeat(200);
    const result = truncateDiff(long, 50);
    assert.ok(result.startsWith('x'.repeat(50)));
  });

  test('appends a truncation notice', () => {
    const long = 'x'.repeat(200);
    const result = truncateDiff(long, 50);
    assert.ok(result.includes('[… diff truncated'));
  });

  test('uses 8000 as the default limit', () => {
    const borderline = 'a'.repeat(8_000);
    assert.strictEqual(truncateDiff(borderline), borderline);

    const over = 'a'.repeat(8_001);
    assert.ok(truncateDiff(over).includes('[… diff truncated'));
  });
});
