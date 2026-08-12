/**
 * API Graph Loader — graph definition loading, caching, and adaptation.
 *
 * Extracted from crud.ts.
 * Loads graph definitions (registry-aware), caches per-run, and adapts
 * taskflow-core Taskflow to FSM TaskflowGraph.
 *
 * Machine validation only: graph YAML contracts, channel shape, user-
 * supplement layer existence. Skill prose is never parsed here — entry-skill
 * alignment runs agent-side in estate-maintain's consistency gate.
 *
 * @module
 */

import { Effect } from 'effect';
import { validateGraphContracts, validateProjectContext } from '../context/contracts.js';
import { debugLog } from '../debug.js';
import { FileSystem, FileSystemError } from '../filesystem.js';
import { flattenFlowPhases, MAX_FLOW_DEPTH } from '../flow-flatten.js';
import type { TaskflowGraph } from '../fsm/transition.js';
import type { Taskflow } from '../graph-definition.js';
import { loadGraph, loadGraphFromPath } from '../graph-definition.js';
import { validatePhase } from '../phase-handler/index.js';
import { RegistryLoader } from '../registry-loader.js';
import type { GraphDefinitionError, RegistryLoadError, SchedulerError } from '../types.js';
import { FlowPhaseError } from '../types.js';

import { graphLoadCache } from './run-caches.js';

/**
 * Load-time contract pass — runs on the flattened graph after
 * schema validation, before any dispatch. Machine-owned checks only:
 * graph YAML contract violations fail the load with GraphDefinitionError
 * (fail-fast — never deferred to dispatch); warnings are surfaced via
 * debugLog and never block.
 */
function runContractsPass(
  tf: Taskflow,
  filePath: string,
  graphName: string,
  projectContext?: readonly string[],
): Effect.Effect<{ tf: Taskflow; warnings: string[] }, GraphDefinitionError, never> {
  return Effect.gen(function* () {
    const contracts = validateGraphContracts(tf, filePath);
    const errors = [...contracts.errors];
    const warnings = [...contracts.warnings];

    // User-supplement layer existence validation — four-layer channel model: exact
    // file missing -> load error, glob zero-match -> warning. Runs against
    // the resolved config.json `context:` when the caller supplies it.
    if (projectContext) {
      const pc = validateProjectContext(projectContext, process.cwd());
      errors.push(...pc.errors);
      warnings.push(...pc.warnings);
    }

    for (const w of warnings) {
      debugLog('load', { event: 'contract_warning', graph: graphName, warning: w });
    }
    if (errors.length > 0) {
      return yield* Effect.fail<GraphDefinitionError>({
        _tag: 'GraphDefinitionError',
        graphName,
        message: `Contract validation failed for ${graphName}`,
        violations: errors,
      });
    }
    return { tf, warnings };
  });
}

/** Recursively collect all `use` graph names from a Taskflow. */
export function collectFlowRefs(tf: Taskflow, seen: Set<string>): string[] {
  const refs: string[] = [];
  for (const phase of tf.phases) {
    if (phase.type === 'flow' && typeof phase.use === 'string' && !seen.has(phase.use)) {
      seen.add(phase.use);
      refs.push(phase.use);
    }
  }
  return refs;
}

interface LoadedNamedGraph {
  readonly tf: Taskflow;
  /** Path the graph was loaded from — for contract-pass reporting. */
  readonly filePath: string;
  /** Resolution source — project registry, builtin registry, or file-name fallback. */
  readonly resolvedFrom: 'project' | 'builtin' | 'fallback';
}

/**
 * Load a graph by name with unified resolution: project registry entry
 * (explicit path) first, taskflow-directory search as fallback. Same
 * semantics for top-level graphs and flow subgraphs.
 */
function loadNamedGraph(
  name: string,
): Effect.Effect<LoadedNamedGraph, GraphDefinitionError | FileSystemError, FileSystem | RegistryLoader> {
  return Effect.gen(function* () {
    const resolvedPath = yield* Effect.either(
      Effect.gen(function* () {
        const registryLoader = yield* RegistryLoader;
        return yield* registryLoader.resolveGraph(name);
      }),
    );
    if (resolvedPath._tag === 'Right') {
      const { path, source } = resolvedPath.right;
      return { tf: yield* loadGraphFromPath(path, name), filePath: path, resolvedFrom: source };
    }
    // Fallback: taskflow-dir search — resolve the actual absolute path for
    // the identity banner (never a bare filename).
    const fallbackPath = yield* Effect.gen(function* () {
      const fs = yield* FileSystem;
      return fs.resolvePath(`${name}.taskflow.yaml`);
    });
    const filePath = fallbackPath ?? `${name}.taskflow.yaml`;
    return { tf: yield* loadGraph(name), filePath, resolvedFrom: 'fallback' };
  });
}

