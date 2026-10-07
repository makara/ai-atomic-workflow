/**
 * The step function — one super-step over a compiled graph.
 *
 * A step runs the nodes that are active, applies the writes their settlements
 * fan out, and routes to the next active set. Every node body is a stub, so a
 * step executes no project code: it reads declarations, folds writes through the
 * channel layer, and consumes a recorded key to route. The same graph, state,
 * and event always land on the same result.
 *
 * @module
 */

import type { ChannelState, ChannelWrite } from '../contract/channels.js';
import { applyWrites, initialState } from '../fold/channels.js';
import { defineOwn, ownValue } from '../fold/reducers.js';
import { END, START, type CompiledGraph, type EdgeSpec, type Json } from '../ir.js';
import { Suspended } from './interrupt.js';
import { runNode, type Settlement } from './node.js';
import { nodeSpecOf } from './spec.js';

/** The runtime's own progress: the folded state, the nodes active in this step, their settlements, and the per-node settlement counts the task identities count on. */
export interface RunState {
  readonly channels: ChannelState;
  readonly active: readonly string[];
  readonly settlements: Readonly<Record<string, Settlement>>;
  /** How many times each node has settled in this run — the occurrence ordinal its next task id carries. */
  readonly visits: Readonly<Record<string, number>>;
}

/** What the host delivers to a step: an advance, carrying at most one settlement. */
export interface RunEvent {
  readonly kind: 'advance';
  readonly settlement?: Settlement;
}

/** What a step answers. */
export type RunResult =
  | { readonly kind: 'interrupt'; readonly node: string; readonly payload: Json }
  | { readonly kind: 'advance'; readonly state: RunState }
  | { readonly kind: 'end'; readonly state: RunState };

/** The closed set of faults a step raises. */
export type RuntimeFaultCode = 'no-start' | 'no-route' | 'out-of-step' | 'stub-invariant' | 'unknown-node';

/** A fault raised where the graph or the event cannot be stepped. */
export class RuntimeError extends Error {
  readonly code: RuntimeFaultCode;

  constructor(code: RuntimeFaultCode, message: string) {
    super(message);
    this.name = 'RuntimeError';
    this.code = code;
  }
}

/** The edges leaving one node. */
function outgoing(graph: CompiledGraph, node: string): readonly EdgeSpec[] {
  return graph.edges.filter((edge) => edge.from === node);
}

/**
 * The fixed targets of the entry sentinel's edges. A router edge cannot leave
 * the entry sentinel: no key has been recorded when the first step runs.
 */
function entryTargets(graph: CompiledGraph): readonly string[] {
  const targets: string[] = [];
  for (const edge of outgoing(graph, START)) {
    if (edge.kind !== 'static') {
      throw new RuntimeError('no-start', 'a router edge leaves the entry sentinel, which carries no key to route on');
    }
    if (edge.to !== END) targets.push(edge.to);
  }
  return [...new Set(targets)];
}

/**
 * The state a run starts from: the entry sentinel's targets are active. A graph
 * whose entry sentinel leads nowhere can never run, so it is refused here rather
 * than stepped into an immediate end.
 */
export function start(graph: CompiledGraph): RunState {
  const active = entryTargets(graph);
  if (active.length === 0) throw new RuntimeError('no-start', 'no edge leaves the entry sentinel');
  return { channels: initialState(graph.channels), active, settlements: {}, visits: {} };
}

/**
 * Rebuild the frontier a folded channel state stands on: a state whose last step
 * recorded no settlement starts at the entry sentinel, and otherwise the recorded
 * keys route the next active set. The settlements contribute their keys alone —
 * their writes were folded into the state already — so a replay never re-applies a
 * write, and the same state always rebuilds the same frontier. The occurrence
 * counts are the caller's to carry: a rebuilt run keeps the identities it minted.
 */
