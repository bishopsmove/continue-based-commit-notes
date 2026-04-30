# Model Availability Fallback Design

**Date:** 2026-04-30  
**Status:** Approved

## Overview

Add provider/model availability detection to the commit generation flow. When a model is unreachable or not found, surface a specific warning and fall back to the next viable model rather than failing with a generic error.

Two distinct failure modes are distinguished:

- **Provider unavailable** — `ECONNREFUSED`: the provider process (e.g. Ollama, LM Studio) is not running at the configured address. All models sharing that provider+apiBase are guaranteed to fail, so they are skipped as a group.
- **Model not found** — HTTP 404: the provider is running but the specific model is not loaded or does not exist. Only that model is skipped; other models on the same provider may still work.

---

## Section 1: Error Classes (`continueApiClient.ts`)

Two new exported error classes are added to `continueApiClient.ts`:

```ts
export class ProviderUnavailableError extends Error {
  constructor(public readonly provider: string, public readonly apiBase: string) {
    super(`Provider "${provider}" is not available at ${apiBase} (connection refused)`);
    this.name = 'ProviderUnavailableError';
  }
}

export class ModelNotFoundError extends Error {
  constructor(public readonly modelName: string, public readonly provider: string) {
    super(`Model "${modelName}" was not found on provider "${provider}" (HTTP 404)`);
    this.name = 'ModelNotFoundError';
  }
}
```

### Detection in `httpPost`

The existing `req.on('error', reject)` handler is updated to check the Node.js error code:

```ts
req.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'ECONNREFUSED') {
    reject(new ProviderUnavailableError(provider, apiBase));
  } else {
    reject(err);
  }
});
```

`httpPost` is extended to accept `provider` and `apiBase` parameters so it can construct `ProviderUnavailableError` directly inside the `req.on('error')` handler. Each caller (`callOllama`, `callOpenAICompatible`, `callAnthropic`) already has this context and passes it through.

In the HTTP response handler, a `404` status throws `ModelNotFoundError`:

```ts
if (status === 404) {
  reject(new ModelNotFoundError(modelName, provider));
}
```

The `modelName` and `provider` values are threaded through from the caller. All other non-2xx statuses continue to throw the existing generic `HTTP ${status}: ...` error.

---

## Section 2: Fallback Logic (`generateCommit.ts`)

### Provider-skip set

A `Set<string>` keyed on `"${provider}|${apiBase ?? ''}"` tracks providers confirmed unreachable during a fallback walk. Before attempting any model, its key is checked against this set; if present, it is skipped silently.

### `showModelPicker = true`

```
show picker
  → user picks model (or cancels → abort)
  → attempt generation
    success → done
    ProviderUnavailableError → warn "Provider X is not available at <base>. Pick a different model." → loop
    ModelNotFoundError       → warn "Model Y was not found on provider X. Pick a different model." → loop
    other error              → show error, abort
```

The picker loop continues until generation succeeds or the user cancels the QuickPick. The provider-skip set is intentionally not used in this path — the user is making a manual selection and the warning message gives them enough context to choose a different model or provider themselves.

### `preferredModel` set

```
try preferred model
  success → done
  ProviderUnavailableError → warn "Preferred model 'Y' — provider X is not available. Trying next available model…"
                             add provider to skip set
                             → fallback walk
  ModelNotFoundError       → warn "Preferred model 'Y' was not found on provider X. Trying next available model…"
                             → fallback walk
  other error              → show error, abort

fallback walk (iterates chatModels in order, skipping preferred and skip-set members):
  for each candidate:
    if provider in skip set → skip silently
    attempt generation
      success → done (no extra notification — the progress title is sufficient)
      ProviderUnavailableError → add provider to skip set, continue
      ModelNotFoundError       → continue
      other error              → show error, abort
  exhausted → showErrorMessage("No configured models are responding…")
```

### Default (neither `showModelPicker` nor `preferredModel`)

Same as the preferred-model fallback walk, starting from `chatModels[0]`, with no "preferred model" prefix on the initial warning:

```
try chatModels[0]
  success → done
  ProviderUnavailableError → warn "Provider X is not available at <base>. Trying next available model…"
                             add provider to skip set → fallback walk
  ModelNotFoundError       → warn "Model Y was not found on provider X. Trying next available model…"
                             → fallback walk
  other error              → show error, abort
```

### Warning messages (summary)

| Scenario | Mode | Message |
|---|---|---|
| ECONNREFUSED, picker | picker | `Provider "X" is not available at <base>. Pick a different model.` |
| HTTP 404, picker | picker | `Model "Y" was not found on provider "X". Pick a different model.` |
| ECONNREFUSED, preferred | preferred | `Preferred model "Y" — provider "X" is not available. Trying next available model…` |
| HTTP 404, preferred | preferred | `Preferred model "Y" was not found on provider "X". Trying next available model…` |
| ECONNREFUSED, default first | default | `Provider "X" is not available at <base>. Trying next available model…` |
| HTTP 404, default first | default | `Model "Y" was not found on provider "X". Trying next available model…` |
| All exhausted | any non-picker | `Continue Commit: No configured models are responding. Check that your providers are running.` (error) |

---

## Section 3: Tests

### `continueApiClient.test.ts` — additions and updates

- Assert `ProviderUnavailableError` and `ModelNotFoundError` are exported from the module.
- Update existing `'rejects on network failure'` test to assert the rejection is an instance of `ProviderUnavailableError` (port 1 → ECONNREFUSED).
- Unit tests for the two error class constructors: correct `message`, `name`, and public fields (`provider`, `apiBase`, `modelName`).

### `generateCommit.test.ts` — new file

All tests mock `getChatCompletion` (to throw or resolve) and `vscode.window.show*` methods. No real network calls.

**Picker path:**
- Re-shows picker on `ProviderUnavailableError`, with correct warning message.
- Re-shows picker on `ModelNotFoundError`, with correct warning message.
- Resolves on the second pick when that model succeeds.
- Aborts cleanly when user cancels the picker after a failure.

**Preferred-model path:**
- Falls through to next `chatModels` entry when preferred model throws `ProviderUnavailableError`.
- Skips all models sharing the unavailable provider's key.
- Falls through to next entry on `ModelNotFoundError` (does not skip same provider).
- Shows success when a fallback model responds.
- Shows exhaustion error when all models fail.

**Default path:**
- Starts with `chatModels[0]`, falls back through list on errors.
- Skips same-provider models after `ProviderUnavailableError`.
- Shows exhaustion error when all models fail.

**Shared / edge cases:**
- Non-`ProviderUnavailableError` / non-`ModelNotFoundError` errors are not swallowed — they surface as the existing `showErrorMessage` path.
- Single-model config: exhaustion error shown immediately on any failure.
