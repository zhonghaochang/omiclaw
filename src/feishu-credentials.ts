import fs from 'fs';
import os from 'os';
import path from 'path';

import { STORE_DIR } from './config.js';

export interface FeishuCredentials {
  appId: string;
  appSecret: string;
  encryptKey?: string;
  verificationToken?: string;
}

export interface FeishuCredentialPathOptions {
  homeDir?: string;
  legacyStoreDir?: string;
}

export interface FeishuCredentialPaths {
  scopedPath: string;
  legacyPath: string;
}

export function getFeishuCredentialPaths(
  options: FeishuCredentialPathOptions = {},
): FeishuCredentialPaths {
  const homeDir = options.homeDir || process.env.HOME || os.homedir();
  const legacyStoreDir = options.legacyStoreDir || STORE_DIR;
  return {
    scopedPath: path.join(
      homeDir,
      '.config',
      'omiclaw',
      'feishu-credentials.json',
    ),
    legacyPath: path.join(legacyStoreDir, 'feishu-credentials.json'),
  };
}

export function getFeishuCredentialsPath(
  options: FeishuCredentialPathOptions = {},
): string {
  return (
    migrateLegacyFeishuCredentials(options) ||
    getFeishuCredentialPaths(options).scopedPath
  );
}

export function hasFeishuCredentials(
  options: FeishuCredentialPathOptions = {},
): boolean {
  return loadFeishuCredentials(options) !== null;
}

export function loadFeishuCredentials(
  options: FeishuCredentialPathOptions = {},
): FeishuCredentials | null {
  const migratedPath = migrateLegacyFeishuCredentials(options);
  const { scopedPath } = getFeishuCredentialPaths(options);
  return readFeishuCredentialsFile(migratedPath || scopedPath);
}

export function saveFeishuCredentials(
  creds: FeishuCredentials,
  options: FeishuCredentialPathOptions = {},
): string {
  const { scopedPath, legacyPath } = getFeishuCredentialPaths(options);
  writeFeishuCredentialsFile(scopedPath, creds);
  safeUnlink(legacyPath);
  return scopedPath;
}

export function migrateLegacyFeishuCredentials(
  options: FeishuCredentialPathOptions = {},
): string | null {
  const { scopedPath, legacyPath } = getFeishuCredentialPaths(options);
  const scopedCreds = readFeishuCredentialsFile(scopedPath);
  if (scopedCreds) {
    safeUnlink(legacyPath);
    return scopedPath;
  }

  const legacyCreds = readFeishuCredentialsFile(legacyPath);
  if (!legacyCreds) {
    return null;
  }

  writeFeishuCredentialsFile(scopedPath, legacyCreds);
  safeUnlink(legacyPath);
  return scopedPath;
}

function readFeishuCredentialsFile(filePath: string): FeishuCredentials | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (isFeishuCredentials(parsed)) {
      return parsed;
    }
  } catch {
    // Ignore invalid or unreadable files; callers will treat as missing.
  }
  return null;
}

function writeFeishuCredentialsFile(
  filePath: string,
  creds: FeishuCredentials,
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(creds, null, 2));
  fs.chmodSync(filePath, 0o600);
}

function safeUnlink(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Best effort cleanup only.
  }
}

function isFeishuCredentials(value: unknown): value is FeishuCredentials {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.appId === 'string' &&
    candidate.appId.trim().length > 0 &&
    typeof candidate.appSecret === 'string' &&
    candidate.appSecret.trim().length > 0
  );
}
