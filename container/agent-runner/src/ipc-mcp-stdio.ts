/**
 * Stdio MCP Server for MatClaw
 * Standalone process that agent teams subagents can inherit.
 * Reads context from environment variables, writes IPC files for the host.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { CronExpressionParser } from 'cron-parser';
import {
  cancelPendingJobRequest,
  getPendingJobReceipt,
  getHostHeartbeatInfo,
  JobSnapshot,
  readJobsSnapshot,
  readPendingJobReceipts,
  waitForJobAck,
  writePendingJobReceipt,
} from './job-ipc.js';
import { WORKSPACE_IPC_DIR } from './workspace.js';

const IPC_DIR = WORKSPACE_IPC_DIR;
const MESSAGES_DIR = path.join(IPC_DIR, 'messages');
const TASKS_DIR = path.join(IPC_DIR, 'tasks');
const JOBS_DIR = path.join(IPC_DIR, 'jobs');
const JOB_ACK_DIR = path.join(IPC_DIR, 'job_ack');
const JOB_RECEIPTS_DIR = path.join(IPC_DIR, 'job_receipts');
const HOST_STATUS_PATH = path.join(IPC_DIR, 'host_status.json');
const JOB_ACK_TIMEOUT_MS = parsePositiveIntEnv(
  'OMICLAW_JOB_ACK_TIMEOUT_MS',
  45_000,
);
const JOB_ACK_POLL_MS = parsePositiveIntEnv('OMICLAW_JOB_ACK_POLL_MS', 250);
const HOST_HEARTBEAT_STALE_MS = parsePositiveIntEnv(
  'OMICLAW_HOST_HEARTBEAT_STALE_MS',
  JOB_ACK_TIMEOUT_MS,
);

// Context from environment variables (set by the agent runner)
const chatJid = process.env.OMICLAW_CHAT_JID!;
const groupFolder = process.env.OMICLAW_GROUP_FOLDER!;
const isMain = process.env.OMICLAW_IS_MAIN === '1';

function parsePositiveIntEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function writeIpcFile(dir: string, data: object): string {
  return writeIpcFileDetailed(dir, data).filename;
}

function writeIpcFileDetailed(
  dir: string,
  data: object,
): { filename: string; filepath: string } {
  fs.mkdirSync(dir, { recursive: true });

  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  const filepath = path.join(dir, filename);

  // Atomic write: temp file then rename
  const tempPath = `${filepath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  fs.renameSync(tempPath, filepath);

  return { filename, filepath };
}

function readTail(filePath: string, maxBytes = 32768): string {
  const stat = fs.statSync(filePath);
  const start = Math.max(0, stat.size - maxBytes);
  const length = stat.size - start;
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, start);
    return buffer.toString('utf-8');
  } finally {
    fs.closeSync(fd);
  }
}

function pendingJobLabel(): 'queued_for_host_pickup' | 'pending_host_ack' {
  const host = getHostHeartbeatInfo(HOST_STATUS_PATH, HOST_HEARTBEAT_STALE_MS);
  return host.fresh ? 'queued_for_host_pickup' : 'pending_host_ack';
}

const server = new McpServer({
  name: 'omiclaw',
  version: '1.0.0',
});

server.tool(
  'send_message',
  "Send a message to the user or group immediately while you're still running. Use this for progress updates or to send multiple messages. You can call this multiple times. Note: when running as a scheduled task, your final output is NOT sent to the user — use this tool if you need to communicate with the user or group.",
  {
    text: z.string().describe('The message text to send'),
    sender: z.string().optional().describe('Your role/identity name (e.g. "Researcher"). When set, messages appear from a dedicated bot in Telegram.'),
  },
  async (args) => {
    const data: Record<string, string | undefined> = {
      type: 'message',
      chatJid,
      text: args.text,
      sender: args.sender || undefined,
      groupFolder,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(MESSAGES_DIR, data);

    return { content: [{ type: 'text' as const, text: 'Message sent.' }] };
  },
);

server.tool(
  'schedule_task',
  `Schedule a recurring or one-time task. The task will run as a full agent with access to all tools.

CONTEXT MODE - Choose based on task type:
\u2022 "group": Task runs in the group's conversation context, with access to chat history. Use for tasks that need context about ongoing discussions, user preferences, or recent interactions.
\u2022 "isolated": Task runs in a fresh session with no conversation history. Use for independent tasks that don't need prior context. When using isolated mode, include all necessary context in the prompt itself.

If unsure which mode to use, you can ask the user. Examples:
- "Remind me about our discussion" \u2192 group (needs conversation context)
- "Check the weather every morning" \u2192 isolated (self-contained task)
- "Follow up on my request" \u2192 group (needs to know what was requested)
- "Generate a daily report" \u2192 isolated (just needs instructions in prompt)

MESSAGING BEHAVIOR - The task agent's output is sent to the user or group. It can also use send_message for immediate delivery, or wrap output in <internal> tags to suppress it. Include guidance in the prompt about whether the agent should:
\u2022 Always send a message (e.g., reminders, daily briefings)
\u2022 Only send a message when there's something to report (e.g., "notify me if...")
\u2022 Never send a message (background maintenance tasks)

SCHEDULE VALUE FORMAT (all times are LOCAL timezone):
\u2022 cron: Standard cron expression (e.g., "*/5 * * * *" for every 5 minutes, "0 9 * * *" for daily at 9am LOCAL time)
\u2022 interval: Milliseconds between runs (e.g., "300000" for 5 minutes, "3600000" for 1 hour)
\u2022 once: Local time WITHOUT "Z" suffix (e.g., "2026-02-01T15:30:00"). Do NOT use UTC/Z suffix.`,
  {
    prompt: z.string().describe('What the agent should do when the task runs. For isolated mode, include all necessary context here.'),
    schedule_type: z.enum(['cron', 'interval', 'once']).describe('cron=recurring at specific times, interval=recurring every N ms, once=run once at specific time'),
    schedule_value: z.string().describe('cron: "*/5 * * * *" | interval: milliseconds like "300000" | once: local timestamp like "2026-02-01T15:30:00" (no Z suffix!)'),
    context_mode: z.enum(['group', 'isolated']).default('group').describe('group=runs with chat history and memory, isolated=fresh session (include context in prompt)'),
    target_group_jid: z.string().optional().describe('(Main group only) JID of the group to schedule the task for. Defaults to the current group.'),
  },
  async (args) => {
    // Validate schedule_value before writing IPC
    if (args.schedule_type === 'cron') {
      try {
        CronExpressionParser.parse(args.schedule_value);
      } catch {
        return {
          content: [{ type: 'text' as const, text: `Invalid cron: "${args.schedule_value}". Use format like "0 9 * * *" (daily 9am) or "*/5 * * * *" (every 5 min).` }],
          isError: true,
        };
      }
    } else if (args.schedule_type === 'interval') {
      const ms = parseInt(args.schedule_value, 10);
      if (isNaN(ms) || ms <= 0) {
        return {
          content: [{ type: 'text' as const, text: `Invalid interval: "${args.schedule_value}". Must be positive milliseconds (e.g., "300000" for 5 min).` }],
          isError: true,
        };
      }
    } else if (args.schedule_type === 'once') {
      if (/[Zz]$/.test(args.schedule_value) || /[+-]\d{2}:\d{2}$/.test(args.schedule_value)) {
        return {
          content: [{ type: 'text' as const, text: `Timestamp must be local time without timezone suffix. Got "${args.schedule_value}" — use format like "2026-02-01T15:30:00".` }],
          isError: true,
        };
      }
      const date = new Date(args.schedule_value);
      if (isNaN(date.getTime())) {
        return {
          content: [{ type: 'text' as const, text: `Invalid timestamp: "${args.schedule_value}". Use local time format like "2026-02-01T15:30:00".` }],
          isError: true,
        };
      }
    }

    // Non-main groups can only schedule for themselves
    const targetJid = isMain && args.target_group_jid ? args.target_group_jid : chatJid;

    const data = {
      type: 'schedule_task',
      prompt: args.prompt,
      schedule_type: args.schedule_type,
      schedule_value: args.schedule_value,
      context_mode: args.context_mode || 'group',
      targetJid,
      createdBy: groupFolder,
      timestamp: new Date().toISOString(),
    };

    const filename = writeIpcFile(TASKS_DIR, data);

    return {
      content: [{ type: 'text' as const, text: `Task scheduled (${filename}): ${args.schedule_type} - ${args.schedule_value}` }],
    };
  },
);

server.tool(
  'start_job',
  `Start a host-managed background job that survives the current chat turn.

