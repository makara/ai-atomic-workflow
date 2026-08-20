/**
 * API Maintenance — 3 maintenance operations as Effect generators.
 *
 * Layer 2 — delegates to lib/db/repository (DAO) and lib/db/migration (DDL).
 *
 * Dependencies:
 * - Layer 3: lib/db/repository (GraphRepository), types (PersistenceError)
 *
 * @module
 */

import { Effect } from 'effect';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';

import { validateProjectContext } from '../context/contracts.js';
import { GraphRepository } from '../lib/db/repository.js';
import { RegistryLoader } from '../registry-loader.js';
import { SERVER_STARTED_AT } from '../runtime-start.js';
import { ConfigFileSchema, unknownPhaseKeys, WorkflowSchema } from '../schemas/index.js';
import type { PersistenceError, SchedulerError } from '../types.js';

import type { FileSystem } from '../filesystem.js';
import { loadGraphWithRegistry } from './graph-loader.js';

/** Workflow YAML file pattern — suffix-free (schema determines identity, not the file name). Single source — no inline copies. */
export const TASKFLOW_FILE_PATTERN = /\.ya?ml$/;

/** Scan inputs — resolved by the runtime facade (config resolution lives there). */
export interface IGraphInitScan {
  /** project root — config.json lives at `<cwd>/.graph-scheduler/config.json` */
  readonly cwd: string;
  /** project taskflow dir — null when only builtin dirs are configured */
  readonly projectTaskflowDir: string | null;
  /** built-in graphs package dir */
  readonly builtinGraphsDir: string;
  /** user-supplement layer context (config.json `context:`) — four-layer channel model */
  readonly projectContext?: readonly string[];
}

/** Config health report — read-only checks mirroring retired CLI validate checks 1-4. */
export interface IConfigHealth {
  readonly exists: boolean;
  readonly valid: boolean;
  readonly schemaErrors: string[];
  /** null when not applicable (missing config / :memory:) */
  readonly dbPathParentExists: boolean | null;
  /** null when not applicable (missing config) */
  readonly taskflowDirExists: boolean | null;
}

export interface IGraphInitReport {
  readonly initialized: true;
  /** ISO 8601 server process start time — module-load time of the scheduler process */
  readonly serverStartedAt: string;
  readonly validation: {
    /** entry-skill contract alignment errors (orphans, upstream, channels) */
    readonly errors: string[];
    /** non-blocking contract warnings */
    readonly warnings: string[];
    /** per-graph machine problems — contract/inventory pass per graph (schema-valid graphs only) */
    readonly graphProblems: Array<{ name: string; filePath: string; problems: string[] }>;
    readonly config: IConfigHealth;
  };
}

/** Scan a graphs dir for workflow YAML files — missing dir → empty list. */
function scanGraphsDir(dir: string): Array<{ filePath: string; raw: string }> {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: Array<{ filePath: string; raw: string }> = [];
  for (const e of entries) {
    if (!e.isFile() || !TASKFLOW_FILE_PATTERN.test(e.name)) continue;
    try {
      out.push({ filePath: join(dir, e.name), raw: readFileSync(join(dir, e.name), 'utf-8') });
    } catch {
      // unreadable file — skip, load-time path will surface it
    }
  }
  return out;
}

/** Config health — read-only; missing config never blocks graph validation. */
function checkConfigHealth(cwd: string): IConfigHealth {
  const configPath = join(cwd, '.graph-scheduler', 'config.json');
  let raw: string;
  try {
    raw = readFileSync(configPath, 'utf-8');
  } catch {
    return { exists: false, valid: false, schemaErrors: [], dbPathParentExists: null, taskflowDirExists: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      exists: true,
      valid: false,
      schemaErrors: [`${configPath}: invalid JSON — ${err instanceof Error ? err.message : String(err)}`],
      dbPathParentExists: null,
      taskflowDirExists: null,
    };
  }

  const result = ConfigFileSchema.safeParse(parsed);
  const schemaErrors = result.success
    ? []
    : result.error.issues.map((i) => `config.json: ${i.path.join('.')} — ${i.message}`);
  const cfg = result.success ? result.data : undefined;

  let dbPathParentExists: boolean | null = null;
  const dbPath = cfg?.dbPath;
  if (dbPath && dbPath !== ':memory:') {
    dbPathParentExists = existsSync(dirname(join(cwd, dbPath)));
  }
  let taskflowDirExists: boolean | null = null;
  const taskflowDir = cfg?.taskflowDir;
  if (taskflowDir) {
    taskflowDirExists = existsSync(join(cwd, taskflowDir));
  }
  return { exists: true, valid: result.success, schemaErrors, dbPathParentExists, taskflowDirExists };
}

/**
 * Initialise the database schema AND run a full-registry health check.
 * Idempotent — repeated runs report the same state.
 *
 * Validation scans project + builtin graphs (YAML parse + machine contract
 * checks), runs user-supplement layer existence validation, and reports
 * config health. Entry-skill alignment + orphan detection are agent-side
 * (estate-maintain consistency gate) — not engine health. Errors are
 * returned in the report — they do NOT fail the effect (report-only).
 */
