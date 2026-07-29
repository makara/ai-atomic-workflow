import { constants } from 'node:fs';
import { access, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

const TASKFLOW_FILE_PATTERN = /\.taskflow\.yaml$/;

/** validate command output report */
export interface IValidateReport {
  /** all checks passed */
  valid: boolean;
  /** validation error list — empty when valid=true */
  errors: string[];
}

/** validate a single .taskflow.yaml file against TaskflowSchema.
 *  Replaces the old validateTaskflowFile() which only checked 4 fields.
 *  TaskflowSchema covers 12 fields (id, type, dependsOn, agent, skill, context,
 *  task, retry, routing, join, when, name/version) plus .passthrough() extension. */
function validateTaskflowFile(raw: unknown, filePath: string): string[] {
  const errors: string[] = [];
  const result = TaskflowSchema.safeParse(raw);
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push(`${filePath}: ${issue.path.join('.')} — ${issue.message}`);
    }
  }
  return errors;
}

/** validate project config + graph definitions.
 *  Returns IValidateReport — never throws, all errors collected in report.errors. */
export async function validateConfig(cwd: string): Promise<IValidateReport> {
  const errors: string[] = [];
  const configPath = join(cwd, '.graph-scheduler', 'config.json');

  // check 1: config.json existence
  try {
    await access(configPath, constants.F_OK);
  } catch {
    errors.push(`${configPath}: file not found — run "atom-graph-config init" to create`);
    return { valid: false, errors };
  }

  // check 2: config.json schema validation
  let configRaw: unknown;
  try {
    const content = await readFile(configPath, 'utf-8');
    configRaw = JSON.parse(content);
  } catch {
    errors.push(`${configPath}: invalid JSON`);
    return { valid: false, errors };
  }

  const configResult = ConfigFileSchema.safeParse(configRaw);
  if (!configResult.success) {
    for (const issue of configResult.error.issues) {
      errors.push(`config.json: ${issue.path.join('.')} — ${issue.message}`);
    }
  }

  const config = configResult.success ? configResult.data : undefined;

  // check 3: dbPath parent directory exists (when not :memory:)
  if (config?.dbPath && config.dbPath !== ':memory:') {
    const dbParent = join(cwd, config.dbPath, '..');
    try {
      await access(dbParent, constants.F_OK);
    } catch {
      errors.push(`dbPath parent directory not found: ${config.dbPath}`);
    }
  }

  // check 4: taskflowDir exists
  if (config?.taskflowDir) {
    try {
      await access(join(cwd, config.taskflowDir), constants.F_OK);
    } catch {
      errors.push(`taskflowDir not found: ${config.taskflowDir}`);
    }
  }

  // check 5: graph *.taskflow.yaml files schema
  const graphsDir = config?.taskflowDir ? join(cwd, config.taskflowDir) : join(cwd, '.graph-scheduler', 'graphs');

  try {
    const entries = await readdir(graphsDir, { withFileTypes: true });
    const yamlFiles = entries.filter((e) => e.isFile() && TASKFLOW_FILE_PATTERN.test(e.name));

    for (const yf of yamlFiles) {
      const filePath = join(graphsDir, yf.name);
      try {
        const raw = await readFile(filePath, 'utf-8');
        const parsed = parseYaml(raw);
      } catch (err) {
        errors.push(`${filePath}: YAML parse error — ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch {
    // directory not found — already reported above, skip
  }

  return { valid: errors.length === 0, errors };
}
