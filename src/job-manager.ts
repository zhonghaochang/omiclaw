import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

import { DATA_DIR } from './config.js';
import { writeJobsSnapshot } from './container-runner.js';
import {
  BackgroundJob,
  RegisteredGroup,
} from './types.js';
import {
  createJob,
  getAllJobs,
  getJobById,
  getJobsByStatus,
  logJobEvent,
  updateJob,
} from './db.js';
import { logger } from './logger.js';

const JOBS_BASE_DIR = path.join(DATA_DIR, 'jobs');
const JOB_SUPERVISOR_POLL_MS = 5000;
const JOB_HEARTBEAT_INTERVAL_SEC = 15;
const DEFAULT_STALE_AFTER_MS = 10 * 60 * 1000;

export interface JobManagerDeps {
  registeredGroups: () => Record<string, RegisteredGroup>;
  sendMessage: (jid: string, text: string) => Promise<void>;
  enqueueRecoveryTurn?: (job: BackgroundJob, prompt: string) => Promise<boolean>;
}

export interface CreateBackgroundJobInput {
  id: string;
  group_folder: string;
  chat_jid: string;
  title: string;
  command: string;
  cwd: string;
  env?: Record<string, string>;
  max_restarts?: number;
  stale_after_ms?: number | null;
  notify_on_finish?: boolean;
  metadata?: Record<string, unknown>;
}

let supervisorRunning = false;
let supervisorDeps: JobManagerDeps | null = null;
let supervisorPass: Promise<void> | null = null;

interface JobAutomationMetadata {
  sourceGroup?: string;
  auto_followup_on_failure?: boolean;
  max_recovery_turns?: number;
  recovery_turns?: number;
  recovery_prompt?: string;
  last_recovery_reason?: string;
}

function jobDir(jobId: string): string {
  return path.join(JOBS_BASE_DIR, jobId);
}

function commandPath(jobId: string): string {
  return path.join(jobDir(jobId), 'command.sh');
}

function runnerPath(jobId: string): string {
  return path.join(jobDir(jobId), 'runner.sh');
}

function logPath(jobId: string): string {
  return path.join(jobDir(jobId), 'job.log');
}

function heartbeatPath(jobId: string): string {
  return path.join(jobDir(jobId), 'heartbeat.json');
}

function exitPath(jobId: string): string {
  return path.join(jobDir(jobId), 'exit.json');
}

function metadataPath(jobId: string): string {
  return path.join(jobDir(jobId), 'job.json');
}

