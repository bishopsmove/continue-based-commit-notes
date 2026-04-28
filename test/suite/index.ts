import * as fs from 'fs';
import * as path from 'path';
import Mocha from 'mocha';

/**
 * Entry point invoked by @vscode/test-electron after VS Code starts.
 * Discovers all *.test.js files next to this file and runs them with Mocha.
 */
export function run(): Promise<void> {
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 15_000,
  });

  const testsRoot = __dirname;
  const files = fs
    .readdirSync(testsRoot)
    .filter(f => f.endsWith('.test.js'));

  files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

  return new Promise((resolve, reject) => {
    mocha.run(failures => {
      if (failures > 0) {
        reject(new Error(`${failures} test(s) failed`));
      } else {
        resolve();
      }
    });
  });
}
