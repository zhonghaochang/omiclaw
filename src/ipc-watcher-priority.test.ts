import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

vi.mock('./config.js', () => ({
  DATA_DIR: '/tmp/omiclaw-ipc-priority-test',
  GROUPS_DIR: '/tmp/omiclaw-ipc-priority-test/groups',
  IPC_POLL_INTERVAL: 10,
  TIMEZONE: 'UTC',
}));

vi.mock('./logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('./job-manager.js', async () => {
  const db = await vi.importActual<typeof import('./db.js')>('./db.js');

  return {
    queueBackgroundJob: vi.fn((input: {
      id: string;
      group_folder: string;
      chat_jid: string;
      title: string;
      command: string;
      cwd: string;
      max_restarts?: number;
      stale_after_ms?: number;
      notify_on_finish?: boolean;
      metadata?: Record<string, unknown>;
      env?: Record<string, string>;
    }) => {
      db.createJob({
        id: input.id,
        group_folder: input.group_folder,
        chat_jid: input.chat_jid,
        title: input.title,
        command: input.command,
        cwd: input.cwd,
        env_json: input.env ? JSON.stringify(input.env) : null,
        status: 'queued',
        created_at: '2026-04-06T08:00:00.000Z',
        started_at: null,
        finished_at: null,
        pid: null,
        pgid: null,
        log_path: null,
        heartbeat_path: null,
        exit_path: null,
        last_heartbeat_at: null,
        restart_count: 0,
        max_restarts: input.max_restarts ?? 0,
        stale_after_ms: input.stale_after_ms ?? null,
        notify_on_finish: input.notify_on_finish === false ? 0 : 1,
        last_error: null,
        metadata_json: JSON.stringify(input.metadata || {}),
      });
    }),
    kickJobSupervisorNow: vi.fn(async () => false),
    syncJobSnapshotsForGroups: vi.fn(),
    cancelBackgroundJob: vi.fn(),
    restartBackgroundJob: vi.fn(),
    serializeJob: vi.fn((job: {
      id: string;
      group_folder: string;
      chat_jid: string;
      title: string;
      command: string;
      cwd: string;
      status: string;
      created_at: string;
      started_at: string | null;
      finished_at: string | null;
      pid: number | null;
      log_path: string | null;
      heartbeat_path: string | null;
      exit_path: string | null;
      last_heartbeat_at: string | null;
      restart_count: number;
      max_restarts: number;
      stale_after_ms: number | null;
      last_error: string | null;
    }) => ({
      id: job.id,
      groupFolder: job.group_folder,
      chatJid: job.chat_jid,
      title: job.title,
      command: job.command,
      cwd: job.cwd,
      status: job.status,
      created_at: job.created_at,
      started_at: job.started_at,
      finished_at: job.finished_at,
      pid: job.pid,
      log_path: job.log_path,
      heartbeat_path: job.heartbeat_path,
      exit_path: job.exit_path,
      last_heartbeat_at: job.last_heartbeat_at,
      restart_count: job.restart_count,
      max_restarts: job.max_restarts,
      stale_after_ms: job.stale_after_ms,
      last_error: job.last_error,
    })),
  };
});

import { _initTestDatabase, setRegisteredGroup } from './db.js';
import { _resetIpcWatcherForTests, IpcDeps, startIpcWatcher } from './ipc.js';
import { RegisteredGroup } from './types.js';

const TEST_DIR = '/tmp/omiclaw-ipc-priority-test';

function writeJson(filePath: string, payload: object): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('IPC watcher priority', () => {
  beforeEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    _initTestDatabase();
    _resetIpcWatcherForTests();
  });

  afterEach(() => {
    _resetIpcWatcherForTests();
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('acknowledges jobs before waiting on slow IPC messages', async () => {
    const group: RegisteredGroup = {
      name: 'Other',
      folder: 'other-group',
      trigger: '@OmiClaw',
      added_at: '2026-04-06T08:00:00.000Z',
    };
    setRegisteredGroup('other@g.us', group);

    const groupIpcDir = path.join(TEST_DIR, 'ipc', group.folder);
    writeJson(path.join(groupIpcDir, 'messages', 'message.json'), {
      type: 'message',
      chatJid: 'other@g.us',
      text: 'slow message',
    });
    writeJson(path.join(groupIpcDir, 'jobs', 'job.json'), {
      type: 'start_job',
      jobId: 'job-priority',
      title: 'Priority job',
      command: 'echo hello',
      targetJid: 'other@g.us',
    });

    let releaseMessage: (() => void) | undefined;
    const deps: IpcDeps = {
      sendMessage: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            releaseMessage = () => resolve();
          }),
      ),
      registeredGroups: () => ({
        'other@g.us': group,
      }),
      registerGroup: () => {},
      syncGroups: async () => {},
      getAvailableGroups: () => [],
      writeGroupsSnapshot: () => {},
    };

    startIpcWatcher(deps);
    await wait(50);

    const ackPath = path.join(groupIpcDir, 'job_ack', 'job-priority.json');
    expect(fs.existsSync(ackPath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(ackPath, 'utf-8'))).toMatchObject({
      ok: true,
      job: {
        id: 'job-priority',
        status: 'queued',
      },
    });
    expect(deps.sendMessage).toHaveBeenCalledTimes(1);

    if (!releaseMessage) {
      throw new Error('Expected slow IPC message to be waiting for release');
    }
    releaseMessage();
    await wait(20);
  });
});
