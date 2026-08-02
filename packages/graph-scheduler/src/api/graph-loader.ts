/**
 * API Graph Loader — graph definition loading, caching, and adaptation.
 *
 * Extracted from crud.ts.
 * Loads graph definitions (registry-aware), caches per-run, and adapts
 * taskflow-core Taskflow to FSM TaskflowGraph.
 *
 * @module
 */

import { Effect } from 'effect';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateEntrySkillContracts, validateGraphContracts } from '../context/contracts.js';
import { debugLog } from '../debug.js';
import { FileSystem, FileSystemError } from '../filesystem.js';
import { flattenFlowPhases, MAX_FLOW_DEPTH } from '../flow-flatten.js';
import type { FsmNodeState } from '../fsm/effects.js';
import type { TaskflowGraph } from '../fsm/transition.js';
import type { Taskflow } from '../graph-definition.js';
import { loadGraph, loadGraphFromPath } from '../graph-definition.js';
import { validatePhase } from '../phase-handler/index.js';
import { RegistryLoader } from '../registry-loader.js';
import type { GraphDefinitionError, RegistryLoadError, SchedulerError } from '../types.js';
import { FlowPhaseError } from '../types.js';

import { graphLoadCache } from './run-caches.js';

/**
 * Contract warnings per graph — captured by the load-time pass, surfaced
 * via graph_start response. Same graph → same warnings.
 * Entries truncated: 20 max, 200 chars each.
 */
const contractWarningsByGraph = new Map<string, string[]>();
export function getContractWarnings(graphName: string): string[] {
  return contractWarningsByGraph.get(graphName) ?? [];
}
function recordContractWarnings(graphName: string, warnings: readonly string[]): void {
  contractWarningsByGraph.set(
    graphName,
    warnings.slice(0, 20).map((w) => (w.length > 200 ? `${w.slice(0, 200)}…` : w)),
  );
}

// graph-workflow skills package — sibling of graph-scheduler in the monorepo.
// Resolved relative to this source file (same convention as scheduler-runtime PKG_ROOT).
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SIBLING_SKILLS_DIR = path.resolve(PKG_ROOT, '..', 'graph-workflow', 'skills');

/**
 * Configured skillsDir (config.json `skillsDir`) — set by
 * createRuntime at startup. undefined = fall back to probing.
 */
let configuredSkillsDir: string | undefined;
export function setConfiguredSkillsDir(dir: string | undefined): void {
  configuredSkillsDir = dir;
}

/** Degradation warning emitted once per process — not once per load. */
let skillsDirWarned = false;

/**
 * Resolve the graph-workflow skills package directory (entry-skill contracts
 * for bidirectional channel validation). Priority: config `skillsDir` →
 * repo-root layout (matches the retired CLI validate convention) →
 * package-sibling. Missing → null (alignment skipped with a single warning —
 * never blocks loading).
 */
export function resolveSkillsDir(): string | null {
  const candidates = [
    ...(configuredSkillsDir ? [configuredSkillsDir] : []),
    path.resolve(process.cwd(), 'packages', 'graph-workflow', 'skills'),
    SIBLING_SKILLS_DIR,
  ];
  for (const dir of candidates) {
    try {
      if (existsSync(dir)) return dir;
    } catch {
      // unreadable — try next
    }
  }
  if (!skillsDirWarned) {
    skillsDirWarned = true;
    debugLog('load', {
      event: 'skills_dir_missing',
      candidates,
      message: 'graph-workflow skills package not found — entry-skill alignment skipped',
    });
  }
  return null;
}

/**
 * Load-time contract pass — runs on the flattened graph after
 * schema validation, before any dispatch. Contract violations fail the load
 * with GraphDefinitionError (fail-fast — never deferred to dispatch);
 * warnings are surfaced via debugLog and never block.
 *
 * Entry-skill alignment runs per-graph with checkOrphans: false — orphanhood
 * is a repo-wide property, not judgeable from a single graph load.
 */
function runContractsPass(
  tf: Taskflow,
  filePath: string,
  graphName: string,
): Effect.Effect<{ tf: Taskflow; warnings: string[] }, GraphDefinitionError, never> {
  return Effect.gen(function* () {
    const contracts = validateGraphContracts(tf as unknown as Record<string, unknown>, filePath);
    const errors = [...contracts.errors];
    const warnings = [...contracts.warnings];

    const skillsDir = resolveSkillsDir();
    if (skillsDir) {
      const alignment = yield* Effect.either(
        Effect.tryPromise(() =>
          validateEntrySkillContracts([{ filePath, graph: tf as unknown as Record<string, unknown> }], skillsDir, {
            checkOrphans: false,
          }),
        ),
      );
      if (alignment._tag === 'Right') {
        errors.push(...alignment.right.errors);
        warnings.push(...alignment.right.warnings);
      } else {
        // Unexpected alignment failure (e.g. interrupted skills scan) — warn, never block.
        warnings.push(`${filePath}: entry-skill alignment aborted — ${String(alignment.left)}`);
      }
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
      return { tf: yield* loadGraphFromPath(resolvedPath.right, name), filePath: resolvedPath.right };
    }
    return { tf: yield* loadGraph(name), filePath: `${name}.taskflow.yaml` };
  });
}

/** True when a FileSystemError wraps an ENOENT — missing file, not a real I/O fault. */
function isFileNotFound(err: unknown): boolean {
  if (!(err instanceof FileSystemError)) return false;
  const cause = err.cause;
  if (cause instanceof Error && (cause as NodeJS.ErrnoException).code === 'ENOENT') return true;
  return err.message.includes('ENOENT');
}

export function loadGraphWithRegistry(
  graphName: string,
): Effect.Effect<Taskflow, SchedulerError | RegistryLoadError, FileSystem | RegistryLoader> {
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
    const result = yield* runContractsPass(flat, loaded.filePath, graphName);
    recordContractWarnings(graphName, result.warnings);
    return result.tf;
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
): Effect.Effect<Taskflow, SchedulerError | RegistryLoadError, FileSystem | RegistryLoader> {
  return Effect.gen(function* () {
    const cached = graphLoadCache.get(runId);
    if (cached) return cached;

    const tf = yield* loadGraphWithRegistry(graphName);
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
      return { name: tf.name ?? 'unnamed', phases: validatedPhases };
    },
    catch: (err: unknown): GraphDefinitionError => ({
      _tag: 'GraphDefinitionError',
      graphName: tf.name ?? 'unnamed',
      message: err instanceof Error ? err.message : String(err),
    }),
  });
}
