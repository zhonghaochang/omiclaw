import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { logger } from '../logger.js';

export interface DashboardPortOwnerInfo {
  pid: number;
  cmdline: string;
  cwd: string | null;
}

export function extractListeningPids(ssOutput: string): number[] {
  const pids = new Set<number>();
  for (const match of ssOutput.matchAll(/pid=(\d+)/g)) {
    const pid = Number.parseInt(match[1] || '', 10);
    if (Number.isInteger(pid) && pid > 0) {
      pids.add(pid);
    }
  }
  return [...pids];
}

export function isManagedDashboardPortOwner(
  owner: DashboardPortOwnerInfo,
  projectRoot = process.cwd(),
): boolean {
  if (owner.pid === process.pid || !owner.cmdline || !owner.cwd) {
    return false;
  }

  const normalizedRoot = path.resolve(projectRoot);
  const normalizedCwd = path.resolve(owner.cwd);
  if (normalizedCwd !== normalizedRoot) {
    return false;
  }

  const srcEntry = path.join(normalizedRoot, 'src', 'index.ts');
  const distEntry = path.join(normalizedRoot, 'dist', 'index.js');

  return (
    owner.cmdline.includes(srcEntry) ||
    owner.cmdline.includes(distEntry) ||
    /(?:^|\s)src\/index\.ts(?:\s|$)/.test(owner.cmdline) ||
    /(?:^|\s)dist\/index\.js(?:\s|$)/.test(owner.cmdline)
  );
}

function getListeningPortOwners(port: number): DashboardPortOwnerInfo[] {
  try {
    const output = execFileSync('ss', ['-ltnp', `( sport = :${port} )`], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    return extractListeningPids(output).map((pid) => ({
      pid,
      cmdline: readProcessCmdline(pid),
      cwd: readProcessCwd(pid),
    }));
  } catch {
    return [];
  }
}

function readProcessCmdline(pid: number): string {
  try {
    return fs
      .readFileSync(path.join('/proc', String(pid), 'cmdline'))
      .toString('utf-8')
      .replace(/\0/g, ' ')
      .trim();
  } catch {
    return '';
  }
}

function readProcessCwd(pid: number): string | null {
  try {
    return fs.readlinkSync(path.join('/proc', String(pid), 'cwd'));
  } catch {
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForPortToClear(
  port: number,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (getListeningPortOwners(port).length === 0) {
      return true;
    }
    await delay(100);
  }

  return getListeningPortOwners(port).length === 0;
}

export async function releaseDashboardPort(
  port: number,
  projectRoot = process.cwd(),
): Promise<boolean> {
  const managedOwners = getListeningPortOwners(port).filter((owner) =>
    isManagedDashboardPortOwner(owner, projectRoot),
  );

  if (managedOwners.length === 0) {
    return false;
  }

  const pids = managedOwners.map((owner) => owner.pid);
  logger.warn(
    { port, pids },
    'Dashboard port is occupied by a previous OmiClaw process, terminating it',
  );

  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Process may have exited between detection and termination.
    }
  }

  if (await waitForPortToClear(port, 1500)) {
    return true;
  }

  logger.warn(
    { port, pids },
    'Dashboard port did not clear after SIGTERM; forcing shutdown',
  );

  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Process may have exited between detection and termination.
    }
  }

  const released = await waitForPortToClear(port, 1500);
  if (!released) {
    logger.warn(
      { port, pids },
      'Dashboard port is still busy after termination attempts',
    );
  }
  return released;
}
