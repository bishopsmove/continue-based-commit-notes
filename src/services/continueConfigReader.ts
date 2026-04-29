import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContinueModel {
  title?: string;
  name?: string; // name is an optional alias for title, used in some YAML configs
  provider: string;
  model: string; // for Ollama models specified as "model: ollama/modelName"
  apiBase?: string;
  apiKey?: string;
}

export interface ContinueConfig {
  models: ContinueModel[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Absolute path to the Continue configuration directory. */
export function getContinueConfigDir(): string {
  return path.join(os.homedir(), '.continue');
}

/**
 * Reads and parses the Continue configuration file.
 * Tries `config.json` first (most common), then `config.yaml`.
 * Returns `null` when neither file exists or cannot be parsed.
 */
export function readContinueConfig(): ContinueConfig | null {
  const dir = getContinueConfigDir();

  const jsonPath = path.join(dir, 'config.json');
  if (fs.existsSync(jsonPath)) {
    try {
      const raw = fs.readFileSync(jsonPath, 'utf-8');
      return JSON.parse(raw) as ContinueConfig;
    } catch {
      return null;
    }
  }

  const yamlPath = path.join(dir, 'config.yaml');
  if (fs.existsSync(yamlPath)) {
    try {
      const raw = fs.readFileSync(yamlPath, 'utf-8');
      return parseMinimalYaml(raw);
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Returns all chat-capable models from a parsed config.
 * Filters out entries missing a `title`, 'name', or `model` field, which are
 * likely embedding / autocomplete-only entries.
 */
export function getChatModels(config: ContinueConfig): ContinueModel[] {
  if (config?.models === undefined || !Array.isArray(config?.models) || config.models.length === 0) {
    return [];
  }
  return config.models.filter(m => (Boolean(m.title) || Boolean(m.name)) && Boolean(m.model));
}

/**
 * Finds a model by its `title` field (case-insensitive).
 * Returns `undefined` if no match is found.
 */
export function findModelByTitle(
  models: ContinueModel[],
  title: string
): ContinueModel | undefined {
  const lower = title.toLowerCase();
  return models.find(m => m.title?.toLowerCase() === lower || m.name?.toLowerCase() === lower);
}

// ---------------------------------------------------------------------------
// Minimal YAML parser
// ---------------------------------------------------------------------------
// Full YAML support would require a runtime dependency. This parser handles
// the subset of YAML that Continue uses for the `models:` array — enough
// for the typical Ollama / LM Studio / OpenAI config.

function parseMinimalYaml(yaml: string): ContinueConfig {
  const models: ContinueModel[] = [];
  const lines = yaml.split('\n');
  let inModels = false;
  let current: Partial<ContinueModel> | null = null;

  const pushCurrent = () => {
    if (
      current &&
      (current.title || current.name) &&
      current.model &&
      current.provider
    ) {
      models.push(current as ContinueModel);
    }
    current = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === 'models:') {
      inModels = true;
      continue;
    }

    if (!inModels) {
      continue;
    }

    // A non-indented key that is not a list item ends the models block.
    if (/^[a-zA-Z]/.test(trimmed) && !trimmed.startsWith('-')) {
      pushCurrent();
      inModels = false;
      continue;
    }

    if (trimmed.startsWith('- ')) {
      // New list item — save previous entry and start a fresh one.
      pushCurrent();
      current = {};
      parseYamlKeyValue(trimmed.slice(2), current as Record<string, string>);
    } else if (current) {
      parseYamlKeyValue(trimmed, current as Record<string, string>);
    }
  }

  pushCurrent();
  return { models };
}

function parseYamlKeyValue(
  line: string,
  obj: Record<string, string>
): void {
  const colonIdx = line.indexOf(':');
  if (colonIdx === -1) {
    return;
  }
  const key = line.slice(0, colonIdx).trim();
  const value = line
    .slice(colonIdx + 1)
    .trim()
    .replace(/^['"]|['"]$/g, ''); // strip optional quotes
  if (key && value) {
    console.log(`Parsed key: ${key}, value: ${value}`);
    obj[key] = value;
  }
}