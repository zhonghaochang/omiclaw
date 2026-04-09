import fs from 'fs';
import path from 'path';

import { CronExpressionParser } from 'cron-parser';

import { DATA_DIR, IPC_POLL_INTERVAL, TIMEZONE } from './config.js';
import { AvailableGroup } from './container-runner.js';
import {
  createTask,
  deleteTask,
  getJobById,
  getTaskById,
  updateTask,
} from './db.js';
import {
  isValidGroupFolder,
  resolveGroupFolderPath,
  resolveGroupIpcPath,
} from './group-folder.js';
import {
  cancelBackgroundJob,
  kickJobSupervisorNow,
  queueBackgroundJob,
  restartBackgroundJob,
  serializeJob,
  syncJobSnapshotsForGroups,
} from './job-manager.js';
import { logger } from './logger.js';
import { RegisteredGroup } from './types.js';

export interface IpcDeps {
  sendMessage: (jid: string, text: string) => Promise<void>;
  registeredGroups: () => Record<string, RegisteredGroup>;
  registerGroup: (jid: string, group: RegisteredGroup) => void;
  syncGroups: (force: boolean) => Promise<void>;
  getAvailableGroups: () => AvailableGroup[];
  writeGroupsSnapshot: (
    groupFolder: string,
    isMain: boolean,
    availableGroups: AvailableGroup[],
    registeredJids: Set<string>,
  ) => void;
}

let ipcWatcherRunning = false;
let ipcWatcherTimer: ReturnType<typeof setTimeout> | null = null;

interface GroupIpcContext {
  sourceGroup: string;
  isMain: boolean;
  messagesDir: string;
  tasksDir: string;
  jobsDir: string;
}

function writeJobAck(
  sourceGroup: string,
  jobId: string,
  payload:
    | { ok: true; job: ReturnType<typeof serializeJob>; note?: string }
    | { ok: false; reason: string },
): void {
  const ackDir = path.join(resolveGroupIpcPath(sourceGroup), 'job_ack');
  fs.mkdirSync(ackDir, { recursive: true });

  const ackPath = path.join(ackDir, `${jobId}.json`);
  const tempPath = `${ackPath}.tmp`;
  fs.writeFileSync(
    tempPath,
    JSON.stringify(
      {
        jobId,
        acknowledged_at: new Date().toISOString(),
        ...payload,
      },
      null,
      2,
    ),
  );
  fs.renameSync(tempPath, ackPath);
}

