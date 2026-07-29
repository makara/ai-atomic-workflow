import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ConfigFileSchema, type SchedulerConfig } from '../schemas/index.js';
import { DEFAULT_CONFIG } from './template.js';

const TASKFLOW_FILE_PATTERN = /\.taskflow\.yaml$/;

/** read + display current config.json content.
 *  Throws if config.json missing or invalid. */
export async function showConfig(cwd: string): Promise<SchedulerConfig> {
  const configPath = join(cwd, '.graph-scheduler', 'config.json');

  const content = await readFile(configPath, 'utf-8');
  const raw = JSON.parse(content);
  const config = ConfigFileSchema.parse(raw);

  // discover graph files in taskflowDir
  let graphFiles: string[] = [];
  try {
    const taskflowDir = config.taskflowDir ?? DEFAULT_CONFIG.taskflowDir ?? '.graph-scheduler/graphs';
    const entries = await readdir(join(cwd, taskflowDir), { withFileTypes: true });
    graphFiles = entries.filter((e) => e.isFile() && TASKFLOW_FILE_PATTERN.test(e.name)).map((e) => e.name);
  } catch {
    // directory missing — leave empty
  }

  // print formatted output
  console.log(`dbPath:         ${config.dbPath ?? DEFAULT_CONFIG.dbPath}`);
  console.log(`taskflowDir:    ${config.taskflowDir ?? DEFAULT_CONFIG.taskflowDir}`);
  console.log('registryPaths:');
  for (const rp of config.registryPaths ?? DEFAULT_CONFIG.registryPaths ?? []) {
    console.log(`  - ${rp}`);
  }

  console.log();
  console.log('Graphs (*.taskflow.yaml):');
  if (graphFiles.length === 0) {
    console.log('  (none)');
  } else {
    for (const gf of graphFiles) {
      console.log(`  - ${gf}`);
    }
  }

  return config;
}
