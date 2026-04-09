import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import { PassThrough, Writable } from 'stream';
import fs from 'fs';

const OUTPUT_START_MARKER = '---MATCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---MATCLAW_OUTPUT_END---';

const mockExistsSync = vi.fn<(path: string) => boolean>();
const mockSpawn = vi.fn();
const mockExec = vi.fn();
const registerRuntimeProcess = vi.fn();
const unregisterRuntimeProcess = vi.fn();
const stopContainer = vi.fn((name: string) => `kill -TERM ${name}`);
const emitAgentEvent = vi.fn();

vi.mock('./config.js', () => ({
  AGENT_ENGINE: 'claude',
  AGENT_MODEL: 'claude-sonnet-4-5',
  CONDA_ENV_PATH: '/opt/conda/envs/omiclaw',
  CONTAINER_MAX_OUTPUT_SIZE: 10_485_760,
  CONTAINER_TIMEOUT: 1_800_000,
  DATA_DIR: '/tmp/omiclaw-test-data',
  GROUPS_DIR: '/tmp/omiclaw-test-groups',
  IDLE_TIMEOUT: 1_800_000,
  TIMEZONE: 'UTC',
}));

vi.mock('./logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: (...args: [string]) => mockExistsSync(...args),
      mkdirSync: vi.fn(),
      chmodSync: vi.fn(),
      writeFileSync: vi.fn(),
      readFileSync: vi.fn(() => ''),
      readdirSync: vi.fn(() => []),
      statSync: vi.fn(() => ({ isDirectory: () => false })),
      copyFileSync: vi.fn(),
      cpSync: vi.fn(),
      rmSync: vi.fn(),
      symlinkSync: vi.fn(),
      createWriteStream: vi.fn(
        () =>
          new Writable({
            write(_chunk, _encoding, callback) {
              callback();
            },
          }),
      ),
    },
  };
});

vi.mock('./mount-security.js', () => ({
  validateAdditionalMounts: vi.fn(() => []),
}));

vi.mock('./env.js', () => ({
  readEnvFile: vi.fn(() => ({})),
}));

vi.mock('./group-folder.js', () => ({
  resolveGroupFolderPath: vi.fn((groupFolder: string) =>
    `/tmp/omiclaw-test-groups/${groupFolder}`,
  ),
  resolveGroupIpcPath: vi.fn((groupFolder: string) =>
    `/tmp/omiclaw-test-ipc/${groupFolder}`,
  ),
}));

vi.mock('./container-runtime.js', () => ({
  registerRuntimeProcess: (name: string, pid: number) =>
    registerRuntimeProcess(name, pid),
  unregisterRuntimeProcess: (name: string) =>
    unregisterRuntimeProcess(name),
  stopContainer: (name: string) => stopContainer(name),
}));

vi.mock('./web/events.js', () => ({
  agentEvents: {
    emit: (event: string, payload: unknown) => emitAgentEvent(event, payload),
  },
}));

function createFakeProcess() {
  const proc = new EventEmitter() as EventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
    kill: ReturnType<typeof vi.fn>;
    pid: number;
  };
  proc.stdin = new PassThrough();
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.kill = vi.fn();
  proc.pid = 12345;
  return proc;
}

let fakeProc: ReturnType<typeof createFakeProcess>;

vi.mock('child_process', async () => {
  const actual =
    await vi.importActual<typeof import('child_process')>('child_process');
  return {
    ...actual,
    spawn: (...args: unknown[]) => mockSpawn(...args),
    exec: (...args: unknown[]) => mockExec(...args),
  };
});

import {
  ContainerOutput,
  runContainerAgent,
  writeHostStatusSnapshot,
} from './container-runner.js';
import type { RegisteredGroup } from './types.js';

const testGroup: RegisteredGroup = {
  name: 'Test Group',
  folder: 'test-group',
  trigger: '@OmiClaw',
  added_at: new Date().toISOString(),
};

const testInput = {
  prompt: 'Hello',
  groupFolder: 'test-group',
  chatJid: 'test@g.us',
  isMain: false,
};

