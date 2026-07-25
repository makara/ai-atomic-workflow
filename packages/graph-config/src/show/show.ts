import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ConfigFileSchema } from '../schema/config-schema';
import type { ConfigFile } from '../schema/types';

const TASKFLOW_FILE_PATTERN = /\.taskflow\.yaml$/;

// read + display current config.json content
// throws if config.json missing or invalid
export async function showConfig(cwd: string): Promise<ConfigFile> {
  const configPath = join(cwd, '.graph-scheduler', 'config.json');

  const content = await readFile(configPath, 'utf-8');
  const raw = JSON.parse(content);
  const config = ConfigFileSchema.parse(raw);

  // discover graph files in taskflowDir
  let graphFiles: string[] = [];
  try {
    const entries = await readdir(join(cwd, config.taskflowDir), { withFileTypes: true });
    graphFiles = entries.filter((e) => e.isFile() && TASKFLOW_FILE_PATTERN.test(e.name)).map((e) => e.name);
  } catch {
    // directory missing — leave empty
  }

  // print formatted output
  console.log(`dbPath:         ${config.dbPath}`);
  console.log(`taskflowDir:    ${config.taskflowDir}`);
  console.log(`registryPaths:`);
  for (const rp of config.registryPaths) {
    console.log(`  - ${rp}`);
  }

  console.log();
  console.log(`Graphs (*.taskflow.yaml):`);
  if (graphFiles.length === 0) {
    console.log(`  (none)`);
  } else {
    for (const gf of graphFiles) {
      console.log(`  - ${gf}`);
    }
  }

  return config;
}
