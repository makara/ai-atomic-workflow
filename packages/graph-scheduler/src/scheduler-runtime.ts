/**
 * Scheduler runtime — L3 application module.
 *
 * Runtime layer assembly: loads config → creates libsql
 * connection → builds persistence, fileSystem, registryLoader,
 * LangGraph adapter, 10-method Promise facade (+ dispose).
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
/** built-in workflow graph directory — fallback when no project taskflowDir configured */
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

import {
  GraphAdapter,
  type DispatchResult,
  type IGraphSnapshot,
  type NodeDetail,
  type StartResult,
} from './adapter.js';
import { loadGraphWithRegistry } from './api/graph-loader.js';
import { cleanAll, cleanCompleted, graphInit, type IGraphInitReport, type IGraphInitScan } from './api/maintenance.js';
import { graphAssets, graphList, type GraphAsset } from './api/query.js';
import { debugLog } from './debug.js';
import { FileSystem, FileSystemError, makeWorkflowFileSystemLayer } from './filesystem.js';
import { buildService, GraphRepository, makeRepositoryLayer } from './lib/db/repository.js';
import { makeRegistryLoader, RegistryLoader } from './registry-loader.js';
import type { ConfigError, RunSummary } from './types.js';

/** Promise-typed facade over the FSM-driven graph-scheduling domain. */
export interface SchedulerRuntime {
  /** Start a new graph run — returns runId + first node to execute. */
  readonly graphStart: (graphName: string, args?: Record<string, unknown>) => Promise<StartResult>;

  /** Advance a run — report node completion + get next node.
   *  Output NOT passed — lives in agent session or on-disk files.
   *  Duration derived from timestamps — never reported.
   *  Dual channel (graph-flow): `condition` = flow-matched transition
   *  (no match → loud error); `jump` = backward-only forced rework (target
   *  ⊆ ancestors ∪ `__handoff`); `end: true` = direct-end (adapter-level
   *  completion). No branchTo. */
  readonly graphAdvance: (
    runId: string,
    nodeId: string,
    end?: boolean,
    condition?: string,
    jump?: string,
  ) => Promise<DispatchResult>;

  /** Directed jump to target phase — reset target + downstream terminal nodes (upstream kept). */
  readonly graphJump: (runId: string, targetPhaseId: string) => Promise<DispatchResult>;

  /** Force-terminate a run — run terminated, irreversible; completed/terminated runs are a no-op. Returns the unified envelope { snapshot, node: null }. */
  readonly graphForceEnd: (runId: string) => Promise<DispatchResult>;

  /** Query full run snapshot. */
  readonly graphStatus: (runId: string) => Promise<IGraphSnapshot>;

  /** List all runs — newest first, summary only. */
  readonly graphList: () => Promise<ReadonlyArray<RunSummary>>;

  /** Enumerate graph assets — merged registries with per-graph problems; read-only, never creates a run. */
  readonly graphAssets: () => Promise<ReadonlyArray<GraphAsset>>;

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
  /** project-level ambient context (config.json `context`) — default layer of the global channel. */
  readonly context: readonly string[];
}

/** Resolve final config: built-in defaults → config.json → env vars → programmatic override.
 * Priority (highest first): override → env vars → config.json → built-in defaults.
 * taskflowDirs: [project dir, built-in dir] — project searched first. */
function resolveConfig(override?: Partial<SchedulerConfig>): ResolvedConfig {
  const result = loadConfigFile();
  const fileConfig = result?.config;

  // Project-first precedence: builtin first (fallback layer), project paths
  // last (later wins) — a same-named project entry shadows the builtin.
  const registryPaths =
    override?.registryPaths ?? ([BUILTIN_REGISTRY_PATH, ...(fileConfig?.registryPaths ?? [])] as readonly string[]);

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
    context: override?.context ?? fileConfig?.context ?? [],
  };
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
    const { dbPath, taskflowDirs, registryPaths } = resolved;

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

    // Layer 2: filesystem (multi-dir workflow resolution — project + builtin)
    const fileSystemLayer = makeWorkflowFileSystemLayer(taskflowDirs);

    // Layer 2b: registry loader
    const registryLoaderService = makeRegistryLoader(registryPaths, BUILTIN_REGISTRY_PATH);
    const registryLoaderLayer = Layer.succeed(RegistryLoader, registryLoaderService);

    // Compose: persistence + fs + registry (config flows via adapter deps)
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

    // Build the Promise-wrapped facade over the LangGraph adapter
    const adapter = new GraphAdapter({
      db,
      repo: buildService(db),
      loadGraph: (graphName: string) => run(loadGraphWithRegistry(graphName, resolved.context)),
      projectContext: resolved.context,
    });

    const schedulerRuntime: SchedulerRuntime = {
      graphStart: (graphName: string, args?: Record<string, unknown>): Promise<StartResult> =>
        adapter.graphStart(graphName, args),

      graphAdvance: (
        runId: string,
        nodeId: string,
        end?: boolean,
        condition?: string,
        jump?: string,
      ): Promise<DispatchResult> => adapter.graphAdvance(runId, nodeId, end, condition, jump),

      graphJump: (runId: string, targetPhaseId: string): Promise<DispatchResult> =>
        adapter.graphJump(runId, targetPhaseId),

      graphForceEnd: (runId: string): Promise<DispatchResult> => adapter.graphForceEnd(runId),

      graphStatus: (runId: string): Promise<IGraphSnapshot> => adapter.graphStatus(runId),

      graphList: () => run(graphList()),

      graphAssets: () => run(graphAssets()),

      graphInit: () => {
        const scan: IGraphInitScan = {
          cwd: process.cwd(),
          projectTaskflowDir: taskflowDirs.length > 1 ? taskflowDirs[0] : null,
          builtinGraphsDir: BUILTIN_TASKFLOW_DIR,
          projectContext: resolved.context,
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
 * Convenience wrapper: in-memory SQLite + optional test workflow directory.
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