function emitOutputMarker(
  proc: ReturnType<typeof createFakeProcess>,
  output: ContainerOutput,
) {
  proc.stdout.push(
    `${OUTPUT_START_MARKER}\n${JSON.stringify(output)}\n${OUTPUT_END_MARKER}\n`,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  fakeProc = createFakeProcess();
  mockSpawn.mockReturnValue(fakeProc);
  mockExec.mockImplementation(
    (_cmd: string, _opts: unknown, cb?: (err: Error | null) => void) => {
      cb?.(null);
      return new EventEmitter();
    },
  );
  mockExistsSync.mockImplementation((inputPath: string) =>
    inputPath.endsWith('container/agent-runner/dist/index.js'),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe('container-runner host mode', () => {
  it('injects the Conda environment into the spawned agent', async () => {
    const resultPromise = runContainerAgent(testGroup, testInput, () => {});

    const spawnOptions = mockSpawn.mock.calls[0][2] as {
      env: Record<string, string>;
    };
    expect(spawnOptions.env.CONDA_PREFIX).toBe('/opt/conda/envs/omiclaw');
    expect(spawnOptions.env.PATH).toMatch(
      /^\/tmp\/omiclaw-test-data\/sessions\/test-group\/\.omiclaw-bin:\/opt\/conda\/envs\/omiclaw\/bin:/,
    );
    expect(spawnOptions.env.OMICLAW_WORKSPACE_GROUP).toBe(
      '/tmp/omiclaw-test-groups/test-group',
    );

    emitOutputMarker(fakeProc, {
      status: 'success',
      result: 'Done',
      newSessionId: 'session-env',
    });
    await vi.advanceTimersByTimeAsync(10);
    fakeProc.emit('close', 0);

    const result = await resultPromise;
    expect(result.status).toBe('success');
    expect(registerRuntimeProcess).toHaveBeenCalled();
    expect(unregisterRuntimeProcess).toHaveBeenCalled();
  });

  it('treats timeout after streamed output as success', async () => {
    const onOutput = vi.fn(async () => {});
    const resultPromise = runContainerAgent(
      testGroup,
      testInput,
      () => {},
      onOutput,
    );

    emitOutputMarker(fakeProc, {
      status: 'success',
      result: 'Here is my response',
      newSessionId: 'session-123',
    });
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(1_830_000);
    fakeProc.emit('close', 137);
    await vi.advanceTimersByTimeAsync(10);

    const result = await resultPromise;
    expect(result.status).toBe('success');
    expect(result.newSessionId).toBe('session-123');
    expect(onOutput).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'Here is my response' }),
    );
    expect(stopContainer).toHaveBeenCalled();
  });

  it('treats timeout without streamed output as error', async () => {
    const onOutput = vi.fn(async () => {});
    const resultPromise = runContainerAgent(
      testGroup,
      testInput,
      () => {},
      onOutput,
    );

    await vi.advanceTimersByTimeAsync(1_830_000);
    fakeProc.emit('close', 137);
    await vi.advanceTimersByTimeAsync(10);

    const result = await resultPromise;
    expect(result.status).toBe('error');
    expect(result.error).toContain('timed out');
    expect(onOutput).not.toHaveBeenCalled();
  });

  it('writes a host heartbeat snapshot into the group IPC directory', () => {
    writeHostStatusSnapshot('test-group', {
      status: 'running',
      pid: 4242,
      started_at: '2026-04-03T07:30:00.000Z',
      heartbeat_at: '2026-04-03T07:30:05.000Z',
    });

    expect(fs.mkdirSync).toHaveBeenCalledWith(
      '/tmp/omiclaw-test-ipc/test-group',
      { recursive: true },
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/tmp/omiclaw-test-ipc/test-group/host_status.json',
      JSON.stringify(
        {
          status: 'running',
          pid: 4242,
          started_at: '2026-04-03T07:30:00.000Z',
          heartbeat_at: '2026-04-03T07:30:05.000Z',
        },
        null,
        2,
      ),
    );
  });
});
