import * as vscode from 'vscode';

/**
 * Lightweight output-channel logger.
 * Call Logger.initialize() in activate(), Logger.dispose() in deactivate().
 */
export class Logger {
  private static channel: vscode.OutputChannel | undefined;

  static initialize(name: string): void {
    Logger.channel = vscode.window.createOutputChannel(name);
  }

  static log(message: string): void {
    Logger.channel?.appendLine(`[${timestamp()}] ${message}`);
  }

  static error(message: string, err?: unknown): void {
    const detail = err instanceof Error ? err.message : String(err ?? '');
    Logger.channel?.appendLine(
      `[${timestamp()}] ERROR: ${message}${detail ? ` — ${detail}` : ''}`
    );
  }

  /** Show and focus the output channel. */
  static show(): void {
    Logger.channel?.show(true);
  }

  static dispose(): void {
    Logger.channel?.dispose();
    Logger.channel = undefined;
  }
}

function timestamp(): string {
  return new Date().toISOString();
}
