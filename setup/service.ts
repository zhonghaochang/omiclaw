import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { logger } from '../src/logger.js';
import { getPlatform, getNodePath, getServiceManager } from './platform.js';
import { emitStatus } from './status.js';

export async function run(_args: string[]): Promise<void> {
  const projectRoot = process.cwd();
  const platform = getPlatform();
  const nodePath = getNodePath();
  const homeDir = os.homedir();

  execSync('npm run build', {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  fs.mkdirSync(path.join(projectRoot, 'logs'), { recursive: true });

  if (platform === 'macos') {
    const plistPath = path.join(homeDir, 'Library', 'LaunchAgents', 'com.omiclaw.plist');
    fs.mkdirSync(path.dirname(plistPath), { recursive: true });
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.omiclaw</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${projectRoot}/dist/index.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${projectRoot}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>${homeDir}</string>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:${homeDir}/.local/bin</string>
  </dict>
  <key>StandardOutPath</key>
  <string>${projectRoot}/logs/omiclaw.log</string>
  <key>StandardErrorPath</key>
  <string>${projectRoot}/logs/omiclaw.error.log</string>
</dict>
</plist>`;
    fs.writeFileSync(plistPath, plist);
    try {
      execSync(`launchctl load ${JSON.stringify(plistPath)}`, { stdio: 'ignore' });
    } catch {
      logger.warn('launchctl load failed');
    }
    emitStatus('SETUP_SERVICE', {
      SERVICE_TYPE: 'launchd',
      PLIST_PATH: plistPath,
      STATUS: 'success',
    });
    return;
  }

  if (platform === 'linux' && getServiceManager() === 'systemd') {
    const unitDir = path.join(homeDir, '.config', 'systemd', 'user');
    const unitPath = path.join(unitDir, 'omiclaw.service');
    fs.mkdirSync(unitDir, { recursive: true });
    const unit = `[Unit]
Description=OmiClaw Single-Cell Assistant
After=network.target

[Service]
Type=simple
ExecStart=${nodePath} ${projectRoot}/dist/index.js
WorkingDirectory=${projectRoot}
Restart=always
RestartSec=5
Environment=HOME=${homeDir}
Environment=PATH=/usr/local/bin:/usr/bin:/bin:${homeDir}/.local/bin
StandardOutput=append:${projectRoot}/logs/omiclaw.log
StandardError=append:${projectRoot}/logs/omiclaw.error.log

[Install]
WantedBy=default.target
`;
    fs.writeFileSync(unitPath, unit);
    try {
      execSync('systemctl --user daemon-reload', { stdio: 'ignore' });
      execSync('systemctl --user enable --now omiclaw', { stdio: 'ignore' });
    } catch {
      logger.warn('systemd enable/start failed');
    }
    emitStatus('SETUP_SERVICE', {
      SERVICE_TYPE: 'systemd-user',
      UNIT_PATH: unitPath,
      STATUS: 'success',
    });
    return;
  }

  emitStatus('SETUP_SERVICE', {
    SERVICE_TYPE: 'manual',
    STATUS: 'success',
  });
}