export function startIpcWatcher(deps: IpcDeps): void {
  if (ipcWatcherRunning) {
    logger.debug('IPC watcher already running, skipping duplicate start');
    return;
  }
  ipcWatcherRunning = true;

  const ipcBaseDir = path.join(DATA_DIR, 'ipc');
  fs.mkdirSync(ipcBaseDir, { recursive: true });

  const scheduleNextPass = (fn: () => Promise<void>): void => {
    if (!ipcWatcherRunning) return;
    ipcWatcherTimer = setTimeout(() => {
      void fn();
    }, IPC_POLL_INTERVAL);
    ipcWatcherTimer.unref?.();
  };

  const moveToErrorDir = (
    sourceGroup: string,
    file: string,
    filePath: string,
  ): void => {
    const errorDir = path.join(ipcBaseDir, 'errors');
    fs.mkdirSync(errorDir, { recursive: true });
    fs.renameSync(filePath, path.join(errorDir, `${sourceGroup}-${file}`));
  };

  const processGroupMessages = async (
    context: GroupIpcContext,
    registeredGroups: Record<string, RegisteredGroup>,
  ): Promise<void> => {
    const { sourceGroup, isMain, messagesDir } = context;
    try {
      if (!fs.existsSync(messagesDir)) return;
      const messageFiles = fs
        .readdirSync(messagesDir)
        .filter((f) => f.endsWith('.json'));
      for (const file of messageFiles) {
        const filePath = path.join(messagesDir, file);
        try {
          const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          if (data.type === 'message' && data.chatJid && data.text) {
            const targetGroup = registeredGroups[data.chatJid];
            if (isMain || (targetGroup && targetGroup.folder === sourceGroup)) {
              await deps.sendMessage(data.chatJid, data.text);
              logger.info(
                { chatJid: data.chatJid, sourceGroup },
                'IPC message sent',
              );
            } else {
              logger.warn(
                { chatJid: data.chatJid, sourceGroup },
                'Unauthorized IPC message attempt blocked',
              );
            }
          }
          fs.unlinkSync(filePath);
        } catch (err) {
          logger.error(
            { file, sourceGroup, err },
            'Error processing IPC message',
          );
          moveToErrorDir(sourceGroup, file, filePath);
        }
      }
    } catch (err) {
      logger.error({ err, sourceGroup }, 'Error reading IPC messages directory');
    }
  };

  const processGroupTasks = async (context: GroupIpcContext): Promise<void> => {
    const { sourceGroup, isMain, tasksDir } = context;
    try {
      if (!fs.existsSync(tasksDir)) return;
      const taskFiles = fs
        .readdirSync(tasksDir)
        .filter((f) => f.endsWith('.json'));
      for (const file of taskFiles) {
        const filePath = path.join(tasksDir, file);
        try {
          const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          await processTaskIpc(data, sourceGroup, isMain, deps);
          fs.unlinkSync(filePath);
        } catch (err) {
          logger.error({ file, sourceGroup, err }, 'Error processing IPC task');
          moveToErrorDir(sourceGroup, file, filePath);
        }
      }
    } catch (err) {
      logger.error({ err, sourceGroup }, 'Error reading IPC tasks directory');
    }
  };

  const processGroupJobs = async (context: GroupIpcContext): Promise<void> => {
    const { sourceGroup, isMain, jobsDir } = context;
    try {
      if (!fs.existsSync(jobsDir)) return;
      const jobFiles = fs.readdirSync(jobsDir).filter((f) => f.endsWith('.json'));
      for (const file of jobFiles) {
        const filePath = path.join(jobsDir, file);
        try {
          const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          await processJobIpc(data, sourceGroup, isMain, deps);
          fs.unlinkSync(filePath);
        } catch (err) {
          logger.error({ file, sourceGroup, err }, 'Error processing IPC job');
          moveToErrorDir(sourceGroup, file, filePath);
        }
      }
    } catch (err) {
      logger.error({ err, sourceGroup }, 'Error reading IPC jobs directory');
    }
  };

  const processIpcFiles = async () => {
    // Scan all group IPC directories (identity determined by directory)
    let groupFolders: string[];
    try {
      groupFolders = fs.readdirSync(ipcBaseDir).filter((f) => {
        const stat = fs.statSync(path.join(ipcBaseDir, f));
        return stat.isDirectory() && f !== 'errors';
      });
    } catch (err) {
      logger.error({ err }, 'Error reading IPC base directory');
      scheduleNextPass(processIpcFiles);
      return;
    }

    const registeredGroups = deps.registeredGroups();

    // Build folder→isMain lookup from registered groups
    const folderIsMain = new Map<string, boolean>();
    for (const group of Object.values(registeredGroups)) {
      if (group.isMain) folderIsMain.set(group.folder, true);
    }

    const groupContexts: GroupIpcContext[] = groupFolders.map((sourceGroup) => ({
      sourceGroup,
      isMain: folderIsMain.get(sourceGroup) === true,
      messagesDir: path.join(ipcBaseDir, sourceGroup, 'messages'),
      tasksDir: path.join(ipcBaseDir, sourceGroup, 'tasks'),
      jobsDir: path.join(ipcBaseDir, sourceGroup, 'jobs'),
    }));

    for (const context of groupContexts) {
      await processGroupJobs(context);
    }
    for (const context of groupContexts) {
      await processGroupTasks(context);
    }
    for (const context of groupContexts) {
      await processGroupMessages(context, registeredGroups);
    }

    scheduleNextPass(processIpcFiles);
  };

  void processIpcFiles();
  logger.info('IPC watcher started (per-group namespaces)');
}

