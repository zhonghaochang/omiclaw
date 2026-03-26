/**
 * Host agent runner for OmiClaw.
 * Preserves the historical container-runner interface while executing
 * agents as local child processes inside the configured Conda environment.
 */
import { ChildProcess, exec, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  AGENT_ENGINE,
  AGENT_MODEL,
  CONDA_ENV_PATH,
  CONTAINER_MAX_OUTPUT_SIZE,
  CONTAINER_TIMEOUT,
  DATA_DIR,
  GROUPS_DIR,
  IDLE_TIMEOUT,
  TIMEZONE,
} from './config.js';
import {
  registerRuntimeProcess,
  stopContainer,
  unregisterRuntimeProcess,
} from './container-runtime.js';
import { readEnvFile } from './env.js';
import { resolveGroupFolderPath, resolveGroupIpcPath } from './group-folder.js';
import { logger } from './logger.js';
import { validateAdditionalMounts } from './mount-security.js';
import { RegisteredGroup } from './types.js';
import { agentEvents } from './web/events.js';

// Sentinel markers for robust output parsing (must match agent-runner)
const OUTPUT_START_MARKER = '---MATCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---MATCLAW_OUTPUT_END---';

export interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
  assistantName?: string;
  secrets?: Record<string, string>;
}

export interface ContainerOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
}

export interface AvailableGroup {
  jid: string;
  name: string;
  lastActivity: string;
  isRegistered: boolean;
}

function mkdirWorld(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
  try {
    fs.chmodSync(dirPath, 0o777);
  } catch {
    /* best-effort */
  }
}

function readSecrets(): Record<string, string> {
  return readEnvFile([
    'CLAUDE_CODE_OAUTH_TOKEN',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_BASE_URL',
    'CODEX_API_KEY',
    'OPENAI_API_KEY',
    'OPENAI_BASE_URL',
    'CODEX_MODEL',
    'OPENAI_MODEL',
    'CODEX_MODEL_REASONING_EFFORT',
    'OPENAI_MODEL_REASONING_EFFORT',
    'MODEL_REASONING_EFFORT',
    'GOOGLE_API_KEY',
  ]);
}

function syncSharedAuthFiles(groupHomeDir: string, hostHomeDir: string): void {
  const groupClaudeDir = path.join(groupHomeDir, '.claude');
  mkdirWorld(groupClaudeDir);

  const sharedClaudeFiles = [
    '.credentials.json',
    'mcp-needs-auth-cache.json',
  ];

  for (const filename of sharedClaudeFiles) {
    const hostPath = path.join(hostHomeDir, '.claude', filename);
    const groupPath = path.join(groupClaudeDir, filename);
    if (!fs.existsSync(hostPath)) continue;

    try {
      if (fs.existsSync(groupPath)) {
        fs.rmSync(groupPath, { recursive: true, force: true });
      }
      fs.symlinkSync(hostPath, groupPath);
    } catch (err) {
      logger.warn({ err, hostPath, groupPath }, 'Failed to sync Claude auth file');
    }
  }
}

interface RuntimePaths {
  groupDir: string;
  groupHomeDir: string;
  ipcDir: string;
  extraBaseDir?: string;
}

function syncSkills(groupClaudeDir: string): void {
  const skillsSrc = path.join(process.cwd(), 'container', 'skills');
  const skillsDst = path.join(groupClaudeDir, 'skills');
  if (!fs.existsSync(skillsSrc)) return;

  if (fs.existsSync(skillsDst)) {
    fs.rmSync(skillsDst, { recursive: true });
  }

  mkdirWorld(skillsDst);
  for (const entry of fs.readdirSync(skillsSrc)) {
    const srcDir = path.join(skillsSrc, entry);
    if (!fs.statSync(srcDir).isDirectory()) continue;
    fs.cpSync(srcDir, path.join(skillsDst, entry), { recursive: true });
  }
}

