/**
 * Flow phase flattening — merge-at-load composition engine.
 *
 * Replaces `type: flow` phases with their child graph phases at load time,
 * prefixing IDs and rewriting dependsOn/routing/eval/channels surfaces.
 * Extracted from graph-definition.ts so loader stays load+validate only.
 *
 * Pure module — zero I/O. All template resolution lives here.
 *
 * @module
 */

import type { Taskflow } from './schemas/index.js';
import { FlowPhaseError } from './types.js';

/** Dynamic expression pattern — detects {…} template expressions in string values. */
const DYNAMIC_EXPR_RE = /^\{[^}]+\}$/;

/** Recursion depth cap for flow composition (field removed — constant). */
export const MAX_FLOW_DEPTH = 5;

/**
 * Resolve `{args.key}` template expressions in a string against run invocation args.
 * Unmatched keys are kept as-is for debugging visibility.
 */
export const resolveArgs = (text: string | undefined, args: Record<string, unknown> | null): string | undefined => {
  if (!text || !args) return text;
  return text.replace(/\{args\.(\w+)\}/g, (_, key: string) => {
    const val = args[key];
    if (val === undefined) return `{args.${key}}`; // unmatched — keep original for debugging
    return String(val);
  });
};

/** Shallow-copy a phase so rewiring never mutates caller-owned objects. */
function clonePhase(phase: Taskflow['phases'][number]): Taskflow['phases'][number] {
  return {
    ...phase,
    dependsOn: phase.dependsOn ? [...phase.dependsOn] : undefined,
    routing: phase.routing ? { ...phase.routing, actions: phase.routing.actions?.map((a) => ({ ...a })) } : undefined,
    jumps: phase.jumps?.map((j) => ({ ...j })),
    channels: phase.channels ? [...phase.channels] : undefined,
  };
}

/**
 * Recursively flatten flow phases in a graph at load time — merge-at-load.
 *
 * Replaces `type: flow` phases with their child graph phases,
 * prefixing IDs with `<parentId>/` and rewriting dependsOn edges.
 * Pure function — zero I/O, never mutates the input graph.
 * `loadChild` callback resolves `use` references.
 *
 * Throws FlowPhaseError for: dynamic expressions, max depth exceeded,
 * name conflicts, missing child graph.
 */
