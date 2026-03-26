import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockExistsSync = vi.fn<(path: string) => boolean>();
const mockExecSync = vi.fn();

vi.mock('./config.js', () => ({
  CONDA_ENV_PATH: '/opt/conda/envs/omiclaw',
}));

vi.mock('./logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('fs', () => ({
  default: {
    existsSync: (...args: [string]) => mockExistsSync(...args),
  },
}));

vi.mock('child_process', () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
}));

import {
  CONTAINER_RUNTIME_BIN,
  cleanupOrphans,
  ensureContainerRuntimeRunning,
  ensureImageAvailable,
  killContainer,
  registerRuntimeProcess,
  stopContainer,
  unregisterRuntimeProcess,
} from './container-runtime.js';
import { logger } from './logger.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('host runtime compatibility API', () => {
  it('reports the compatibility runtime name', () => {
    expect(CONTAINER_RUNTIME_BIN).toBe('host');
  });

  it('returns a kill command for registered processes', () => {
    registerRuntimeProcess('omiclaw-test', 4242);
    expect(stopContainer('omiclaw-test')).toBe('kill -TERM 4242');
    unregisterRuntimeProcess('omiclaw-test');
    expect(stopContainer('omiclaw-test')).toBe('true');
  });

  it('kills registered processes', () => {
    const killSpy = vi
      .spyOn(process, 'kill')
      .mockImplementation(() => true as never);

    registerRuntimeProcess('omiclaw-test', 5151);
    killContainer('omiclaw-test');

    expect(killSpy).toHaveBeenCalledWith(5151, 'SIGKILL');
    expect(stopContainer('omiclaw-test')).toBe('true');

    killSpy.mockRestore();
  });
});

describe('ensureContainerRuntimeRunning', () => {
  it('throws when the Conda python is missing', () => {
    mockExistsSync.mockReturnValue(false);

    expect(() => ensureContainerRuntimeRunning()).toThrow(
      'Conda environment not found: /opt/conda/envs/omiclaw',
    );
  });

  it('validates required single-cell packages', () => {
    mockExistsSync.mockImplementation((inputPath: string) =>
      inputPath.endsWith('/bin/python'),
    );
    mockExecSync.mockReturnValue('{"missing": []}\n');

    ensureContainerRuntimeRunning();

    expect(mockExecSync.mock.calls[0][0]).toContain(
      '"/opt/conda/envs/omiclaw/bin/python" -c',
    );
    expect(mockExecSync.mock.calls[0][0]).toContain('importlib.util.find_spec');
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.any(String),
      { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf-8', timeout: 15000 },
    );
    expect(logger.debug).toHaveBeenCalledWith(
      { condaEnv: '/opt/conda/envs/omiclaw' },
      'Host Conda runtime is ready',
    );
  });

  it('throws a helpful error when package validation fails', () => {
    mockExistsSync.mockImplementation((inputPath: string) =>
      inputPath.endsWith('/bin/python'),
    );
    mockExecSync.mockImplementation(() => {
      const err = new Error('module missing') as Error & {
        stdout?: string;
      };
      err.stdout = '{"missing":["scvi"]}\n';
      throw err;
    });

    expect(() => ensureContainerRuntimeRunning()).toThrow(
      'Conda environment check failed for /opt/conda/envs/omiclaw: Missing modules: scvi',
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        condaEnv: '/opt/conda/envs/omiclaw',
        missing: ['scvi'],
      }),
      'Conda environment check failed',
    );
  });
});

describe('ensureImageAvailable', () => {
  it('throws when the local agent runner build is missing', () => {
    mockExistsSync.mockReturnValue(false);

    expect(() => ensureImageAvailable()).toThrow(
      'Local agent-runner is not built. Expected: /vepfs-mlp2/mlp-public/250266/omiclaw/container/agent-runner/dist/index.js',
    );
  });

  it('passes when the local agent runner build exists', () => {
    mockExistsSync.mockImplementation((inputPath: string) =>
      inputPath.endsWith('container/agent-runner/dist/index.js'),
    );

    expect(() => ensureImageAvailable()).not.toThrow();
  });
});

describe('cleanupOrphans', () => {
  it('runs pkill for orphaned local runner processes and clears local state', () => {
    registerRuntimeProcess('omiclaw-test', 6161);
    mockExecSync.mockReturnValue('');

    cleanupOrphans();

    expect(mockExecSync).toHaveBeenCalledWith(
      'pkill -f "container/agent-runner/dist/index.js --agent-name omiclaw-"',
      { stdio: 'ignore' },
    );
    expect(stopContainer('omiclaw-test')).toBe('true');
  });
});
