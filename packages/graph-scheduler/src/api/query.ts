/**
 * API Query — 2 read operations as Effect generators.
 *
 * Layer 2 — read-only. graphList is pure delegation to lib/db/repository;
 * graphAssets enumerates the merged registries. graphStatus now routes the
 * adapter (checkpoint-derived snapshot — single snapshot path, no FSM).
 *
 * @module
 */

import { Effect } from 'effect';

import { FileSystem } from '../filesystem.js';
import { loadGraphFromPath } from '../graph-definition.js';
import { GraphRepository } from '../lib/db/repository.js';
import { RegistryLoader } from '../registry-loader.js';
import type { PersistenceError, RegistryLoadError, RunSummary, SchedulerError } from '../types.js';
import { loadGraphWithRegistry } from './graph-loader.js';

/**
 * List all graph runs — newest first, summary only.
 *
 * Pure delegation to repository.listRuns().
 */
export function graphList(): Effect.Effect<ReadonlyArray<RunSummary>, PersistenceError, GraphRepository> {
  return Effect.gen(function* () {
    const repo = yield* GraphRepository;
    return yield* repo.listRuns();
  });
}

/** Graph asset — the graph perception list entry (graph_assets surface). */
export interface GraphAsset {
  /** Graph name — identity. */
  readonly id: string;
  /** Purpose — the graph definition's top-level description (catalog single source; empty when undeclared). */
  readonly description: string;
  /** Run conditions — projected from the loaded graph definition, never a new fact source. */
  readonly run_conditions: {
    /** Declared interaction value (`none` | `enabled`; absent defaults to `enabled`). */
    readonly interaction: 'none' | 'enabled';
    /** True when the definition declares a non-empty top-level constraints array. */
    readonly constraints_present: boolean;
  };
  /** Resolution source — merged form of the former registered/resolvedFrom pair. */
  readonly source: 'builtin' | 'project' | 'fallback';
  /** Load-time warnings per graph — empty when clean. */
  readonly problems: string[];
}

/**
 * Graph asset query — the passive information channel for graph-workflow.
 *
 * Enumerates the merged registries (project-first) with per-graph
 * { id, description, run_conditions, source, problems } — the graph
 * perception list (five-field asset shape). `description` and
 * `run_conditions` are projected from the loaded graph definition at query
 * time (catalog single source — registry entries are a pure index);
 * `source` merges the former registered/resolvedFrom pair. Schema-valid
 * workflow YAMLs without a registry entry are enumerated as
 * `source: fallback` (schema determines graph identity — FL2
 * discoverability, never invisible). Read-only: never creates a run.
 *
 * Catalog ordering: registered entries first (name-sorted, project-first
 * merge), unregistered entries after (name-sorted).
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
    for (const name of registry.keys()) {
      const loaded = yield* Effect.either(loadGraphWithRegistry(name));
      if (loaded._tag === 'Right') {
        assets.push({
          id: name,
          description: loaded.right.meta.description ?? '',
          run_conditions: {
            interaction: loaded.right.tf.interaction ?? 'enabled',
            constraints_present: (loaded.right.tf.constraints?.length ?? 0) > 0,
          },
          source: loaded.right.meta.resolvedFrom,
          problems: loaded.right.meta.problems,
        });
      } else {
        // Registry entry whose graph fails to load — surface as an asset with
        // the load failure in problems (never a silent drop). Source derived
        // from the registry resolution (project wins over builtin).
        // Schema violations (incl. strict unknown-key rejections) carry the
        // detail in `violations` — merged so the frontend notification names
        // the offending keys (graph-maintain cleanup target). The definition
        // could not be read, so description is empty and run_conditions take
        // their defaults (interaction enabled, no constraints).
        const source = yield* Effect.either(registryLoader.resolveGraph(name));
        const maybeViolations = (loaded.left as { violations?: unknown }).violations;
        const violations = Array.isArray(maybeViolations) ? (maybeViolations as readonly string[]) : [];
        const problem =
          violations.length > 0 ? `${loaded.left.message} — ${violations.join('; ')}` : loaded.left.message;
        assets.push({
          id: name,
          description: '',
          run_conditions: { interaction: 'enabled', constraints_present: false },
          source: source._tag === 'Right' ? source.right.source : 'fallback',
          problems: [problem],
        });
      }
    }

    // Unregistered enumeration — every workflow YAML under the workflow dirs
    // that validates as a graph without a registry entry (FL2: schema-valid
    // YAML IS a graph; discoverability never depends on registration).
    const fs = yield* FileSystem;
    const registeredNames = new Set(registry.keys());
    for (const filePath of fs.listYamlFiles()) {
      const loaded = yield* Effect.either(loadGraphFromPath(filePath, filePath));
      if (loaded._tag === 'Right') {
        const name = loaded.right.name;
        // A file whose declared name resolves through the registry (e.g. a
        // registry path entry) is already listed above — skip duplicates.
        if (registeredNames.has(name)) continue;
        assets.push({
          id: name,
          description: loaded.right.description ?? '',
          run_conditions: {
            interaction: loaded.right.interaction ?? 'enabled',
            constraints_present: (loaded.right.constraints?.length ?? 0) > 0,
          },
          source: 'fallback',
          problems: [],
        });
      }
      // Schema-invalid YAMLs are not graphs — skipped silently (probe semantics).
    }

    // Deterministic order — registered entries first (name-sorted), then
    // unregistered (name-sorted). Registry insertion order is merge-deterministic.
    return assets.sort((a, b) => {
      if ((a.source === 'fallback') !== (b.source === 'fallback')) return a.source === 'fallback' ? 1 : -1;
      return a.id.localeCompare(b.id);
    });
  });
}