export function flattenFlowPhases(
  graph: Taskflow,
  loadChild: (graphName: string) => Taskflow | null,
  depth: number,
  maxDepth: number = MAX_FLOW_DEPTH,
): Taskflow {
  // Copy the input phases up front — downstream rewiring below must never
  // mutate caller-owned phase objects (pure function contract).
  const phases = graph.phases.map(clonePhase);
  const newPhases: Taskflow['phases'] = [];

  for (const phase of phases) {
    if (phase.type !== 'flow') {
      newPhases.push(phase);
      continue;
    }

    // Depth check
    if (depth >= maxDepth) {
      throw new FlowPhaseError(
        phase.id,
        'MAX_DEPTH_EXCEEDED',
        `Flow phase '${phase.id}': max depth ${maxDepth} exceeded at depth ${depth}`,
      );
    }

    // Dynamic expression detection
    if (typeof phase.use === 'string' && DYNAMIC_EXPR_RE.test(phase.use)) {
      throw new FlowPhaseError(
        phase.id,
        'DYNAMIC_EXPRESSION',
        `Flow phase '${phase.id}': dynamic expression in use='${phase.use}' not supported in Phase 1`,
      );
    }

    // Load child graph — flow requires use (schema-enforced)
    const useName = phase.use;
    if (!useName) {
      throw new FlowPhaseError(phase.id, 'GRAPH_NOT_FOUND', `Flow phase '${phase.id}': must have 'use'`);
    }
    const child = loadChild(useName);
    if (!child) {
      throw new FlowPhaseError(
        phase.id,
        'GRAPH_NOT_FOUND',
        `Flow phase '${phase.id}': child graph '${useName}' not found in registry or taskflow dirs`,
      );
    }
    const childGraph: Taskflow = child;

    // Recursively flatten child graph
    const flatChild = flattenFlowPhases(childGraph, loadChild, depth + 1, maxDepth);

    // Collect ALL existing IDs (processed + remaining in parent) for conflict detection
    const allExistingIds = new Set<string>();
    for (const np of newPhases) allExistingIds.add(np.id);
    for (const rp of phases) allExistingIds.add(rp.id);
    // Parent-level IDs — a child `node:` channel targeting a parent node stays
    // unprefixed (cross-level reference); anything else is a child-sibling
    // target and must be prefixed to match the flattened graph's node IDs.
    const parentIds = new Set(phases.map((p) => p.id));

    // Prefix child phase IDs
    const prefix = `${phase.id}/`;
    const childIds = new Set(flatChild.phases.map((p) => p.id));
    const entryPhaseId = flatChild.phases.find((p) => !p.dependsOn || p.dependsOn.length === 0)?.id;
    const entryNodeId = `${prefix}${entryPhaseId ?? flatChild.phases[0]?.id ?? ''}`;
    const prefixedPhases: Taskflow['phases'] = flatChild.phases.map((cp) => {
      const prefixedId = `${prefix}${cp.id}`;

      // Conflict detection — check against all IDs including unprocessed parent phases
      if (allExistingIds.has(prefixedId)) {
        throw new FlowPhaseError(
          phase.id,
          'NAME_CONFLICT',
          `Flow phase '${phase.id}': child node '${prefixedId}' conflicts with existing node`,
        );
      }
      allExistingIds.add(prefixedId);

      // Rewrite dependsOn with prefix + inherit flow phase dependsOn for entry nodes
      // Entry nodes (empty dependsOn in child) get flow phase's dependsOn prepended.
      // This preserves DAG topology + enables Scoped Context for child phases.
      const isEntryInChild = !cp.dependsOn || cp.dependsOn.length === 0;
      const flowDependsOn = isEntryInChild ? (phase.dependsOn ?? []) : [];
      const childInternal = cp.dependsOn ? cp.dependsOn.map((dep) => `${prefix}${dep}`) : [];
      const rewiredDependsOn = [...flowDependsOn, ...childInternal];

      // Prefix routing targets to match expanded child IDs. Branch-route
      // continue targets naming a FLOW stay as route refs (route-first —
      // routes are first-class; the flow id IS the route id); retry/jump
      // targets remap flow → flattened entry (re-run the flow from start).
      // Child-internal node targets get the flow prefix; parent-level targets
      // (cross-level refs — e.g. loop-gate routing to loop-entry) stay
      // unprefixed. Gate jump targets prefix the same way.
      const childRef = (ref: string): string => (childIds.has(ref) ? `${prefix}${ref}` : ref);
      const prefixedJumps = cp.jumps?.map((j) => ({ ...j, to: childRef(j.to) }));
      const prefixedRouting = cp.routing
        ? {
            ...cp.routing,
            actions: cp.routing.actions?.map((a) => ({
              ...a,
              target:
                a.target === phase.id && a.action !== 'continue'
                  ? entryNodeId
                  : a.target
                    ? childRef(a.target)
                    : a.target,
            })),
          }
        : undefined;

      // Route propagation — a flow declared as a route (`route: <id>` on the
      // flow phase) propagates it to children; children without a route stay
      // on the implicit default route (plain composition flows always run).
      // Branch-route flows MUST declare `route:` — routes are explicit, never
      // inferred from composition.
      const childRoute = cp.route ?? phase.route;

      return {
        ...cp,
        id: prefixedId,
        route: childRoute,
        dependsOn: rewiredDependsOn,
        // when propagation removed (branch-routing redesign) — flow entry guards express
        // as preceding gate branches in the parent graph.
        // Prefix child channels: node: targets pointing at child-sibling nodes
        // get prefixed; parent-level targets stay unprefixed (cross-level ref).
        // Flow input interface — flow-phase channels are the flow's
        // input contract: propagate to ENTRY children only, merged with the
        // child's own channels (flow-first, dedup by string). Non-entry
        // children keep only their own channels. Never silently dropped.
        channels: (() => {
          const childChannels = (cp.channels ?? []).map((c) => {
            if (c.startsWith('node:')) {
              const target = c.slice('node:'.length);
              if (!parentIds.has(target)) return `node:${prefix}${target}`;
            }
            return c;
          });
          const flowChannels = phase.channels ?? [];
          if (isEntryInChild && flowChannels.length > 0) {
            return [...new Set([...flowChannels, ...childChannels])];
          }
          return childChannels.length > 0 ? childChannels : undefined;
        })(),
        routing: prefixedRouting,
        jumps: prefixedJumps,
      };
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

    // Remap parent routing/jump targets naming this flow phase:
    // - continue branch-route targets keep the flow id — it IS the route id
    //   (route-first: activating a route, not re-running a node)
    // - retry/jump targets remap to the flattened entry node — "re-run the
    //   flow from start" (JUMP resets target + downstream)
    const rewireTargets = (target: Taskflow['phases'][number]): void => {
      if (target.routing?.actions) {
        target.routing.actions = target.routing.actions.map((a) =>
          a.target === phase.id && a.action !== 'continue' ? { ...a, target: entryNodeId } : a,
        );
      }
      if (target.jumps) {
        target.jumps = target.jumps.map((j) => (j.to === phase.id ? { ...j, to: entryNodeId } : j));
      }
    };

    // Helper: rewire downstream dependsOn — replace flow phase ID with child terminals
    const rewireDownstream = (target: Taskflow['phases'][number]): void => {
      if (target.dependsOn?.includes(phase.id)) {
        target.dependsOn = [...target.dependsOn.filter((d) => d !== phase.id), ...childTerminals];
      }
    };
    newPhases.push(...prefixedPhases);

    // Rewire downstream: any phase (processed or not) depending on the flow phase
    // now depends on all child terminals. Rewiring touches only our own copies —
    // the caller's original phases are never mutated.
    for (const np of newPhases) rewireDownstream(np);
    for (const rp of phases) rewireDownstream(rp);

    // Rewire targets: same surface as dependsOn — parent routing/eval targets
    // referencing the flow phase remap to its flattened entry node
    for (const np of newPhases) rewireTargets(np);
    for (const rp of phases) rewireTargets(rp);
  }

  return { ...graph, phases: newPhases };
}
