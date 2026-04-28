import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  try {
    // The folder containing the extension's package.json
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    // The path to the compiled test suite index
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      // Suppress VS Code's welcome / walkthrough UI during tests
      launchArgs: ['--disable-extensions', '--disable-workspace-trust'],
    });
  } catch (err) {
    console.error('Test runner failed:', err);
    process.exit(1);
  }
}

main();