Use this for long-running shell commands, pipelines, or analysis scripts that should keep running even after the current Codex turn ends.

Important:
- Prefer this over nohup, setsid, "&", or other ad-hoc backgrounding.
- cwd is resolved relative to the current group workspace when not absolute.
- The host supervisor will monitor the job, keep status in current_jobs.json, and can notify the user when the job finishes.
- If the job still ultimately fails, the host may queue a follow-up agent turn to diagnose, fix, and continue.`,
  {
    title: z.string().optional().describe('Human-friendly job title'),
    command: z.string().describe('Shell command to run in the background'),
    cwd: z.string().optional().describe('Working directory for the job. Relative paths are resolved from the current group workspace.'),
    max_restarts: z.number().int().min(0).max(10).default(1).describe('How many automatic restarts are allowed after failure or stuck detection'),
    stale_after_ms: z.number().int().positive().optional().describe('Mark the job as stuck if heartbeat is older than this many milliseconds'),
    notify_on_finish: z.boolean().default(true).describe('Whether the host should notify the user when the job finishes'),
    target_group_jid: z.string().optional().describe('(Main group only) JID of the group to start the job for. Defaults to the current group.'),
  },
  async (args) => {
    const targetJid = isMain && args.target_group_jid ? args.target_group_jid : chatJid;
    const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = new Date().toISOString();
    const data = {
      type: 'start_job',
      jobId,
      title: args.title || jobId,
      command: args.command,
      cwd: args.cwd,
      max_restarts: args.max_restarts ?? 1,
      stale_after_ms: args.stale_after_ms,
      notify_on_finish: args.notify_on_finish ?? true,
      auto_followup_on_failure: true,
      max_recovery_turns: 3,
      targetJid,
      groupFolder,
      timestamp,
    };
    const request = writeIpcFileDetailed(JOBS_DIR, data);
    writePendingJobReceipt(JOB_RECEIPTS_DIR, {
      jobId,
      title: data.title,
      command: data.command,
      cwd: data.cwd || '.',
      requested_at: timestamp,
      request_path: request.filepath,
      target_group_jid: targetJid,
      source_group_folder: groupFolder,
    });
    const ack = await waitForJobAck({
      jobId,
      requestPath: request.filepath,
      jobsFile: path.join(IPC_DIR, 'current_jobs.json'),
      jobAckDir: JOB_ACK_DIR,
      jobReceiptsDir: JOB_RECEIPTS_DIR,
      hostStatusPath: HOST_STATUS_PATH,
      ackTimeoutMs: JOB_ACK_TIMEOUT_MS,
      ackPollMs: JOB_ACK_POLL_MS,
      heartbeatStaleMs: HOST_HEARTBEAT_STALE_MS,
    });
    if (ack.state === 'rejected') {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Background job was not accepted by the host supervisor: ${ack.reason}`,
          },
        ],
        isError: true,
      };
    }
    if (ack.state === 'queued') {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Background job queued for host pickup: ${jobId}. ${ack.reason} Use get_job_status or list_jobs to monitor it.`,
          },
        ],
      };
    }
    if (ack.state === 'pending') {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Background job request is still pending host acknowledgement: ${jobId}. ${ack.reason} Use get_job_status or list_jobs to monitor this pending request.`,
          },
        ],
      };
    }
    return {
      content: [
        {
          type: 'text' as const,
          text: `Background job accepted: ${jobId} (${ack.job.status}). Use get_job_status or list_jobs to monitor it.`,
        },
      ],
    };
  },
);

