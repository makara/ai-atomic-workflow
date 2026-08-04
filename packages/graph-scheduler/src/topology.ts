/**
 * Topology pure functions — Kahn sort, dependency resolution, route-aware
 * readiness, upstream/downstream tracing (JUMP + validation only).
 *
 * Route-first redesign: readiness is route-aware — a node
 * activates iff its route is active and every dependency is terminal or on an
 * inactive route. Zero closure inference — route membership is declared
 * (phase `route`, flow-as-route propagation); the backend only looks up.
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
 * Route activation map — routeId → activating node id. Presence = active;
 * absence = inactive. The implicit default route (phase with no route) is
 * always active and never stored.
 */
export type RouteMap = Readonly<Record<string, string>>;

/**
 * Effective route of a phase — its declared `route`, or the implicit default
 * route marker when absent (flow propagation materializes flow ids on
 * children at flatten time).
 */
export const DEFAULT_ROUTE = '__default__';

/** Route id of a phase — declared route or the implicit default. */
export function routeOf(phase: Phase): string {
  return phase.route ?? DEFAULT_ROUTE;
}

/** Is the phase's route active? Default route is always active. */
export function routeActive(phase: Phase, routes: RouteMap | undefined): boolean {
  const r = routeOf(phase);
  if (r === DEFAULT_ROUTE) return true;
  return routes !== undefined && r in routes;
}

/**
 * Return phases NOT yet terminal whose dependencies are all satisfied AND
 * whose route is active (route-first readiness — O(1) lookups, zero inference).
 *
 * - Route rule: a node activates only when its route is active (branch-route
 *   decisions activate routes; unselected routes stay dormant forever).
 * - Dependency rule: every dep must be terminal (no join — default all), or
 *   at least one dep done (join: any — used for track joins: the chosen
 *   route's terminal satisfies; unselected routes never complete and never
 *   block). No vacuous satisfaction — a dep on an unselected route means the
 *   graph author must sequence via the decision node or an any-join.
 *
 * @param phases     all phases in the graph
 * @param terminal   set of phase ids that have finished execution (done or aborted)
 * @param phaseMap   phase id → node state (distinguishes done vs aborted for OR-join)
 * @param routes     route activation map — routeId → activating node id
 */
export function resolveReady(
  phases: readonly Phase[],
  terminal: ReadonlySet<string>,
  phaseMap?: Readonly<Record<string, { status: string }>>,
  routes?: RouteMap,
): Phase[] {
  return phases.filter((p) => {
    if (terminal.has(p.id)) return false;
    // Route rule — unselected routes never activate (unchosen branch-route
    // nodes stay pending forever: never ready, never dispatched).
    if (!routeActive(p, routes)) return false;
    const deps = p.dependsOn;
    if (!deps || deps.length === 0) return true;
    if (p.join === 'any') {
      if (!phaseMap) return false;
      return deps.some((d) => phaseMap[d]?.status === 'done');
    }
    return deps.every((d) => terminal.has(d));
  });
}

/** Find all upstream phases reachable from fromPhaseId via dependsOn edges (BFS). */
export function findUpstream(fromPhaseId: string, phases: readonly Phase[]): string[] {
  const byIdLocal = new Map(phases.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const queue = [fromPhaseId];
  while (queue.length > 0) {
    const cur = queue.pop()!;
    const deps = byIdLocal.get(cur)?.dependsOn ?? [];
    for (const d of deps) {
      if (!seen.has(d)) {
        seen.add(d);
        queue.push(d);
      }
    }
  }
  return [...seen];
}

/** Find all downstream phases reachable from nodeId via reverse dependency edges (BFS). */
export function findDownstream(nodeId: string, phases: readonly Phase[]): string[] {
  const byIdLocal = new Map(phases.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const cur = queue.pop()!;
    for (const [pid, ph] of byIdLocal) {
      if ((ph.dependsOn ?? []).includes(cur) && !seen.has(pid)) {
        seen.add(pid);
        queue.push(pid);
      }
    }
  }
  return [...seen];
}