/** True when a FileSystemError wraps an ENOENT — missing file, not a real I/O fault. */
function isFileNotFound(err: unknown): boolean {
  if (!(err instanceof FileSystemError)) return false;
  const cause = err.cause;
  if (cause instanceof Error && (cause as NodeJS.ErrnoException).code === 'ENOENT') return true;
  return err.message.includes('ENOENT');
}

export interface GraphLoadMeta {
  /** Resolution source of the top-level graph — project | builtin | fallback. */
  readonly resolvedFrom: 'project' | 'builtin' | 'fallback';
  /** Absolute path the top-level graph file was loaded from. */
  readonly resolvedPath: string;
  /** Graph top-level description (purpose-focused free text) — undefined when absent. */
  readonly description?: string;
}

export function loadGraphWithRegistry(
  graphName: string,
  projectContext?: readonly string[],
): Effect.Effect<Taskflow & GraphLoadMeta, SchedulerError | RegistryLoadError, FileSystem | RegistryLoader> {
  return Effect.gen(function* () {
    const loaded = yield* loadNamedGraph(graphName);

    // Phase 1 merge-at-load: pre-load all referenced child graphs, then flatten
    const seen = new Set<string>();
    let pendingRefs = collectFlowRefs(loaded.tf, seen);
    const childMap = new Map<string, Taskflow>();

    // Load child graphs iteratively (breadth-first for simplicity)
    while (pendingRefs.length > 0) {
      for (const refName of pendingRefs) {
        const childResult = yield* Effect.either(loadNamedGraph(refName));
        if (childResult._tag === 'Right') {
          childMap.set(refName, childResult.right.tf);
        } else if (isFileNotFound(childResult.left)) {
          yield* Effect.fail(
            new FlowPhaseError(
              refName,
              'GRAPH_NOT_FOUND',
              `child graph '${refName}' not found in registry or taskflow dirs`,
            ),
          );
        } else {
          // fail-fast — propagate the original load error (schema violations, I/O faults)
          yield* Effect.fail(childResult.left);
        }
      }
      // Check newly loaded children for nested flow refs
      const nextRefs: string[] = [];
      for (const refName of pendingRefs) {
        const child = childMap.get(refName);
        if (child) {
          const childRefs = collectFlowRefs(child, seen);
          nextRefs.push(...childRefs);
        }
      }
      pendingRefs = nextRefs;
    }

    const loadChild = (childName: string): Taskflow | null => childMap.get(childName) ?? null;
    const flat = flattenFlowPhases(loaded.tf, loadChild, 1, MAX_FLOW_DEPTH);
    // Contract checks run at load: errors fail fast, warnings surface.
    const result = yield* runContractsPass(flat, loaded.filePath, graphName, projectContext);
    return {
      ...result.tf,
      resolvedFrom: loaded.resolvedFrom,
      resolvedPath: loaded.filePath,
      description: loaded.tf.description,
    };
  });
}
/**
 * Load a graph definition for a run — cache-aware.
 * First call for a run loads from disk; subsequent calls reuse cached.
 * Cache key = runId, so different runs don't collide even with same graphName.
 */
export function loadGraphForRun(
  runId: string,
  graphName: string,
  projectContext?: readonly string[],
): Effect.Effect<Taskflow, SchedulerError | RegistryLoadError, FileSystem | RegistryLoader> {
  return Effect.gen(function* () {
    const cached = graphLoadCache.get(runId);
    if (cached) return cached;

    const tf = yield* loadGraphWithRegistry(graphName, projectContext);
    graphLoadCache.set(runId, tf);
    return tf;
  });
}

/**
 * Adapt taskflow-core Taskflow to the FSM's TaskflowGraph shape.
 * Also runs each phase through its handler's validate() — after schema.parse().
 * Flow phases are already flattened at this point; type is main/approval.
 */
export function toTaskflowGraph(tf: Taskflow): Effect.Effect<TaskflowGraph, GraphDefinitionError> {
  return Effect.try({
    try: () => {
      const validatedPhases: Array<Taskflow['phases'][number]> = [];
      for (const p of tf.phases) {
        // Unknown phase type fails graph load — never a silent pass-through.
        // Error names the type + registered list (from UnknownPhaseTypeError message).
        validatedPhases.push(validatePhase(p));
      }
      return {
        name: tf.name ?? 'unnamed',
        description: tf.description,
        context: tf.context ?? [],
        phases: validatedPhases,
      };
    },
    catch: (err: unknown): GraphDefinitionError => ({
      _tag: 'GraphDefinitionError',
      graphName: tf.name ?? 'unnamed',
      message: err instanceof Error ? err.message : String(err),
    }),
  });
}
