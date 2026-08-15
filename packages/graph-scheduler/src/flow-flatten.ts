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

import type { Workflow } from './schemas/index.js';
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
function clonePhase(phase: Workflow['phases'][number]): Workflow['phases'][number] {
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
  graph: Workflow,
  loadChild: (graphName: string) => Workflow | null,
  depth: number,
  maxDepth: number = MAX_FLOW_DEPTH,
): Workflow {
  // Copy the input phases up front — downstream rewiring below must never
  // mutate caller-owned phase objects (pure function contract).
  const phases = graph.phases.map(clonePhase);
  const newPhases: Workflow['phases'] = [];

  // Subgraph constraint accumulation — composed graphs carry the union of
  // the root's top-level constraints and every composed subgraph's
  // constraints (composition order; symmetric with the inventory use-chain
  // union). Recursive flattening makes this transitive by construction:
  // each level appends its children's already-composed sets.
  const composedConstraints: string[] = [];

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
        `Flow phase '${phase.id}': child graph '${useName}' not found in registry or workflow dirs`,
      );
    }
    const childGraph: Workflow = child;

    // Recursively flatten child graph
    const flatChild = flattenFlowPhases(childGraph, loadChild, depth + 1, maxDepth);

    // Union the child's top-level constraints into the composed set —
    // flatChild.constraints already includes the child's own subgraph union
    // (transitive propagation).
    composedConstraints.push(...(flatChild.constraints ?? []));

    // Collect ALL existing IDs (processed + remaining in parent) for conflict detection
    const allExistingIds = new Set<string>();
    for (const np of newPhases) allExistingIds.add(np.id);
    for (const rp of phases) allExistingIds.add(rp.id);

    // Prefix child phase IDs (all children get the flow prefix — no reserved
    // ids exist; '$' ids are rejected at schema level).
    const prefix = `${phase.id}/`;
    const childIds = new Set(flatChild.phases.map((p) => p.id));
    const entryPhaseId = flatChild.phases.find((p) => !p.dependsOn || p.dependsOn.length === 0)?.id;
    const entryNodeId = `${prefix}${entryPhaseId ?? flatChild.phases[0]?.id ?? ''}`;
    const prefixedPhases: Workflow['phases'] = flatChild.phases.map((cp) => {
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
      // This preserves acyclic dependency edges + enables Scoped Context for child phases.
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
        // Channels — two sources (two-scope context model), merged dedup:
        // 1. child graph-level context (top-level `context:` of the child
        //    graph — its ambient layer; applies to ALL child phases;
        //    node: targets rewritten like phase entries: child-sibling →
        //    prefixed, parent-level stays unprefixed). Entry rules enforced
        //    here (composition bypasses the child's standalone contract
        //    pass): explicit skill:/node: prefix or glob shape — bare name
        //    fails load (graph-level bare name SHALL be a load error).
        // 2. the child phase's own channels
        // node: targets follow the childRef rule (same as jump targets):
        // prefix ONLY targets inside the child's own flattened set; parent-
        // level and cross-flow flattened refs (e.g. spec-extract reading
        // adopt/spec-propose) stay unprefixed — the composed graph's run
        // scope resolves them.
        channels: (() => {
          const childGraphContext = (flatChild.context ?? []).map((c) => {
            if (c.startsWith('skill:') || c.startsWith('node:')) {
              if (c.startsWith('node:')) {
                const target = c.slice('node:'.length);
                if (childIds.has(target)) return `node:${prefix}${target}`;
              }
              return c;
            }
            if (c.includes('/') || c.includes('*') || c.includes('?') || c.includes('[')) return c;
            throw new FlowPhaseError(
              phase.id,
              'BARE_GRAPH_CHANNEL',
              `child graph '${useName}' top-level context entry "${c}" is a bare name — graph-level entries require an explicit skill:/node: prefix or a file glob`,
            );
          });
          const childChannels = (cp.channels ?? []).map((c) => {
            if (c.startsWith('node:')) {
              const target = c.slice('node:'.length);
              if (childIds.has(target)) return `node:${prefix}${target}`;
            }
            return c;
          });
          const merged = [...new Set([...childGraphContext, ...childChannels])];
          return merged.length > 0 ? merged : undefined;
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
    const rewireTargets = (target: Workflow['phases'][number]): void => {
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
    const rewireDownstream = (target: Workflow['phases'][number]): void => {
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

  // Union semantics: dedupe identical entries preserving order — a subgraph
  // composed more than once contributes its rules exactly once (true set
  // union, matching the spec wording and keeping the merged block clean).
  return {
    ...graph,
    constraints: [...new Set([...(graph.constraints ?? []), ...composedConstraints])],
    phases: newPhases,
  };
}
