# Continue Commit Notes

> AI-powered git commit message generator for VS Code, powered by your locally configured [Continue.dev](https://continue.dev) models.

---

## Overview

**Continue Commit Notes** adds a single-click **C** button to the Source Control panel in VS Code. Click it and the extension:

1. Reads your staged diff (or all working-tree changes if nothing is staged)
2. Looks up which chat models you have configured in `~/.continue/config.json`
3. Sends the diff to that model with a structured prompt
4. Writes the generated message directly into the SCM commit input box — ready to review, edit, and commit

No cloud service, no API keys required for local models. Ollama, LM Studio, and llama.cpp work out of the box.

---

## Requirements

| Dependency | Version |
|---|---|
| VS Code | ≥ 1.85 |
| [Continue.dev extension](https://marketplace.visualstudio.com/items?itemName=Continue.continue) | Any recent release |
| A configured chat model | Ollama, LM Studio, OpenAI, Anthropic, etc. |

The extension reads your Continue configuration (`~/.continue/config.json` or `config.yaml`) to discover available models. You do **not** need the Continue extension to be actively running — as long as the config file is present the extension can call model APIs directly.

---

## Installation

1. Install from the VS Code Marketplace: search **"Continue Commit Notes"**
2. Make sure Continue.dev is installed and you have at least one model configured
3. Open a git repository — the **C** icon appears automatically in the Source Control panel

---

## Usage

### Generating a commit message

There are three ways to trigger generation:

**① Inline button in the Changes / Staged Changes header**  
Hover over the *Changes* or *Staged Changes* group label in the Source Control panel. A **C** icon appears inline — click it.

**② Title bar button**  
A **C** icon is always visible in the top-right of the Source Control panel title bar.

**③ Command Palette**  
Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run:
- `Continue Commit: Generate Commit Message`
- `Continue Commit: Generate Commit Message (Pick Model)`

### What gets sent to the model

- If you have **staged changes**, only those are included in the diff (`git diff --cached`)
- If **nothing is staged**, the full working-tree diff is used, with a warning
- Very large diffs are automatically truncated to 8 000 characters (configurable) to stay within model context limits

### Model selection

By default the extension uses the **first model** listed in your Continue config. You can override this in three ways:

1. **Pin a model** — set `continueCommit.preferredModel` to the model's `title` field
2. **Always show a picker** — set `continueCommit.showModelPicker: true`
3. **Per-generation picker** — run `Continue Commit: Generate Commit Message (Pick Model)` from the palette or right-click menu

---

## Configuration

All settings are under `continueCommit.*` in VS Code settings (`Ctrl+,`).

| Setting | Type | Default | Description |
|---|---|---|---|
| `showModelPicker` | boolean | `false` | Always show a QuickPick model selector before generating |
| `preferredModel` | string | `""` | Title of the preferred Continue model (must match a `title` in your config). Leave empty to auto-select the first model. |
| `commitStyle` | enum | `"conventional"` | `"conventional"` — Conventional Commits format; `"freeform"` — plain summary |
| `continuePort` | number | `65432` | Port of the Continue.dev local proxy server |
| `maxTokens` | number | `256` | Maximum tokens to generate (64–2048) |
| `useContinueProxy` | boolean | `true` | Try Continue's local proxy first; falls back to the provider API directly if unreachable |

### Example `settings.json`

```jsonc
{
  // Always use Ollama's Llama 3 model, no picker
  "continueCommit.preferredModel": "Ollama Llama 3",
  "continueCommit.showModelPicker": false,

  // Use Conventional Commits format
  "continueCommit.commitStyle": "conventional",

  // Allow longer messages with more context
  "continueCommit.maxTokens": 512
}
```

---

## How Continue model discovery works

The extension reads `~/.continue/config.json` (or `config.yaml` for newer Continue versions) and looks at the top-level `models` array. Any entry with both a `title` and a `model` field is considered a chat model.

```jsonc
// ~/.continue/config.json (example)
{
  "models": [
    {
      "title": "Ollama Llama 3",   // ← used as the display name and selector key
      "provider": "ollama",
      "model": "llama3"
    },
    {
      "title": "GPT-4o",
      "provider": "openai",
      "model": "gpt-4o",
      "apiKey": "sk-..."
    }
  ]
}
```

### Supported providers

| Provider | `provider` value | Default API base |
|---|---|---|
| Ollama | `ollama` | `http://localhost:11434` |
| LM Studio | `lmstudio` | `http://localhost:1234` |
| llama.cpp server | `llamacpp` | `http://localhost:8080` |
| OpenAI | `openai` | `https://api.openai.com` |
| Anthropic | `anthropic` | `https://api.anthropic.com` |
| Any OpenAI-compatible | `together`, `mistral`, etc. | Uses `apiBase` from config |

When `useContinueProxy` is `true` (default), the extension first tries to POST to Continue's local proxy at `localhost:65432/chat/completions`. This means any provider Continue supports will work transparently. If the proxy is not running, the extension falls back to calling the provider API directly using the credentials stored in your config.

---

## Output channel

All activity is logged to the **Continue Commit Notes** output channel (`View → Output → Continue Commit Notes`). Check there first if something isn't working.

---

## Commit message formats

### Conventional Commits (default)

```
feat(auth): add refresh token rotation

Tokens are now rotated on every use. The old token is invalidated
immediately, which closes a session-fixation window.

Closes #127
```

Types used: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

### Freeform

```
Rotate refresh tokens on every use

Eliminates the session-fixation window that existed when a stolen
token remained valid until expiry.
```

---

## Development

### Prerequisites

```bash
node >= 18
npm >= 9
```

### Setup

```bash
git clone https://github.com/your-username/continue-commit-notes
cd continue-commit-notes
npm install
```

### Build

```bash
npm run compile          # development build → dist/extension.js
npm run watch            # rebuild on save
npm run vscode:prepublish  # minified production build
```

### Run tests

```bash
npm test
# Compiles TypeScript to out/, then launches @vscode/test-electron
# which downloads a headless VS Code and runs the Mocha test suite.
```

### Package for Marketplace

```bash
npm run package          # produces continue-commit-notes-x.y.z.vsix
```

Install the VSIX locally with `Extensions: Install from VSIX…` in VS Code, or publish with `vsce publish`.

---

## Contributing

Pull requests are welcome. For significant changes please open an issue first to discuss the approach.

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes and add tests
4. Verify: `npm test`
5. Open a pull request

---

## License

MIT — see [LICENSE](LICENSE) for details.
