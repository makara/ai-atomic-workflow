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
import { FileSystem, FileSystemError } from './filesystem.js';
import { RegistryEntrySchema } from './schemas/index.js';
import type { GraphDefinitionError, RegistryEntry, RegistryLoadError } from './types.js';

/**
 * RegistryLoader Context.Tag — injectable registry I/O.
 *
 * Loads and merges multiple registry.json files into a flat Map keyed by
 * graph name. Project registries override builtin for the same key
 * (project-first precedence — the builtin registry is the fallback layer).
 */
export class RegistryLoader extends Context.Tag('RegistryLoader')<
  RegistryLoader,
  {
    /** Resolve graph name → file path via merged registry (project wins over builtin). */
    readonly resolveGraph: (
      graphName: string,
    ) => Effect.Effect<
      { path: string; source: 'project' | 'builtin' },
      GraphDefinitionError | RegistryLoadError,
      FileSystem
    >;

    /** The merged registry index. */
    readonly registry: Effect.Effect<Map<string, RegistryEntry>, RegistryLoadError, FileSystem>;
  }
>() {}

/**
 * Read and merge one registry.json into `merged`.
 *
 * Non-existent files are skipped silently. Parse or structural errors fail
 * the effect. Registry entry paths are resolved relative to the registry
 * file's containing directory — so built-in registries and project registries
 * each resolve their graph files from their own location. Each winning entry
 * records its source registry (project | builtin) for resolution visibility.
 */
function mergeOneRegistry(
  merged: Map<string, { entry: RegistryEntry; source: 'project' | 'builtin' }>,
  registryPath: string,
  builtinPath: string,
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

    const source: 'project' | 'builtin' = registryPath === builtinPath ? 'builtin' : 'project';
    for (const entry of graphs) {
      const parsed = RegistryEntrySchema.safeParse(entry);
      if (!parsed.success) {
        debugLog('load', { event: 'registry_entry_skip', file: registryPath, issues: parsed.error.issues });
        continue;
      }
      const e = parsed.data;
      // Resolve relative path against registry file's directory
      const resolvedPath = resolvePath(registryDir, e.path);
      // Project-first precedence: later paths override earlier (builtin first,
      // project last wins) — a same-named project entry shadows the builtin.
      if (merged.has(e.name)) {
        debugLog('load', { event: 'merge_override', graph: e.name, by: source });
      }
      merged.set(e.name, { entry: { ...e, path: resolvedPath }, source });
    }
    debugLog('load', { event: 'registry_found', file: registryPath, entries: graphs.length });
  });
}

/**
 * Build a RegistryLoader service from a list of registry paths.
 *
 * Project-first precedence: the builtin registry path comes first, project
 * registry paths after — later entries override earlier, so a same-named
 * project entry shadows the builtin (the builtin is the fallback layer).
 * `resolvedFrom` reports which layer won, making shadowing explicit.
 *
 * Registries are re-read on every call — the registry set is small
 * (~10 entries), so caching buys nothing and stale caches silently
 * ignore runtime registry.json changes.
 *
 * The returned object conforms to RegistryLoader['Type'] and can be
 * injected via Layer.succeed.
 */
export function makeRegistryLoader(registryPaths: ReadonlyArray<string>, builtinPath: string): RegistryLoader['Type'] {
  const loadAll = (): Effect.Effect<
    Map<string, { entry: RegistryEntry; source: 'project' | 'builtin' }>,
    RegistryLoadError,
    FileSystem
  > =>
    Effect.gen(function* () {
      const merged = new Map<string, { entry: RegistryEntry; source: 'project' | 'builtin' }>();
      for (const p of registryPaths) {
        yield* mergeOneRegistry(merged, p, builtinPath);
      }
      return merged;
    });

  return {
    resolveGraph: (graphName: string) =>
      Effect.gen(function* () {
        const merged = yield* loadAll();

        const hit = merged.get(graphName);
        if (!hit) {
          return yield* Effect.fail<GraphDefinitionError>({
            _tag: 'GraphDefinitionError',
            graphName,
            message: `Graph "${graphName}" not found in any registry`,
          });
        }
        debugLog('load', { event: 'graph_resolved', path: hit.entry.path, source: hit.source });
        return { path: hit.entry.path, source: hit.source };
      }),

    registry: loadAll().pipe(
      Effect.map((merged) => {
        const flat = new Map<string, RegistryEntry>();
        for (const [name, { entry }] of merged) {
          flat.set(name, entry);
        }
        return flat;
      }),
    ),
  };
}
