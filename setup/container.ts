import { execSync } from 'child_process';
import path from 'path';

import { buildPythonModuleCheckCommand } from '../src/conda-check.js';
import { CONDA_ENV_PATH } from '../src/config.js';
import { logger } from '../src/logger.js';
import { emitStatus } from './status.js';

export async function run(_args: string[]): Promise<void> {
  const projectRoot = process.cwd();
  const logFile = path.join(projectRoot, 'logs', 'setup.log');

  let buildOk = false;
  let verifyOk = false;

  try {
    execSync('npm run build:agent-runner', {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    buildOk = true;
  } catch (err) {
    logger.error({ err }, 'agent-runner build failed');
  }

  if (buildOk) {
    try {
      execSync(
        buildPythonModuleCheckCommand(
          path.join(CONDA_ENV_PATH, 'bin', 'python'),
        ),
        { stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 },
      );
      verifyOk = true;
    } catch (err) {
      logger.error({ err }, 'Conda runtime verification failed');
    }
  }

  emitStatus('SETUP_CONTAINER', {
    RUNTIME: 'host-conda',
    CONDA_ENV_PATH,
    BUILD_OK: buildOk,
    TEST_OK: verifyOk,
    STATUS: buildOk && verifyOk ? 'success' : 'failed',
    LOG: 'logs/setup.log',
  });

  if (!(buildOk && verifyOk)) {
    process.exit(1);
  }
}