server.tool(
  'list_jobs',
  "List visible background jobs. Main groups see all jobs; other groups see only their own group's jobs.",
  {},
  async () => {
    const jobsFile = path.join(IPC_DIR, 'current_jobs.json');
    const jobs = readJobsSnapshot(jobsFile);
    const pendingLabel = pendingJobLabel();
    const pendingJobs = readPendingJobReceipts(JOB_RECEIPTS_DIR).filter(
      (receipt) => !jobs.some((job) => job.id === receipt.jobId),
    );

    if (jobs.length === 0 && pendingJobs.length === 0) {
      return { content: [{ type: 'text' as const, text: 'No background jobs found.' }] };
    }

    const activeLines = jobs.map(
      (job) =>
        `- [${job.id}] ${job.title} (${job.status}) pid=${job.pid ?? 'n/a'} restarts=${job.restart_count}/${job.max_restarts} log=${job.log_path || 'n/a'}`,
    );
    const pendingLines = pendingJobs.map(
      (job) =>
        `- [${job.jobId}] ${job.title} (${pendingLabel}) pid=n/a restarts=n/a log=n/a requested=${job.requested_at}`,
    );
    const formatted = [...activeLines, ...pendingLines].join('\n');

    return { content: [{ type: 'text' as const, text: `Background jobs:\n${formatted}` }] };
  },
);

