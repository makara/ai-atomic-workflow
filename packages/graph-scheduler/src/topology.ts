/**
 * Topology pure functions — Kahn sort, dependency resolution, upstream tracing.
 *
 * ## Design Decision: Custom `topoLayers` implementation
 *
 * We use a custom topological sort implementation for three reasons:
 *
 * 1. **Phase type-aligned** — Our `Phase` type carries `agent`, `task`, `retry`
 *    fields used by graph-scheduling algorithms.
 *
 * 2. **Simpler** — Kahn's algorithm with adjacency + indegree is ~60 lines.
 *    No adapter layer, no external dependency just for a topological sort.
 *
 * 3. **No adapter needed** — `resolveReady()` and `findUpstream()` operate
 *    directly on `Phase[]`, which is the canonical domain type for scheduling.
 *
 * @module
 */

import type { Phase } from './types.js';

/**
 * Build adjacency map: key = phase id, value = ids of phases that depend on key.
 * Edge direction: if B depends on A, then A → B (A must run before B).
 */
function buildDependents(phases: readonly Phase[]): Map<string, string[]> {
  const deps = new Map<string, string[]>();
  for (const p of phases) {
    const upstream = p.dependsOn;
    if (!upstream) continue;
    for (const u of upstream) {
      const list = deps.get(u);
      if (list) {
        list.push(p.id);
      } else {
        deps.set(u, [p.id]);
      }
    }
  }
  return deps;
}

/**
 * Build indegree map: key = phase id, value = count of unfulfilled upstream dependencies.
 */
function buildIndegree(phases: readonly Phase[]): Map<string, number> {
  const indeg = new Map<string, number>();
  for (const p of phases) {
    const upstream = p.dependsOn;
    indeg.set(p.id, upstream ? upstream.length : 0);
  }
  return indeg;
}

/**
 * Topologically sort phases into layers using Kahn's algorithm.
 * Phases in the same layer have no mutual dependencies — they can run concurrently.
 *
 * @throws {Error} if a cycle is detected (processed < total phases).
 */
export function topoLayers(phases: readonly Phase[]): Phase[][] {
  if (phases.length === 0) return [];

  const byId = new Map(phases.map((p) => [p.id, p]));
  const indeg = buildIndegree(phases);
  const dependents = buildDependents(phases);

  // initial frontier — nodes with indegree 0
  const queue: string[] = [];
  for (const [id, deg] of indeg) {
    if (deg === 0) queue.push(id);
  }

  const layers: Phase[][] = [];
  let processed = 0;

  while (queue.length > 0) {
    // snapshot current frontier as one layer
    const layerIds = [...queue];
    queue.length = 0;

    const layer: Phase[] = [];
    for (const id of layerIds) {
      const p = byId.get(id);
      if (p) layer.push(p);
      processed++;

      // reduce indegree of dependents
      const children = dependents.get(id) ?? [];
      for (const child of children) {
        const newDeg = (indeg.get(child) ?? 1) - 1;
        indeg.set(child, newDeg);
        if (newDeg === 0) queue.push(child);
      }
    }
    layers.push(layer);
  }

  if (processed !== phases.length) {
    const remainingIds = phases.filter((p) => (indeg.get(p.id) ?? 0) > 0).map((p) => p.id);

    // Check for missing dependencies — references to non-existent phases
    const missingRefs = new Set<string>();
    for (const id of remainingIds) {
      const p = byId.get(id)!;
      const upstream = p.dependsOn ?? [];
      for (const u of upstream) {
        if (!byId.has(u)) missingRefs.add(u);
      }
    }

    if (missingRefs.size > 0) {
      throw new Error(
        `Missing dependency in phase graph — referenced non-existent phase(s): ${[...missingRefs].sort().join(', ')}`,
      );
    }

    throw new Error(
      `Cycle detected in phase graph — ${remainingIds.length} node(s) unreachable: ${remainingIds.sort().join(', ')}`,
    );
  }

  return layers;
}

/**
 * Return phases NOT yet in `completed` whose dependencies are all satisfied.
 *
 * Resolution strategy controlled by phase.join field:
 * - `all` (default): every dependsOn must be terminal (done or skipped).
 * - `any`: at least one dependsOn must be done (not just skipped).
 *
 * @param phases     all phases in the graph
 * @param terminal   set of phase ids that have finished execution (done or skipped)
 * @param phaseMap   phase id → node state for distinguishing done vs skipped (needed for OR-join)
 */
export function resolveReady(
  phases: readonly Phase[],
  terminal: ReadonlySet<string>,
  phaseMap?: Readonly<Record<string, { status: string }>>,
): Phase[] {
  return phases.filter((p) => {
    // skip already-completed phases
    if (terminal.has(p.id)) return false;
    const deps = p.dependsOn;
    if (!deps || deps.length === 0) return true;
    const join = p.join ?? 'all';
    if (join === 'any') {
      // At least one dep must be DONE (not just skipped).
      // phaseMap is required for correct OR-join resolution — initPhases passes empty terminal.
      if (!phaseMap) return false;
      return deps.some((d) => phaseMap[d]?.status === 'done');
    }
    return deps.every((d) => terminal.has(d));
  });
}

/**
 * Find all upstream phases reachable from fromPhaseId via dependsOn edges (BFS).
 * Returns the transitive closure of phases that fromPhaseId depends on,
 * EXCLUDING fromPhaseId itself.
 *
 * @param fromPhaseId  the phase whose upstream closure is needed
 * @param phases  all phases in the graph
 * @returns sorted array of upstream phase ids
 */
export function findUpstream(fromPhaseId: string, phases: readonly Phase[]): string[] {
  const byId = new Map(phases.map((p) => [p.id, p]));
  const visited = new Set<string>();
  const queue: string[] = [fromPhaseId];
  visited.add(fromPhaseId);

  // Build reverse adjacency: phase → its dependsOn
  const depsOf = new Map(phases.map((p) => [p.id, p.dependsOn ?? []]));

  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    const upstream = depsOf.get(current) ?? [];
    for (const u of upstream) {
      if (!visited.has(u)) {
        visited.add(u);
        queue.push(u);
      }
    }
  }

  // remove fromPhaseId itself, sort for determinism
  visited.delete(fromPhaseId);
  return [...visited].sort();
}

/**
 * Find all downstream phases reachable from nodeId via reverse dependency edges (BFS).
 *
 * "Downstream" = phases that depend on nodeId (nodeId → downstream).
 * Returns the transitive closure, excluding nodeId itself.
 *
 * @param nodeId    starting phase id
 * @param phases    all phases in the graph
 * @returns sorted array of downstream phase ids
 */
export function findDownstream(nodeId: string, phases: readonly Phase[]): string[] {
  // Build reverse adjacency: phase → phases that depend on it
  const dependents = new Map<string, Set<string>>();
  for (const p of phases) {
    const deps = p.dependsOn ?? [];
    for (const dep of deps) {
      let set = dependents.get(dep);
      if (!set) {
        set = new Set();
        dependents.set(dep, set);
      }
      set.add(p.id);
    }
  }

  // BFS from nodeId through dependents
  const visited = new Set<string>();
  const queue = [nodeId];
  visited.add(nodeId);

  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    const deps = dependents.get(current);
    if (deps) {
      for (const d of deps) {
        if (!visited.has(d)) {
          visited.add(d);
          queue.push(d);
        }
      }
    }
  }

  // Exclude the starting node itself
  visited.delete(nodeId);
  return [...visited].sort();
}
