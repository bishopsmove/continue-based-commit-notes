import * as assert from 'assert';
import {
  getChatModels,
  findModelByTitle,
  type ContinueConfig,
  type ContinueModel,
} from '../../src/services/continueConfigReader';

suite('continueConfigReader — getChatModels', () => {
  test('returns empty array when models array is empty', () => {
    const cfg: ContinueConfig = { models: [] };
    assert.deepStrictEqual(getChatModels(cfg), []);
  });

  test('returns empty array when models key is missing', () => {
    // @ts-expect-error — intentionally malformed
    const cfg: ContinueConfig = {};
    assert.deepStrictEqual(getChatModels(cfg), []);
  });

  test('filters out entries with no title', () => {
    const cfg: ContinueConfig = {
      models: [
        { title: '', provider: 'openai', model: 'gpt-4' },
        { title: 'Valid', provider: 'ollama', model: 'llama3' },
      ],
    };
    const result = getChatModels(cfg);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].title, 'Valid');
  });

  test('filters out entries with no model name', () => {
    const cfg: ContinueConfig = {
      models: [
        { title: 'No model', provider: 'openai', model: '' },
        { title: 'Has model', provider: 'ollama', model: 'llama3' },
      ],
    };
    assert.strictEqual(getChatModels(cfg).length, 1);
  });

  test('returns all valid models unmodified', () => {
    const models: ContinueModel[] = [
      { title: 'GPT-4', provider: 'openai', model: 'gpt-4', apiKey: 'sk-test' },
      { title: 'Llama 3', provider: 'ollama', model: 'llama3' },
      { title: 'LM Studio', provider: 'lmstudio', model: 'local-model' },
    ];
    const cfg: ContinueConfig = { models };
    assert.deepStrictEqual(getChatModels(cfg), models);
  });

  test('preserves optional apiBase and apiKey fields', () => {
    const cfg: ContinueConfig = {
      models: [
        {
          title: 'Custom',
          provider: 'openai',
          model: 'gpt-4',
          apiBase: 'https://my-proxy.example.com',
          apiKey: 'abc123',
        },
      ],
    };
    const result = getChatModels(cfg);
    assert.strictEqual(result[0].apiBase, 'https://my-proxy.example.com');
    assert.strictEqual(result[0].apiKey, 'abc123');
  });
});

suite('continueConfigReader — findModelByTitle', () => {
  const models: ContinueModel[] = [
    { title: 'GPT-4', provider: 'openai', model: 'gpt-4' },
    { title: 'Ollama Llama 3', provider: 'ollama', model: 'llama3' },
    { title: 'LM Studio', provider: 'lmstudio', model: 'local' },
  ];

  test('finds model by exact title', () => {
    const found = findModelByTitle(models, 'GPT-4');
    assert.ok(found, 'Should find GPT-4');
    assert.strictEqual(found!.provider, 'openai');
  });

  test('finds model case-insensitively', () => {
    assert.ok(findModelByTitle(models, 'gpt-4'), 'lowercase should match');
    assert.ok(findModelByTitle(models, 'GPT-4'), 'uppercase should match');
    assert.ok(findModelByTitle(models, 'Gpt-4'), 'mixed case should match');
  });

  test('finds model with spaces in title', () => {
    const found = findModelByTitle(models, 'ollama llama 3');
    assert.ok(found);
    assert.strictEqual(found!.model, 'llama3');
  });

  test('returns undefined for an unknown title', () => {
    assert.strictEqual(findModelByTitle(models, 'Unknown Model'), undefined);
  });

  test('returns undefined for an empty title', () => {
    assert.strictEqual(findModelByTitle(models, ''), undefined);
  });

  test('returns undefined when models array is empty', () => {
    assert.strictEqual(findModelByTitle([], 'GPT-4'), undefined);
  });
});