export function _resetIpcWatcherForTests(): void {
  ipcWatcherRunning = false;
  if (ipcWatcherTimer) {
    clearTimeout(ipcWatcherTimer);
    ipcWatcherTimer = null;
  }
}

export async function processTaskIpc(
  data: {
    type: string;
    taskId?: string;
    prompt?: string;
    schedule_type?: string;
    schedule_value?: string;
    context_mode?: string;
    groupFolder?: string;
    chatJid?: string;
    targetJid?: string;
    // For register_group
    jid?: string;
    name?: string;
    folder?: string;
    trigger?: string;
    requiresTrigger?: boolean;
    containerConfig?: RegisteredGroup['containerConfig'];
  },
  sourceGroup: string, // Verified identity from IPC directory
  isMain: boolean, // Verified from directory path
  deps: IpcDeps,
): Promise<void> {
  const registeredGroups = deps.registeredGroups();

  switch (data.type) {
    case 'schedule_task':
      if (
        data.prompt &&
        data.schedule_type &&
        data.schedule_value &&
        data.targetJid
      ) {
        // Resolve the target group from JID
        const targetJid = data.targetJid as string;
        const targetGroupEntry = registeredGroups[targetJid];

        if (!targetGroupEntry) {
          logger.warn(
            { targetJid },
            'Cannot schedule task: target group not registered',
          );
          break;
        }

        const targetFolder = targetGroupEntry.folder;

        // Authorization: non-main groups can only schedule for themselves
        if (!isMain && targetFolder !== sourceGroup) {
          logger.warn(
            { sourceGroup, targetFolder },
            'Unauthorized schedule_task attempt blocked',
          );
          break;
        }

        const scheduleType = data.schedule_type as 'cron' | 'interval' | 'once';

        let nextRun: string | null = null;
        if (scheduleType === 'cron') {
          try {
            const interval = CronExpressionParser.parse(data.schedule_value, {
              tz: TIMEZONE,
            });
            nextRun = interval.next().toISOString();
          } catch {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid cron expression',
            );
            break;
          }
        } else if (scheduleType === 'interval') {
          const ms = parseInt(data.schedule_value, 10);
          if (isNaN(ms) || ms <= 0) {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid interval',
            );
            break;
          }
          nextRun = new Date(Date.now() + ms).toISOString();
        } else if (scheduleType === 'once') {
          const scheduled = new Date(data.schedule_value);
          if (isNaN(scheduled.getTime())) {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid timestamp',
            );
            break;
          }
          nextRun = scheduled.toISOString();
        }

        const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const contextMode =
          data.context_mode === 'group' || data.context_mode === 'isolated'
            ? data.context_mode
            : 'isolated';
        createTask({
          id: taskId,
          group_folder: targetFolder,
          chat_jid: targetJid,
          prompt: data.prompt,
          schedule_type: scheduleType,
          schedule_value: data.schedule_value,
          context_mode: contextMode,
          next_run: nextRun,
          status: 'active',
          created_at: new Date().toISOString(),
        });
        logger.info(
          { taskId, sourceGroup, targetFolder, contextMode },
          'Task created via IPC',
        );
      }
      break;

    case 'pause_task':
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (task && (isMain || task.group_folder === sourceGroup)) {
          updateTask(data.taskId, { status: 'paused' });
          logger.info(
            { taskId: data.taskId, sourceGroup },
            'Task paused via IPC',
          );
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task pause attempt',
          );
        }
      }
      break;

    case 'resume_task':
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (task && (isMain || task.group_folder === sourceGroup)) {
          updateTask(data.taskId, { status: 'active' });
          logger.info(
            { taskId: data.taskId, sourceGroup },
            'Task resumed via IPC',
          );
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task resume attempt',
          );
        }
      }
      break;

    case 'cancel_task':
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (task && (isMain || task.group_folder === sourceGroup)) {
          deleteTask(data.taskId);
          logger.info(
            { taskId: data.taskId, sourceGroup },
            'Task cancelled via IPC',
          );
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task cancel attempt',
          );
        }
      }
      break;

    case 'refresh_groups':
      // Only main group can request a refresh
      if (isMain) {
        logger.info(
          { sourceGroup },
          'Group metadata refresh requested via IPC',
        );
        await deps.syncGroups(true);
        // Write updated snapshot immediately
        const availableGroups = deps.getAvailableGroups();
        deps.writeGroupsSnapshot(
          sourceGroup,
          true,
          availableGroups,
          new Set(Object.keys(registeredGroups)),
        );
      } else {
        logger.warn(
          { sourceGroup },
          'Unauthorized refresh_groups attempt blocked',
        );
      }
      break;

    case 'register_group':
      // Only main group can register new groups
      if (!isMain) {
        logger.warn(
          { sourceGroup },
          'Unauthorized register_group attempt blocked',
        );
        break;
      }
      if (data.jid && data.name && data.folder && data.trigger) {
        if (!isValidGroupFolder(data.folder)) {
          logger.warn(
            { sourceGroup, folder: data.folder },
            'Invalid register_group request - unsafe folder name',
          );
          break;
        }
        // Defense in depth: agent cannot set isMain via IPC
        deps.registerGroup(data.jid, {
          name: data.name,
          folder: data.folder,
          trigger: data.trigger,
          added_at: new Date().toISOString(),
          containerConfig: data.containerConfig,
          requiresTrigger: data.requiresTrigger,
        });
      } else {
        logger.warn(
          { data },
          'Invalid register_group request - missing required fields',
        );
      }
      break;

    default:
      logger.warn({ type: data.type }, 'Unknown IPC task type');
  }
}