function ensureJobDir(jobId: string): string {
  const dir = jobDir(jobId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function toIsoOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date.toISOString();
}

function parseJsonFile<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function processExists(pid: number | null): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killProcessGroup(pgid: number | null, signal: NodeJS.Signals): boolean {
  if (!pgid || pgid <= 0) return false;
  try {
    process.kill(-pgid, signal);
    return true;
  } catch {
    return false;
  }
}

function shellString(value: string): string {
  return JSON.stringify(value);
}

function writeFileExecutable(filePath: string, content: string): void {
  fs.writeFileSync(filePath, content, { mode: 0o755 });
}

function refreshSnapshotsFromActiveSupervisor(): void {
  if (!supervisorDeps) return;
  try {
    syncJobSnapshots(supervisorDeps.registeredGroups());
  } catch (err) {
    logger.warn({ err }, 'Failed to refresh background job snapshots');
  }
}

function renderCommandScript(job: BackgroundJob): string {
  return [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    '',
    job.command,
    '',
  ].join('\n');
}

function renderRunnerScript(job: BackgroundJob): string {
  return [
    '#!/usr/bin/env bash',
    'set +e',
    `JOB_DIR=${shellString(jobDir(job.id))}`,
    `JOB_CWD=${shellString(job.cwd)}`,
    `COMMAND_FILE=${shellString(commandPath(job.id))}`,
    `HEARTBEAT_FILE=${shellString(heartbeatPath(job.id))}`,
    `EXIT_FILE=${shellString(exitPath(job.id))}`,
    '',
    'heartbeat_loop() {',
    '  while true; do',
    '    printf \'{"timestamp":"%s","status":"running","pid":%s}\\n\' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$$" > "${HEARTBEAT_FILE}.tmp"',
    '    mv "${HEARTBEAT_FILE}.tmp" "${HEARTBEAT_FILE}"',
    `    sleep ${JOB_HEARTBEAT_INTERVAL_SEC} || break`,
    '  done',
    '}',
    '',
    'heartbeat_loop &',
    'HB_PID=$!',
    '',
    'cd "$JOB_CWD"',
    'CD_STATUS=$?',
    'if [ "$CD_STATUS" -ne 0 ]; then',
    '  EXIT_CODE=200',
    'else',
    '  bash "$COMMAND_FILE"',
    '  EXIT_CODE=$?',
    'fi',
    '',
    'kill "$HB_PID" 2>/dev/null || true',
    'wait "$HB_PID" 2>/dev/null || true',
    'printf \'{"finished_at":"%s","exit_code":%s}\\n\' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$EXIT_CODE" > "${EXIT_FILE}.tmp"',
    'mv "${EXIT_FILE}.tmp" "${EXIT_FILE}"',
    'exit "$EXIT_CODE"',
    '',
  ].join('\n');
}

export function serializeJob(job: BackgroundJob): {
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
} {
  return {
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
  };
}

function syncJobSnapshots(registeredGroups: Record<string, RegisteredGroup>): void {
  const jobs = getAllJobs().map(serializeJob);
  for (const group of Object.values(registeredGroups)) {
    writeJobsSnapshot(group.folder, group.isMain === true, jobs);
  }
}

function logStructuredEvent(
  jobId: string,
  level: 'info' | 'warn' | 'error',
  message: string,
  data?: Record<string, unknown>,
): void {
  logJobEvent({
    job_id: jobId,
    timestamp: new Date().toISOString(),
    level,
    message,
    data_json: data ? JSON.stringify(data) : null,
  });
}

function markJobLaunchFailure(
  job: BackgroundJob,
  message: string,
  err?: unknown,
): void {
  const error = `Job failed to start: ${message}`;
  updateJob(job.id, {
    status: 'failed',
    started_at: null,
    finished_at: new Date().toISOString(),
    pid: null,
    pgid: null,
    last_error: error,
  });
  logStructuredEvent(job.id, 'error', 'Job launch failed', { error });
  refreshSnapshotsFromActiveSupervisor();
  logger.error({ jobId: job.id, err, message }, 'Failed to launch background job');
}

function readEnvJson(job: BackgroundJob): Record<string, string> {
  try {
    const parsed = job.env_json ? JSON.parse(job.env_json) : {};
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  } catch {
    return {};
  }
}

function readJobMetadata(job: BackgroundJob): JobAutomationMetadata {
  try {
    const parsed = job.metadata_json ? JSON.parse(job.metadata_json) : {};
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as JobAutomationMetadata;
  } catch {
    return {};
  }
}

function writeJobMetadata(
  job: BackgroundJob,
  metadata: JobAutomationMetadata,
): void {
  updateJob(job.id, {
    metadata_json: JSON.stringify(metadata),
  });
}

function buildRecoveryPrompt(
  job: BackgroundJob,
  reason: string,
  exitCode?: number | null,
): string {
  const exitLine =
    exitCode === null || exitCode === undefined
      ? ''
      : `Exit code: ${exitCode}\n`;
  return [
    '[HOST AUTONOMOUS RECOVERY]',
    `A host-managed background job failed and your original goal is still active.`,
    '',
    `Job ID: ${job.id}`,
    `Title: ${job.title}`,
    `Group folder: ${job.group_folder}`,
    `Chat JID: ${job.chat_jid}`,
    `Working directory: ${job.cwd}`,
    `Command: ${job.command}`,
    `Log path: ${job.log_path || logPath(job.id)}`,
    `Heartbeat path: ${job.heartbeat_path || heartbeatPath(job.id)}`,
    `Exit metadata path: ${job.exit_path || exitPath(job.id)}`,
    exitLine ? exitLine.trimEnd() : '',
    `Failure reason: ${reason}`,
    job.last_error ? `Last error: ${job.last_error}` : '',
    '',
    'Continue autonomously:',
    '1. Inspect the failing job log and any newly written traceback.',
    '2. Diagnose the root cause and fix the underlying code/config/data issue.',
    '3. Relaunch the long-running work using mcp__omiclaw__start_job, not nohup/setsid/& or a query-bound foreground command.',
    '4. Use mcp__omiclaw__send_message for progress updates while you work.',
    '5. Stay focused on completing the original objective instead of stopping at diagnosis.',
  ]
    .filter(Boolean)
    .join('\n');
}

async function maybeQueueRecoveryTurn(
  deps: JobManagerDeps,
  job: BackgroundJob,
  reason: string,
  exitCode?: number | null,
): Promise<boolean> {
  if (!deps.enqueueRecoveryTurn) return false;

  const metadata = readJobMetadata(job);
  if (metadata.auto_followup_on_failure === false) {
    return false;
  }

  const maxRecoveryTurns = metadata.max_recovery_turns ?? 3;
  const recoveryTurns = metadata.recovery_turns ?? 0;
  if (recoveryTurns >= maxRecoveryTurns) {
    logStructuredEvent(job.id, 'warn', 'Skipping recovery turn: max attempts reached', {
      recovery_turns: recoveryTurns,
      max_recovery_turns: maxRecoveryTurns,
      reason,
    });
    return false;
  }

  const prompt =
    metadata.recovery_prompt || buildRecoveryPrompt(job, reason, exitCode);
  const queued = await deps.enqueueRecoveryTurn(job, prompt);
  if (!queued) {
    logStructuredEvent(job.id, 'warn', 'Failed to queue recovery turn', {
      recovery_turns: recoveryTurns,
      max_recovery_turns: maxRecoveryTurns,
      reason,
    });
    return false;
  }

  writeJobMetadata(job, {
    ...metadata,
    recovery_turns: recoveryTurns + 1,
    last_recovery_reason: reason,
  });
  logStructuredEvent(job.id, 'warn', 'Queued autonomous recovery turn', {
    recovery_turns: recoveryTurns + 1,
    max_recovery_turns: maxRecoveryTurns,
    reason,
  });
  return true;
}

function launchJob(job: BackgroundJob): void {
  ensureJobDir(job.id);

  const cmdPath = commandPath(job.id);
  const runPath = runnerPath(job.id);
  const jobLogPath = logPath(job.id);
  const hbPath = heartbeatPath(job.id);
  const exPath = exitPath(job.id);
  const metaPath = metadataPath(job.id);

  writeFileExecutable(cmdPath, renderCommandScript(job));
  writeFileExecutable(runPath, renderRunnerScript(job));
  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        id: job.id,
        title: job.title,
        cwd: job.cwd,
        command: job.command,
        created_at: job.created_at,
      },
      null,
      2,
    ),
  );

  try {
    fs.rmSync(exPath, { force: true });
    fs.rmSync(hbPath, { force: true });
  } catch {
    // Best-effort cleanup between restarts.
  }

  try {
    if (!fs.existsSync(job.cwd) || !fs.statSync(job.cwd).isDirectory()) {
      markJobLaunchFailure(job, `working directory is unavailable: ${job.cwd}`);
      return;
    }
  } catch (err) {
    markJobLaunchFailure(job, `unable to validate working directory ${job.cwd}`, err);
    return;
  }

  const stdoutFd = fs.openSync(jobLogPath, 'a');
  const stderrFd = fs.openSync(jobLogPath, 'a');
  const env = {
    ...process.env,
    ...readEnvJson(job),
    OMICLAW_JOB_ID: job.id,
    OMICLAW_JOB_DIR: jobDir(job.id),
    OMICLAW_JOB_LOG: jobLogPath,
  };

  try {
    const child = spawn(runPath, [], {
      cwd: job.cwd,
      env,
      detached: true,
      stdio: ['ignore', stdoutFd, stderrFd],
    });
    child.once('error', (err) => {
      const current = getJobById(job.id);
      if (!current || current.status !== 'running') return;
      markJobLaunchFailure(job, err instanceof Error ? err.message : String(err), err);
    });

    const childPid =
      typeof child.pid === 'number' && child.pid > 0 ? child.pid : null;
    if (!childPid) {
      try {
        child.kill('SIGTERM');
      } catch {
        // Best-effort cleanup.
      }
      markJobLaunchFailure(job, 'spawn returned no pid');
      return;
    }

    child.unref();

    const now = new Date().toISOString();
    updateJob(job.id, {
      status: 'running',
      started_at: now,
      finished_at: null,
      pid: childPid,
      pgid: childPid,
      log_path: jobLogPath,
      heartbeat_path: hbPath,
      exit_path: exPath,
      last_heartbeat_at: now,
      last_error: null,
    });
    refreshSnapshotsFromActiveSupervisor();
    logStructuredEvent(job.id, 'info', 'Job launched', {
      pid: childPid,
      cwd: job.cwd,
      log_path: jobLogPath,
    });
    logger.info(
      { jobId: job.id, pid: childPid, title: job.title },
      'Background job launched',
    );
  } catch (err) {
    markJobLaunchFailure(
      job,
      err instanceof Error ? err.message : String(err),
      err,
    );
  } finally {
    fs.closeSync(stdoutFd);
    fs.closeSync(stderrFd);
  }
}

