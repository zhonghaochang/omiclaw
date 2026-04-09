import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./config.js', () => ({
  DATA_DIR: '/tmp/omiclaw-job-manager-test',
}));

vi.mock('./container-runner.js', () => ({
  writeJobsSnapshot: vi.fn(),
}));

vi.mock('./logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  _initTestDatabase,
  createJob,
  getJobById,
} from './db.js';
import {
  _resetJobSupervisorLoopForTests,
  kickJobSupervisorNow,
  queueBackgroundJob,
  startJobSupervisorLoop,
} from './job-manager.js';
import { BackgroundJob } from './types.js';

function makeJob(
  overrides: Partial<BackgroundJob> = {},
): BackgroundJob {
  return {
    id: overrides.id || 'job-test',
    group_folder: overrides.group_folder || 'other-group',
    chat_jid: overrides.chat_jid || 'other@g.us',
    title: overrides.title || 'Test Job',
    command: overrides.command || 'exit 1',
    cwd: overrides.cwd || '/tmp',
    env_json: overrides.env_json ?? null,
    status: overrides.status || 'running',
    created_at: overrides.created_at || '2026-04-03T00:00:00.000Z',
    started_at: overrides.started_at || '2026-04-03T00:00:01.000Z',
    finished_at: overrides.finished_at ?? null,
    pid: overrides.pid ?? 999999,
    pgid: overrides.pgid ?? 999999,
    log_path: overrides.log_path || '/tmp/job.log',
    heartbeat_path: overrides.heartbeat_path || '/tmp/heartbeat.json',
    exit_path: overrides.exit_path || '/tmp/exit.json',
    last_heartbeat_at:
      overrides.last_heartbeat_at || '2026-04-03T00:00:02.000Z',
    restart_count: overrides.restart_count ?? 0,
    max_restarts: overrides.max_restarts ?? 0,
    stale_after_ms: overrides.stale_after_ms ?? 60_000,
    notify_on_finish: overrides.notify_on_finish ?? 0,
    last_error: overrides.last_error ?? 'boom',
    metadata_json:
      overrides.metadata_json ??
      JSON.stringify({
        auto_followup_on_failure: true,
        max_recovery_turns: 2,
        recovery_turns: 0,
      }),
  };
}

describe('job-manager recovery', () => {
  beforeEach(() => {
    _initTestDatabase();
    _resetJobSupervisorLoopForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    _resetJobSupervisorLoopForTests();
    vi.useRealTimers();
  });

  it('queues a recovery turn when a running job fails and auto follow-up is enabled', async () => {
    createJob(makeJob());

    const enqueueRecoveryTurn = vi.fn(
      async (_job: BackgroundJob, _prompt: string) => true,
    );

    startJobSupervisorLoop({
      registeredGroups: () => ({}),
      sendMessage: async () => {},
      enqueueRecoveryTurn,
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(enqueueRecoveryTurn).toHaveBeenCalledTimes(1);
    const firstCall = enqueueRecoveryTurn.mock.calls[0];
    expect(firstCall).toBeDefined();
    const jobArg = firstCall![0] as BackgroundJob;
    const promptArg = firstCall![1] as string;
    expect(jobArg.id).toBe('job-test');
    expect(promptArg).toContain('HOST AUTONOMOUS RECOVERY');
    expect(promptArg).toContain('/tmp/job.log');

    const updated = getJobById('job-test');
    expect(updated?.status).toBe('failed');
    expect(updated?.metadata_json).toContain('"recovery_turns":1');
  });

  it('does not queue a recovery turn after reaching the recovery limit', async () => {
    createJob(
      makeJob({
        id: 'job-maxed',
        metadata_json: JSON.stringify({
          auto_followup_on_failure: true,
          max_recovery_turns: 1,
          recovery_turns: 1,
        }),
      }),
    );

    const enqueueRecoveryTurn = vi.fn(
      async (_job: BackgroundJob, _prompt: string) => true,
    );

    startJobSupervisorLoop({
      registeredGroups: () => ({}),
      sendMessage: async () => {},
      enqueueRecoveryTurn,
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(enqueueRecoveryTurn).not.toHaveBeenCalled();
    const updated = getJobById('job-maxed');
    expect(updated?.status).toBe('failed');
    expect(updated?.metadata_json).toContain('"recovery_turns":1');
  });

  it('fails fast when a queued job points to a missing working directory', async () => {
    queueBackgroundJob({
      id: 'job-missing-cwd',
      group_folder: 'other-group',
      chat_jid: 'other@g.us',
      title: 'Missing cwd',
      command: 'echo hello',
      cwd: '/tmp/omiclaw-job-manager-test/does-not-exist',
      max_restarts: 0,
      notify_on_finish: false,
    });

    startJobSupervisorLoop({
      registeredGroups: () => ({}),
      sendMessage: async () => {},
    });

    await kickJobSupervisorNow();

    const updated = getJobById('job-missing-cwd');
    expect(updated?.status).toBe('failed');
    expect(updated?.last_error).toContain('working directory is unavailable');
    expect(updated?.pid).toBeNull();
  });
});
