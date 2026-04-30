# Changelog

All notable changes to **Continue Commit Notes** are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [0.3.0] — 2026-04-30

### Added
- **Model availability fallback**: when a provider is unreachable or a model is not loaded, the extension now warns the user and automatically tries the next configured model rather than failing immediately
  - `ECONNREFUSED` (provider not running) surfaces as a specific warning and skips all other models on the same provider+address
  - HTTP 404 (model not found on provider) surfaces as a specific warning and tries the next model; other models on the same provider are still attempted
  - **Picker mode** (`showModelPicker`): re-shows the model picker after a failure so the user can choose a different model
  - **Preferred model mode**: warns with "Preferred model…" prefix, then walks remaining configured models
  - **Default mode**: warns and walks `chatModels` in order until one succeeds
  - If all configured models fail, shows an error: "No configured models are responding. Check that your providers are running."
- `ProviderUnavailableError` and `ModelNotFoundError` exported error classes in `continueApiClient.ts` for typed error handling

### Fixed
- Model display name now falls back to `'(untitled)'` instead of the string `"undefined"` when a model has neither `title` nor `name`
- Typed provider errors (`ProviderUnavailableError`, `ModelNotFoundError`) now propagate correctly when the Continue proxy is enabled, so fallback logic fires regardless of the `useContinueProxy` setting
- Config reader logging now uses the `Logger` class consistently

## [0.2.8] — 2026-04-29

### Changed
- Cleaned up logging messages in the config reader and model filter for clarity
- Updated commenting in the config reader to explain the logic more clearly

## [0.2.7] — 2026-04-29

### Added
- `.vscode/launch.json` configuration for running and debugging extension tests
- `extensionKind: ["ui"]` declaration to package.json
- Expanded marketplace keywords (llama.cpp, LM Studio, gpt4all, gemini, mistral, and others)

### Changed
- Updated dev dependencies

## [0.2.2] — 2026-04-29

### Fixed
- Model display now falls back to `name` when `title` is empty, preventing blank labels in the model picker and status messages
- Config reader now tries `config.yaml` before `config.json` (aligns with Continue's default format)
- Model filter correctly accepts models that have `name` but no `title`

### Added
- Logging for the resolved Continue config directory path and parsed model list

## [0.2.1] — 2026-04-28

### Added
- Logging in the config reader to aid debugging

## [0.2.0] — 2026-04-28

### Added
- MIT license

### Changed
- `ContinueModel.title` is now optional; `name` is accepted as an alias (supports configs that use `name:` instead of `title:`)
- Menu command titles updated for clarity

## [0.1.0] — 2026-04-28

### Added
- Initial release
- Generate commit messages with **Conventional Commits** format (default) or freeform
- Auto-discovers chat models from `~/.continue/config.json` / `config.yaml`
- Model picker QuickPick (enabled via `continueCommit.showModelPicker` or right-click command)
- Inline **C** icon button in the **Changes** and **Staged Changes** group headers
- **C** icon in the Source Control panel title bar
- Support for Ollama, LM Studio, llama.cpp, OpenAI, and Anthropic model providers
- Graceful fallback: tries Continue proxy (port 65432) first, then calls the provider API directly
- `continueCommit.preferredModel` setting to pin a specific model
- Output channel logging for debugging
- Mocha + `@vscode/test-electron` test suite
