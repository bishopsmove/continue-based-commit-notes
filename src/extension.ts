import * as vscode from 'vscode';
import {
  generateCommitCommand,
  generateCommitWithPickerCommand,
} from './commands/generateCommit';
import { Logger } from './utils/logger';

export function activate(context: vscode.ExtensionContext): void {
  Logger.initialize('Continue Commit Notes');
  Logger.log('Extension activated.');

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'continueCommit.generate',
      generateCommitCommand
    ),
    vscode.commands.registerCommand(
      'continueCommit.generateWithModelPicker',
      generateCommitWithPickerCommand
    )
  );
}

export function deactivate(): void {
  Logger.dispose();
}
