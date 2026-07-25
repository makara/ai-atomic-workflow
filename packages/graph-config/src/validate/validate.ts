import { constants } from 'node:fs';
import { access, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ConfigFileSchema } from '../schema/config-schema';
import type { IValidateReport } from '../schema/types';

const TASKFLOW_FILE_PATTERN = /\.taskflow\.yaml$/;

// minimal taskflow schema check — ensures file has required "name" + "phases" fields
function validateTaskflowFile(raw: unknown, filePath: string): string[] {
  const errors: string[] = [];

  if (typeof raw !== 'object' || raw === null) {
    errors.push(`${filePath}: not a valid taskflow definition`);
    return errors;
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.name !== 'string' || obj.name.length === 0) {
    errors.push(`${filePath}: missing or empty "name" field`);
  }

  if (!Array.isArray(obj.phases)) {
    errors.push(`${filePath}: missing or invalid "phases" array`);
  } else {
    obj.phases.forEach((phase: unknown, idx: number) => {
      if (typeof phase !== 'object' || phase === null) {
        errors.push(`${filePath}: phases[${idx}] is not an object`);
        return;
      }
      const p = phase as Record<string, unknown>;
      if (typeof p.id !== 'string' || p.id.length === 0) {
        errors.push(`${filePath}: phases[${idx}].id missing or empty`);
      }
      if (typeof p.type !== 'string' || p.type.length === 0) {
        errors.push(`${filePath}: phases[${idx}].type missing or empty`);
      }
    });
  }

  return errors;
}

// validate project config + graph definitions
// returns IValidateReport — never throws, all errors collected in report.errors
export async function validateConfig(cwd: string): Promise<IValidateReport> {
  const errors: string[] = [];
  const configPath = join(cwd, '.graph-scheduler', 'config.json');

  // check 1: config.json existence
  try {
    await access(configPath, constants.F_OK);
  } catch {
    return {
      valid: false,
      errors: [`config.json not found at .graph-scheduler/config.json`],
    };
  }

  // check 2: config.json schema validation
  let configRaw: unknown;
  try {
    const content = await readFile(configPath, 'utf-8');
    configRaw = JSON.parse(content);
  } catch {
    errors.push(`.graph-scheduler/config.json: invalid JSON`);
    return { valid: false, errors };
  }

  const configResult = ConfigFileSchema.safeParse(configRaw);
  if (!configResult.success) {
    for (const issue of configResult.error.issues) {
      errors.push(`config.json: ${issue.path.join('.')} — ${issue.message}`);
    }
    // continue validating graph files even if config has issues
  }

  const config = configResult.success ? configResult.data : undefined;

  // check 3: dbPath parent directory exists
  if (config) {
    const dbParent = join(cwd, config.dbPath, '..');
    try {
      await access(dbParent, constants.F_OK);
    } catch {
      errors.push(`dbPath parent directory not found: ${config.dbPath}`);
    }
  }

  // check 4: taskflowDir exists
  if (config) {
    const taskflowAbs = join(cwd, config.taskflowDir);
    try {
      await access(taskflowAbs, constants.F_OK);
    } catch {
      errors.push(`taskflowDir not found: ${config.taskflowDir}`);
    }
  }

  // check 5: graph *.taskflow.yaml files schema
  const graphsDir = config ? join(cwd, config.taskflowDir) : join(cwd, '.graph-scheduler', 'graphs');

  try {
    const entries = await readdir(graphsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !TASKFLOW_FILE_PATTERN.test(entry.name)) continue;

      const filePath = join(graphsDir, entry.name);
      const relativePath = `${config?.taskflowDir ?? '.graph-scheduler/graphs'}/${entry.name}`;

      try {
        const content = await readFile(filePath, 'utf-8');
        const { parse: parseYaml } = await import('yaml');
        const raw = parseYaml(content);
        const taskflowErrors = validateTaskflowFile(raw, relativePath);
        errors.push(...taskflowErrors);
      } catch (e) {
        const msg = e instanceof SyntaxError ? `invalid YAML` : String(e);
        errors.push(`${relativePath}: ${msg}`);
      }
    }
  } catch {
    // directory not found — already reported above, skip
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
