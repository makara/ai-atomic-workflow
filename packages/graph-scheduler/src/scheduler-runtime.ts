/**
 * Scheduler runtime — L3 application module.
 *
 * FSM Layer assembly (ADR 0020): loads config → creates libsql
 * connection → builds persistence, fileSystem, registryLoader,
 * 9-method Promise facade.
 *
 * @module
 */

import { Effect, Layer, ManagedRuntime } from 'effect';
import Database from 'libsql';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// Built-in assets — resolved relative to this source file
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILTIN_REGISTRY_PATH = path.resolve(PKG_ROOT, 'graphs', 'registry.json');

import { debugLog } from './debug.js';
import { FileSystemError } from './filesystem.js';
import { FileSystem } from './graph-definition.js';
import {
  AgentRegistryService,
  DefaultAgentRegistryLayer,
  loadBuiltinRegistry,
  mergeAgentRegistry,
  type AgentRegistryEntry,
} from './lib/agent-registry.js';
import { buildService, GraphRepository, makeRepositoryLayer, type RunSummaryItem } from './lib/db/repository.js';
import { registerDefaultPhaseHandlersLayer } from './phase-handler/index.js';
import { makeRegistryLoader, RegistryLoader } from './registry-loader.js';
// API layer — direct Effect generators (ADR 0020)
import { z } from 'zod/v4';
import {
  graphAdvance,
  graphForceEnd,
  graphJump,
  graphStart,
  type IGraphSnapshot,
  type NodeDetail,
} from './api/crud.js';
import { cleanAll, cleanCompleted, graphInit } from './api/maintenance.js';
import { graphList, graphStatus } from './api/query.js';
import { AgentRegistryEntrySchema } from './schemas/index.js';

import type { ConfigError } from './types.js';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

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
  }>;

  /** Advance a run — report node completion + get next node.
   *  Output NOT passed — lives in agent session or on-disk files. */
  readonly graphAdvance: (
    runId: string,
    nodeId: string,
    durationMs: number,
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

  /** Initialize database schema — idempotent. */
  readonly graphInit: () => Promise<void>;

  /** Clean completed runs — optional ISO 8601 cutoff. */
  readonly graphCleanCompleted: (before?: string) => Promise<{ readonly deleted: number }>;

  /** Clean all runs — dangerous, requires confirmation. */
  readonly graphCleanAll: () => Promise<{ readonly deleted: number }>;

  /** Release resources — closes the database connection. */
  readonly dispose: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Config schema — single source of truth for config.json validation
// ---------------------------------------------------------------------------

/** Zod schema for graph-scheduler config.json. All fields optional — partial config is valid. */
export const ConfigFileSchema = z.object({
  dbPath: z.string().min(1).optional(),
  taskflowDir: z.string().min(1).optional(),
  registryPaths: z.array(z.string().min(1)).optional(),
  agentRegistry: z.array(AgentRegistryEntrySchema).optional(),
});

/** Configuration for createRuntime — inferred from ConfigFileSchema. */
export type SchedulerConfig = z.infer<typeof ConfigFileSchema>;

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

/**
 * Load config from .graph-scheduler/config.json.
 * Resolves relative paths, validates against ConfigFileSchema.
 * Returns null if file missing, invalid JSON, or schema mismatch.
 */
function loadConfigFile(): { config: Partial<SchedulerConfig>; configDir: string } | null {
  try {
    const configPath = path.resolve('.graph-scheduler', 'config.json');
    const configDir = path.dirname(configPath);
    const raw = readFileSync(configPath, 'utf-8');
    const cfg = JSON.parse(raw) as Record<string, unknown>;
    // Resolve relative paths against config file's directory
    if (typeof cfg['taskflowDir'] === 'string' && !path.isAbsolute(cfg['taskflowDir'])) {
      cfg['taskflowDir'] = path.resolve(configDir, cfg['taskflowDir']);
    }
    if (Array.isArray(cfg['registryPaths'])) {
      cfg['registryPaths'] = (cfg['registryPaths'] as string[]).map((p: string) =>
        path.isAbsolute(p) ? p : path.resolve(configDir, p),
      );
    }
    // Validate structure — reject malformed config (F2)
    const parsed = ConfigFileSchema.safeParse(cfg);
    if (!parsed.success) return null;
    return { config: parsed.data, configDir };
  } catch {
    return null;
  }
}

/** Resolved config — all optional fields have their defaults applied. */
interface ResolvedConfig {
  readonly dbPath: string;
  readonly taskflowDir: string;
  readonly registryPaths: readonly string[];
  readonly agentRegistry: readonly AgentRegistryEntry[] | undefined;
}

/**
 * Normalize config.json agentRegistry from object format `{ agent: "skill" }`
 * to internal array format `[{ type: "agent", skill: "skill" }]`.
 * Validates array entries against AgentRegistryEntrySchema — rejects invalid.
 * Returns undefined on nil/missing/invalid so caller falls back to builtin.
 */
function normalizeAgentRegistry(raw: unknown): readonly AgentRegistryEntry[] | undefined {
  if (!raw) return undefined;
  // Array format — validate each entry against schema
  if (Array.isArray(raw)) {
    const parsed = AgentRegistryEntrySchema.array().safeParse(raw);
    return parsed.success ? parsed.data : undefined;
  }
  // Object format: { agent: "skill-name", ... }
  if (typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>)
      .filter(([type, skill]) => AgentRegistryEntrySchema.safeParse({ type, skill }).success)
      .map(([type, skill]) => ({ type, skill: skill as string }));
  }
}