export function graphInit(
  scan: IGraphInitScan,
): Effect.Effect<IGraphInitReport, PersistenceError | SchedulerError, GraphRepository | FileSystem | RegistryLoader> {
  return Effect.gen(function* () {
    const repo = yield* GraphRepository;
    yield* repo.initialize();

    const errors: string[] = [];
    const warnings: string[] = [];
    const graphProblems: Array<{ name: string; filePath: string; problems: string[] }> = [];

    const graphs: Array<{ filePath: string; graph: Record<string, unknown> }> = [];
    const dirs = scan.projectTaskflowDir ? [scan.projectTaskflowDir, scan.builtinGraphsDir] : [scan.builtinGraphsDir];

    for (const dir of dirs) {
      for (const { filePath, raw } of scanGraphsDir(dir)) {
        let parsed: unknown;
        try {
          parsed = parseYaml(raw);
        } catch (err) {
          errors.push(`${filePath}: YAML parse error — ${err instanceof Error ? err.message : String(err)}`);
          continue;
        }
        // Health check validates against the Workflow schema — not YAML-parse
        // only: schema violations surface in the health report. When schema
        // validation fails, run the tolerant unknown-key audit — extra phase
        // keys are reported as per-graph problems (frontend notification →
        // graph-maintain cleanup) instead of a bare validation error.
        const schemaResult = WorkflowSchema.safeParse(parsed);
        if (!schemaResult.success) {
          const findings = unknownPhaseKeys(parsed);
          if (findings.length > 0) {
            const details = findings.map((f) => `${f.phaseId}: ${f.keys.join(', ')}`).join('; ');
            graphProblems.push({
              name: typeof (parsed as { name?: unknown }).name === 'string' ? (parsed as { name: string }).name : '',
              filePath,
              problems: [`schema-unknown phase keys: ${details} — run graph-maintain to remove the extra fields`],
            });
          } else {
            errors.push(
              `${filePath}: schema validation failed — ${schemaResult.error.issues.map((i) => i.message).join('; ')}`,
            );
          }
          continue;
        }
        const graph = parsed as Record<string, unknown>;
        graphs.push({ filePath, graph });

        // Full load-time contract pass per graph — errors fail fast, warnings
        // surfaced. Loads through the registry-aware path (flattened flow
        // view + inventory per source graph), identical to graph_start.
        // Shadowing guard: when a project graph shadows a same-named builtin,
        // the scanned builtin file is not what actually loads — only the
        // resolved path carries the load-time problems. Skip the mismatch
        // (the shadowing project file reports its own row).
        const name = typeof graph.name === 'string' ? graph.name : '';
        const loaded = yield* Effect.either(loadGraphWithRegistry(name));
        if (loaded._tag === 'Right') {
          if (loaded.right.meta.resolvedPath === filePath) {
            // Flow-presence machine axis (graph-flow-layout rule): a builtin
            // graph SHALL declare a top-level `flow` block — the canonical
            // transition surface. Absence surfaces as a per-graph problem
            // (frontend notification → graph-maintain cleanup).
            const problems = [...loaded.right.meta.problems];
            if (dir === scan.builtinGraphsDir && graph.flow === undefined) {
              problems.push(
                "builtin graph declares no top-level 'flow' block (canonical layout — graph-flow-layout rule); declare the transition surface or run graph-maintain",
              );
            }
            graphProblems.push({ name, filePath, problems });
          }
        } else {
          errors.push(`${filePath}: contract validation failed — ${loaded.left.message}`);
        }
      }
    }

    // User-supplement layer existence validation — same implementation as
    // the load path (four-layer channel model): exact-file missing -> error,
    // glob zero-match -> warning.
    const projectContext = scan.projectContext;
    if (projectContext) {
      const pc = validateProjectContext(projectContext, scan.cwd);
      errors.push(...pc.errors);
      warnings.push(...pc.warnings);
    }

    return {
      initialized: true,
      serverStartedAt: new Date(SERVER_STARTED_AT).toISOString(),
      validation: { errors, warnings, graphProblems, config: checkConfigHealth(scan.cwd) },
    };
  });
}

/**
 * Clean completed graph runs.
 *
 * Deletes all runs with fsm_state = 'completed'. If `before` is provided,
 * only deletes runs whose updated_at is before the given ISO timestamp.
 *
 * @param before — optional ISO 8601 cutoff; runs updated before this are deleted
 * @returns number of runs deleted
 */
export function cleanCompleted(before?: string): Effect.Effect<number, PersistenceError, GraphRepository> {
  return Effect.gen(function* () {
    const repo = yield* GraphRepository;
    const deletedIds = yield* repo.deleteCompletedRuns(before);
    return deletedIds.length;
  });
}

/**
 * Clean all graph runs — deletes every run and their node states.
 *
 * @returns number of runs deleted
 */
export function cleanAll(): Effect.Effect<number, PersistenceError, GraphRepository> {
  return Effect.gen(function* () {
    const repo = yield* GraphRepository;
    const runs = yield* repo.listRuns();

    let count = 0;
    for (const run of runs) {
      yield* repo.deleteRun(run.runId);
      count++;
    }

    return count;
  });
}
