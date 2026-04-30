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
