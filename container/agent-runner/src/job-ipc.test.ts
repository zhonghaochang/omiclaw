import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

import {
  getPendingJobReceipt,
  waitForJobAck,
  writePendingJobReceipt,
} from './job-ipc.js';

const TEST_DIR = '/tmp/omiclaw-agent-runner-job-ipc-test';

function writeJson(filePath: string, payload: object): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

describe('job IPC acknowledgement handling', () => {
  beforeEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-03T14:12:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('keeps the request pending instead of withdrawing it on ack timeout', async () => {
    const requestPath = path.join(TEST_DIR, 'jobs', 'request.json');
    const jobsFile = path.join(TEST_DIR, 'current_jobs.json');
    const jobAckDir = path.join(TEST_DIR, 'job_ack');
    const jobReceiptsDir = path.join(TEST_DIR, 'job_receipts');
    const hostStatusPath = path.join(TEST_DIR, 'host_status.json');

    writeJson(requestPath, { type: 'start_job' });
    writeJson(jobsFile, []);
    const receipt = {
      jobId: 'job-pending',
      title: 'Pending job',
      command: 'echo hello',
      cwd: '.',
      requested_at: '2026-04-03T14:10:00.000Z',
      request_path: requestPath,
    };
    writePendingJobReceipt(jobReceiptsDir, receipt);

    const pendingPromise = waitForJobAck({
      jobId: 'job-pending',
      requestPath,
      jobsFile,
      jobAckDir,
      jobReceiptsDir,
      hostStatusPath,
      pendingReceipt: receipt,
      ackTimeoutMs: 10,
      ackPollMs: 1,
      heartbeatStaleMs: 10,
    });

    await vi.advanceTimersByTimeAsync(20);
    const result = await pendingPromise;

    expect(result.state).toBe('pending');
    expect(fs.existsSync(requestPath)).toBe(true);
    expect(getPendingJobReceipt(jobReceiptsDir, 'job-pending')).toMatchObject({
      jobId: 'job-pending',
    });
  });

  it('treats a queued on-disk request as durable when the host heartbeat is fresh', async () => {
    const requestPath = path.join(TEST_DIR, 'jobs', 'request.json');
    const jobsFile = path.join(TEST_DIR, 'current_jobs.json');
    const jobAckDir = path.join(TEST_DIR, 'job_ack');
    const jobReceiptsDir = path.join(TEST_DIR, 'job_receipts');
    const hostStatusPath = path.join(TEST_DIR, 'host_status.json');

    writeJson(requestPath, { type: 'start_job' });
    writeJson(jobsFile, []);
    writeJson(hostStatusPath, {
      status: 'running',
      heartbeat_at: '2026-04-03T14:11:55.000Z',
      started_at: '2026-04-03T14:00:00.000Z',
      pid: 4242,
    });
    const receipt = {
      jobId: 'job-queued',
      title: 'Queued job',
      command: 'echo hello',
      cwd: '.',
      requested_at: '2026-04-03T14:11:50.000Z',
      request_path: requestPath,
    };
    writePendingJobReceipt(jobReceiptsDir, receipt);

    const queuedPromise = waitForJobAck({
      jobId: 'job-queued',
      requestPath,
      jobsFile,
      jobAckDir,
      jobReceiptsDir,
      hostStatusPath,
      pendingReceipt: receipt,
      ackTimeoutMs: 10,
      ackPollMs: 1,
      heartbeatStaleMs: 30_000,
    });

    await vi.advanceTimersByTimeAsync(20);
    const result = await queuedPromise;

    expect(result.state).toBe('queued');
    if (result.state !== 'queued') {
      throw new Error(`Expected queued result, got ${result.state}`);
    }
    expect(result.reason).toContain('durably queued on disk');
    expect(getPendingJobReceipt(jobReceiptsDir, 'job-queued')).toMatchObject({
      jobId: 'job-queued',
    });
  });

  it('accepts once the host writes an acknowledgement and clears the pending receipt', async () => {
    const requestPath = path.join(TEST_DIR, 'jobs', 'request.json');
    const jobsFile = path.join(TEST_DIR, 'current_jobs.json');
    const jobAckDir = path.join(TEST_DIR, 'job_ack');
    const jobReceiptsDir = path.join(TEST_DIR, 'job_receipts');
    const hostStatusPath = path.join(TEST_DIR, 'host_status.json');

    writeJson(requestPath, { type: 'start_job' });
    writeJson(jobsFile, []);
    const receipt = {
      jobId: 'job-accepted',
      title: 'Accepted job',
      command: 'echo hello',
      cwd: '.',
      requested_at: '2026-04-03T14:11:00.000Z',
      request_path: requestPath,
    };
    writePendingJobReceipt(jobReceiptsDir, receipt);

    const acceptedPromise = waitForJobAck({
      jobId: 'job-accepted',
      requestPath,
      jobsFile,
      jobAckDir,
      jobReceiptsDir,
      hostStatusPath,
      pendingReceipt: receipt,
      ackTimeoutMs: 100,
      ackPollMs: 5,
      heartbeatStaleMs: 100,
    });

    await vi.advanceTimersByTimeAsync(10);
    writeJson(path.join(jobAckDir, 'job-accepted.json'), {
      jobId: 'job-accepted',
      acknowledged_at: '2026-04-03T14:11:05.000Z',
      ok: true,
      job: {
        id: 'job-accepted',
        groupFolder: 'feishu_test',
        chatJid: 'oc:test',
        title: 'Accepted job',
        command: 'echo hello',
        cwd: '.',
        status: 'queued',
        created_at: '2026-04-03T14:11:00.000Z',
        started_at: null,
        finished_at: null,
        pid: null,
        log_path: null,
        heartbeat_path: null,
        exit_path: null,
        last_heartbeat_at: null,
        restart_count: 0,
        max_restarts: 1,
        stale_after_ms: null,
        last_error: null,
      },
    });

    await vi.advanceTimersByTimeAsync(20);
    const result = await acceptedPromise;

    expect(result.state).toBe('accepted');
    expect(getPendingJobReceipt(jobReceiptsDir, 'job-accepted')).toBeNull();
  });
});