server.tool(
  'get_job_status',
  'Get detailed status for a background job by job ID.',
  {
    job_id: z.string().describe('The job ID returned by start_job'),
  },
  async (args) => {
    const jobsFile = path.join(IPC_DIR, 'current_jobs.json');
    const job = readJobsSnapshot(jobsFile).find((j) => j.id === args.job_id);
    if (!job) {
      const pending = getPendingJobReceipt(JOB_RECEIPTS_DIR, args.job_id);
      if (pending) {
        const pendingLabel = pendingJobLabel();
        const lines = [
          `Job: ${pending.jobId}`,
          `Title: ${pending.title}`,
          `Status: ${pendingLabel}`,
          'PID: n/a',
          `CWD: ${pending.cwd}`,
          'Started: n/a',
          'Finished: n/a',
          `Requested: ${pending.requested_at}`,
          'Last heartbeat: n/a',
          'Restarts: n/a',
          'Log: n/a',
          'Last error: n/a',
          `Request path: ${pending.request_path}`,
        ];
        return {
          content: [{ type: 'text' as const, text: lines.join('\n') }],
        };
      }
      return {
        content: [{ type: 'text' as const, text: `Job not found: ${args.job_id}` }],
        isError: true,
      };
    }

    const lines = [
      `Job: ${job.id}`,
      `Title: ${job.title}`,
      `Status: ${job.status}`,
      `PID: ${job.pid ?? 'n/a'}`,
      `CWD: ${job.cwd}`,
      `Started: ${job.started_at || 'n/a'}`,
      `Finished: ${job.finished_at || 'n/a'}`,
      `Last heartbeat: ${job.last_heartbeat_at || 'n/a'}`,
      `Restarts: ${job.restart_count}/${job.max_restarts}`,
      `Log: ${job.log_path || 'n/a'}`,
      `Last error: ${job.last_error || 'n/a'}`,
    ];
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  },
);

