import fs from 'fs';
import path from 'path';

export interface JobSnapshot {
  id: string;
  groupFolder: string;
  chatJid: string;
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
}

export interface HostStatusSnapshot {
  status?: 'running' | 'stopped';
  pid?: number;
  started_at?: string;
  heartbeat_at?: string;
}

export interface JobAckSnapshot {
  jobId: string;
  acknowledged_at: string;
  ok: boolean;
  reason?: string;
  note?: string;
  job?: JobSnapshot;
}

export interface PendingJobReceipt {
  jobId: string;
  title: string;
  command: string;
  cwd: string;
  requested_at: string;
  request_path: string;
  target_group_jid?: string;
  source_group_folder?: string;
}

export type WaitForJobAckResult =
  | { state: 'accepted'; job: JobSnapshot }
  | { state: 'queued'; reason: string; receipt: PendingJobReceipt | null }
  | { state: 'pending'; reason: string; receipt: PendingJobReceipt | null }
  | { state: 'rejected'; reason: string };

interface WaitForJobAckOptions {
  jobId: string;
  requestPath: string;
  jobsFile: string;
  jobAckDir: string;
  jobReceiptsDir: string;
  hostStatusPath: string;
  pendingReceipt?: PendingJobReceipt;
  ackTimeoutMs?: number;
  ackPollMs?: number;
  heartbeatStaleMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function atomicWriteJson(filePath: string, payload: object): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2));
  fs.renameSync(tempPath, filePath);
}

function parseJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function parseIsoTimestamp(value: unknown): number | null {
  if (typeof value !== 'string' || !value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

export interface HostHeartbeatInfo {
  fresh: boolean;
  ageMs: number | null;
}

export function getHostHeartbeatInfo(
  hostStatusPath: string,
  heartbeatStaleMs: number,
): HostHeartbeatInfo {
  const snapshot = parseJsonFile<HostStatusSnapshot>(hostStatusPath);
  if (snapshot?.status === 'stopped') {
    return { fresh: false, ageMs: 0 };
  }

  const heartbeatAt = parseIsoTimestamp(snapshot?.heartbeat_at);
  if (heartbeatAt === null) {
    return { fresh: false, ageMs: null };
  }

  const ageMs = Date.now() - heartbeatAt;
  return {
    fresh: ageMs <= heartbeatStaleMs,
    ageMs,
  };
}

function jobAckPath(jobAckDir: string, jobId: string): string {
  return path.join(jobAckDir, `${jobId}.json`);
}

export function readJobsSnapshot(jobsFile: string): JobSnapshot[] {
  return parseJsonFile<JobSnapshot[]>(jobsFile) || [];
}

export function readJobAck(
  jobAckDir: string,
  jobId: string,
): JobAckSnapshot | null {
  return parseJsonFile<JobAckSnapshot>(jobAckPath(jobAckDir, jobId));
}

export function removeJobAck(jobAckDir: string, jobId: string): void {
  try {
    fs.unlinkSync(jobAckPath(jobAckDir, jobId));
  } catch {
    // Best-effort cleanup.
  }
}

function pendingJobReceiptPath(jobReceiptsDir: string, jobId: string): string {
  return path.join(jobReceiptsDir, `${jobId}.json`);
}

export function writePendingJobReceipt(
  jobReceiptsDir: string,
  receipt: PendingJobReceipt,
): void {
  atomicWriteJson(pendingJobReceiptPath(jobReceiptsDir, receipt.jobId), receipt);
}

export function getPendingJobReceipt(
  jobReceiptsDir: string,
  jobId: string,
): PendingJobReceipt | null {
  return parseJsonFile<PendingJobReceipt>(
    pendingJobReceiptPath(jobReceiptsDir, jobId),
  );
}

export function readPendingJobReceipts(
  jobReceiptsDir: string,
): PendingJobReceipt[] {
  if (!fs.existsSync(jobReceiptsDir)) return [];
  try {
    return fs
      .readdirSync(jobReceiptsDir)
      .filter((entry) => entry.endsWith('.json'))
      .map((entry) =>
        parseJsonFile<PendingJobReceipt>(path.join(jobReceiptsDir, entry)),
      )
      .filter((receipt): receipt is PendingJobReceipt => Boolean(receipt));
  } catch {
    return [];
  }
}

export function removePendingJobReceipt(
  jobReceiptsDir: string,
  jobId: string,
): void {
  try {
    fs.unlinkSync(pendingJobReceiptPath(jobReceiptsDir, jobId));
  } catch {
    // Best-effort cleanup.
  }
}

export function cancelPendingJobRequest(
  jobReceiptsDir: string,
  jobId: string,
): PendingJobReceipt | null {
  const receipt = getPendingJobReceipt(jobReceiptsDir, jobId);
  removePendingJobReceipt(jobReceiptsDir, jobId);

  if (receipt?.request_path && fs.existsSync(receipt.request_path)) {
    try {
      fs.unlinkSync(receipt.request_path);
    } catch {
      // The host may have consumed the request already.
    }
  }

  return receipt;
}

function describePendingReason(
  heartbeatAgeMs: number | null,
  message: string,
): string {
  const heartbeatPart =
    heartbeatAgeMs === null
      ? 'Host heartbeat is missing.'
      : `Host heartbeat age is ${heartbeatAgeMs}ms.`;
  return `${heartbeatPart} ${message} Do not start a duplicate foreground run.`;
}

function describeQueuedReason(
  heartbeatAgeMs: number | null,
  message: string,
): string {
  const heartbeatPart =
    heartbeatAgeMs === null
      ? 'Host heartbeat freshness could not be verified.'
      : `Host heartbeat age is ${heartbeatAgeMs}ms.`;
  return `${heartbeatPart} ${message} The durable request file is still present, so let the host continue to pick it up instead of starting a duplicate foreground run.`;
}

export async function waitForJobAck(
  options: WaitForJobAckOptions,
): Promise<WaitForJobAckResult> {
  const {
    jobId,
    requestPath,
    jobsFile,
    jobAckDir,
    jobReceiptsDir,
    hostStatusPath,
    pendingReceipt,
    ackTimeoutMs = 15_000,
    ackPollMs = 250,
    heartbeatStaleMs = 15_000,
  } = options;

  let requestDisappeared = false;
  const deadline = Date.now() + ackTimeoutMs;

  while (Date.now() < deadline) {
    const ack = readJobAck(jobAckDir, jobId);
    if (ack) {
      removeJobAck(jobAckDir, jobId);
      removePendingJobReceipt(jobReceiptsDir, jobId);

      if (ack.ok && ack.job) {
        return { state: 'accepted', job: ack.job };
      }

      if (ack.ok) {
        const jobFromSnapshot = readJobsSnapshot(jobsFile).find(
          (candidate) => candidate.id === jobId,
        );
        if (jobFromSnapshot) {
          return { state: 'accepted', job: jobFromSnapshot };
        }

        const notePart = ack.note ? ` ${ack.note}` : '';
        return {
          state: 'rejected',
          reason:
            ack.reason ||
            `The host acknowledged the job request but did not provide a job snapshot.${notePart}`,
        };
      }

      return {
        state: 'rejected',
        reason: ack.reason || 'The host rejected the background job request.',
      };
    }

    const job = readJobsSnapshot(jobsFile).find((candidate) => candidate.id === jobId);
    if (job) {
      removePendingJobReceipt(jobReceiptsDir, jobId);
      return { state: 'accepted', job };
    }

    if (!fs.existsSync(requestPath)) {
      requestDisappeared = true;
    }

    await sleep(ackPollMs);
  }

  const jobAfterTimeout = readJobsSnapshot(jobsFile).find(
    (candidate) => candidate.id === jobId,
  );
  if (jobAfterTimeout) {
    removePendingJobReceipt(jobReceiptsDir, jobId);
    return { state: 'accepted', job: jobAfterTimeout };
  }

  const hostHeartbeat = getHostHeartbeatInfo(hostStatusPath, heartbeatStaleMs);
  const receipt =
    getPendingJobReceipt(jobReceiptsDir, jobId) || pendingReceipt || null;

  if (hostHeartbeat.fresh && fs.existsSync(requestPath)) {
    return {
      state: 'queued',
      reason: describeQueuedReason(
        hostHeartbeat.ageMs,
        `The host supervisor has not acknowledged the job request within ${ackTimeoutMs}ms yet, but the request is durably queued on disk.`,
      ),
      receipt,
    };
  }

  if (hostHeartbeat.fresh && requestDisappeared) {
    return {
      state: 'queued',
      reason: describeQueuedReason(
        hostHeartbeat.ageMs,
        'The host consumed the request file and appears healthy, but has not yet published an acknowledgement or job snapshot.',
      ),
      receipt,
    };
  }

  if (fs.existsSync(requestPath)) {
    return {
      state: 'pending',
      reason: describePendingReason(
        hostHeartbeat.ageMs,
        `The host supervisor has not acknowledged the job request within ${ackTimeoutMs}ms, but the request is still queued.`,
      ),
      receipt,
    };
  }

  if (requestDisappeared) {
    return {
      state: 'pending',
      reason: describePendingReason(
        hostHeartbeat.ageMs,
        'The host consumed the request file but has not yet published an acknowledgement or job snapshot.',
      ),
      receipt,
    };
  }

  return {
    state: 'pending',
    reason: describePendingReason(
      hostHeartbeat.ageMs,
      `The host supervisor has not yet acknowledged the job request within ${ackTimeoutMs}ms.`,
    ),
    receipt,
  };
}
