import { constants } from 'node:fs';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { IInitReport } from '../schema/types';
import { DEFAULT_CONFIG } from './template';

// init project config — idempotent create .graph-scheduler/ + config.json
// never overwrites existing files, only fills gaps
export async function initConfig(cwd: string): Promise<IInitReport> {
  const report: IInitReport = {
    created: [],
    existed: [],
    projectRoot: cwd,
  };

  const baseDir = join(cwd, '.graph-scheduler');
  const dataDir = join(baseDir, 'data');
  const graphsDir = join(baseDir, 'graphs');
  const configPath = join(baseDir, 'config.json');

  // step 1: base directory
  try {
    await access(baseDir, constants.F_OK);
    report.existed.push('.graph-scheduler/');
  } catch {
    await mkdir(baseDir, { recursive: true });
    report.created.push('.graph-scheduler/');
  }

  // step 2: data/ subdirectory
  try {
    await access(dataDir, constants.F_OK);
    report.existed.push('.graph-scheduler/data/');
  } catch {
    await mkdir(dataDir, { recursive: true });
    report.created.push('.graph-scheduler/data/');
  }

  // step 3: graphs/ subdirectory
  try {
    await access(graphsDir, constants.F_OK);
    report.existed.push('.graph-scheduler/graphs/');
  } catch {
    await mkdir(graphsDir, { recursive: true });
    report.created.push('.graph-scheduler/graphs/');
  }

  // step 4: config.json — only write if missing
  try {
    await access(configPath, constants.F_OK);
    report.existed.push('.graph-scheduler/config.json');
  } catch {
    await writeFile(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n', 'utf-8');
    report.created.push('.graph-scheduler/config.json');
  }

  return report;
}
