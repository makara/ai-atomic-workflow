/**
 * Graph definition loader — loads and validates .taskflow.yaml files.
 * Uses zod schemas (schemas/) for validation. Supports unknown
 * fields via .passthrough() for forward compatibility.
 * No interpolation engine — template-variable resolution not used in this project.
 *
 * Layer 1 capability module: uses Effect-TS FileSystem Tag for I/O seam
 * (imported from ./filesystem.js). Single-method interface — caller passes
 * graphName, gets verified Taskflow or structured GraphDefinitionError with
 * file path + violation details.
 *
 * @module
 */

import { Context, Effect, Layer } from 'effect';
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { FileSystem, FileSystemError } from './filesystem.js';
import { parseWithEffect, TaskflowSchema, type Taskflow } from './schemas/index.js';
import type { FlowPhaseError, GraphDefinitionError } from './types.js';
export type { Taskflow };

// Re-export FileSystem for callers that import it from graph-definition
export { FileSystem };

// ---------------------------------------------------------------------------
// Default FileSystem layer — Node.js fs
// ---------------------------------------------------------------------------

/**
 * Default FileSystem layer backed by Node.js `readFileSync`.
 * File path is used as-is; caller is responsible for directory resolution.
 */
export const defaultFileSystemLayer: Layer.Layer<FileSystem, never, never> = Layer.succeed(FileSystem, {
  readFile: (path: string) =>
    Effect.try({
      try: () => readFileSync(path, 'utf-8'),
      catch: (cause): FileSystemError =>
        new FileSystemError(path, `File not found or unreadable: ${String(cause)}`, cause),
    }),
});

// ---------------------------------------------------------------------------
// Internal: load and validate a file by path
// ---------------------------------------------------------------------------
/**
 * Core load-and-validate logic — shared by loadGraph and loadGraphFromPath.
 * Reads the file via FileSystem Tag, parses YAML, validates with zod
 * TaskflowSchema, and returns a typed Taskflow or GraphDefinitionError.
 */
