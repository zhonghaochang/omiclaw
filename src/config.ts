import os from 'os';
import path from 'path';

import { readEnvFile } from './env.js';

// Read config values from .env (falls back to process.env).
// Secrets are NOT read here — they stay on disk and are loaded only
// where needed (container-runner.ts) to avoid leaking to child processes.
const envConfig = readEnvFile([
  'ASSISTANT_NAME',
  'ASSISTANT_HAS_OWN_NUMBER',
  'AGENT_ENGINE',
  'AGENT_MODEL',
  'AGENT_TIMEOUT',
  'MAX_CONCURRENT_AGENTS',
  'CONDA_ENV_PATH',
  'DASHBOARD_PORT',
  'CONTAINER_TIMEOUT',
  'IDLE_TIMEOUT',
  'MAX_CONCURRENT_CONTAINERS',
  'LOG_LEVEL',
]);

export const ASSISTANT_NAME =
  process.env.ASSISTANT_NAME || envConfig.ASSISTANT_NAME || 'OmiClaw';
export const ASSISTANT_HAS_OWN_NUMBER =
  (process.env.ASSISTANT_HAS_OWN_NUMBER ||
    envConfig.ASSISTANT_HAS_OWN_NUMBER) === 'true';
export const POLL_INTERVAL = 2000;
export const SCHEDULER_POLL_INTERVAL = 60000;

// Absolute paths needed for container mounts
const PROJECT_ROOT = process.cwd();
const HOME_DIR = process.env.HOME || os.homedir();

// Mount security: allowlist stored OUTSIDE project root, never mounted into containers
export const MOUNT_ALLOWLIST_PATH = path.join(
  HOME_DIR,
  '.config',
  'omiclaw',
  'mount-allowlist.json',
);
export const SENDER_ALLOWLIST_PATH = path.join(
  HOME_DIR,
  '.config',
  'omiclaw',
  'sender-allowlist.json',
);
export const STORE_DIR = path.resolve(PROJECT_ROOT, 'store');
export const GROUPS_DIR = path.resolve(PROJECT_ROOT, 'groups');
export const DATA_DIR = path.resolve(PROJECT_ROOT, 'data');
export const CONDA_ENV_PATH =
  process.env.CONDA_ENV_PATH ||
  envConfig.CONDA_ENV_PATH ||
  '/vepfs-mlp2/mlp-public/250266/miniconda3/envs/omiclaw';
export const DASHBOARD_PORT = parseInt(
  process.env.DASHBOARD_PORT || envConfig.DASHBOARD_PORT || '3220',
  10,
);

// Agent engine: 'codex' (default), 'claude', or 'gemini'
export const AGENT_ENGINE =
  process.env.AGENT_ENGINE || envConfig.AGENT_ENGINE || 'codex';

// Agent model: for Claude engine sets CLAUDE_CODE_MODEL, for Codex sets CODEX_MODEL
// Claude: 'claude-sonnet-4-5-20250514', 'claude-opus-4-5-20250414', etc.
// Codex: 'gpt-5.3-codex', 'gpt-4.1', etc.
export const AGENT_MODEL =
  process.env.AGENT_MODEL || envConfig.AGENT_MODEL || '';

export const AGENT_TIMEOUT = parseInt(
  process.env.AGENT_TIMEOUT ||
    envConfig.AGENT_TIMEOUT ||
    process.env.CONTAINER_TIMEOUT ||
    envConfig.CONTAINER_TIMEOUT ||
    '604800000',
  10,
);
export const CONTAINER_TIMEOUT = AGENT_TIMEOUT;
export const CONTAINER_MAX_OUTPUT_SIZE = parseInt(
  process.env.CONTAINER_MAX_OUTPUT_SIZE || '10485760',
  10,
); // 10MB default
export const IPC_POLL_INTERVAL = 1000;
export const IDLE_TIMEOUT = parseInt(
  process.env.IDLE_TIMEOUT || envConfig.IDLE_TIMEOUT || '604800000',
  10,
);
export const MAX_CONCURRENT_AGENTS = Math.max(
  1,
  parseInt(
    process.env.MAX_CONCURRENT_AGENTS ||
      envConfig.MAX_CONCURRENT_AGENTS ||
      process.env.MAX_CONCURRENT_CONTAINERS ||
      envConfig.MAX_CONCURRENT_CONTAINERS ||
      '5',
    10,
  ) || 5,
);
export const MAX_CONCURRENT_CONTAINERS = MAX_CONCURRENT_AGENTS;

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const TRIGGER_PATTERN = new RegExp(
  `^@${escapeRegex(ASSISTANT_NAME)}\\b`,
  'i',
);

// Timezone for scheduled tasks (cron expressions, etc.)
// Uses system timezone by default
export const TIMEZONE =
  process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
