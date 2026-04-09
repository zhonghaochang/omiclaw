/**
 * Host runtime abstraction for OmiClaw.
 * Keeps the historical container-runtime interface so the rest of the app
 * can stay mostly unchanged while execution happens on the host.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import {
  buildPythonModuleCheckCommand,
  parseMissingModules,
} from './conda-check.js';
import { CONDA_ENV_PATH } from './config.js';
import { logger } from './logger.js';

/** Historical name kept for compatibility with existing imports/tests. */
export const CONTAINER_RUNTIME_BIN = 'host';

const runtimeProcesses = new Map<string, number>();

function agentRunnerDistPath(): string {
  return path.join(
    process.cwd(),
    'container',
    'agent-runner',
    'dist',
    'index.js',
  );
}

function pythonPath(): string {
  return path.join(CONDA_ENV_PATH, 'bin', 'python');
}

export function registerRuntimeProcess(name: string, pid: number): void {
  runtimeProcesses.set(name, pid);
}

export function unregisterRuntimeProcess(name: string): void {
  runtimeProcesses.delete(name);
}

/** Returns a shell command that stops the local agent process. */
export function stopContainer(name: string): string {
  const pid = runtimeProcesses.get(name);
  return pid ? `kill -TERM ${pid}` : 'true';
}

/** Kill a running agent process by registered name. */
export function killContainer(name: string): void {
  const pid = runtimeProcesses.get(name);
  if (!pid) return;
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // Process may already be gone.
  } finally {
    runtimeProcesses.delete(name);
  }
}

/** Validate the host runtime prerequisites. */
export function ensureContainerRuntimeRunning(): void {
  const py = pythonPath();
  if (!fs.existsSync(py)) {
    throw new Error(`Conda environment not found: ${CONDA_ENV_PATH}`);
  }

  try {
    const raw = execSync(buildPythonModuleCheckCommand(py), {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf-8',
      timeout: 15000,
    });
    const missing = parseMissingModules(raw);
    if (missing.length > 0) {
      throw new Error(`Missing modules: ${missing.join(', ')}`);
    }
  } catch (err) {
    const execErr = err as NodeJS.ErrnoException & {
      stdout?: string | Buffer;
    };
    const missing = parseMissingModules(execErr.stdout);
    const details =
      missing.length > 0
        ? `Missing modules: ${missing.join(', ')}`
        : execErr.code === 'ETIMEDOUT'
          ? 'Package availability check timed out'
          : 'Package availability check failed';

    logger.error(
      { err, condaEnv: CONDA_ENV_PATH, missing },
      'Conda environment check failed',
    );
    throw new Error(
      `Conda environment check failed for ${CONDA_ENV_PATH}: ${details}`,
    );
  }

  logger.debug({ condaEnv: CONDA_ENV_PATH }, 'Host Conda runtime is ready');
}

/** Validate that the local agent-runner build artifact exists. */
export function ensureImageAvailable(): void {
  const distPath = agentRunnerDistPath();
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Local agent-runner is not built. Expected: ${distPath}`,
    );
  }
}

/** Kill orphaned host agent processes from previous runs. */
export function cleanupOrphans(): void {
  const patterns = [
    'container/agent-runner/dist/index.js --agent-name omiclaw-',
    'container/agent-runner/src/index.ts --agent-name omiclaw-',
  ];

  for (const pattern of patterns) {
    try {
      execSync(`pkill -f ${JSON.stringify(pattern)}`, {
        stdio: 'ignore',
      });
    } catch {
      // No orphan processes found for this pattern.
    }
  }
  runtimeProcesses.clear();
}