export function resume(
  graph: CompiledGraph,
  channels: ChannelState,
  settled: Readonly<Record<string, Settlement>>,
  visits: Readonly<Record<string, number>> = {},
  over: readonly string[] = [],
): RunState {
  const nodes = Object.keys(settled);
  if (nodes.length === 0) {
    // A graph whose start sentinel leaves no static edge has no entry at all: the live run refuses
    // it at `start`, and a cold replay refuses it here rather than answering an ended chain.
    if (over.length === 0 && entryTargets(graph).length === 0) {
      throw new RuntimeError('no-start', `graph '${graph.id}' declares no entry the start sentinel leaves`);
    }
    return { channels, active: over.length === 0 ? entryTargets(graph) : [...over], settlements: {}, visits };
  }
  // The routing walks the frontier, not the settlement record: `over` carries the order the step
  // stepped in, so a cold replay reads the same order the live run did — `Object.keys` would read
  // the report order instead, which the host chooses.
  const carried = over.filter((node) => Object.hasOwn(settled, node));
  // The block routes its out-edges once, over the nodes it carries: a node already settled
  // never re-enters the active set on its own account, so a terminal node that carries an
  // in-edge drains instead of being re-issued (the cursor-loop defect).
  const routed = route(graph, carried.length === 0 ? nodes : carried, settled);
  // A block that settled only part of the set it stepped over is a suspended super-step: the
  // nodes it left unsettled stay outstanding beside the routed successors, exactly as the
  // live step left them (a cold replay stands on the same frontier).
  const outstanding = over.filter((node) => !Object.hasOwn(settled, node));
  return { channels, active: [...new Set([...outstanding, ...routed])], settlements: {}, visits };
}

/** Route the settled nodes to the next active set, consuming each recorded key. */
/** The successor one edge routes to from one node: a static edge names its target, a router
 *  edge reads the settlement's key off its own map — and a router whose map carries no entry
 *  for the recorded key refuses the route rather than landing nowhere. */
function routedTarget(
  edge: EdgeSpec,
  node: string,
  settlements: Readonly<Record<string, Settlement>>,
): string | undefined {
  if (edge.kind === 'static') return edge.to;
  const key = ownValue(settlements, node)?.key;
  const map = edge.map;
  const target = key === undefined || map === undefined ? undefined : ownValue(map, key);
  if (target === undefined) {
    throw new RuntimeError('no-route', `node '${node}' recorded '${key ?? ''}' and its router carries no such entry`);
  }
  return target;
}

function route(
  graph: CompiledGraph,
  active: readonly string[],
  settlements: Readonly<Record<string, Settlement>>,
): readonly string[] {
  const next: string[] = [];
  for (const node of active) {
    for (const edge of outgoing(graph, node)) {
      const target = routedTarget(edge, node, settlements);
      if (target !== undefined && target !== END) next.push(target);
    }
  }
  return [...new Set(next)];
}

/** Record the event's settlement for this step, refusing one for a node that is not active. */
function record(state: RunState, event: RunEvent): Readonly<Record<string, Settlement>> {
  const settlement = event.settlement;
  if (settlement === undefined) return state.settlements;
  if (!state.active.includes(settlement.node)) {
    throw new RuntimeError('out-of-step', `node '${settlement.node}' is not active in this step`);
  }
  return { ...state.settlements, [settlement.node]: settlement };
}

/**
 * One step. A node without a settlement suspends the step and its payload goes
 * to the host; once every active node is settled the step applies the fan-out
 * writes and routes. Re-entry over a recorded settlement never suspends again.
 */
export function run(graph: CompiledGraph, state: RunState, event: RunEvent): RunResult {
  const settlements = record(state, event);
  const writes: ChannelWrite[] = [];
  for (const node of state.active) {
    const spec = nodeSpecOf(graph, node);
    const settlement = ownValue(settlements, node);
    if (settlement === undefined) {
      try {
        runNode(node, spec, undefined);
      } catch (signal) {
        if (signal instanceof Suspended) return { kind: 'interrupt', node: signal.node, payload: signal.payload };
        throw signal;
      }
      // the stub suspends on every call without a settlement: reaching here would mean it stopped doing so
      throw new RuntimeError('stub-invariant', `node '${node}' carries no settlement and did not suspend`);
    }
    if (settlement.node !== node) {
      throw new RuntimeError('stub-invariant', `node '${node}' carries a settlement for '${settlement.node}'`);
    }
    writes.push(runNode(node, spec, settlement));
  }

  let channels = state.channels;
  for (const map of writes) channels = applyWrites(graph.channels, channels, map);
  const active = route(graph, state.active, settlements);
  // One settlement is one occurrence: the count is the identity the next activation of
  // this node mints from, so a revisited node never reuses an earlier task id.
  const visits: Record<string, number> = { ...state.visits };
  for (const node of state.active) defineOwn(visits, node, (ownValue(visits, node) ?? 0) + 1);
  const stepped: RunState = { channels, active, settlements: {}, visits };
  return active.length === 0 ? { kind: 'end', state: stepped } : { kind: 'advance', state: stepped };
}