function prepareRuntimePaths(
  group: RegisteredGroup,
  isMain: boolean,
): RuntimePaths {
  const hostHomeDir = os.homedir();
  const groupDir = resolveGroupFolderPath(group.folder);
  mkdirWorld(groupDir);

  const groupHomeDir = path.join(DATA_DIR, 'sessions', group.folder);
  const groupClaudeDir = path.join(groupHomeDir, '.claude');
  mkdirWorld(groupClaudeDir);
  mkdirWorld(path.join(groupClaudeDir, 'debug'));

  const settingsFile = path.join(groupClaudeDir, 'settings.json');
  if (!fs.existsSync(settingsFile)) {
    fs.writeFileSync(
      settingsFile,
      JSON.stringify(
        {
          env: {
            CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
            CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: '1',
            CLAUDE_CODE_DISABLE_AUTO_MEMORY: '0',
          },
        },
        null,
        2,
      ) + '\n',
    );
  }
  syncSkills(groupClaudeDir);

  const groupCodexDir = path.join(groupHomeDir, '.codex');
  mkdirWorld(groupCodexDir);
  const hostCodexAuth = path.join(hostHomeDir, '.codex', 'auth.json');
  if (fs.existsSync(hostCodexAuth)) {
    fs.copyFileSync(hostCodexAuth, path.join(groupCodexDir, 'auth.json'));
  }
  syncSharedAuthFiles(groupHomeDir, hostHomeDir);

  const hostGmailDir = path.join(hostHomeDir, '.gmail-mcp');
  const groupGmailDir = path.join(groupHomeDir, '.gmail-mcp');
  if (fs.existsSync(hostGmailDir) && !fs.existsSync(groupGmailDir)) {
    fs.symlinkSync(hostGmailDir, groupGmailDir, 'dir');
  }

  const ipcDir = resolveGroupIpcPath(group.folder);
  mkdirWorld(ipcDir);
  mkdirWorld(path.join(ipcDir, 'messages'));
  mkdirWorld(path.join(ipcDir, 'tasks'));
  mkdirWorld(path.join(ipcDir, 'input'));
  mkdirWorld(path.join(ipcDir, 'output'));

  let extraBaseDir: string | undefined;
  if (group.containerConfig?.additionalMounts) {
    const validatedMounts = validateAdditionalMounts(
      group.containerConfig.additionalMounts,
      group.name,
      isMain,
    );
    if (validatedMounts.length > 0) {
      extraBaseDir = path.join(groupHomeDir, 'extra');
      if (fs.existsSync(extraBaseDir)) {
        fs.rmSync(extraBaseDir, { recursive: true });
      }
      mkdirWorld(extraBaseDir);

      for (const mount of validatedMounts) {
        const relativePath = mount.containerPath.replace(
          /^\/workspace\/extra\//,
          '',
        );
        const linkPath = path.join(extraBaseDir, relativePath);
        mkdirWorld(path.dirname(linkPath));
        fs.symlinkSync(mount.hostPath, linkPath);
      }
    }
  }

  return { groupDir, groupHomeDir, ipcDir, extraBaseDir };
}

function getRunnerCommand(agentName: string): { command: string; args: string[] } {
  const distRunner = path.join(
    process.cwd(),
    'container',
    'agent-runner',
    'dist',
    'index.js',
  );
  if (fs.existsSync(distRunner)) {
    return {
      command: process.execPath,
      args: [distRunner, '--agent-name', agentName],
    };
  }

  const tsRunner = path.join(
    process.cwd(),
    'container',
    'agent-runner',
    'src',
    'index.ts',
  );
  const tsxBin = path.resolve('node_modules/.bin/tsx');
  return {
    command: fs.existsSync(tsxBin) ? tsxBin : 'tsx',
    args: [tsRunner, '--agent-name', agentName],
  };
}

