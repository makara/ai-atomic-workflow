/**
 * Topology pure functions — route-aware readiness, join resolution, and
 * downstream tracing (JUMP reset scope). Kahn sorting and upstream tracing
 * were deleted as dead production exports (topoLayers/findUpstream — zero
 * production callers, graph-schema-w6-close).
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