function latestHeartbeat(job: BackgroundJob): string | null {
  const heartbeat = parseJsonFile<{ timestamp?: string }>(
    heartbeatPath(job.id),
  );
  return toIsoOrNull(heartbeat?.timestamp) || job.last_heartbeat_at;
}

async function notifyJobState(
  deps: JobManagerDeps,
  job: BackgroundJob,
  summary: string,
): Promise<void> {
  if (job.notify_on_finish !== 1) return;
  try {
    await deps.sendMessage(job.chat_jid, summary);
  } catch (err) {
    logger.warn({ jobId: job.id, err }, 'Failed to send job notification');
  }
}

async function finalizeJob(
  deps: JobManagerDeps,
  job: BackgroundJob,
  status: 'succeeded' | 'failed' | 'stuck' | 'cancelled',
  details: { lastError?: string | null; exitCode?: number | null },
): Promise<void> {
  const finishedAt =
    parseJsonFile<{ finished_at?: string }>(exitPath(job.id))?.finished_at ||
    new Date().toISOString();
  const lastError = details.lastError ?? null;
  updateJob(job.id, {
    status,
    finished_at: toIsoOrNull(finishedAt) || new Date().toISOString(),
    pid: null,
    pgid: null,
    last_error: lastError,
  });
  refreshSnapshotsFromActiveSupervisor();
  logStructuredEvent(job.id, status === 'succeeded' ? 'info' : 'error', 'Job finalized', {
    status,
    exit_code: details.exitCode ?? null,
    last_error: lastError,
  });

  const recoveryQueued =
    status === 'failed' || status === 'stuck'
      ? await maybeQueueRecoveryTurn(
          deps,
          getJobById(job.id) || { ...job, status, last_error: lastError },
          lastError || status,
          details.exitCode,
        )
      : false;

  const refreshed =
    getJobById(job.id) || { ...job, status, last_error: lastError };
  const exitPart =
    details.exitCode === null || details.exitCode === undefined
      ? ''
      : ` Exit code: ${details.exitCode}.`;
  const errPart = lastError ? ` Error: ${lastError}` : '';
  const recoveryPart = recoveryQueued
    ? ' Autonomous recovery turn queued.'
    : '';
  const summary =
    status === 'succeeded'
      ? `Background job "${job.title}" completed successfully. Log: ${job.log_path || logPath(job.id)}`
      : `Background job "${job.title}" ${status}.${exitPart}${errPart}${recoveryPart} Log: ${job.log_path || logPath(job.id)}`;
  await notifyJobState(deps, refreshed as BackgroundJob, summary);
}

