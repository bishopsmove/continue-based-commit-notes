# Changelog

All notable changes to **Continue Commit Notes** are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

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
