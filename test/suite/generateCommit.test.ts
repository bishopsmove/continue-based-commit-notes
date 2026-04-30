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

      const result = await mod.generateWithFallback(models, { kind: 'preferred', preferredModel: preferred }, {
        generate: async (m) => {
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
      assert.strictEqual(result!.model, initial);
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
});