function canAutoRestart(job: BackgroundJob): boolean {
  return job.restart_count < job.max_restarts;
}

function queueRestart(job: BackgroundJob, reason: string): void {
  updateJob(job.id, {
    status: 'queued',
    started_at: null,
    finished_at: null,
    pid: null,
    pgid: null,
    last_error: reason,
    restart_count: job.restart_count + 1,
  });
  refreshSnapshotsFromActiveSupervisor();
  logStructuredEvent(job.id, 'warn', 'Job queued for restart', {
    restart_count: job.restart_count + 1,
    reason,
  });
}

async function reconcileQueuedJobs(): Promise<void> {
  const queuedJobs = getJobsByStatus(['queued']);
  for (const job of queuedJobs) {
    if (!getJobById(job.id) || getJobById(job.id)?.status !== 'queued') continue;
    launchJob(job);
  }
}

async function reconcileRunningJobs(deps: JobManagerDeps): Promise<void> {
  const runningJobs = getJobsByStatus(['running']);
  for (const job of runningJobs) {
    const heartbeatAt = latestHeartbeat(job);
    if (heartbeatAt && heartbeatAt !== job.last_heartbeat_at) {
      updateJob(job.id, { last_heartbeat_at: heartbeatAt });
    }

    const current = getJobById(job.id);
    if (!current || current.status !== 'running') continue;

    const alive = processExists(current.pid);
    const exitInfo = parseJsonFile<{ exit_code?: number; finished_at?: string }>(
      exitPath(current.id),
    );
    const lastHeartbeat = heartbeatAt || current.last_heartbeat_at;
    const staleAfterMs = current.stale_after_ms ?? DEFAULT_STALE_AFTER_MS;

    if (alive && lastHeartbeat) {
      const ageMs = Date.now() - new Date(lastHeartbeat).getTime();
      if (ageMs > staleAfterMs) {
        killProcessGroup(current.pgid || current.pid, 'SIGTERM');
        const reason = `Heartbeat stale for ${ageMs}ms`;
        if (canAutoRestart(current)) {
          queueRestart(current, reason);
        } else {
          await finalizeJob(deps, current, 'stuck', { lastError: reason, exitCode: null });
        }
      }
      continue;
    }

    if (alive) continue;

    const exitCode =
      typeof exitInfo?.exit_code === 'number' ? exitInfo.exit_code : null;
    if (exitCode === 0) {
      await finalizeJob(deps, current, 'succeeded', { exitCode, lastError: null });
      continue;
    }

    const reason =
      current.last_error ||
      (exitCode === null
        ? 'Process exited without exit metadata'
        : `Process exited with code ${exitCode}`);
    if (canAutoRestart(current)) {
      queueRestart(current, reason);
    } else {
      await finalizeJob(deps, current, 'failed', { exitCode, lastError: reason });
    }
  }
}

