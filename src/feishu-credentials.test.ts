import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  getFeishuCredentialPaths,
  loadFeishuCredentials,
  migrateLegacyFeishuCredentials,
  saveFeishuCredentials,
} from './feishu-credentials.js';

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'omiclaw-feishu-creds-test-'),
  );
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

describe('feishu credential storage', () => {
  it('migrates legacy project credentials to user-scoped config', () => {
    const root = makeTempRoot();
    const homeDir = path.join(root, 'home');
    const legacyStoreDir = path.join(root, 'project', 'store');
    fs.mkdirSync(legacyStoreDir, { recursive: true });

    const { scopedPath, legacyPath } = getFeishuCredentialPaths({
      homeDir,
      legacyStoreDir,
    });
    fs.writeFileSync(
      legacyPath,
      JSON.stringify({ appId: 'app-1', appSecret: 'secret-1' }),
    );

    const migratedPath = migrateLegacyFeishuCredentials({
      homeDir,
      legacyStoreDir,
    });

    expect(migratedPath).toBe(scopedPath);
    expect(fs.existsSync(scopedPath)).toBe(true);
    expect(fs.existsSync(legacyPath)).toBe(false);
    expect(
      JSON.parse(fs.readFileSync(scopedPath, 'utf-8')).appId,
    ).toBe('app-1');
  });

  it('saves and loads credentials only from the user-scoped path', () => {
    const root = makeTempRoot();
    const homeDir = path.join(root, 'home');
    const legacyStoreDir = path.join(root, 'project', 'store');
    fs.mkdirSync(legacyStoreDir, { recursive: true });

    const { scopedPath, legacyPath } = getFeishuCredentialPaths({
      homeDir,
      legacyStoreDir,
    });
    fs.writeFileSync(
      legacyPath,
      JSON.stringify({ appId: 'stale-app', appSecret: 'stale-secret' }),
    );

    saveFeishuCredentials(
      { appId: 'app-2', appSecret: 'secret-2' },
      { homeDir, legacyStoreDir },
    );

    const loaded = loadFeishuCredentials({ homeDir, legacyStoreDir });

    expect(loaded).toEqual({ appId: 'app-2', appSecret: 'secret-2' });
    expect(fs.existsSync(scopedPath)).toBe(true);
    expect(fs.existsSync(legacyPath)).toBe(false);
  });
});
