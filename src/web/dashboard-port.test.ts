import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockExecFileSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockReadlinkSync = vi.fn();

vi.mock('child_process', () => ({
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
}));

vi.mock('fs', () => ({
  default: {
    readFileSync: (...args: [string]) => mockReadFileSync(...args),
    readlinkSync: (...args: [string]) => mockReadlinkSync(...args),
  },
}));

vi.mock('../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { logger } from '../logger.js';
import {
  extractListeningPids,
  isManagedDashboardPortOwner,
  releaseDashboardPort,
} from './dashboard-port.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('extractListeningPids', () => {
  it('returns unique pids from ss output', () => {
    const raw = `
State  Recv-Q Send-Q Local Address:Port Peer Address:PortProcess
LISTEN 0      511                *:3220            *:*    users:(("node",pid=123,fd=43),("node",pid=123,fd=44),("node",pid=456,fd=45))
`;

    expect(extractListeningPids(raw)).toEqual([123, 456]);
  });
});

describe('isManagedDashboardPortOwner', () => {
  it('matches the current project dashboard process', () => {
    expect(
      isManagedDashboardPortOwner(
        {
          pid: process.pid + 10,
          cmdline: 'node --import loader.mjs src/index.ts',
          cwd: '/repo/omiclaw',
        },
        '/repo/omiclaw',
      ),
    ).toBe(true);
  });

  it('ignores unrelated processes', () => {
    expect(
      isManagedDashboardPortOwner(
        {
          pid: process.pid + 10,
          cmdline: 'python -m http.server 3220',
          cwd: '/repo/omiclaw',
        },
        '/repo/omiclaw',
      ),
    ).toBe(false);
  });
});

describe('releaseDashboardPort', () => {
  it('terminates the stale project process and reports success once the port clears', async () => {
    vi.useFakeTimers();
    const killSpy = vi
      .spyOn(process, 'kill')
      .mockImplementation(() => true as never);

    mockReadFileSync.mockReturnValue(
      Buffer.from('node\0--import\0loader.mjs\0src/index.ts\0'),
    );
    mockReadlinkSync.mockReturnValue('/repo/omiclaw');

    let calls = 0;
    mockExecFileSync.mockImplementation(() => {
      calls += 1;
      if (calls === 1) {
        return 'users:(("node",pid=123,fd=43))';
      }
      return '';
    });

    const releasePromise = releaseDashboardPort(3220, '/repo/omiclaw');
    await vi.runAllTimersAsync();

    await expect(releasePromise).resolves.toBe(true);
    expect(killSpy).toHaveBeenCalledWith(123, 'SIGTERM');
    expect(logger.warn).toHaveBeenCalledWith(
      { port: 3220, pids: [123] },
      'Dashboard port is occupied by a previous OmiClaw process, terminating it',
    );

    killSpy.mockRestore();
    vi.useRealTimers();
  });

  it('does not touch unrelated port owners', async () => {
    mockReadFileSync.mockReturnValue(Buffer.from('python\0-m\0http.server\0'));
    mockReadlinkSync.mockReturnValue('/repo/omiclaw');
    mockExecFileSync.mockReturnValue('users:(("python",pid=222,fd=9))');

    const killSpy = vi
      .spyOn(process, 'kill')
      .mockImplementation(() => true as never);

    await expect(releaseDashboardPort(3220, '/repo/omiclaw')).resolves.toBe(
      false,
    );
    expect(killSpy).not.toHaveBeenCalled();

    killSpy.mockRestore();
  });
});
