# CI GitHub Actions Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GitHub Actions CI workflow that lints, typechecks, and runs unit tests on every push/PR to `main`, packages a `.vsix` artifact on success, and shows a status badge in the README.

**Architecture:** A single `ci` job on `ubuntu-latest` runs steps sequentially: install → typecheck → unit tests (via Mocha directly, skipping the VS Code electron integration suite) → `vsce package` → upload artifact. The README badge is activated by uncommenting and fixing the existing commented-out badge line. Lint is intentionally omitted — `eslint` is not in `devDependencies` and there is no `.eslintrc` config at the project root, so `npm run lint` would fail in CI.

**Tech Stack:** GitHub Actions, Node 20, `npm ci`, TypeScript (`tsc --noEmit`), Mocha (direct invocation), `@vscode/vsce`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `.github/workflows/ci.yml` | **Create** | Full CI workflow definition (no lint step — eslint not configured) |
| `README.md` | **Modify** | Uncomment + fix the CI badge (line 14) |

---

### Task 1: Create `.github/workflows/ci.yml`

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: Create `.github/workflows/ci.yml` with the following content**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:

jobs:
  ci:
    name: Lint, Typecheck, Test & Package
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Typecheck
        run: npx tsc --noEmit

      - name: Compile tests
        run: npm run pretest

      - name: Run unit tests
        run: npx mocha --ui tdd --color --timeout 15000 'out/test/suite/*.test.js' --ignore 'out/test/suite/extension.test.js'

      - name: Package extension
        run: npx vsce package

      - name: Upload .vsix artifact
        uses: actions/upload-artifact@v4
        with:
          name: continue-commit-notes-vsix
          path: '*.vsix'
          retention-days: 7
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions CI workflow"
```

---

### Task 2: Activate the CI badge in `README.md`

**Files:**
- Modify: `README.md` (line 14)

**Context:** Line 14 of `README.md` already contains a commented-out CI badge stub — it just needs to be uncommented, have a `logo` parameter added, and have the missing markdown link `(url)` part added. It should join the existing inline badge block on line 9.

- [ ] **Step 1: Replace the commented badge line with the active badge appended to the badge block**

Find line 14 in `README.md`:
```
<!-- [![CI](https://img.shields.io/github/actions/workflow/status/bishopsmove/continue-based-commit-notes/ci.yml?branch=main&style=for-the-badge&label=CI&labelColor=1a1a2e&color=3b82f6)] -->
```

Replace it with an empty line (removing the comment entirely), and on line 9 append the CI badge to the end of the existing badge block **before** the closing `</div>`.

The existing badge block (line 9) ends with `...](LICENSE)`. Append the CI badge directly after it on the same line:

```markdown
[![CI](https://img.shields.io/github/actions/workflow/status/bishopsmove/continue-based-commit-notes/ci.yml?branch=main&style=for-the-badge&label=CI&labelColor=1a1a2e&color=3b82f6&logo=githubactions&logoColor=white)](https://github.com/bishopsmove/continue-based-commit-notes/actions/workflows/ci.yml)
```

The full badge block line after editing should be:
```
[![VS Code Marketplace](...)](...)[![Open VSX](...)](...)[![MS Marketplace Installs](...)](...)[![Open VSX Downloads](...)](...)[![GitHub Stars](...)](...)[![License](https://img.shields.io/badge/License-MIT-f43f5e?style=for-the-badge&labelColor=1a1a2e)](LICENSE)[![CI](https://img.shields.io/github/actions/workflow/status/bishopsmove/continue-based-commit-notes/ci.yml?branch=main&style=for-the-badge&label=CI&labelColor=1a1a2e&color=3b82f6&logo=githubactions&logoColor=white)](https://github.com/bishopsmove/continue-based-commit-notes/actions/workflows/ci.yml)
```

- [ ] **Step 2: Verify the README renders correctly**

Open `README.md` in the IDE preview and confirm:
- The CI badge appears inline with the other badges
- The old HTML comment line (line 14) is gone or blank
- No broken markdown syntax

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: activate CI status badge in README"
```

---

### Task 3: Verify the workflow runs cleanly

- [ ] **Step 1: Push to GitHub and confirm the Action triggers**

```bash
git push origin main
```

Navigate to `https://github.com/bishopsmove/continue-based-commit-notes/actions` and confirm the `CI` workflow appears and starts running.

- [ ] **Step 2: Confirm each step passes**

Watch the run. Expected:
- ✅ Lint — no ESLint errors
- ✅ Typecheck — no TypeScript errors
- ✅ Compile tests — `tsc` exits 0
- ✅ Run unit tests — all unit tests pass (extension.test.js excluded)
- ✅ Package extension — `.vsix` produced
- ✅ Upload artifact — artifact available in the run summary

- [ ] **Step 3: Confirm the README badge turns green**

After the first successful run, the badge at the top of the README should show green. This may take a few minutes for GitHub's CDN to update.
