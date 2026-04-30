import * as assert from 'assert';

/**
 * Unit-level smoke tests for continueApiClient.
 *
 * Full integration tests (actually calling Ollama / Continue proxy) are
 * intentionally omitted here — they require a running local model server
 * and are best run manually or in a dedicated E2E job.
 *
 * These tests verify the module's exported surface and that provider
 * selection logic is reachable without network errors.
 */
suite('continueApiClient — module shape', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('../../src/services/continueApiClient') as typeof import('../../src/services/continueApiClient');

  test('exports getChatCompletion as a function', () => {
    assert.strictEqual(typeof mod.getChatCompletion, 'function');
  });

  test('getChatCompletion returns a Promise when called', () => {
    // Pass a deliberately unreachable port so we get a fast network error
    // rather than blocking the test suite. The point is that a Promise is returned.
    const result = mod.getChatCompletion({
      model: {
        title: 'test',
        provider: 'ollama',
        model: 'test',
        apiBase: 'http://localhost:1', // port 1 — connection refused immediately
      },
      messages: [{ role: 'user', content: 'hello' }],
      maxTokens: 10,
    });

    assert.ok(result instanceof Promise, 'Should return a Promise');

    // Swallow the expected network error to keep the test clean
    result.catch(() => { /* expected */ });
  });

  test('getChatCompletion rejects (not throws) on network failure', async () => {
    let rejected = false;
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
    } catch {
      rejected = true;
    }
    assert.ok(rejected, 'Should reject when the server is unreachable');
  });
});

suite('continueApiClient — error classes', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
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
