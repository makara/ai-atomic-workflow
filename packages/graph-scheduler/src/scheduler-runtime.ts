/**
 * Scheduler runtime — L3 application module.
 *
 * FSM Layer assembly: loads config → creates libsql
 * connection → builds persistence, fileSystem, registryLoader,
 * 9-method Promise facade.
 *
 * @module
 */

import { Cause, Effect, Layer, ManagedRuntime } from 'effect';
import Database from 'libsql';
import { mkdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// Built-in assets — resolved relative to this source file
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** built-in registry.json path — low-priority default registry entry */
export const BUILTIN_REGISTRY_PATH = path.resolve(PKG_ROOT, 'graphs', 'registry.json');
/** built-in taskflow graph directory — fallback when no project taskflowDir configured */
export const BUILTIN_TASKFLOW_DIR = path.resolve(PKG_ROOT, 'graphs');
/** runtime database fallback when no dbPath configured anywhere */
export const BUILTIN_DB_PATH = ':memory:';

/**
 * Normalize a database path — absolute paths and in-memory databases pass
 * through unchanged; relative paths resolve against the project root (cwd).
 * Applied to every dbPath source (override, env, config.json) so the
 * effective storage location never depends on how the process was spawned.
 */
export function normalizeDbPath(dbPath: string): string {
  // Empty strings pass through — schema validation rejects them; normalization
  // must not turn an unset value into a resolvable path.
  if (dbPath === '' || dbPath === BUILTIN_DB_PATH || path.isAbsolute(dbPath)) return dbPath;
  return path.resolve(dbPath);
}

/**
 * Canonical project layout — the single source of truth for scaffolded
 * config.json (setup-atomic-workflow skill seed) AND the layout
 * resolveConfig() acts on when a project adopts these defaults.
 *
 * Handwritten duplicates are forbidden: any code producing a default
 * project config derives from this function.
 */
export function createDefaultConfig(): SchedulerConfig {
  return {
    dbPath: '.graph-scheduler/data/graph-scheduler.db',
    taskflowDir: '.graph-scheduler/graphs',
    registryPaths: ['.graph-scheduler/graphs/registry.json'],
  };
}

import { resolveSkillsDir, setConfiguredSkillsDir } from './api/graph-loader.js';
import { debugLog } from './debug.js';
import { FileSystem, FileSystemError } from './filesystem.js';
import { buildService, GraphRepository, makeRepositoryLayer, type RunSummaryItem } from './lib/db/repository.js';
import { makeRegistryLoader, RegistryLoader } from './registry-loader.js';
// API layer — direct Effect generators
import { z } from 'zod/v4';
import { graphAdvance, graphForceEnd, graphJump, graphStart, type NodeDetail } from './api/crud.js';
import { cleanAll, cleanCompleted, graphInit, type IGraphInitReport, type IGraphInitScan } from './api/maintenance.js';
import { graphList, graphStatus } from './api/query.js';
import type { IGraphSnapshot } from './api/snapshot.js';

import type { ConfigError } from './types.js';

/** Run summary — returned by graphList. */
export interface RunSummary {
  readonly runId: string;
  readonly graphName: string;
  readonly status: string;
  readonly startedAt: string;
}

/** Promise-typed facade over the FSM-driven graph-scheduling domain. */
export interface SchedulerRuntime {
  /** Start a new graph run — returns runId + first node to execute. */
  readonly graphStart: (
    graphName: string,
    args?: Record<string, unknown>,
  ) => Promise<{
    readonly runId: string;
    readonly node: NodeDetail | null;
    /** contract warnings captured at load — empty when clean (optional) */
    readonly contractWarnings?: string[];
    /** run snapshot — entry dispatch carries it (Run Mode consumption) */
    readonly snapshot: IGraphSnapshot;
  }>;

  /** Advance a run — report node completion + get next node.
   *  Output NOT passed — lives in agent session or on-disk files. */
  readonly graphAdvance: (
    runId: string,
    nodeId: string,
    durationMs: number,
    skip?: boolean,
  ) => Promise<{
    readonly snapshot: IGraphSnapshot;
    readonly node: NodeDetail | null;
  }>;

  /** Directed jump to target phase — reset target + upstream. */
  readonly graphJump: (
    runId: string,
    targetPhaseId: string,
  ) => Promise<{
    readonly snapshot: IGraphSnapshot;
    readonly node: NodeDetail | null;
  }>;

  /** Force-terminate a run — all unfinished nodes skipped, irreversible. */
  readonly graphForceEnd: (runId: string) => Promise<IGraphSnapshot>;

  /** Query full run snapshot. */
  readonly graphStatus: (runId: string) => Promise<IGraphSnapshot>;

  /** List all runs — newest first, summary only. */
  readonly graphList: () => Promise<RunSummary[]>;

  /** Initialize database schema + full-registry health check — idempotent. */
  readonly graphInit: () => Promise<IGraphInitReport>;

  /** Clean completed runs — optional ISO 8601 cutoff. */
  readonly graphCleanCompleted: (before?: string) => Promise<{ readonly deleted: number }>;

  /** Clean all runs — dangerous, requires confirmation. */
  readonly graphCleanAll: () => Promise<{ readonly deleted: number }>;

  /** Release resources — closes the database connection. */
  readonly dispose: () => Promise<void>;
}

// Config schema — single source of truth for config.json validation
import { ConfigFileSchema, type SchedulerConfig } from './schemas/index.js';
export { ConfigFileSchema, type SchedulerConfig };

/**
 * Load config from .graph-scheduler/config.json.
 * Resolves relative paths, validates against ConfigFileSchema.
 * Returns null if file missing. Malformed config (invalid JSON / schema
 * mismatch) logs `config_error` (path + reason) and returns null — never
 * degrades silently; missing file is documented-default behavior.
 */
function loadConfigFile(): { config: Partial<SchedulerConfig> } | null {
  const configPath = path.resolve('.graph-scheduler', 'config.json');
  let raw: string;
  try {
    raw = readFileSync(configPath, 'utf-8');
  } catch {
    return null; // missing — defaults are the documented behavior, no log
  }
  try {
    const cfg = JSON.parse(raw) as Record<string, unknown>;
    // taskflowDir is relative to project root (CWD), not config dir.
    // configDir may be a subdirectory like .graph-scheduler/ — resolving
    // against it would double-nest (e.g. .graph-scheduler/.graph-scheduler/graphs).
    if (typeof cfg['taskflowDir'] === 'string' && !path.isAbsolute(cfg['taskflowDir'])) {
      cfg['taskflowDir'] = path.resolve(cfg['taskflowDir']);
    }
    // registryPaths are also relative to CWD (same reasoning as taskflowDir).
    if (Array.isArray(cfg['registryPaths'])) {
      cfg['registryPaths'] = (cfg['registryPaths'] as string[]).map((p: string) =>
        path.isAbsolute(p) ? p : path.resolve(p),
      );
    }
    // dbPath same resolution rule — project-root (CWD) relative. In-memory
    // databases pass through unchanged.
    if (typeof cfg['dbPath'] === 'string') {
      cfg['dbPath'] = normalizeDbPath(cfg['dbPath']);
    }
    // skillsDir same resolution rule — project-root relative.
    if (typeof cfg['skillsDir'] === 'string' && !path.isAbsolute(cfg['skillsDir'])) {
      cfg['skillsDir'] = path.resolve(cfg['skillsDir']);
    }
    // Validate structure — reject malformed config
    const parsed = ConfigFileSchema.safeParse(cfg);
    if (!parsed.success) {
      debugLog('load', {
        event: 'config_error',
        path: configPath,
        reason: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      });
      return null;
    }
    return { config: parsed.data };
  } catch (err) {
    debugLog('load', { event: 'config_error', path: configPath, reason: String(err) });
    return null;
  }
}

/** Resolved config — all optional fields have their defaults applied. */
interface ResolvedConfig {
  readonly dbPath: string;
  /** Ordered search dirs — project first, built-in last. First file found wins. */
  readonly taskflowDirs: readonly string[];
  readonly registryPaths: readonly string[];
  /** skills package dir for entry-skill alignment — undefined = probing fallback. */
  readonly skillsDir: string | undefined;
}

/** Resolve final config: built-in defaults → config.json → env vars → programmatic override.
 * Priority (highest first): override → env vars → config.json → built-in defaults.
 * taskflowDirs: [project dir, built-in dir] — project searched first. */
function resolveConfig(override?: Partial<SchedulerConfig>): ResolvedConfig {
  const result = loadConfigFile();
  const fileConfig = result?.config;

  // Built-in registry path (low priority) + project paths (high priority)
  const registryPaths =
    override?.registryPaths ?? ([...(fileConfig?.registryPaths ?? []), BUILTIN_REGISTRY_PATH] as readonly string[]);

  // taskflowDirs: project dir first, built-in dir last for fallback
  const projectTaskflowDir: string | undefined =
    override?.taskflowDir ?? process.env['GS_TASKFLOW_DIR'] ?? fileConfig?.taskflowDir ?? undefined;
  const taskflowDirs: readonly string[] = projectTaskflowDir
    ? [projectTaskflowDir, BUILTIN_TASKFLOW_DIR]
    : [BUILTIN_TASKFLOW_DIR];

  return {
    dbPath: normalizeDbPath(override?.dbPath ?? process.env['GS_DB_PATH'] ?? fileConfig?.dbPath ?? BUILTIN_DB_PATH),
    taskflowDirs,
    registryPaths,
    skillsDir: override?.skillsDir ?? fileConfig?.skillsDir,
  };
}

/**
 * Create a FileSystem Layer that searches multiple taskflow directories.
 *
 * Relative file paths are tried against each directory in order;
 * the first existing file wins. Absolute paths bypass directory search.
 * Directories searched: project dir first, built-in dir last (fallback).
 */
function makeTaskflowFileSystemLayer(taskflowDirs: readonly string[]): Layer.Layer<FileSystem, never, never> {
  return Layer.succeed(FileSystem, {
    readFile: (filePath: string) =>
      Effect.try({
        try: (): string => {
          // Absolute paths — use as-is (from registry resolution)
          if (path.isAbsolute(filePath)) {
            return readFileSync(filePath, 'utf-8');
          }
          // Relative paths — try each taskflow dir in order
          const errors: string[] = [];
          for (const dir of taskflowDirs) {
            const candidate = `${dir}/${filePath}`;
            try {
              return readFileSync(candidate, 'utf-8');
            } catch (e) {
              errors.push(`${candidate}: ${String(e)}`);
            }
          }
          throw new Error(`Not found in any taskflow dir: ${errors.join('; ')}`);
        },
        catch: (cause): FileSystemError =>
          new FileSystemError(filePath, `File not found or unreadable: ${String(cause)}`, cause),
      }),
  });
}

/**
 * Assemble the full FSM scheduler runtime.
 *
 * Opens a libsql connection, builds all domain layers, initializes DDL,
 * and returns a Promise-typed SchedulerRuntime facade backed by ManagedRuntime.
 *
 * Config resolution: override → env vars → config.json → built-in defaults.
 */
export function createRuntime(config?: Partial<SchedulerConfig>): Effect.Effect<SchedulerRuntime, ConfigError> {
  return Effect.gen(function* () {
    const resolved = resolveConfig(config);
    const { dbPath, taskflowDirs, registryPaths, skillsDir } = resolved;

    // Configured skills package dir — consumed by load-time alignment.
    setConfiguredSkillsDir(skillsDir);

    debugLog('load', {
      event: 'createRuntime',
      config: { dbPath, taskflowDirs, registryPaths },
    });

    // Open libsql connection once — shared across all layers
    const db = yield* Effect.try({
      try: () => {
        // libsql does not create parent directories — ensure they exist
        // before opening (fresh checkouts have no .graph-scheduler/data/).
        if (dbPath !== BUILTIN_DB_PATH) {
          mkdirSync(path.dirname(dbPath), { recursive: true });
        }
        const conn = new Database(dbPath);
        conn.pragma('journal_mode = WAL');
        return conn;
      },
      catch: (cause: unknown): ConfigError => ({
        _tag: 'ConfigError',
        message: `Failed to open database at "${dbPath}": ${String(cause)}. Verify the parent directory is writable, or override with GS_DB_PATH environment variable`,
      }),
    });

    debugLog('load', { event: 'db_connected' });

    // Layer 1: persistence — GraphRepository (lib/db/)
    const persistenceLayer = makeRepositoryLayer(db);

    // DDL initialisation — use buildService directly on shared connection
    const repoForInit = buildService(db);
    yield* repoForInit.initialize().pipe(
      Effect.mapError((e: { message: string }): ConfigError => ({
        _tag: 'ConfigError',
        message: `DDL initialisation failed: ${e.message}`,
        cause: e,
      })),
    );

    debugLog('load', { event: 'ddl_complete' });

    // Layer 2: filesystem (multi-dir taskflow resolution — project + builtin)
    const fileSystemLayer = makeTaskflowFileSystemLayer(taskflowDirs);

    // Layer 2b: registry loader
    const registryLoaderService = makeRegistryLoader(registryPaths);
    const registryLoaderLayer = Layer.succeed(RegistryLoader, registryLoaderService);

    // Compose: persistence + fs + registry
    const envLayer = Layer.merge(persistenceLayer, Layer.merge(fileSystemLayer, registryLoaderLayer));

    const runtime = ManagedRuntime.make(envLayer);

    debugLog('load', { event: 'layer_ready' });

    /**
     * Run an effect through the managed runtime, rejecting the promise with
     * the RAW tagged failure (never a FiberFailure wrapper). Tagged domain
     * errors (GraphDefinitionError etc.) keep their `_tag`/`message`/`violations`
     * so the MCP layer maps them to typed error codes; defects become plain
     * Error with the Cause pretty-printed.
     */
    /** Env union the managed runtime provides — effects runnable through the facade. */
    type SchedulerEnv = GraphRepository | FileSystem | RegistryLoader;

    const run = <A, E>(eff: Effect.Effect<A, E, SchedulerEnv>): Promise<A> =>
      runtime.runPromiseExit(eff).then((exit) => {
        if (exit._tag === 'Success') return exit.value;
        const failure = Cause.failureOption(exit.cause);
        throw failure._tag === 'Some' ? failure.value : new Error(Cause.pretty(exit.cause));
      });

    // Build the Promise-wrapped facade
    const schedulerRuntime: SchedulerRuntime = {
      graphStart: (graphName: string, args?: Record<string, unknown>) => run(graphStart(graphName, args)),

      graphAdvance: (runId: string, nodeId: string, durationMs: number, skip?: boolean) =>
        run(graphAdvance(runId, nodeId, durationMs, skip)),

      graphJump: (runId: string, targetPhaseId: string) => run(graphJump(runId, targetPhaseId)),

      graphForceEnd: (runId: string) => run(graphForceEnd(runId)),

      graphStatus: (runId: string) => run(graphStatus(runId)),

      graphList: () =>
        run(
          Effect.gen(function* () {
            const items = yield* graphList();
            return items.map((item: RunSummaryItem): RunSummary => ({
              runId: item.runId,
              graphName: item.graphName,
              status: item.fsmState,
              startedAt: item.createdAt,
            }));
          }),
        ),

      graphInit: () => {
        const scan: IGraphInitScan = {
          cwd: process.cwd(),
          projectTaskflowDir: taskflowDirs.length > 1 ? taskflowDirs[0] : null,
          builtinGraphsDir: BUILTIN_TASKFLOW_DIR,
          skillsDir: resolveSkillsDir(),
        };
        return run(graphInit(scan));
      },

      graphCleanCompleted: (before?: string) =>
        run(
          Effect.gen(function* () {
            const deleted = yield* cleanCompleted(before);
            return { deleted };
          }),
        ),

      graphCleanAll: () =>
        run(
          Effect.gen(function* () {
            const deleted = yield* cleanAll();
            return { deleted };
          }),
        ),

      dispose: (): Promise<void> => {
        db.close();
        return Promise.resolve();
      },
    };

    return schedulerRuntime;
  });
}

/**
 * Convenience wrapper: in-memory SQLite + optional test taskflow directory.
 *
 * Defaults taskflowDir to "test-graphs" for use in test suites.
 */
export function createMemoryRuntime(taskflowDir?: string): Effect.Effect<SchedulerRuntime, ConfigError> {
  debugLog('load', {
    event: 'createMemoryRuntime',
    taskflowDir: taskflowDir ?? 'test-graphs',
  });
  return createRuntime({
    dbPath: ':memory:',
    taskflowDir: taskflowDir ?? 'test-graphs',
  });
}
