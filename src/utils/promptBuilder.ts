export type CommitStyle = 'conventional' | 'freeform';

export interface PromptOptions {
  diff: string;
  style: CommitStyle;
  branch?: string;
}

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

// ---------------------------------------------------------------------------
// System instructions
// ---------------------------------------------------------------------------

const CONVENTIONAL_SYSTEM = `You are an expert software engineer writing a git commit message.
Analyze the provided git diff and write a single commit message following the Conventional Commits specification (https://www.conventionalcommits.org/).

Rules:
- Format: <type>(<optional scope>): <short description>
- Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
- Short description: imperative mood, lowercase start, no trailing period, ≤72 characters total for the first line
- Optional body (blank line after subject): explain WHY, not WHAT; wrap at 72 characters
- Optional footer: BREAKING CHANGE: <desc>, or Closes #<issue>

Output ONLY the commit message text — no preamble, no markdown fences, no explanation.`;

const FREEFORM_SYSTEM = `You are an expert software engineer writing a git commit message.
Analyze the provided git diff and write a clear, concise commit message.

Rules:
- First line: imperative mood summary, ≤72 characters
- Optional blank line + body explaining WHY the change was made (not what the diff shows)
- Output ONLY the commit message — no preamble, no markdown fences, no explanation.`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds the messages array to send to the LLM.
 * Returns [systemMessage, userMessage].
 */
export function buildPrompt(options: PromptOptions): ChatMessage[] {
  const systemContent =
    options.style === 'conventional' ? CONVENTIONAL_SYSTEM : FREEFORM_SYSTEM;

  const branchLine =
    options.branch && options.branch !== 'unknown'
      ? `Current branch: ${options.branch}\n\n`
      : '';

  const userContent =
    `${branchLine}Git diff:\n\`\`\`diff\n${truncateDiff(options.diff)}\n\`\`\``;

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContent },
  ];
}

/**
 * Truncates very large diffs to avoid blowing past model context limits.
 * Keeps the first `maxChars` characters and appends a notice.
 */
export function truncateDiff(diff: string, maxChars = 8_000): string {
  if (diff.length <= maxChars) {
    return diff;
  }
  return `${diff.slice(0, maxChars)}\n\n[… diff truncated at ${maxChars} characters — only the first portion was analysed]`;
}
