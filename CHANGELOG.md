# Changelog

All notable changes to **Continue Commit Notes** are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

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