export async function processJobIpc(
  data: {
    type: string;
    jobId?: string;
    title?: string;
    command?: string;
    cwd?: string;
    env?: Record<string, string>;
    max_restarts?: number;
    notify_on_finish?: boolean;
    stale_after_ms?: number;
    auto_followup_on_failure?: boolean;
    max_recovery_turns?: number;
    recovery_prompt?: string;
    targetJid?: string;
  },
  sourceGroup: string,
  isMain: boolean,
  deps: IpcDeps,
): Promise<void> {
  const registeredGroups = deps.registeredGroups();

  switch (data.type) {
    case 'start_job': {
      if (!data.jobId || !data.command || !data.targetJid) {
        if (data.jobId) {
          writeJobAck(sourceGroup, data.jobId, {
            ok: false,
            reason:
              'Invalid start_job request: missing jobId, command, or targetJid.',
          });
        }
        logger.warn({ data, sourceGroup }, 'Invalid start_job request');
        break;
      }

      const targetGroupEntry = registeredGroups[data.targetJid];
      if (!targetGroupEntry) {
        writeJobAck(sourceGroup, data.jobId, {
          ok: false,
          reason: `Cannot start job: target group is not registered (${data.targetJid}).`,
        });
        logger.warn(
          { targetJid: data.targetJid, sourceGroup },
          'Cannot start job: target group not registered',
        );
        break;
      }

      if (!isMain && targetGroupEntry.folder !== sourceGroup) {
        writeJobAck(sourceGroup, data.jobId, {
          ok: false,
          reason:
            'Unauthorized start_job attempt: non-main groups may only start jobs inside their own workspace.',
        });
        logger.warn(
          { sourceGroup, targetFolder: targetGroupEntry.folder },
          'Unauthorized start_job attempt blocked',
        );
        break;
      }

      const groupRoot = resolveGroupFolderPath(targetGroupEntry.folder);
      const cwd = data.cwd
        ? path.resolve(groupRoot, data.cwd)
        : groupRoot;
      const relativeCwd = path.relative(groupRoot, cwd);
      if (
        !isMain &&
        (relativeCwd === '..' ||
          relativeCwd.startsWith(`..${path.sep}`) ||
          path.isAbsolute(relativeCwd))
      ) {
        writeJobAck(sourceGroup, data.jobId, {
          ok: false,
          reason: `Unauthorized start_job cwd outside group root: ${cwd}`,
        });
        logger.warn(
          { sourceGroup, cwd, groupRoot },
          'Unauthorized start_job cwd outside group root blocked',
        );
        break;
      }

      queueBackgroundJob({
        id: data.jobId,
        group_folder: targetGroupEntry.folder,
        chat_jid: data.targetJid,
        title: data.title || data.jobId,
        command: data.command,
        cwd,
        env: data.env,
        max_restarts:
          typeof data.max_restarts === 'number' && data.max_restarts >= 0
            ? data.max_restarts
            : 0,
        stale_after_ms:
          typeof data.stale_after_ms === 'number' && data.stale_after_ms > 0
            ? data.stale_after_ms
            : undefined,
        notify_on_finish: data.notify_on_finish !== false,
        metadata: {
          sourceGroup,
          auto_followup_on_failure: data.auto_followup_on_failure !== false,
          max_recovery_turns:
            typeof data.max_recovery_turns === 'number' &&
            data.max_recovery_turns > 0
              ? data.max_recovery_turns
              : 3,
          recovery_prompt:
            typeof data.recovery_prompt === 'string' &&
            data.recovery_prompt.trim()
              ? data.recovery_prompt
              : undefined,
        },
      });
      const queuedJob = getJobById(data.jobId);
      if (!queuedJob) {
        writeJobAck(sourceGroup, data.jobId, {
          ok: false,
          reason:
            'Host consumed the request, but the job record was not created. Check host logs.',
        });
        logger.warn(
          { jobId: data.jobId, sourceGroup },
          'Background job request consumed without creating a job record',
        );
        break;
      }

      writeJobAck(sourceGroup, data.jobId, {
        ok: true,
        job: serializeJob(queuedJob),
      });

      let kickError: string | null = null;
      try {
        await kickJobSupervisorNow();
      } catch (err) {
        kickError = err instanceof Error ? err.message : String(err);
        logger.error(
          { err, jobId: data.jobId, sourceGroup },
          'Immediate background job supervisor pass failed',
        );
      }
      if (kickError) {
        logger.warn(
          { jobId: data.jobId, sourceGroup, kickError },
          'Background job accepted, but the immediate supervisor pass reported an error',
        );
      }
      try {
        syncJobSnapshotsForGroups(registeredGroups);
      } catch (err) {
        logger.error(
          { err, jobId: data.jobId, sourceGroup },
          'Background job accepted, but snapshot sync failed',
        );
      }
      logger.info(
        { jobId: data.jobId, sourceGroup, targetFolder: targetGroupEntry.folder },
        'Background job queued via IPC',
      );
      break;
    }

    case 'cancel_job': {
      if (!data.jobId) break;
      const job = getJobById(data.jobId);
      if (!job) {
        logger.warn({ jobId: data.jobId }, 'Cancel requested for missing job');
        break;
      }
      if (!isMain && job.group_folder !== sourceGroup) {
        logger.warn(
          { jobId: data.jobId, sourceGroup },
          'Unauthorized cancel_job attempt blocked',
        );
        break;
      }
      cancelBackgroundJob(data.jobId);
      syncJobSnapshotsForGroups(registeredGroups);
      logger.info({ jobId: data.jobId, sourceGroup }, 'Background job cancelled via IPC');
      break;
    }

    case 'restart_job': {
      if (!data.jobId) break;
      const job = getJobById(data.jobId);
      if (!job) {
        logger.warn({ jobId: data.jobId }, 'Restart requested for missing job');
        break;
      }
      if (!isMain && job.group_folder !== sourceGroup) {
        logger.warn(
          { jobId: data.jobId, sourceGroup },
          'Unauthorized restart_job attempt blocked',
        );
        break;
      }
      restartBackgroundJob(data.jobId);
      try {
        await kickJobSupervisorNow();
      } catch (err) {
        logger.error(
          { err, jobId: data.jobId, sourceGroup },
          'Immediate supervisor pass after restart failed',
        );
      }
      syncJobSnapshotsForGroups(registeredGroups);
      logger.info({ jobId: data.jobId, sourceGroup }, 'Background job restart requested via IPC');
      break;
    }

    default:
      logger.warn({ type: data.type }, 'Unknown IPC job type');
  }
}
