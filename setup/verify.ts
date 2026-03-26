import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { buildPythonModuleCheckCommand } from '../src/conda-check.js';
import { CONDA_ENV_PATH } from '../src/config.js';
import { emitStatus } from './status.js';

function detectService(projectRoot: string): { type: string; running: boolean } {
  try {
    const output = execSync('launchctl list', { encoding: 'utf-8' });
    if (output.includes('com.omiclaw')) return { type: 'launchd', running: true };
  } catch {
    // ignore
  }

  try {
    execSync('systemctl --user is-active omiclaw', { stdio: 'ignore' });
    return { type: 'systemd-user', running: true };
  } catch {
    // ignore
  }

  try {
    const output = execSync(`pgrep -af ${JSON.stringify(path.join(projectRoot, 'dist', 'index.js'))}`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (output.trim()) return { type: 'process', running: true };
  } catch {
    // ignore
  }

  return { type: 'none', running: false };
}

export async function run(_args: string[]): Promise<void> {
  const projectRoot = process.cwd();
  const condaPython = path.join(CONDA_ENV_PATH, 'bin', 'python');
  const runnerDist = path.join(projectRoot, 'container', 'agent-runner', 'dist', 'index.js');
  const service = detectService(projectRoot);

  let importsOk = false;
  if (fs.existsSync(condaPython)) {
    try {
      execSync(buildPythonModuleCheckCommand(condaPython), {
        stdio: 'ignore',
        timeout: 15000,
      });
      importsOk = true;
    } catch {
      // ignore
    }
  }

  emitStatus('VERIFY', {
    CONDA_ENV_PATH,
    CONDA_ENV_EXISTS: fs.existsSync(condaPython),
    RUNNER_EXISTS: fs.existsSync(runnerDist),
    IMPORTS_OK: importsOk,
    SERVICE_TYPE: service.type,
    SERVICE_RUNNING: service.running,
    STATUS: fs.existsSync(condaPython) && fs.existsSync(runnerDist) && importsOk ? 'success' : 'failed',
  });
}
