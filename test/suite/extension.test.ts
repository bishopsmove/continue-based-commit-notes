import * as assert from 'assert';
import * as vscode from 'vscode';

/**
 * Integration tests that run inside a real VS Code extension host.
 * These verify that the extension activates correctly and its commands
 * and configuration defaults are in place.
 */
suite('Extension — activation & registration', () => {
  // Give the extension host time to load all extensions
  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension('your-publisher-id.continue-commit-notes');
    if (ext && !ext.isActive) {
      await ext.activate();
    }
  });

  test('Extension is present in the registry', () => {
    const ext = vscode.extensions.getExtension(
      'your-publisher-id.continue-commit-notes'
    );
    assert.ok(ext, 'Extension should be registered');
  });

  test('"continueCommit.generate" command is registered', async () => {
    const all = await vscode.commands.getCommands(true);
    assert.ok(
      all.includes('continueCommit.generate'),
      'continueCommit.generate must be registered'
    );
  });

  test('"continueCommit.generateWithModelPicker" command is registered', async () => {
    const all = await vscode.commands.getCommands(true);
    assert.ok(
      all.includes('continueCommit.generateWithModelPicker'),
      'continueCommit.generateWithModelPicker must be registered'
    );
  });

  suite('Default configuration values', () => {
    let cfg: vscode.WorkspaceConfiguration;

    setup(() => {
      cfg = vscode.workspace.getConfiguration('continueCommit');
    });

    test('showModelPicker defaults to false', () => {
      assert.strictEqual(cfg.get('showModelPicker'), false);
    });

    test('preferredModel defaults to empty string', () => {
      assert.strictEqual(cfg.get('preferredModel'), '');
    });

    test('commitStyle defaults to "conventional"', () => {
      assert.strictEqual(cfg.get('commitStyle'), 'conventional');
    });

    test('continuePort defaults to 65432', () => {
      assert.strictEqual(cfg.get('continuePort'), 65432);
    });

    test('maxTokens defaults to 256', () => {
      assert.strictEqual(cfg.get('maxTokens'), 256);
    });

    test('useContinueProxy defaults to true', () => {
      assert.strictEqual(cfg.get('useContinueProxy'), true);
    });
  });
});
