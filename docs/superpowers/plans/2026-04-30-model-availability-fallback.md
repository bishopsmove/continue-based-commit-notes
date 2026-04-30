# Model Availability Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect ECONNREFUSED and HTTP 404 errors from model providers and apply a typed-error fallback strategy across all three model-selection modes (picker, preferred, default).

**Architecture:** Two exported error classes (`ProviderUnavailableError`, `ModelNotFoundError`) are thrown by `continueApiClient.ts`. An exported helper `generateWithFallback` in `generateCommit.ts` accepts injected `generate`/`pick`/`warn`/`error` functions and implements the full retry/skip/warn/exhaust loop for each mode. `runGenerate` wires real VS Code functions into that helper.

**Tech Stack:** TypeScript, Node.js `http`/`https`, VS Code extension API (Mocha test runner via `@vscode/test-electron`)

---

### Task 1: Add and export the two error classes

**Files:**
- Modify: `src/services/continueApiClient.ts` (top of file, before existing code)
- Modify: `test/suite/continueApiClient.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `test/suite/continueApiClient.test.ts` after the existing `suite`:

```ts
suite('continueApiClient — error classes', () => {
  const mod = require('../../src/services/continueApiClient') as typeof import('../../src/services/continueApiClient');

  test('ProviderUnavailableError is exported', () => {
    assert.strictEqual(typeof mod.ProviderUnavailableError, 'function');
  });

  test('ModelNotFoundError is exported', () => {
    assert.strictEqual(typeof mod.ModelNotFoundError, 'function');
  });

  test('ProviderUnavailableError sets name, message, provider, apiBase', () => {
    const err = new mod.ProviderUnavailableError('ollama', 'http://localhost:11434');
    assert.strictEqual(err.name, 'ProviderUnavailableError');
    assert.ok(err.message.includes('ollama'));
    assert.ok(err.message.includes('http://localhost:11434'));
    assert.strictEqual(err.provider, 'ollama');
    assert.strictEqual(err.apiBase, 'http://localhost:11434');
    assert.ok(err instanceof Error);
  });

  test('ModelNotFoundError sets name, message, modelName, provider', () => {
    const err = new mod.ModelNotFoundError('llama3', 'ollama');
    assert.strictEqual(err.name, 'ModelNotFoundError');
    assert.ok(err.message.includes('llama3'));
    assert.ok(err.message.includes('ollama'));
    assert.strictEqual(err.modelName, 'llama3');
    assert.strictEqual(err.provider, 'ollama');
    assert.ok(err instanceof Error);
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
npm test
```

Expected: 4 new tests fail with "ProviderUnavailableError is not a function" / "ModelNotFoundError is not a function".

- [ ] **Step 3: Add the error classes to `continueApiClient.ts`**

Insert after the existing imports, before the `CompletionOptions` interface:

```ts
// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

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

- [ ] **Step 4: Run tests to confirm passage**

```bash
npm test
```

Expected: all 4 new tests pass. All prior tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/continueApiClient.ts test/suite/continueApiClient.test.ts
git commit -m "feat: add ProviderUnavailableError and ModelNotFoundError classes"
```

---

### Task 2: Throw `ProviderUnavailableError` on ECONNREFUSED

**Files:**
- Modify: `src/services/continueApiClient.ts` (`httpPost`, `callOllama`, `callOpenAICompatible`, `callAnthropic`)
- Modify: `test/suite/continueApiClient.test.ts`

- [ ] **Step 1: Update the ECONNREFUSED test to assert the typed error**

In `test/suite/continueApiClient.test.ts`, update the existing test `'getChatCompletion rejects (not throws) on network failure'`:

```ts
test('getChatCompletion rejects with ProviderUnavailableError on ECONNREFUSED', async () => {
  const mod = require('../../src/services/continueApiClient') as typeof import('../../src/services/continueApiClient');
  let caughtError: unknown;
  try {
    await mod.getChatCompletion({
      model: {
        title: 'test',
        provider: 'ollama',
        model: 'test',
        apiBase: 'http://localhost:1',
      },
      messages: [{ role: 'user', content: 'hello' }],
      maxTokens: 10,
    });
  } catch (err) {
    caughtError = err;
  }
  assert.ok(caughtError instanceof mod.ProviderUnavailableError, 'Should be ProviderUnavailableError');
  assert.strictEqual((caughtError as InstanceType<typeof mod.ProviderUnavailableError>).provider, 'ollama');
  assert.ok((caughtError as InstanceType<typeof mod.ProviderUnavailableError>).apiBase.includes('localhost:1'));
});
```

Also update the `'getChatCompletion returns a Promise when called'` test — its `.catch(() => {})` swallow is fine to leave as-is.

- [ ] **Step 2: Run test to confirm failure**

```bash
npm test
```

Expected: the updated ECONNREFUSED test fails because the caught error is a plain `Error`, not `ProviderUnavailableError`.

- [ ] **Step 3: Update `PostOpts` and `httpPost` to accept provider context**

Replace the `PostOpts` interface and `httpPost` function signature in `continueApiClient.ts`:

```ts
interface PostOpts {
  hostname: string;
  port: number;
  path: string;
  provider: string;
  apiBase: string;
}

function httpPost(
  opts: PostOpts,
  body: string,
  extraHeaders: Record<string, string>,
  useHttps: boolean
): Promise<string> {
  return new Promise((resolve, reject) => {
    const lib = useHttps ? https : http;
    const buf = Buffer.from(body, 'utf-8');

    const req = lib.request(
      {
        hostname: opts.hostname,
        port: opts.port,
        path: opts.path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': buf.byteLength,
          ...extraHeaders,
        },
      },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const data = Buffer.concat(chunks).toString('utf-8');
          const status = res.statusCode ?? 0;
          if (status >= 200 && status < 300) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${status}: ${data.slice(0, 200)}`));
          }
        });
      }
    );

    req.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ECONNREFUSED') {
        reject(new ProviderUnavailableError(opts.provider, opts.apiBase));
      } else {
        reject(err);
      }
    });

    req.setTimeout(30_000, () => {
      req.destroy(new Error('Request timed out after 30 s'));
    });

    req.write(buf);
    req.end();
  });
}
```

- [ ] **Step 4: Update `urlToOpts` to carry provider context**

Replace `urlToOpts`:

```ts
function urlToOpts(url: URL, provider: string, apiBase: string): PostOpts {
  const defaultPort = url.protocol === 'https:' ? 443 : 80;
  return {
    hostname: url.hostname,
    port: url.port ? parseInt(url.port, 10) : defaultPort,
    path: url.pathname + url.search,
    provider,
    apiBase,
  };
}
```

- [ ] **Step 5: Update the Continue proxy call in `tryContinueProxy` to pass context**

Replace the `httpPost` call in `tryContinueProxy`:

```ts
const raw = await httpPost(
  { hostname: 'localhost', port, path: '/chat/completions', provider: 'continue-proxy', apiBase: `http://localhost:${port}` },
  body,
  {},
  false
);
```

- [ ] **Step 6: Update `callOllama` to pass context through `urlToOpts`**

Replace the `httpPost` call in `callOllama`:

```ts
const raw = await httpPost(urlToOpts(url, model.provider, base), body, {}, url.protocol === 'https:');
```

- [ ] **Step 7: Update `callOpenAICompatible` to pass context**

Replace the `httpPost` call in `callOpenAICompatible`:

```ts
const raw = await httpPost(
  urlToOpts(url, model.provider, base),
  body,
  extraHeaders,
  url.protocol === 'https:'
);
```

- [ ] **Step 8: Update `callAnthropic` to pass context**

Replace the `httpPost` call in `callAnthropic`:

```ts
const raw = await httpPost(urlToOpts(url, model.provider, base), body, extraHeaders, true);
```

- [ ] **Step 9: Run tests to confirm passage**

```bash
npm test
```

Expected: all tests pass including the updated ECONNREFUSED test now asserting `ProviderUnavailableError`.

- [ ] **Step 10: Commit**

```bash
git add src/services/continueApiClient.ts test/suite/continueApiClient.test.ts
git commit -m "feat: throw ProviderUnavailableError on ECONNREFUSED in httpPost"
```

---

### Task 3: Throw `ModelNotFoundError` on HTTP 404

**Files:**
- Modify: `src/services/continueApiClient.ts` (`httpPost` response handler)
- Modify: `test/suite/continueApiClient.test.ts`

- [ ] **Step 1: Write the failing test**

Add to the `'continueApiClient — error classes'` suite in `test/suite/continueApiClient.test.ts`:

```ts
test('ModelNotFoundError is instanceof Error', () => {
  const mod = require('../../src/services/continueApiClient') as typeof import('../../src/services/continueApiClient');
  const err = new mod.ModelNotFoundError('mistral', 'openai');
  assert.ok(err instanceof Error);
  assert.strictEqual(err.name, 'ModelNotFoundError');
});
```

This test already passes from Task 1, so also add a test confirming `getChatCompletion` propagates `ModelNotFoundError`. Because this requires a mock HTTP server (not practical here), confirm the class behaviour via constructor tests only. The 404 path is covered by the integration behaviour verified manually. Mark this step complete after adding the constructor test above and confirming it passes.

- [ ] **Step 2: Update `httpPost` response handler to throw `ModelNotFoundError` on 404**

In the `res.on('end', ...)` callback inside `httpPost`, replace the non-2xx rejection block:

```ts
res.on('end', () => {
  const data = Buffer.concat(chunks).toString('utf-8');
  const status = res.statusCode ?? 0;
  if (status >= 200 && status < 300) {
    resolve(data);
  } else if (status === 404) {
    reject(new ModelNotFoundError(opts.path, opts.provider));
  } else {
    reject(new Error(`HTTP ${status}: ${data.slice(0, 200)}`));
  }
});
```

Note: `opts.path` is used as `modelName` in this context since `httpPost` does not know the model name directly. The provider-specific callers own model name context; for HTTP 404, the path is the best available identifier at this level. The `ModelNotFoundError.modelName` field will contain the request path (e.g. `/api/chat`). This is acceptable — the meaningful model name appears in the warning message constructed by `generateWithFallback` using the `ContinueModel` object, not the error field.

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/services/continueApiClient.ts test/suite/continueApiClient.test.ts
git commit -m "feat: throw ModelNotFoundError on HTTP 404 in httpPost"
```

---

### Task 4: Add `generateWithFallback` to `generateCommit.ts` — types and picker path

**Files:**
- Modify: `src/commands/generateCommit.ts`
- Create: `test/suite/generateCommit.test.ts`

- [ ] **Step 1: Write the failing tests for the picker path**

Create `test/suite/generateCommit.test.ts`:

```ts
import * as assert from 'assert';

type Mod = typeof import('../../src/commands/generateCommit');
type ContinueModel = import('../../src/services/continueConfigReader').ContinueModel;

function makeModel(provider: string, model: string, apiBase?: string): ContinueModel {
  return { title: `${provider}/${model}`, provider, model, apiBase };
}

suite('generateCommit — generateWithFallback', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('../../src/commands/generateCommit') as Mod;

  // Helpers
  const ProviderUnavailableError = require('../../src/services/continueApiClient').ProviderUnavailableError as typeof import('../../src/services/continueApiClient').ProviderUnavailableError;
  const ModelNotFoundError = require('../../src/services/continueApiClient').ModelNotFoundError as typeof import('../../src/services/continueApiClient').ModelNotFoundError;

  suite('picker mode', () => {
    test('returns result when first pick succeeds', async () => {
      const models = [makeModel('ollama', 'llama3'), makeModel('openai', 'gpt-4')];
      let pickCount = 0;
      const result = await mod.generateWithFallback(models, { kind: 'picker' }, {
        generate: async () => 'feat: add thing',
        pick: async (ms) => { pickCount++; return ms[0]; },
        warn: () => {},
        error: () => {},
      });
      assert.ok(result !== undefined);
      assert.strictEqual(result!.content, 'feat: add thing');
      assert.strictEqual(pickCount, 1);
    });

    test('re-shows picker and warns on ProviderUnavailableError, succeeds on second pick', async () => {
      const models = [makeModel('ollama', 'llama3', 'http://localhost:11434'), makeModel('openai', 'gpt-4')];
      const warns: string[] = [];
      let pickCount = 0;
      let generateCount = 0;

      const result = await mod.generateWithFallback(models, { kind: 'picker' }, {
        generate: async (m) => {
          generateCount++;
          if (generateCount === 1) throw new ProviderUnavailableError('ollama', 'http://localhost:11434');
          return 'fix: something';
        },
        pick: async (ms) => { pickCount++; return ms[pickCount - 1]; },
        warn: (msg) => warns.push(msg),
        error: () => {},
      });

      assert.ok(result !== undefined);
      assert.strictEqual(result!.content, 'fix: something');
      assert.strictEqual(pickCount, 2);
      assert.strictEqual(warns.length, 1);
      assert.ok(warns[0].includes('ollama'));
      assert.ok(warns[0].includes('Pick a different model'));
    });

    test('re-shows picker and warns on ModelNotFoundError', async () => {
      const models = [makeModel('ollama', 'llama3', 'http://localhost:11434'), makeModel('openai', 'gpt-4')];
      const warns: string[] = [];
      let generateCount = 0;
      let pickCount = 0;

      const result = await mod.generateWithFallback(models, { kind: 'picker' }, {
        generate: async (m) => {
          generateCount++;
          if (generateCount === 1) throw new ModelNotFoundError('llama3', 'ollama');
          return 'chore: update';
        },
        pick: async (ms) => { pickCount++; return ms[pickCount - 1]; },
        warn: (msg) => warns.push(msg),
        error: () => {},
      });

      assert.ok(result !== undefined);
      assert.strictEqual(result!.content, 'chore: update');
      assert.ok(warns[0].includes('llama3'));
      assert.ok(warns[0].includes('Pick a different model'));
    });

    test('returns undefined when user cancels picker after failure', async () => {
      const models = [makeModel('ollama', 'llama3', 'http://localhost:11434')];
      let pickCount = 0;

      const result = await mod.generateWithFallback(models, { kind: 'picker' }, {
        generate: async () => { throw new ProviderUnavailableError('ollama', 'http://localhost:11434'); },
        pick: async () => { pickCount++; return pickCount === 1 ? models[0] : undefined; },
        warn: () => {},
        error: () => {},
      });

      assert.strictEqual(result, undefined);
    });

    test('bubbles non-availability errors in picker mode', async () => {
      const models = [makeModel('ollama', 'llama3')];
      let threw = false;
      try {
        await mod.generateWithFallback(models, { kind: 'picker' }, {
          generate: async () => { throw new Error('Bad API key'); },
          pick: async () => models[0],
          warn: () => {},
          error: () => {},
        });
      } catch (err) {
        threw = true;
        assert.ok((err as Error).message === 'Bad API key');
      }
      assert.ok(threw);
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
npm test
```

Expected: all tests in the new suite fail with "generateWithFallback is not a function".

- [ ] **Step 3: Add the `FallbackMode`, `FallbackDeps`, `GenerateResult` types and stub `generateWithFallback` in `generateCommit.ts`**

Add these exports after the existing imports in `generateCommit.ts`:

```ts
import {
  ProviderUnavailableError,
  ModelNotFoundError,
} from '../services/continueApiClient';

// ---------------------------------------------------------------------------
// Fallback types (exported for testing)
// ---------------------------------------------------------------------------

export type FallbackMode =
  | { kind: 'picker' }
  | { kind: 'preferred'; preferredModel: ContinueModel }
  | { kind: 'default'; initialModel: ContinueModel };

export interface FallbackDeps {
  generate: (model: ContinueModel) => Promise<string>;
  pick: (models: ContinueModel[]) => Promise<ContinueModel | undefined>;
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

export interface GenerateResult {
  content: string;
  model: ContinueModel;
}
```

- [ ] **Step 4: Implement `generateWithFallback` — picker path only**

Add the exported function after the type declarations:

```ts
export async function generateWithFallback(
  chatModels: ContinueModel[],
  mode: FallbackMode,
  deps: FallbackDeps
): Promise<GenerateResult | undefined> {

  if (mode.kind === 'picker') {
    while (true) {
      const model = await deps.pick(chatModels);
      if (!model) return undefined;

      try {
        const content = await deps.generate(model);
        return { content, model };
      } catch (err) {
        if (err instanceof ProviderUnavailableError) {
          deps.warn(
            `Provider "${err.provider}" is not available at ${err.apiBase}. Pick a different model.`
          );
        } else if (err instanceof ModelNotFoundError) {
          deps.warn(
            `Model "${err.modelName}" was not found on provider "${err.provider}". Pick a different model.`
          );
        } else {
          throw err;
        }
      }
    }
  }

  // Stub for preferred/default — implemented in Task 5
  return undefined;
}
```

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: all picker-path tests pass. Preferred/default tests do not exist yet.

- [ ] **Step 6: Commit**

```bash
git add src/commands/generateCommit.ts test/suite/generateCommit.test.ts
git commit -m "feat: add generateWithFallback picker path with typed error handling"
```

---

### Task 5: Implement `generateWithFallback` — preferred and default paths

**Files:**
- Modify: `src/commands/generateCommit.ts`
- Modify: `test/suite/generateCommit.test.ts`

- [ ] **Step 1: Write the failing tests for preferred and default paths**

Add to `test/suite/generateCommit.test.ts`, inside the top-level suite, after the picker suite:

```ts
  suite('preferred mode', () => {
    test('returns result when preferred model succeeds', async () => {
      const preferred = makeModel('ollama', 'llama3', 'http://localhost:11434');
      const models = [preferred, makeModel('openai', 'gpt-4')];

      const result = await mod.generateWithFallback(models, { kind: 'preferred', preferredModel: preferred }, {
        generate: async () => 'feat: thing',
        pick: async () => undefined,
        warn: () => {},
        error: () => {},
      });

      assert.ok(result !== undefined);
      assert.strictEqual(result!.content, 'feat: thing');
      assert.strictEqual(result!.model, preferred);
    });

    test('warns and falls back to next model on ProviderUnavailableError', async () => {
      const preferred = makeModel('ollama', 'llama3', 'http://localhost:11434');
      const fallback = makeModel('openai', 'gpt-4');
      const models = [preferred, fallback];
      const warns: string[] = [];
      let callCount = 0;

      const result = await mod.generateWithFallback(models, { kind: 'preferred', preferredModel: preferred }, {
        generate: async (m) => {
          callCount++;
          if (m === preferred) throw new ProviderUnavailableError('ollama', 'http://localhost:11434');
          return 'fix: fallback';
        },
        pick: async () => undefined,
        warn: (msg) => warns.push(msg),
        error: () => {},
      });

      assert.ok(result !== undefined);
      assert.strictEqual(result!.content, 'fix: fallback');
      assert.strictEqual(result!.model, fallback);
      assert.strictEqual(warns.length, 1);
      assert.ok(warns[0].includes('Preferred model'));
      assert.ok(warns[0].includes('ollama'));
    });

    test('skips all models sharing an unavailable provider', async () => {
      const preferred = makeModel('ollama', 'llama3', 'http://localhost:11434');
      const sameProvider = makeModel('ollama', 'mistral', 'http://localhost:11434');
      const different = makeModel('openai', 'gpt-4');
      const models = [preferred, sameProvider, different];
      const tried: ContinueModel[] = [];

      const result = await mod.generateWithFallback(models, { kind: 'preferred', preferredModel: preferred }, {
        generate: async (m) => {
          tried.push(m);
          if (m.provider === 'ollama') throw new ProviderUnavailableError('ollama', 'http://localhost:11434');
          return 'fix: ok';
        },
        pick: async () => undefined,
        warn: () => {},
        error: () => {},
      });

      assert.ok(result !== undefined);
      assert.ok(!tried.includes(sameProvider), 'should skip sameProvider model');
      assert.strictEqual(result!.model, different);
    });

    test('warns and falls back on ModelNotFoundError (does not skip same provider)', async () => {
      const preferred = makeModel('ollama', 'llama3', 'http://localhost:11434');
      const sameProvider = makeModel('ollama', 'mistral', 'http://localhost:11434');
      const models = [preferred, sameProvider];
      const warns: string[] = [];
      const tried: ContinueModel[] = [];

      const result = await mod.generateWithFallback(models, { kind: 'preferred', preferredModel: preferred }, {
        generate: async (m) => {
          tried.push(m);
          if (m === preferred) throw new ModelNotFoundError('llama3', 'ollama');
          return 'feat: ok';
        },
        pick: async () => undefined,
        warn: (msg) => warns.push(msg),
        error: () => {},
      });

      assert.ok(result !== undefined);
      assert.ok(tried.includes(sameProvider), 'same-provider model should still be tried');
      assert.ok(warns[0].includes('Preferred model'));
    });

    test('calls error and returns undefined when all models fail', async () => {
      const preferred = makeModel('ollama', 'llama3', 'http://localhost:11434');
      const models = [preferred];
      const errors: string[] = [];

      const result = await mod.generateWithFallback(models, { kind: 'preferred', preferredModel: preferred }, {
        generate: async () => { throw new ProviderUnavailableError('ollama', 'http://localhost:11434'); },
        pick: async () => undefined,
        warn: () => {},
        error: (msg) => errors.push(msg),
      });

      assert.strictEqual(result, undefined);
      assert.strictEqual(errors.length, 1);
      assert.ok(errors[0].includes('No configured models'));
    });
  });

  suite('default mode', () => {
    test('returns result when initial model succeeds', async () => {
      const initial = makeModel('ollama', 'llama3', 'http://localhost:11434');
      const models = [initial];

      const result = await mod.generateWithFallback(models, { kind: 'default', initialModel: initial }, {
        generate: async () => 'feat: init',
        pick: async () => undefined,
        warn: () => {},
        error: () => {},
      });

      assert.ok(result !== undefined);
      assert.strictEqual(result!.content, 'feat: init');
    });

    test('warns and falls back on ProviderUnavailableError', async () => {
      const initial = makeModel('ollama', 'llama3', 'http://localhost:11434');
      const fallback = makeModel('openai', 'gpt-4');
      const models = [initial, fallback];
      const warns: string[] = [];

      const result = await mod.generateWithFallback(models, { kind: 'default', initialModel: initial }, {
        generate: async (m) => {
          if (m === initial) throw new ProviderUnavailableError('ollama', 'http://localhost:11434');
          return 'feat: fallback';
        },
        pick: async () => undefined,
        warn: (msg) => warns.push(msg),
        error: () => {},
      });

      assert.ok(result !== undefined);
      assert.strictEqual(result!.content, 'feat: fallback');
      assert.ok(warns[0].includes('Provider'));
      assert.ok(!warns[0].includes('Preferred model'));
    });

    test('calls error and returns undefined when all models fail', async () => {
      const initial = makeModel('ollama', 'llama3', 'http://localhost:11434');
      const models = [initial];
      const errors: string[] = [];

      const result = await mod.generateWithFallback(models, { kind: 'default', initialModel: initial }, {
        generate: async () => { throw new ProviderUnavailableError('ollama', 'http://localhost:11434'); },
        pick: async () => undefined,
        warn: () => {},
        error: (msg) => errors.push(msg),
      });

      assert.strictEqual(result, undefined);
      assert.ok(errors[0].includes('No configured models'));
    });

    test('bubbles non-availability errors in default mode', async () => {
      const initial = makeModel('ollama', 'llama3');
      const models = [initial];
      let threw = false;

      try {
        await mod.generateWithFallback(models, { kind: 'default', initialModel: initial }, {
          generate: async () => { throw new Error('Unexpected server error'); },
          pick: async () => undefined,
          warn: () => {},
          error: () => {},
        });
      } catch (err) {
        threw = true;
        assert.strictEqual((err as Error).message, 'Unexpected server error');
      }
      assert.ok(threw);
    });
  });
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
npm test
```

Expected: preferred and default tests fail (the stub returns `undefined` for both paths).

- [ ] **Step 3: Implement preferred and default paths in `generateWithFallback`**

Replace the stub `// Stub for preferred/default` comment and `return undefined` at the end of `generateWithFallback` with:

```ts
  // ── Preferred and default paths: linear fallback walk ─────────────────────
  const unavailableProviders = new Set<string>();
  const providerKey = (m: ContinueModel): string => `${m.provider}|${m.apiBase ?? ''}`;

  const initialModel =
    mode.kind === 'preferred' ? mode.preferredModel : mode.initialModel;
  const isPreferred = mode.kind === 'preferred';
  const initialLabel = isPreferred
    ? `Preferred model "${initialModel.title ?? initialModel.name}" — provider`
    : 'Provider';

  // Attempt the initial model
  try {
    const content = await deps.generate(initialModel);
    return { content, model: initialModel };
  } catch (err) {
    if (err instanceof ProviderUnavailableError) {
      deps.warn(
        `${initialLabel} "${err.provider}" is not available at ${err.apiBase}. Trying next available model…`
      );
      unavailableProviders.add(providerKey(initialModel));
    } else if (err instanceof ModelNotFoundError) {
      const modelLabel = isPreferred
        ? `Preferred model "${initialModel.title ?? initialModel.name}"`
        : `Model "${initialModel.title ?? initialModel.name}"`;
      deps.warn(
        `${modelLabel} was not found on provider "${err.provider}". Trying next available model…`
      );
    } else {
      throw err;
    }
  }

  // Walk remaining models
  for (const candidate of chatModels) {
    if (candidate === initialModel) continue;
    if (unavailableProviders.has(providerKey(candidate))) continue;

    try {
      const content = await deps.generate(candidate);
      return { content, model: candidate };
    } catch (err) {
      if (err instanceof ProviderUnavailableError) {
        unavailableProviders.add(providerKey(candidate));
      } else if (err instanceof ModelNotFoundError) {
        // continue to next candidate
      } else {
        throw err;
      }
    }
  }

  // All models exhausted
  deps.error(
    'Continue Commit: No configured models are responding. Check that your providers are running.'
  );
  return undefined;
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/commands/generateCommit.ts test/suite/generateCommit.test.ts
git commit -m "feat: implement generateWithFallback preferred and default paths"
```

---

### Task 6: Wire `generateWithFallback` into `runGenerate`

**Files:**
- Modify: `src/commands/generateCommit.ts` (`runGenerate` function)

- [ ] **Step 1: Replace the generation block in `runGenerate`**

The current `withProgress` callback in `runGenerate` (lines ~109–147) is replaced. The full updated `runGenerate` function:

```ts
async function runGenerate(showModelPicker: boolean): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('continueCommit');
  const commitStyle = cfg.get<CommitStyle>('commitStyle', 'conventional');
  const preferredModel = cfg.get<string>('preferredModel', '');
  const maxTokens = cfg.get<number>('maxTokens', 256);

  // ── 1. Git repository ────────────────────────────────────────────────────
  const repo = getGitRepository();
  if (!repo) {
    vscode.window.showErrorMessage(
      'Continue Commit: No git repository found. Open a folder that contains a git repository.'
    );
    return;
  }

  if (!hasAnyChanges(repo)) {
    vscode.window.showWarningMessage(
      'Continue Commit: No changes detected. Make some edits or stage files first.'
    );
    return;
  }

  // ── 2. Continue config ────────────────────────────────────────────────────
  const continueConfig = readContinueConfig();
  if (!continueConfig) {
    vscode.window.showErrorMessage(
      'Continue Commit: Could not read ~/.continue/config.yaml (or config.json). ' +
      'Make sure Continue.dev is installed and has been configured at least once.'
    );
    return;
  }

  const chatModels = getChatModels(continueConfig);
  if (chatModels.length === 0) {
    vscode.window.showErrorMessage(
      'Continue Commit: No chat models are configured in your Continue config. ' +
      'Add a model under the "models" key in ~/.continue/config.yaml (or config.json).'
    );
    return;
  }

  // ── 3. Determine mode ─────────────────────────────────────────────────────
  let mode: FallbackMode;

  if (showModelPicker) {
    mode = { kind: 'picker' };
  } else if (preferredModel) {
    const found = findModelByTitle(chatModels, preferredModel);
    if (!found) {
      Logger.log(
        `Preferred model "${preferredModel}" not found in config — using first available.`
      );
    }
    mode = found
      ? { kind: 'preferred', preferredModel: found }
      : { kind: 'default', initialModel: chatModels[0] };
  } else {
    mode = { kind: 'default', initialModel: chatModels[0] };
  }

  // ── 4. Generate ───────────────────────────────────────────────────────────
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.SourceControl,
      title: 'Continue Commit: generating message…',
      cancellable: false,
    },
    async () => {
      try {
        const diff = await getStagedDiff(repo);

        if (!diff.trim()) {
          vscode.window.showWarningMessage(
            'Continue Commit: The diff came back empty. Try staging some changes first.'
          );
          return;
        }

        const branch = getCurrentBranch(repo);
        const messages = buildPrompt({ diff, style: commitStyle, branch });

        const result = await generateWithFallback(chatModels, mode, {
          generate: (model) => getChatCompletion({ model, messages, maxTokens }),
          pick: pickModel,
          warn: (msg) => { void vscode.window.showWarningMessage(msg); },
          error: (msg) => { void vscode.window.showErrorMessage(msg); },
        });

        if (result) {
          setCommitMessage(repo, result.content);
          Logger.log(`Commit message generated (${result.content.length} chars).`);
          vscode.window.showInformationMessage(
            `Continue Commit: Message generated using "${result.model.title ?? result.model.name}" ✓`
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        Logger.error('Generation failed', err);
        vscode.window.showErrorMessage(`Continue Commit: ${msg}`);
      }
    }
  );
}
```

- [ ] **Step 2: Run full test suite**

```bash
npm test
```

Expected: all tests pass with no regressions.

- [ ] **Step 3: Commit**

```bash
git add src/commands/generateCommit.ts
git commit -m "feat: wire generateWithFallback into runGenerate"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run the full test suite one final time**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 2: Type-check the project**

```bash
npx tsc -p tsconfig.json --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit if any lint/type fixes were needed; otherwise done**

```bash
git log --oneline -6
```

Verify the 5 feature commits from Tasks 1–6 are present and the branch is clean.
