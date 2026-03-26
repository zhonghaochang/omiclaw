#!/usr/bin/env npx tsx
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

import { confirm } from '@inquirer/prompts';

import { CONDA_ENV_PATH } from '../src/config.js';

function run(command: string): void {
  execSync(command, { cwd: process.cwd(), stdio: 'inherit' });
}

async function main(): Promise<void> {
  console.log('\nOmiClaw Setup\n');
  console.log(`Project: ${process.cwd()}`);
  console.log(`Conda env: ${CONDA_ENV_PATH}\n`);

  const condaPython = path.join(CONDA_ENV_PATH, 'bin', 'python');
  if (!fs.existsSync(condaPython)) {
    console.error(`Missing Conda environment: ${CONDA_ENV_PATH}`);
    process.exit(1);
  }

  if (!fs.existsSync(path.join(process.cwd(), 'node_modules'))) {
    console.log('Installing root dependencies...');
    run('npm install');
  }

  console.log('Building agent runner and app...');
  run('npm run build');

  const configureApi = await confirm({
    message: 'Configure API credentials now?',
    default: true,
  });
  if (configureApi) {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('npx', ['tsx', 'setup/index.ts', '--step', 'configure-api'], {
        cwd: process.cwd(),
        stdio: 'inherit',
      });
      child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(String(code)))));
    }).catch(() => undefined);
  }

  const installService = await confirm({
    message: 'Install or update the background service now?',
    default: true,
  });
  if (installService) {
    run('npx tsx setup/index.ts --step service');
  }

  console.log('\nSetup complete. Use `npm run dev` to start OmiClaw in the foreground.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