server.tool(
  'tail_job_log',
  'Read the tail of a background job log file.',
  {
    job_id: z.string().describe('The job ID returned by start_job'),
    max_bytes: z.number().int().positive().max(262144).default(32768).describe('Maximum number of bytes to read from the end of the log'),
  },
  async (args) => {
    const jobsFile = path.join(IPC_DIR, 'current_jobs.json');
    const job = readJobsSnapshot(jobsFile).find((j) => j.id === args.job_id);
    if (!job || !job.log_path) {
      if (getPendingJobReceipt(JOB_RECEIPTS_DIR, args.job_id)) {
        const pendingLabel = pendingJobLabel();
        return {
          content: [{ type: 'text' as const, text: `Job ${args.job_id} is still ${pendingLabel}; no log is available yet.` }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text' as const, text: `No log found for job: ${args.job_id}` }],
        isError: true,
      };
    }
    if (!fs.existsSync(job.log_path)) {
      return {
        content: [{ type: 'text' as const, text: `Log file missing: ${job.log_path}` }],
        isError: true,
      };
    }

    const tail = readTail(job.log_path, args.max_bytes ?? 32768);
    return { content: [{ type: 'text' as const, text: tail || '(log is currently empty)' }] };
  },
);

server.tool(
  'cancel_job',
  'Cancel a background job.',
  {
    job_id: z.string().describe('The job ID to cancel'),
  },
  async (args) => {
    const cancelledPending = cancelPendingJobRequest(JOB_RECEIPTS_DIR, args.job_id);
    writeIpcFile(JOBS_DIR, {
      type: 'cancel_job',
      jobId: args.job_id,
      groupFolder,
      timestamp: new Date().toISOString(),
    });
    return {
      content: [
        {
          type: 'text' as const,
          text: cancelledPending
            ? `Cancel requested for job ${args.job_id}. The pending request receipt was removed as well.`
            : `Cancel requested for job ${args.job_id}.`,
        },
      ],
    };
  },
);

server.tool(
  'restart_job',
  'Restart a finished, failed, stuck, or cancelled background job.',
  {
    job_id: z.string().describe('The job ID to restart'),
  },
  async (args) => {
    writeIpcFile(JOBS_DIR, {
      type: 'restart_job',
      jobId: args.job_id,
      groupFolder,
      timestamp: new Date().toISOString(),
    });
    return { content: [{ type: 'text' as const, text: `Restart requested for job ${args.job_id}.` }] };
  },
);

server.tool(
  'list_tasks',
  "List all scheduled tasks. From main: shows all tasks. From other groups: shows only that group's tasks.",
  {},
  async () => {
    const tasksFile = path.join(IPC_DIR, 'current_tasks.json');

    try {
      if (!fs.existsSync(tasksFile)) {
        return { content: [{ type: 'text' as const, text: 'No scheduled tasks found.' }] };
      }

      const allTasks = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'));

      const tasks = isMain
        ? allTasks
        : allTasks.filter((t: { groupFolder: string }) => t.groupFolder === groupFolder);

      if (tasks.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No scheduled tasks found.' }] };
      }

      const formatted = tasks
        .map(
          (t: { id: string; prompt: string; schedule_type: string; schedule_value: string; status: string; next_run: string }) =>
            `- [${t.id}] ${t.prompt.slice(0, 50)}... (${t.schedule_type}: ${t.schedule_value}) - ${t.status}, next: ${t.next_run || 'N/A'}`,
        )
        .join('\n');

      return { content: [{ type: 'text' as const, text: `Scheduled tasks:\n${formatted}` }] };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error reading tasks: ${err instanceof Error ? err.message : String(err)}` }],
      };
    }
  },
);

server.tool(
  'pause_task',
  'Pause a scheduled task. It will not run until resumed.',
  { task_id: z.string().describe('The task ID to pause') },
  async (args) => {
    const data = {
      type: 'pause_task',
      taskId: args.task_id,
      groupFolder,
      isMain,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(TASKS_DIR, data);

    return { content: [{ type: 'text' as const, text: `Task ${args.task_id} pause requested.` }] };
  },
);

server.tool(
  'resume_task',
  'Resume a paused task.',
  { task_id: z.string().describe('The task ID to resume') },
  async (args) => {
    const data = {
      type: 'resume_task',
      taskId: args.task_id,
      groupFolder,
      isMain,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(TASKS_DIR, data);

    return { content: [{ type: 'text' as const, text: `Task ${args.task_id} resume requested.` }] };
  },
);

server.tool(
  'cancel_task',
  'Cancel and delete a scheduled task.',
  { task_id: z.string().describe('The task ID to cancel') },
  async (args) => {
    const data = {
      type: 'cancel_task',
      taskId: args.task_id,
      groupFolder,
      isMain,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(TASKS_DIR, data);

    return { content: [{ type: 'text' as const, text: `Task ${args.task_id} cancellation requested.` }] };
  },
);

server.tool(
  'register_group',
  `Register a new chat/group so the agent can respond to messages there. Main group only.

Use available_groups.json to find the JID for a group. The folder name must be channel-prefixed: "{channel}_{group-name}" (e.g., "whatsapp_family-chat", "telegram_dev-team", "discord_general"). Use lowercase with hyphens for the group name part.`,
  {
    jid: z.string().describe('The chat JID (e.g., "120363336345536173@g.us", "tg:-1001234567890", "dc:1234567890123456")'),
    name: z.string().describe('Display name for the group'),
    folder: z.string().describe('Channel-prefixed folder name (e.g., "whatsapp_family-chat", "telegram_dev-team")'),
    trigger: z.string().describe('Trigger word (e.g., "@OmiClaw")'),
  },
  async (args) => {
    if (!isMain) {
      return {
        content: [{ type: 'text' as const, text: 'Only the main group can register new groups.' }],
        isError: true,
      };
    }

    const data = {
      type: 'register_group',
      jid: args.jid,
      name: args.name,
      folder: args.folder,
      trigger: args.trigger,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(TASKS_DIR, data);

    return {
      content: [{ type: 'text' as const, text: `Group "${args.name}" registered. It will start receiving messages immediately.` }],
    };
  },
);

// Start the stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
