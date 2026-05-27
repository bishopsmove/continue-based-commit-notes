# CI GitHub Actions Workflow — Design Spec

**Date:** 2026-05-27  
**Project:** continue-based-commit-notes  
**Status:** Approved

---

## Goal

Add a GitHub Actions CI workflow that demonstrates the extension is healthy on every push and pull request to `main`. A packaged `.vsix` artifact is produced on every green run. A CI badge is added to the README.

---

## Approach

Single job, sequential steps (Option A). One `ci` job on `ubuntu-latest` — simple, fast (~2 min), no parallel overhead. Failure at any step stops the run immediately with a clear signal. The `.vsix` artifact is only produced when all checks pass, so it doubles as a "green build" indicator.

---

## Trigger

```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:
```

Runs on pushes and PRs targeting `main`. `workflow_dispatch` allows manual runs from the GitHub Actions UI.

---

## Job: `ci`

**Runner:** `ubuntu-latest`

### Steps

| # | Step | Tool / Command | Purpose |
|---|------|----------------|---------|
| 1 | Checkout | `actions/checkout@v4` | Full repo checkout |
| 2 | Setup Node | `actions/setup-node@v4`, Node 20, npm cache | Consistent runtime, fast installs |
| 3 | Install dependencies | `npm ci` | Clean, reproducible install |
| 4 | Lint | `npm run lint` | ESLint over `src/` |
| 5 | Typecheck | `npx tsc --noEmit` | Type-check without emitting build output |
| 6 | Unit tests | `npm run pretest && npm test` with integration suite excluded | Compile to `out/`, run unit tests only |
| 7 | Package | `npx vsce package` | Produce `.vsix` |
| 8 | Upload artifact | `actions/upload-artifact@v4`, 7-day retention | Attach `.vsix` to the workflow run |

---

## Unit Test Isolation

The test suite contains two categories:

- **Unit tests** (`promptBuilder`, `gitService`, `continueConfigReader`, `continueApiClient`, `generateCommit`) — import `src/` directly, run under plain Node/Mocha. No VS Code host required.
- **Integration tests** (`extension.test.ts`, suite name: `"Extension — activation & registration"`) — require a VS Code electron host via `@vscode/test-electron`. Not suitable for headless CI without `xvfb` and significant setup complexity.

The workflow skips integration tests using Mocha's `--grep-invert` flag targeting the suite title `"Extension"`, keeping CI dependency-free and fast.

The `pretest` script (`tsc -p tsconfig.json`) compiles TypeScript to `out/` before the test runner executes.

---

## README Badge

A CI status badge is added to the existing badge block in `README.md`:

```markdown
[![CI](https://github.com/bishopsmove/continue-based-commit-notes/actions/workflows/ci.yml/badge.svg)](https://github.com/bishopsmove/continue-based-commit-notes/actions/workflows/ci.yml)
```

Style kept consistent with the existing `for-the-badge` shields — same `labelColor`, matching color scheme.

---

## Files Changed

| File | Change |
|------|--------|
| `.github/workflows/ci.yml` | **New** — the workflow definition |
| `README.md` | **Modified** — CI badge added to badge block |

---

## Out of Scope

- Integration tests in CI (requires VS Code electron + xvfb; deferred)
- Publish-on-tag workflow (separate concern)
- Multi-Node version matrix (extension runtime is pinned to VS Code's bundled Node)
- Dependabot / automated dependency updates