export function queueBackgroundJob(input: CreateBackgroundJobInput): void {
  const now = new Date().toISOString();
  createJob({
    id: input.id,
    group_folder: input.group_folder,
    chat_jid: input.chat_jid,
    title: input.title,
    command: input.command,
    cwd: input.cwd,
    env_json: input.env ? JSON.stringify(input.env) : null,
    status: 'queued',
    created_at: now,
    started_at: null,
    finished_at: null,
    pid: null,
    pgid: null,
    log_path: logPath(input.id),
    heartbeat_path: heartbeatPath(input.id),
    exit_path: exitPath(input.id),
    last_heartbeat_at: null,
    restart_count: 0,
    max_restarts: input.max_restarts ?? 0,
    stale_after_ms: input.stale_after_ms ?? DEFAULT_STALE_AFTER_MS,
    notify_on_finish: input.notify_on_finish === false ? 0 : 1,
    last_error: null,
    metadata_json: input.metadata ? JSON.stringify(input.metadata) : null,
  });
  refreshSnapshotsFromActiveSupervisor();
  logStructuredEvent(input.id, 'info', 'Job queued', {
    cwd: input.cwd,
    title: input.title,
  });
}

export function cancelBackgroundJob(jobId: string): boolean {
  const job = getJobById(jobId);
  if (!job) return false;

  killProcessGroup(job.pgid || job.pid, 'SIGTERM');
  updateJob(job.id, {
    status: 'cancelled',
    finished_at: new Date().toISOString(),
    pid: null,
    pgid: null,
    last_error: 'Cancelled by user',
  });
  refreshSnapshotsFromActiveSupervisor();
  logStructuredEvent(job.id, 'warn', 'Job cancelled');
  return true;
}

export function restartBackgroundJob(jobId: string): boolean {
  const job = getJobById(jobId);
  if (!job || job.status === 'running') return false;

  updateJob(job.id, {
    status: 'queued',
    started_at: null,
    finished_at: null,
    pid: null,
    pgid: null,
    last_error: null,
    restart_count: job.restart_count + 1,
  });
  refreshSnapshotsFromActiveSupervisor();
  logStructuredEvent(job.id, 'info', 'Job restart requested', {
    restart_count: job.restart_count + 1,
  });
  return true;
}

async function reconcileJobs(deps: JobManagerDeps): Promise<void> {
  await reconcileQueuedJobs();
  await reconcileRunningJobs(deps);
  syncJobSnapshots(deps.registeredGroups());
}

async function runSupervisorPass(deps: JobManagerDeps): Promise<void> {
  if (supervisorPass) {
    await supervisorPass;
    return;
  }

  supervisorPass = (async () => {
    await reconcileJobs(deps);
  })().finally(() => {
    supervisorPass = null;
  });

  await supervisorPass;
}

export async function kickJobSupervisorNow(): Promise<boolean> {
  if (!supervisorDeps) return false;
  await runSupervisorPass(supervisorDeps);
  return true;
}

export function startJobSupervisorLoop(deps: JobManagerDeps): void {
  if (supervisorRunning) {
    logger.debug('Job supervisor loop already running, skipping duplicate start');
    return;
  }
  supervisorRunning = true;
  supervisorDeps = deps;
  fs.mkdirSync(JOBS_BASE_DIR, { recursive: true });
  logger.info('Job supervisor loop started');

  const loop = async () => {
    try {
      await runSupervisorPass(deps);
    } catch (err) {
      logger.error({ err }, 'Error in job supervisor loop');
    }
    setTimeout(loop, JOB_SUPERVISOR_POLL_MS);
  };

  loop();
}

export function syncJobSnapshotsForGroups(
  registeredGroups: Record<string, RegisteredGroup>,
): void {
  syncJobSnapshots(registeredGroups);
}

export function _resetJobSupervisorLoopForTests(): void {
  supervisorRunning = false;
  supervisorDeps = null;
  supervisorPass = null;
}
