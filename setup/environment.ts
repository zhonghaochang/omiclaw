import fs from 'fs';
import path from 'path';

import Database from 'better-sqlite3';

import { CONDA_ENV_PATH, STORE_DIR } from '../src/config.js';
import { logger } from '../src/logger.js';
import { commandExists, getPlatform, isHeadless, isWSL } from './platform.js';
import { emitStatus } from './status.js';

export async function run(_args: string[]): Promise<void> {
  const projectRoot = process.cwd();
  const platform = getPlatform();
  const wsl = isWSL();
  const headless = isHeadless();

  const condaPython = path.join(CONDA_ENV_PATH, 'bin', 'python');
  const condaExists = fs.existsSync(condaPython);
  const hasEnv = fs.existsSync(path.join(projectRoot, '.env'));

  const authDir = path.join(projectRoot, 'store', 'auth');
  const hasAuth = fs.existsSync(authDir) && fs.readdirSync(authDir).length > 0;

  let hasRegisteredGroups = false;
  const dbPath = path.join(STORE_DIR, 'messages.db');
  if (fs.existsSync(dbPath)) {
    try {
      const db = new Database(dbPath, { readonly: true });
      const row = db
        .prepare('SELECT COUNT(*) as count FROM registered_groups')
        .get() as { count: number };
      hasRegisteredGroups = row.count > 0;
      db.close();
    } catch {
      // ignore
    }
  }

  logger.info(
    { platform, wsl, condaExists, hasEnv, hasAuth, hasRegisteredGroups },
    'Environment check complete',
  );

  emitStatus('CHECK_ENVIRONMENT', {
    PLATFORM: platform,
    IS_WSL: wsl,
    IS_HEADLESS: headless,
    HAS_NODE: commandExists('node'),
    HAS_NPM: commandExists('npm'),
    CONDA_ENV_PATH,
    CONDA_ENV_EXISTS: condaExists,
    HAS_ENV: hasEnv,
    HAS_AUTH: hasAuth,
    HAS_REGISTERED_GROUPS: hasRegisteredGroups,
    STATUS: condaExists ? 'success' : 'failed',
    LOG: 'logs/setup.log',
  });

  if (!condaExists) {
    process.exit(1);
  }
}
