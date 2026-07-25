/**
 * Registry loader — multi-registry merge for graph resolution.
 *
 * Layer 1 capability module: loads one or more registry.json files and merges
 * them into a unified graph index. Deterministic priority: later paths override
 * earlier for same-named entries.
 *
 * Uses Effect-TS FileSystem Tag for I/O seam — no direct fs calls.
 */

import { Context, Effect } from 'effect';
import { dirname, resolve as resolvePath } from 'node:path';
import { debugLog } from './debug.js';
import { FileSystemError } from './filesystem.js';
import { FileSystem } from './graph-definition.js';
import { RegistryEntrySchema } from './schemas/index.js';
import type { GraphDefinitionError, Registry, RegistryEntry, RegistryLoadError } from './types.js';

// ---------------------------------------------------------------------------
// Tag
// ---------------------------------------------------------------------------

/**
 * RegistryLoader Context.Tag — injectable registry I/O.
 *
 * Loads and merges multiple registry.json files into a flat Map keyed by
 * graph name. Later registries override earlier for the same key.
 */
export class RegistryLoader extends Context.Tag('RegistryLoader')<
  RegistryLoader,
  {
    /** Load and merge registry files into a unified index. */
    readonly loadRegistries: (
      paths: ReadonlyArray<string>,
    ) => Effect.Effect<Map<string, RegistryEntry>, RegistryLoadError, FileSystem>;

    /** Resolve graph name → file path via merged registry. */
    readonly resolveGraph: (
      graphName: string,
    ) => Effect.Effect<string, GraphDefinitionError | RegistryLoadError, FileSystem>;

    /** The merged registry index. */
    readonly registry: Effect.Effect<Map<string, RegistryEntry>, RegistryLoadError, FileSystem>;
  }
>() {}

// ---------------------------------------------------------------------------
// Internal: merge a single registry file into the accumulator map
// ---------------------------------------------------------------------------

/**
 * Read and merge one registry.json into `merged`.
 *
 * Non-existent files are skipped silently. Parse or structural errors fail
 * the effect. Registry entry paths are resolved relative to the registry
 * file's containing directory — so built-in registries and project registries
 * each resolve their graph files from their own location.
 */
function mergeOneRegistry(
  merged: Map<string, RegistryEntry>,
  registryPath: string,
): Effect.Effect<void, RegistryLoadError, FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const registryDir = dirname(registryPath);

    const raw = yield* fs.readFile(registryPath).pipe(
      Effect.catchAll((e: FileSystemError) => {
        if (e.message.includes('not found') || e.message.includes('ENOENT')) {
          return Effect.succeed(null);
        }
        debugLog('load', { event: 'registry_error', file: registryPath, error: String(e.message) });
        return Effect.fail<RegistryLoadError>({
          _tag: 'RegistryLoadError',
          registryPath: registryPath,
          message: `Failed to read registry "${registryPath}": ${e.message}`,
        });
      }),
    );

    if (raw === null) {
      debugLog('load', { event: 'registry_missing', file: registryPath });
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      debugLog('load', { event: 'registry_error', file: registryPath, error: String(e) });
      return yield* Effect.fail<RegistryLoadError>({
        _tag: 'RegistryLoadError',
        registryPath: registryPath,
        message: `Invalid JSON in registry "${registryPath}": ${e instanceof Error ? e.message : String(e)}`,
      });
    }

    const registry = parsed as Record<string, unknown>;
    const graphs = registry.graphs;

    if (!Array.isArray(graphs)) {
      debugLog('load', { event: 'registry_error', file: registryPath, error: '"graphs" must be an array' });
      return yield* Effect.fail<RegistryLoadError>({
        _tag: 'RegistryLoadError',
        registryPath: registryPath,
        message: `Invalid registry "${registryPath}": "graphs" must be an array`,
      });
    }

    for (const entry of graphs) {
      const parsed = RegistryEntrySchema.safeParse(entry);
      if (!parsed.success) {
        debugLog('load', { event: 'registry_entry_skip', file: registryPath, issues: parsed.error.issues });
        continue;
      }
      const e = parsed.data;
      // Resolve relative path against registry file's directory
      const resolvedPath = resolvePath(registryDir, e.path);
      // Later entry overwrites earlier for same name (merge priority)
      if (merged.has(e.name)) {
        debugLog('load', { event: 'merge_override', graph: e.name });
      }
      merged.set(e.name, { ...e, path: resolvedPath });
    }
    debugLog('load', { event: 'registry_found', file: registryPath, entries: graphs.length });
  });
}

// ---------------------------------------------------------------------------
// Service factory
// ---------------------------------------------------------------------------

/**
 * Build a RegistryLoader service from a list of registry paths.
 *
 * The returned object conforms to RegistryLoader['Type'] and can be
 * injected via Layer.succeed.
 */
export function makeRegistryLoader(registryPaths: ReadonlyArray<string>): RegistryLoader['Type'] {
  let cachedRegistry: Map<string, RegistryEntry> | null = null;

  return {
    loadRegistries: (paths: ReadonlyArray<string>) =>
      Effect.gen(function* () {
        debugLog('load', { event: 'loadRegistries', paths });
        const merged = new Map<string, RegistryEntry>();
        for (const p of paths) {
          yield* mergeOneRegistry(merged, p);
        }
        cachedRegistry = merged;
        return merged;
      }),

    resolveGraph: (graphName: string) =>
      Effect.gen(function* () {
        const merged =
          cachedRegistry ??
          (yield* Effect.gen(function* () {
            const m = new Map<string, RegistryEntry>();
            for (const p of registryPaths) {
              yield* mergeOneRegistry(m, p);
            }
            cachedRegistry = m;
            return m;
          }));

        const entry = merged.get(graphName);
        if (!entry) {
          return yield* Effect.fail<GraphDefinitionError>({
            _tag: 'GraphDefinitionError',
            graphName,
            message: `Graph "${graphName}" not found in any registry`,
          });
        }
        debugLog('load', { event: 'graph_resolved', path: entry.path });
        return entry.path;
      }),

    registry: Effect.gen(function* () {
      if (cachedRegistry) return cachedRegistry;
      const m = new Map<string, RegistryEntry>();
      for (const p of registryPaths) {
        yield* mergeOneRegistry(m, p);
      }
      cachedRegistry = m;
      return m;
    }),
  };
}
