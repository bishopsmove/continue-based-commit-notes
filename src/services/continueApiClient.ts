import * as http from 'http';
import * as https from 'https';
import * as vscode from 'vscode';

import type { ContinueModel } from './continueConfigReader';
import type { ChatMessage } from '../utils/promptBuilder';
import { Logger } from '../utils/logger';

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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompletionOptions {
  model: ContinueModel;
  messages: ChatMessage[];
  maxTokens?: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates a chat completion using the supplied Continue model config.
 *
 * Strategy (when `continueCommit.useContinueProxy` is true):
 *   1. POST to Continue's local proxy at `localhost:{continuePort}/chat/completions`.
 *      This works regardless of which provider the model actually uses.
 *   2. On failure (Continue not running / wrong port), fall back to calling
 *      the provider's native API directly using the credentials in the config.
 *
 * When `useContinueProxy` is false, step 1 is skipped.
 */
export async function getChatCompletion(
  options: CompletionOptions
): Promise<string> {
  const config = vscode.workspace.getConfiguration('continueCommit');
  const useProxy = config.get<boolean>('useContinueProxy', true);
  const continuePort = config.get<number>('continuePort', 65432);

  if (useProxy) {
    try {
      Logger.log(`Trying Continue proxy at localhost:${continuePort}…`);
      const result = await tryContinueProxy(options, continuePort);
      Logger.log('Continue proxy succeeded.');
      return result;
    } catch (err) {
      Logger.log(
        `Continue proxy unavailable (${errorMessage(err)}). Falling back to direct provider API.`
      );
    }
  }

  return callProviderDirect(options);
}

// ---------------------------------------------------------------------------
// Continue proxy
// ---------------------------------------------------------------------------

async function tryContinueProxy(
  options: CompletionOptions,
  port: number
): Promise<string> {
  const body = JSON.stringify({
    model: options.model.title,
    messages: options.messages,
    max_tokens: options.maxTokens ?? 256,
    stream: false,
  });

  const raw = await httpPost(
    { hostname: 'localhost', port, path: '/chat/completions', provider: 'continue-proxy', apiBase: `http://localhost:${port}` },
    body,
    {},
    false
  );

  const json = JSON.parse(raw) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from Continue proxy');
  }
  return content.trim();
}

// ---------------------------------------------------------------------------
// Direct provider fallback
// ---------------------------------------------------------------------------

async function callProviderDirect(options: CompletionOptions): Promise<string> {
  const provider = (options.model.provider ?? '').toLowerCase();
  Logger.log(`Calling provider directly: ${provider}`);

  switch (provider) {
    case 'ollama':
      return callOllama(options);
    case 'anthropic':
      return callAnthropic(options);
    default:
      // Covers: openai, lmstudio, llamacpp, together, mistral, cohere, etc.
      return callOpenAICompatible(options);
  }
}

// ---------------------------------------------------------------------------
// Ollama
// ---------------------------------------------------------------------------

async function callOllama(options: CompletionOptions): Promise<string> {
  const { model } = options;
  const base = model.apiBase ?? 'http://localhost:11434';
  const url = safeUrl('/api/chat', base);

  const body = JSON.stringify({
    model: model.model,
    messages: options.messages,
    stream: false,
    options: { num_predict: options.maxTokens ?? 256 },
  });

  const raw = await httpPost(urlToOpts(url, model.provider, base), body, {}, url.protocol === 'https:');
  const json = JSON.parse(raw) as { message?: { content?: string } };
  const content = json?.message?.content;
  if (!content) {
    throw new Error('Empty response from Ollama');
  }
  return content.trim();
}

// ---------------------------------------------------------------------------
// OpenAI-compatible (openai, lmstudio, llamacpp, together, mistral, …)
// ---------------------------------------------------------------------------

async function callOpenAICompatible(options: CompletionOptions): Promise<string> {
  const { model } = options;
  const defaultBase = providerDefaultBase(model.provider);
  const base = model.apiBase ?? defaultBase;
  const url = safeUrl('/v1/chat/completions', base);

  const body = JSON.stringify({
    model: model.model,
    messages: options.messages,
    max_tokens: options.maxTokens ?? 256,
    stream: false,
  });

  const extraHeaders: Record<string, string> = {};
  if (model.apiKey) {
    extraHeaders['Authorization'] = `Bearer ${model.apiKey}`;
  }

  const raw = await httpPost(
    urlToOpts(url, model.provider, base),
    body,
    extraHeaders,
    url.protocol === 'https:'
  );
  const json = JSON.parse(raw) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from OpenAI-compatible API');
  }
  return content.trim();
}

// ---------------------------------------------------------------------------
// Anthropic Messages API
// ---------------------------------------------------------------------------

async function callAnthropic(options: CompletionOptions): Promise<string> {
  const { model } = options;
  const base = model.apiBase ?? 'https://api.anthropic.com';
  const url = safeUrl('/v1/messages', base);

  const systemMsg = options.messages.find(m => m.role === 'system');
  const userMessages = options.messages.filter(m => m.role !== 'system');

  const payload: Record<string, unknown> = {
    model: model.model,
    max_tokens: options.maxTokens ?? 256,
    messages: userMessages,
  };
  if (systemMsg) {
    payload['system'] = systemMsg.content;
  }

  const body = JSON.stringify(payload);
  const extraHeaders: Record<string, string> = {
    'anthropic-version': '2023-06-01',
  };
  if (model.apiKey) {
    extraHeaders['x-api-key'] = model.apiKey;
  }

  const raw = await httpPost(urlToOpts(url, model.provider, base), body, extraHeaders, true);
  const json = JSON.parse(raw) as {
    content?: Array<{ text?: string }>;
  };
  const content = json?.content?.[0]?.text;
  if (!content) {
    throw new Error('Empty response from Anthropic');
  }
  return content.trim();
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

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
          } else if (status === 404) {
            reject(new ModelNotFoundError(opts.path, opts.provider));
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

function safeUrl(pathSuffix: string, base: string): URL {
  // Normalise — ensure no double slashes when base ends with /
  const normalised = base.replace(/\/$/, '');
  return new URL(pathSuffix, normalised);
}

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

function providerDefaultBase(provider: string): string {
  switch ((provider ?? '').toLowerCase()) {
    case 'lmstudio':
      return 'http://localhost:1234';
    case 'llamacpp':
      return 'http://localhost:8080';
    default:
      return 'https://api.openai.com';
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
