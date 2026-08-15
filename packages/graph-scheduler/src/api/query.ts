/**
 * API Query — 2 read operations as Effect generators.
 *
 * Layer 2 — pure delegation to lib/db/repository. Zero write side effects.
 *
 * Dependencies:
 * - Layer 3: lib/db/repository (GraphRepository), types (SchedulerError)
 * - Internal: api/snapshot (IGraphSnapshot)
 *
 * @module
 */

import { Effect } from 'effect';

import type { FileSystem } from '../filesystem.js';
import type { NodeStateEntry } from '../lib/db/repository.js';
import { GraphRepository } from '../lib/db/repository.js';
import { RegistryLoader } from '../registry-loader.js';
import type { PersistenceError, RegistryLoadError, SchedulerError } from '../types.js';
import { loadGraphWithRegistry } from './graph-loader.js';
import { assembleSnapshot, type IGraphSnapshot } from './snapshot.js';

/**
 * Build a full GraphSnapshot from a repository GraphRun + NodeStateEntry array.
 * Shares shape assembly with snapshot.ts assembleSnapshot().
 */
function buildFullSnapshot(
  runId: string,
  graphName: string,
  fsmState: string,
  createdAt: string,
  updatedAt: string,
  nodeStates: ReadonlyArray<NodeStateEntry>,
): IGraphSnapshot {
  const nodes = nodeStates.map((ns) => ({
    nodeId: ns.nodeId,
    status: ns.status,
    retryCount: ns.retryCount,
  }));

  return assembleSnapshot({ runId, graphName, fsmState, createdAt, updatedAt }, nodes);
}

/**
 * Get the full status snapshot of a graph run.
 *
 * Loads run + all node states from persistence and returns a unified snapshot.
 *
 * @param runId — run identifier
 */
export function graphStatus(runId: string): Effect.Effect<IGraphSnapshot, SchedulerError, GraphRepository> {
  return Effect.gen(function* () {
    const repo = yield* GraphRepository;

    const run = yield* repo.getRun(runId);

    const nodeStates = yield* repo.getNodeStates(runId);

    return buildFullSnapshot(run.runId, run.graphName, run.fsmState, run.createdAt, run.updatedAt, nodeStates);
  });
}

/**
 * List all graph runs — newest first, summary only.
 *
 * Pure delegation to repository.listRuns().
 */
export function graphList(): Effect.Effect<
  ReadonlyArray<{
    readonly runId: string;
    readonly graphName: string;
    readonly fsmState: string;
    readonly createdAt: string;
    readonly updatedAt: string;
  }>,
  PersistenceError,
  GraphRepository
> {
  return Effect.gen(function* () {
    const repo = yield* GraphRepository;
    return yield* repo.listRuns();
  });
}

/** Graph asset — registry entry + load-time problems (graph_assets surface). */
export interface GraphAsset {
  readonly name: string;
  readonly path: string;
  readonly description?: string;
  readonly problems: string[];
  readonly resolvedFrom: 'project' | 'builtin' | 'fallback';
}

/**
 * Graph asset query — the passive information channel for graph-workflow.
 *
 * Enumerates the merged registries (project-first) with per-graph
 * { name, path, description, problems[], resolvedFrom } — load-time
 * problems attached per graph. Read-only: never creates a run.
 *
 * Description precedence: the graph's own top-level description when
 * declared, else the registry entry description.
 */
export function graphAssets(): Effect.Effect<
  ReadonlyArray<GraphAsset>,
  SchedulerError | RegistryLoadError,
  FileSystem | RegistryLoader
> {
  return Effect.gen(function* () {
    const registryLoader = yield* RegistryLoader;
    const registry = yield* registryLoader.registry;

    const assets: GraphAsset[] = [];
    for (const [name, entry] of registry) {
      const loaded = yield* Effect.either(loadGraphWithRegistry(name));
      if (loaded._tag === 'Right') {
        assets.push({
          name,
          path: loaded.right.resolvedPath,
          description: loaded.right.description ?? entry.description,
          problems: loaded.right.problems,
          resolvedFrom: loaded.right.resolvedFrom,
        });
      } else {
        // Registry entry whose graph fails to load — surface as an asset with
        // the load failure in problems (never a silent drop). Source derived
        // from the registry resolution (project wins over builtin).
        const source = yield* Effect.either(registryLoader.resolveGraph(name));
        assets.push({
          name,
          path: entry.path,
          description: entry.description,
          problems: [loaded.left.message],
          resolvedFrom: source._tag === 'Right' ? source.right.source : 'fallback',
        });
      }
    }
    // Deterministic order — registry insertion order is merge-deterministic,
    // but sort by name for stable display.
    return assets.sort((a, b) => a.name.localeCompare(b.name));
  });
}