export async function runContainerAgent(
  group: RegisteredGroup,
  input: ContainerInput,
  onProcess: (proc: ChildProcess, containerName: string) => void,
  onOutput?: (output: ContainerOutput) => Promise<void>,
): Promise<ContainerOutput> {
  const startTime = Date.now();
  const runtimePaths = prepareRuntimePaths(group, input.isMain);
  const safeName = group.folder.replace(/[^a-zA-Z0-9-]/g, '-');
  const containerName = `omiclaw-${safeName}-${Date.now()}`;
  const logsDir = path.join(runtimePaths.groupDir, 'logs');
  mkdirWorld(logsDir);

  const logsPath = path.join(logsDir, 'agent-live.log');
  const liveStream = fs.createWriteStream(logsPath, { flags: 'w' });

  const freshConfig = readEnvFile(['AGENT_ENGINE', 'AGENT_MODEL']);
  const engine = freshConfig.AGENT_ENGINE || AGENT_ENGINE;
  const model = freshConfig.AGENT_MODEL || AGENT_MODEL;
  const { command, args } = getRunnerCommand(containerName);

  logger.info(
    {
      group: group.name,
      containerName,
      engine,
      condaEnv: CONDA_ENV_PATH,
    },
    'Spawning host agent',
  );

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: runtimePaths.groupDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        TZ: TIMEZONE,
        HOME: runtimePaths.groupHomeDir,
        AGENT_ENGINE: engine,
        ...(model ? { AGENT_MODEL: model } : {}),
        PATH: `${path.join(CONDA_ENV_PATH, 'bin')}:${process.env.PATH || ''}`,
        CONDA_PREFIX: CONDA_ENV_PATH,
        OMICLAW_WORKSPACE_GROUP: runtimePaths.groupDir,
        OMICLAW_WORKSPACE_GLOBAL: path.join(GROUPS_DIR, 'global'),
        OMICLAW_WORKSPACE_IPC: runtimePaths.ipcDir,
        ...(runtimePaths.extraBaseDir
          ? { OMICLAW_WORKSPACE_EXTRA: runtimePaths.extraBaseDir }
          : {}),
      },
    });

    if (child.pid) {
      registerRuntimeProcess(containerName, child.pid);
    }
    onProcess(child, containerName);

    let stdout = '';
    let stderr = '';
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let parseBuffer = '';
    let newSessionId: string | undefined;
    let timedOut = false;
    let hadStreamingOutput = false;
    let outputChain = Promise.resolve();

    liveStream.write(`=== OmiClaw Agent Live Log ===\n`);
    liveStream.write(`Started: ${new Date().toISOString()}\n`);
    liveStream.write(`Group: ${group.name}\n`);
    liveStream.write(`Agent: ${containerName}\n`);
    liveStream.write(`${'='.repeat(60)}\n\n`);

    agentEvents.emit('agent', {
      type: 'agent:start',
      group: group.name,
      groupFolder: group.folder,
      timestamp: new Date().toISOString(),
      data: { containerName, prompt: input.prompt },
    });

    input.secrets = readSecrets();
    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
    delete input.secrets;

    const configTimeout = group.containerConfig?.timeout || CONTAINER_TIMEOUT;
    const timeoutMs = Math.max(configTimeout, IDLE_TIMEOUT + 30_000);
    const killOnTimeout = () => {
      timedOut = true;
      logger.error({ group: group.name, containerName }, 'Agent timeout, stopping');
      exec(stopContainer(containerName), { timeout: 15000 }, (err) => {
        if (err) {
          try {
            child.kill('SIGKILL');
          } catch {
            /* ignore */
          }
        }
      });
    };

    let timeout = setTimeout(killOnTimeout, timeoutMs);
    const resetTimeout = () => {
      clearTimeout(timeout);
      timeout = setTimeout(killOnTimeout, timeoutMs);
    };

    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      liveStream.write(chunk);

      agentEvents.emit('agent', {
        type: 'agent:stdout',
        group: group.name,
        groupFolder: group.folder,
        timestamp: new Date().toISOString(),
        data: { chunk },
      });

      if (!stdoutTruncated) {
        const remaining = CONTAINER_MAX_OUTPUT_SIZE - stdout.length;
        if (chunk.length > remaining) {
          stdout += chunk.slice(0, remaining);
          stdoutTruncated = true;
        } else {
          stdout += chunk;
        }
      }

      if (!onOutput) return;

      parseBuffer += chunk;
      let startIdx: number;
      while ((startIdx = parseBuffer.indexOf(OUTPUT_START_MARKER)) !== -1) {
        const endIdx = parseBuffer.indexOf(OUTPUT_END_MARKER, startIdx);
        if (endIdx === -1) break;

        const jsonStr = parseBuffer
          .slice(startIdx + OUTPUT_START_MARKER.length, endIdx)
          .trim();
        parseBuffer = parseBuffer.slice(endIdx + OUTPUT_END_MARKER.length);

        try {
          const parsed: ContainerOutput = JSON.parse(jsonStr);
          if (parsed.newSessionId) newSessionId = parsed.newSessionId;
          hadStreamingOutput = true;
          resetTimeout();
          agentEvents.emit('agent', {
            type: 'agent:output',
            group: group.name,
            groupFolder: group.folder,
            timestamp: new Date().toISOString(),
            data: { result: parsed.result, status: parsed.status },
          });
          outputChain = outputChain.then(() => onOutput(parsed));
        } catch (err) {
          logger.warn({ err }, 'Failed to parse agent output chunk');
        }
      }
    });

    child.stderr.on('data', (data) => {
      const chunk = data.toString();
      for (const line of chunk.trim().split('\n')) {
        if (!line) continue;
        liveStream.write(`[stderr] ${line}\n`);
        logger.debug({ agent: group.folder }, line);
      }

      agentEvents.emit('agent', {
        type: 'agent:stderr',
        group: group.name,
        groupFolder: group.folder,
        timestamp: new Date().toISOString(),
        data: { chunk },
      });

      if (stderrTruncated) return;
      const remaining = CONTAINER_MAX_OUTPUT_SIZE - stderr.length;
      if (chunk.length > remaining) {
        stderr += chunk.slice(0, remaining);
        stderrTruncated = true;
      } else {
        stderr += chunk;
      }
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      unregisterRuntimeProcess(containerName);

      const duration = Date.now() - startTime;
      const hostCodexAuth = path.join(os.homedir(), '.codex', 'auth.json');
      const groupCodexAuth = path.join(
        runtimePaths.groupHomeDir,
        '.codex',
        'auth.json',
      );
      try {
        if (fs.existsSync(groupCodexAuth)) {
          fs.mkdirSync(path.dirname(hostCodexAuth), { recursive: true });
          fs.copyFileSync(groupCodexAuth, hostCodexAuth);
        }
      } catch (err) {
        logger.warn({ err }, 'Failed to sync Codex auth back to host');
      }

      liveStream.write(`\n${'='.repeat(60)}\n`);
      liveStream.write(`Finished: ${new Date().toISOString()}\n`);
      liveStream.write(
        `Duration: ${Math.round(duration / 1000)}s | Exit Code: ${code}\n`,
      );
      liveStream.end();

      agentEvents.emit('agent', {
        type: 'agent:end',
        group: group.name,
        groupFolder: group.folder,
        timestamp: new Date().toISOString(),
        data: { duration, exitCode: code },
      });

      if (timedOut) {
        if (hadStreamingOutput) {
          outputChain.then(() =>
            resolve({ status: 'success', result: null, newSessionId }),
          );
          return;
        }
        resolve({
          status: 'error',
          result: null,
          error: `Agent timed out after ${configTimeout}ms`,
        });
        return;
      }

      if (code !== 0) {
        const isSignalKill = code === 137 || code === 143;
        if (!isSignalKill || !hadStreamingOutput) {
          resolve({
            status: 'error',
            result: null,
            error: `Agent exited with code ${code}: ${stderr.slice(-200)}`,
          });
          return;
        }
      }

      if (onOutput) {
        outputChain.then(() =>
          resolve({ status: 'success', result: null, newSessionId }),
        );
        return;
      }

      try {
        const startIdx = stdout.indexOf(OUTPUT_START_MARKER);
        const endIdx = stdout.indexOf(OUTPUT_END_MARKER);

        let jsonLine: string;
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          jsonLine = stdout
            .slice(startIdx + OUTPUT_START_MARKER.length, endIdx)
            .trim();
        } else {
          const lines = stdout.trim().split('\n');
          jsonLine = lines[lines.length - 1];
        }

        resolve(JSON.parse(jsonLine) as ContainerOutput);
      } catch (err) {
        resolve({
          status: 'error',
          result: null,
          error: `Failed to parse agent output: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      unregisterRuntimeProcess(containerName);
      resolve({
        status: 'error',
        result: null,
        error: `Agent spawn error: ${err.message}`,
      });
    });
  });
}

export function writeTasksSnapshot(
  groupFolder: string,
  isMain: boolean,
  tasks: Array<{
    id: string;
    groupFolder: string;
    prompt: string;
    schedule_type: string;
    schedule_value: string;
    status: string;
    next_run: string | null;
  }>,
): void {
  const groupIpcDir = resolveGroupIpcPath(groupFolder);
  fs.mkdirSync(groupIpcDir, { recursive: true });

  const filteredTasks = isMain
    ? tasks
    : tasks.filter((t) => t.groupFolder === groupFolder);

  fs.writeFileSync(
    path.join(groupIpcDir, 'current_tasks.json'),
    JSON.stringify(filteredTasks, null, 2),
  );
}

export function writeGroupsSnapshot(
  groupFolder: string,
  isMain: boolean,
  groups: AvailableGroup[],
  _registeredJids: Set<string>,
): void {
  const groupIpcDir = resolveGroupIpcPath(groupFolder);
  fs.mkdirSync(groupIpcDir, { recursive: true });

  const visibleGroups = isMain ? groups : [];
  fs.writeFileSync(
    path.join(groupIpcDir, 'available_groups.json'),
    JSON.stringify(
      {
        groups: visibleGroups,
        lastSync: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}
