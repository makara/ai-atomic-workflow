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
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';

import { validateEntrySkillContracts, validateProjectContext } from '../context/contracts.js';
import { GraphRepository } from '../lib/db/repository.js';
import { SERVER_STARTED_AT } from '../runtime-start.js';
import { ConfigFileSchema } from '../schemas/index.js';
import type { PersistenceError, SchedulerError } from '../types.js';

import { clearRunCaches, dropRunCaches } from './run-caches.js';

const TASKFLOW_FILE_PATTERN = /\.taskflow\.yaml$/;

/** Scan inputs — resolved by the runtime facade (config resolution lives there). */
export interface IGraphInitScan {
  /** project root — config.json lives at `<cwd>/.graph-scheduler/config.json` */
  readonly cwd: string;
  /** project taskflow dir — null when only builtin dirs are configured */
  readonly projectTaskflowDir: string | null;
  /** built-in graphs package dir */
  readonly builtinGraphsDir: string;
  /** graph-workflow skills package dir — null = alignment skipped */
  readonly skillsDir: string | null;
  /** project layer context (config.json `context:`) — three-tier channel model */
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
    readonly config: IConfigHealth;
  };
}

/** Scan a graphs dir for *.taskflow.yaml files — missing dir → empty list. */
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
 * Validation scans project + builtin graphs, runs entry-skill contract
 * alignment WITH orphan detection (checkOrphans: true — the repo-wide layer
 * the retired CLI validate owned), and reports config health. Errors are
 * returned in the report — they do NOT fail the effect (report-only).
 */
export function graphInit(scan: IGraphInitScan): Effect.Effect<IGraphInitReport, PersistenceError, GraphRepository> {
  return Effect.gen(function* () {
    const repo = yield* GraphRepository;
    yield* repo.initialize();

    const errors: string[] = [];
    const warnings: string[] = [];

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
        graphs.push({ filePath, graph: parsed as Record<string, unknown> });
      }
    }

    const skillsDir = scan.skillsDir;
    if (skillsDir && graphs.length > 0) {
      // Three-tier channel model: graph_init health validates with the
      // project layer (config.json context) — coverage via convention/project
      // layers and project-layer existence both surface in the health report.
      const projectContext = scan.projectContext;
      // Project layer existence validation — same implementation as the load
      // path (three-tier channel model): exact-file missing -> error, glob
      // zero-match -> warning.
      if (projectContext) {
        const pc = validateProjectContext(projectContext, scan.cwd);
        errors.push(...pc.errors);
        warnings.push(...pc.warnings);
      }
      const alignment = yield* Effect.either(
        Effect.tryPromise(() => validateEntrySkillContracts(graphs, skillsDir, { checkOrphans: true, projectContext })),
      );
      if (alignment._tag === 'Right') {
        errors.push(...alignment.right.errors);
        warnings.push(...alignment.right.warnings);
      } else {
        // Unexpected alignment failure — report, never throw.
        errors.push(`${scan.cwd}: entry-skill alignment aborted — ${String(alignment.left)}`);
      }
    } else if (!scan.skillsDir) {
      warnings.push(
        `${scan.cwd}: skills package not configured — entry-skill alignment skipped (set skillsDir in config.json)`,
      );
    }

    return {
      initialized: true,
      serverStartedAt: new Date(SERVER_STARTED_AT).toISOString(),
      validation: { errors, warnings, config: checkConfigHealth(scan.cwd) },
    };
  });
}

/**
 * Clean completed graph runs.
 *
 * Deletes all runs with fsm_state = 'completed'. If `before` is provided,
 * only deletes runs whose updated_at is before the given ISO timestamp.
 * In-memory run caches are dropped for every deleted run.
 *
 * @param before — optional ISO 8601 cutoff; runs updated before this are deleted
 * @returns number of runs deleted
 */
export function cleanCompleted(before?: string): Effect.Effect<number, PersistenceError, GraphRepository> {
  return Effect.gen(function* () {
    const repo = yield* GraphRepository;
    const deletedIds = yield* repo.deleteCompletedRuns(before);
    for (const runId of deletedIds) {
      dropRunCaches(runId);
    }
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

    // Every run deleted — caches must follow, no stale entries left behind
    clearRunCaches();

    return count;
  });
}
