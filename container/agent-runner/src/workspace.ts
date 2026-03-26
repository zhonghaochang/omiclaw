import path from 'path';

function fromEnv(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const WORKSPACE_GROUP_DIR = fromEnv(
  'OMICLAW_WORKSPACE_GROUP',
  '/workspace/group',
);
export const WORKSPACE_GLOBAL_DIR = fromEnv(
  'OMICLAW_WORKSPACE_GLOBAL',
  '/workspace/global',
);
export const WORKSPACE_IPC_DIR = fromEnv(
  'OMICLAW_WORKSPACE_IPC',
  '/workspace/ipc',
);
export const WORKSPACE_EXTRA_DIR = fromEnv(
  'OMICLAW_WORKSPACE_EXTRA',
  '/workspace/extra',
);
export const IPC_INPUT_DIR = path.join(WORKSPACE_IPC_DIR, 'input');
export const IPC_OUTPUT_DIR = path.join(WORKSPACE_IPC_DIR, 'output');
export const IPC_SECRETS_PATH = path.join(WORKSPACE_IPC_DIR, '_secrets.json');
export const IPC_INPUT_CLOSE_SENTINEL = path.join(IPC_INPUT_DIR, '_close');