function loadAndValidate(
  filePath: string,
  graphName: string,
): Effect.Effect<Taskflow, GraphDefinitionError | FileSystemError, FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const raw = yield* fs.readFile(filePath);

    let parsed: unknown;
    try {
      parsed = parseYaml(raw);
    } catch (e) {
      return yield* Effect.fail<GraphDefinitionError>({
        _tag: 'GraphDefinitionError',
        graphName,
        message: `Invalid YAML in ${filePath}: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
    const validated = yield* parseWithEffect(TaskflowSchema, parsed).pipe(
      Effect.mapError(
        (e) =>
          ({
            _tag: 'GraphDefinitionError',
            graphName,
            message: `Schema validation failed for ${graphName}`,
            violations: e.issues.map((i) => i.message),
          }) satisfies GraphDefinitionError,
      ),
    );

    return validated;
  });
}

// ---------------------------------------------------------------------------
// flattenFlowPhases — merge-at-load (ADR 0043)
// ---------------------------------------------------------------------------

/** Dynamic expression pattern — detects {…} template expressions in string values. */
const DYNAMIC_EXPR_RE = /^\{[^}]+\}$/;

/**
 * Recursively flatten flow phases in a graph at load time.
 *
 * Replaces `type: flow` phases with their child graph phases,
 * prefixing IDs with `<parentId>/` and rewriting dependsOn edges.
 * Pure function — zero I/O. `loadChild` callback resolves `use` references.
 *
 * Throws FlowPhaseError for: dynamic expressions, max depth exceeded,
 * name conflicts, missing child graph.
 */
export function flattenFlowPhases(
  graph: Taskflow,
  loadChild: (graphName: string) => Taskflow | null,
  depth: number,
  maxDepth: number,
): Taskflow {
  const newPhases: Taskflow['phases'] = [];

  for (const phase of graph.phases) {
    if (phase.type !== 'flow') {
      newPhases.push(phase);
      continue;
    }

    // Depth check
    if (depth >= maxDepth) {
      throw {
        _tag: 'FlowPhaseError',
        phaseId: phase.id,
        code: 'MAX_DEPTH_EXCEEDED',
        message: `Flow phase '${phase.id}': max depth ${maxDepth} exceeded at depth ${depth}`,
      } satisfies FlowPhaseError;
    }

    // Dynamic expression detection
    if (typeof phase.use === 'string' && DYNAMIC_EXPR_RE.test(phase.use)) {
      throw {
        _tag: 'FlowPhaseError',
        phaseId: phase.id,
        code: 'DYNAMIC_EXPRESSION',
        message: `Flow phase '${phase.id}': dynamic expression in use='${phase.use}' not supported in Phase 1`,
      } satisfies FlowPhaseError;
    }
    // Dynamic expression in def: only check if def is a string (template expression),
    // not an object (static inline definition)
    if (typeof phase.def === 'string' && DYNAMIC_EXPR_RE.test(phase.def)) {
      throw {
        _tag: 'FlowPhaseError',
        phaseId: phase.id,
        code: 'DYNAMIC_EXPRESSION',
        message: `Flow phase '${phase.id}': dynamic expression in def not supported in Phase 1`,
      } satisfies FlowPhaseError;
    }

    // Load child graph
    let childGraph: Taskflow;
    if (phase.use) {
      const child = loadChild(phase.use);
      if (!child) {
        throw {
          _tag: 'FlowPhaseError',
          phaseId: phase.id,
          code: 'GRAPH_NOT_FOUND',
          message: `Flow phase '${phase.id}': child graph '${phase.use}' not found in registry`,
        } satisfies FlowPhaseError;
      }
      childGraph = child;
    } else if (phase.def !== null && typeof phase.def === 'object' && 'phases' in phase.def) {
      const defRecord = phase.def as Record<string, unknown>;
      const phases = Array.isArray(defRecord.phases) ? (defRecord.phases as Taskflow['phases']) : [];
      const defName = typeof defRecord.name === 'string' ? defRecord.name : `${phase.id}-inline`;
      childGraph = {
        name: defName,
        phases: phases,
      };
    } else {
      throw {
        _tag: 'FlowPhaseError',
        phaseId: phase.id,
        code: 'GRAPH_NOT_FOUND',
        message: `Flow phase '${phase.id}': must have 'use' or 'def'`,
      } satisfies FlowPhaseError;
    }

    // Recursively flatten child graph
    const flatChild = flattenFlowPhases(childGraph, loadChild, depth + 1, maxDepth);

    // Collect ALL existing IDs (processed + remaining in parent) for conflict detection
    const allExistingIds = new Set<string>();
    for (const np of newPhases) allExistingIds.add(np.id);
    for (const rp of graph.phases) allExistingIds.add(rp.id);

    // Prefix child phase IDs
    const prefix = `${phase.id}/`;
    const prefixedPhases: Taskflow['phases'] = flatChild.phases.map((cp) => {
      const prefixedId = `${prefix}${cp.id}`;

      // Conflict detection — check against all IDs including unprocessed parent phases
      if (allExistingIds.has(prefixedId)) {
        throw {
          _tag: 'FlowPhaseError',
          phaseId: phase.id,
          code: 'NAME_CONFLICT',
          message: `Flow phase '${phase.id}': child node '${prefixedId}' conflicts with existing node`,
        } satisfies FlowPhaseError;
      }
      allExistingIds.add(prefixedId);

      // Rewrite dependsOn with prefix
      const rewiredDependsOn = cp.dependsOn ? cp.dependsOn.map((dep) => `${prefix}${dep}`) : cp.dependsOn;

      return { ...cp, id: prefixedId, dependsOn: rewiredDependsOn };
    });

    // Find child terminals: phases that no other child phase depends on
    const childPhaseIds = new Set(prefixedPhases.map((cp) => cp.id));
    const hasDownstream = new Set<string>();
    for (const cp of prefixedPhases) {
      for (const dep of cp.dependsOn ?? []) {
        hasDownstream.add(dep);
      }
    }
    const childTerminals = [...childPhaseIds].filter((id) => !hasDownstream.has(id));

    // Helper: rewire downstream dependsOn — replace flow phase ID with child terminals
    const rewireDownstream = (target: Taskflow['phases'][number]): void => {
      if (target.dependsOn?.includes(phase.id)) {
        target.dependsOn = [...target.dependsOn.filter((d) => d !== phase.id), ...childTerminals];
      }
    };
    newPhases.push(...prefixedPhases);

    // Rewire downstream: any phase (processed or not) depending on the flow phase
    // now depends on all child terminals
    for (const np of newPhases) rewireDownstream(np);
    // Also rewire unprocessed phases in-place (mutate original array)
    for (const rp of graph.phases) rewireDownstream(rp);
  }

  return { ...graph, phases: newPhases };
}

// ---------------------------------------------------------------------------
// loadGraph
// ---------------------------------------------------------------------------

/**
 * Load and validate a .taskflow.yaml file by graph name.
 *
 * Resolves `${graphName}.taskflow.yaml` in the current working directory
 * (taskflowDir resolution handled by caller via FileSystem layer).
 * On failure, returns GraphDefinitionError with the file path and violation
 * details.
 */
export function loadGraph(
  graphName: string,
): Effect.Effect<Taskflow, GraphDefinitionError | FileSystemError, FileSystem> {
  return loadAndValidate(`${graphName}.taskflow.yaml`, graphName);
}

// ---------------------------------------------------------------------------
// loadGraphFromPath
// ---------------------------------------------------------------------------

/**
 * Load and validate a .taskflow.yaml file at an explicit path.
 *
 * Used by registry-loader when graph names are resolved to explicit file
 * paths via registry.json entries. Avoids amplifying errors through
 * wrapping — returns the original GraphDefinitionError on failure.
 */
export function loadGraphFromPath(
  resolvedPath: string,
  graphName: string,
): Effect.Effect<Taskflow, GraphDefinitionError | FileSystemError, FileSystem> {
  return loadAndValidate(resolvedPath, graphName);
}