/** Resolve final config: built-in defaults → config.json → env vars → programmatic override.
 * Priority (highest first): override → env vars → config.json → built-in defaults.
 * Relative paths are resolved against config dir (or CWD when no config file). */
function resolveConfig(override?: Partial<SchedulerConfig>): ResolvedConfig {
  const result = loadConfigFile();
  const fileConfig = result?.config;
  const configDir = result?.configDir ?? process.cwd();

  // Built-in registry path (low priority) + project paths (high priority)
  const registryPaths =
    override?.registryPaths ?? ([...(fileConfig?.registryPaths ?? []), BUILTIN_REGISTRY_PATH] as readonly string[]);

  return {
    dbPath: override?.dbPath ?? fileConfig?.dbPath ?? process.env['GS_DB_PATH'] ?? ':memory:',
    taskflowDir:
      override?.taskflowDir ??
      fileConfig?.taskflowDir ??
      process.env['GS_TASKFLOW_DIR'] ??
      path.resolve(configDir, 'graphs'),
    registryPaths,
    agentRegistry: override?.agentRegistry ?? normalizeAgentRegistry(fileConfig?.agentRegistry),
  };
}

// ---------------------------------------------------------------------------
// FileSystem layer with directory resolution
// ---------------------------------------------------------------------------

/**
 * Create a FileSystem Layer that resolves relative paths under `taskflowDir`.
 *
 * loadGraph calls `readFile("${graphName}.taskflow.yaml")`; this layer
 * prepends the taskflow directory so files are read from the correct location.
 */
function makeTaskflowFileSystemLayer(taskflowDir: string): Layer.Layer<FileSystem, never, never> {
  return Layer.succeed(FileSystem, {
    readFile: (filePath: string) =>
      Effect.try({
        try: (): string => {
          const resolved = path.isAbsolute(filePath) ? filePath : `${taskflowDir}/${filePath}`;
          return readFileSync(resolved, 'utf-8');
        },
        catch: (cause): FileSystemError =>
          new FileSystemError(filePath, `File not found or unreadable: ${String(cause)}`, cause),
      }),
  });
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

/**
 * Assemble the full FSM scheduler runtime.
 *
 * Opens a libsql connection, builds all domain layers, initializes DDL,
 * and returns a Promise-typed SchedulerRuntime facade backed by ManagedRuntime.
 *
 * Config resolution: override → .graph-scheduler/config.json → env vars → defaults.
 */
export function createRuntime(config?: Partial<SchedulerConfig>): Effect.Effect<SchedulerRuntime, ConfigError> {
  return Effect.gen(function* () {
    const resolved = resolveConfig(config);
    const { dbPath, taskflowDir, registryPaths, agentRegistry } = resolved;

    debugLog('load', {
      event: 'createRuntime',
      config: { dbPath, taskflowDir, registryPaths },
    });

    // Open libsql connection once — shared across all layers
    const db = yield* Effect.try({
      try: () => {
        const conn = new Database(dbPath);
        conn.pragma('journal_mode = WAL');
        return conn;
      },
      catch: (cause: unknown): ConfigError => ({
        _tag: 'ConfigError',
        message: `Failed to open database at "${dbPath}": ${String(cause)}`,
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

    // Layer 2: filesystem (with taskflowDir resolution)
    const fileSystemLayer = makeTaskflowFileSystemLayer(taskflowDir);

    // Layer 2b: registry loader
    const registryLoaderService = makeRegistryLoader(registryPaths);
    const registryLoaderLayer = Layer.succeed(RegistryLoader, registryLoaderService);

    // Layer 2c: agent registry — merge builtin JSON + project overrides
    const agentRegistryLayer = agentRegistry
      ? Layer.succeed(AgentRegistryService, mergeAgentRegistry(loadBuiltinRegistry(), agentRegistry))
      : DefaultAgentRegistryLayer;

    // Layer 2d: phase handler registry (per-runtime fresh Map, Finding 3 fix)
    const phaseHandlerLayer = registerDefaultPhaseHandlersLayer();

    // Compose: persistence + fs + registry + agentRegistry + phaseHandler
    const envLayer = Layer.merge(
      persistenceLayer,
      Layer.merge(
        fileSystemLayer,
        Layer.merge(registryLoaderLayer, Layer.merge(agentRegistryLayer, phaseHandlerLayer)),
      ),
    );

    const runtime = ManagedRuntime.make(envLayer);

    debugLog('load', { event: 'layer_ready' });

    // Build the Promise-wrapped facade
    const schedulerRuntime: SchedulerRuntime = {
      graphStart: (graphName: string, args?: Record<string, unknown>) =>
        runtime.runPromise(graphStart(graphName, args)),

      graphAdvance: (runId: string, nodeId: string, durationMs: number) =>
        runtime.runPromise(graphAdvance(runId, nodeId, durationMs)),

      graphJump: (runId: string, targetPhaseId: string) => runtime.runPromise(graphJump(runId, targetPhaseId)),

      graphForceEnd: (runId: string) => runtime.runPromise(graphForceEnd(runId)),

      graphStatus: (runId: string) => runtime.runPromise(graphStatus(runId)),

      graphList: () =>
        runtime.runPromise(
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

      graphInit: () => runtime.runPromise(graphInit()),

      graphCleanCompleted: (before?: string) =>
        runtime.runPromise(
          Effect.gen(function* () {
            const deleted = yield* cleanCompleted(before);
            return { deleted };
          }),
        ),

      graphCleanAll: () =>
        runtime.runPromise(
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
