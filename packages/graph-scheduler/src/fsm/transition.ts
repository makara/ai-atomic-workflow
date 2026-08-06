/**
 * FSM transition — pure function: state × event × graph → next state + effects.
 *
 * Layer 1 — highest-depth module in the FSM core. Four event paths, each with
 * independent state transition logic. Zero Effect dependency, zero I/O.
 *
 * Judgment model (route-first redesign): all judgment lives
 * agent-side; the FSM only executes decisions mechanically. Gate jump
 * decisions arrive via COMPLETE.branchTo — a backward rework (target +
 * downstream reset, upstream kept). Approval branch-route decisions arrive
 * via COMPLETE.branchTo too — route activation (node or route id). Approval
 * `end` arrives via COMPLETE.endRun — immediate run completion. No end node
 * exists; no skip state exists; unselected routes never activate, and run
 * completion is natural drain (no active and no eligible) or an end action.
 *
 * Dependencies:
 * - Layer 1: fsm/events (FsmEvent), fsm/effects (FsmEffect)
 * - Layer 3: topology (resolveReady, findDownstream)
 *
 * @module
 */

import { randomUUID } from 'node:crypto';
import type { Phase } from '../schemas/index.js';
import { findDownstream, resolveReady, routeActive, routeOf, type RouteMap } from '../topology.js';
import type { FsmEffect, FsmNodeState } from './effects.js';
import type { FsmEvent } from './events.js';

/** Graph definition — name + phases + activation prologue, enough for topology and state init. */
export interface TaskflowGraph {
  readonly name: string;
  /**
   * Purpose-focused free text describing what the graph does/produces —
   * identity metadata surfaced in graph_start responses. Optional.
   */
  readonly description?: string;
  /**
   * Graph-level ambient context — top-level `context` of the taskflow
   * definition (the global channel). Merged once with the config default
   * layer at dispatch (config first, dedup) and prepended to every phase's
   * effective channels. Absent → empty graph scope.
   */
  readonly context?: readonly string[];
  readonly phases: readonly Phase[];
  /**
   * Activation prologue — graph-external built-in nodes (reserved `$` ids,
   * synthesized at load, author-overridable). NOT part of the author DAG:
   * excluded from topology/jump-closure; the FSM gates author activation
   * behind them and re-runs them on entry-target resets (round restart).
   */
  readonly prologue: readonly Phase[];
}

/**
 * FSM run-level status.
 *
 * State machine legal-event matrix (see fsm/state-machine):
 *   idle       → START
 *   running    → COMPLETE, JUMP, FORCE_END
 *   completed  → (terminal)
 *   terminated → (terminal)
 */
export type FsmStatus = 'idle' | 'running' | 'completed' | 'terminated';

/**
 * FSM state — discriminated union on status.
 *
 * - idle: no run exists (initial state)
 * - running: run active, at least one node active or pending
 * - completed: natural drain (no active, no eligible) or approval end action
 * - terminated: run force-ended (terminal)
 */
export type FsmState =
  | { readonly status: 'idle' }
  | {
      readonly status: 'running';
      readonly runId: string;
      readonly graphName: string;
      readonly phases: Record<string, FsmNodeState>;
      /** route activation map — routeId → activating node id (route-first); absent = inactive */
      readonly routes: RouteMap;
      readonly startedAt: string;
    }
  | {
      readonly status: 'completed';
      readonly runId: string;
      readonly graphName: string;
      readonly phases: Record<string, FsmNodeState>;
      readonly routes: RouteMap;
      readonly startedAt: string;
    }
  | {
      readonly status: 'terminated';
      readonly runId: string;
      readonly graphName: string;
      readonly phases: Record<string, FsmNodeState>;
      readonly routes: RouteMap;
      readonly startedAt: string;
    };

/**
 * Transition result — next state + side-effect declarations.
 * The api/ layer is responsible for executing effects[] in order.
 */
export interface TransitionResult {
  readonly nextState: FsmState;
  readonly effects: readonly FsmEffect[];
}

/**
 * Build initial node states — all pending, first dispatch batch set to active.
 * Prologue nodes occupy the first positions (first dispatch order) and are
 * the only active nodes at START — author nodes wait for the round prefix
 * (prologue gating). Without a prologue the first author-ready batch activates.
 */
function initPhases(graph: TaskflowGraph, startedAt: string): Record<string, FsmNodeState> {
  const map: Record<string, FsmNodeState> = {};
  for (const p of graph.prologue) {
    map[p.id] = { status: 'pending', retryCount: 0 };
  }
  for (const p of graph.phases) {
    map[p.id] = { status: 'pending', retryCount: 0 };
  }
  if (graph.prologue.length > 0) {
    for (const p of graph.prologue) {
      map[p.id] = { ...map[p.id], status: 'active', startedAt };
    }
  } else {
    const ready = resolveReady(graph.phases, new Set(), map, {});
    for (const p of ready) {
      map[p.id] = { ...map[p.id], status: 'active', startedAt };
    }
  }
  return map;
}

/** Deep-clone the phases map so transition never mutates input state. */
function clonePhases(phases: Record<string, FsmNodeState>): Record<string, FsmNodeState> {
  const clone: Record<string, FsmNodeState> = {};
  for (const [id, ns] of Object.entries(phases)) {
    clone[id] = { ...ns };
  }
  return clone;
}

function terminalIds(phases: Record<string, FsmNodeState>): Set<string> {
  return new Set(
    Object.entries(phases)
      .filter(([, ns]) => ns.status === 'done' || ns.status === 'aborted')
      .map(([id]) => id),
  );
}

/**
 * Activate all currently-ready phases (mutates phases, pushes effects).
 * Route-aware — resolveReady consults the route activation map.
 * Prologue gating — while any prologue node is pending, ONLY prologue nodes
 * are eligible; author nodes wait for the round prefix to finish.
 */
function activateReady(
  phases: Record<string, FsmNodeState>,
  graph: TaskflowGraph,
  now: string,
  effects: FsmEffect[],
  runId: string,
  routes: RouteMap,
): void {
  // Prologue gating — while any prologue node is NOT terminal (pending or
  // active), ONLY prologue nodes are eligible; author nodes wait for the
  // round prefix to finish. Pending check alone would leak: at START all P
  // nodes activate together, so a still-running sibling is never "pending".
  // A MISSING state (legacy run created before the prologue existed) never
  // gates — the run continues with handler-side degradation, no deadlock.
  const prologueGated = graph.prologue.some((p) => {
    const s = phases[p.id]?.status;
    return s !== undefined && s !== 'done' && s !== 'aborted';
  });
  if (prologueGated) {
    for (const p of graph.prologue) {
      if (phases[p.id]?.status !== 'pending') continue;
      phases[p.id] = {
        ...phases[p.id],
        status: 'active',
        startedAt: now,
      };
      effects.push({
        type: 'persist_node_state',
        runId,
        nodeId: p.id,
        state: phases[p.id],
      });
    }
    return;
  }

  const doneSet = terminalIds(phases);
  const ready = resolveReady(graph.phases, doneSet, phases, routes);
  for (const p of ready) {
    // Pending guard — a node already activated (branch target, JUMP reset
    // re-activation) must not be re-activated with a duplicate effect.
    if (phases[p.id]?.status !== 'pending') continue;
    phases[p.id] = {
      ...phases[p.id],
      status: 'active',
      startedAt: now,
    };
    effects.push({
      type: 'persist_node_state',
      runId,
      nodeId: p.id,
      state: phases[p.id],
    });
  }
}

/**
 * Natural-drain completion check — no active node AND no eligible pending
 * node (route-active with satisfied deps). Unselected-route members stay
 * pending forever and never block completion.
 */
function isDrained(phases: Record<string, FsmNodeState>, graph: TaskflowGraph, routes: RouteMap): boolean {
  for (const ns of Object.values(phases)) {
    if (ns.status === 'active') return false;
  }
  const doneSet = terminalIds(phases);
  return resolveReady(graph.phases, doneSet, phases, routes).length === 0;
}

/**
 * JUMP reset — target + downstream terminal nodes back to pending,
 * retryCount incremented (never zeroed — bounds reference the counter),
 * upstream KEPT (inputs already produced stay), route activations made by
 * nodes inside the reset closure cleared (they re-run and re-decide), then
 * re-activate ready nodes. Shared by the JUMP event and gate jump decisions
 * (route-first redesign).
 */
function applyJumpReset(
  phases: Record<string, FsmNodeState>,
  graph: TaskflowGraph,
  targetPhaseId: string,
  now: string,
  effects: FsmEffect[],
  runId: string,
  routes: RouteMap,
): RouteMap {
  const resetSet = new Set<string>([targetPhaseId]);
  for (const id of findDownstream(targetPhaseId, graph.phases)) {
    const ns = phases[id];
    if (ns && (ns.status === 'done' || ns.status === 'active' || ns.status === 'aborted')) {
      resetSet.add(id);
    }
  }

  for (const id of resetSet) {
    const ns = phases[id];
    if (ns) {
      phases[id] = { status: 'pending', retryCount: ns.retryCount + 1 };
      effects.push({
        type: 'persist_node_state',
        runId,
        nodeId: id,
        state: phases[id],
      });
    }
  }

  // Clear route activations made by reset nodes — they re-run and re-decide.
  const nextRoutes: Record<string, string> = {};
  for (const [routeId, activator] of Object.entries(routes)) {
    if (!resetSet.has(activator)) nextRoutes[routeId] = activator;
  }

  // Round restart — a reset whose target is an entry node (author DAG,
  // in-degree 0) re-runs the activation prologue: the round prefix refreshes
  // (constraints reload, run mode re-confirmed). Mid-graph rework resets do
  // NOT touch P — the current round's prefix stays valid.
  const targetPhase = graph.phases.find((p) => p.id === targetPhaseId);
  if (targetPhase && (targetPhase.dependsOn?.length ?? 0) === 0) {
    for (const p of graph.prologue) {
      const ns = phases[p.id];
      if (ns) {
        phases[p.id] = { status: 'pending', retryCount: ns.retryCount + 1 };
        effects.push({
          type: 'persist_node_state',
          runId,
          nodeId: p.id,
          state: phases[p.id],
        });
      }
    }
  }

  // Activation is NOT done here — callers run a single activateReady after
  // the routing block so prologue gating (P pending → P only) applies to the
  // whole event; activating inside would let author nodes slip through in the
  // same transition that re-armed the prefix.
  return nextRoutes;
}

/**
 * Pure state transition — computes next FsmState and effects from current
 * state, event, and graph definition.
 *
 * Four event paths, each independent:
 * 1. START      — init run: all nodes pending, first ready batch active
 * 2. COMPLETE   — mark phase done; apply routing decision (gate jump /
 *                 approval branch-route) or endRun; drain → completed
 * 3. JUMP       — reset target + downstream to pending, re-activate ready
 * 4. FORCE_END  — all pending/active → aborted, run terminated
 *
 * @param state  current FSM state
 * @param event  dispatch event from api/ layer
 * @param graph  graph definition (phases + metadata)
 */
export function transition(state: FsmState, event: FsmEvent, graph: TaskflowGraph): TransitionResult {
  switch (event.type) {
    case 'START': {
      if (state.status !== 'idle') {
        throw new InvalidStateTransitionError(state.status, 'START');
      }
      const runId = randomUUID();
      const startedAt = new Date().toISOString();
      const phases = initPhases(graph, startedAt);
      const nextState: FsmState = {
        status: 'running',
        runId,
        graphName: graph.name,
        phases,
        routes: {},
        startedAt,
      };

      const effects: FsmEffect[] = [{ type: 'persist_run_state', runId, status: 'running', routes: {} }];
      for (const [nodeId, ns] of Object.entries(phases)) {
        effects.push({ type: 'persist_node_state', runId, nodeId, state: ns });
      }

      return { nextState, effects };
    }

    case 'COMPLETE': {
      if (state.status !== 'running') {
        throw new InvalidStateTransitionError(state.status, 'COMPLETE');
      }

      const nodeState = state.phases[event.phaseId];
      if (!nodeState) {
        throw new InvalidStateTransitionError(
          state.status,
          'COMPLETE',
          `Phase ${event.phaseId} not found in run ${state.runId}`,
        );
      }
      if (nodeState.status !== 'active') {
        throw new InvalidStateTransitionError(
          state.status,
          'COMPLETE',
          `Phase ${event.phaseId} is ${nodeState.status}, expected active`,
        );
      }

      const now = new Date().toISOString();
      const phases = clonePhases(state.phases);
      const effects: FsmEffect[] = [];
      let routes = state.routes;

      phases[event.phaseId] = {
        ...nodeState,
        status: 'done',
        completedAt: now,
        durationMs: event.durationMs,
      };
      effects.push({
        type: 'persist_node_state',
        runId: state.runId,
        nodeId: event.phaseId,
        state: phases[event.phaseId],
      });

      // Approval `end` action — explicit run completion, no end node.
      if (event.endRun === true) {
        const nextState: FsmState = { ...state, status: 'completed', phases, routes };
        effects.push({ type: 'persist_run_state', runId: state.runId, status: 'completed', routes });
        return { nextState, effects };
      }

      // Routing decision — mechanical application of the agent's decision.
      // Gate: branchTo = backward jump target (rework). Approval: branchTo =
      // branch-route target (node or route id — activates the route).
      const completedPhase = graph.phases.find((p) => p.id === event.phaseId);
      if (event.branchTo !== undefined) {
        if (completedPhase?.type === 'gate') {
          const target = phases[event.branchTo];
          if (!target) {
            throw new InvalidStateTransitionError(
              state.status,
              'COMPLETE',
              `Gate jump target ${event.branchTo} not found in run ${state.runId}`,
            );
          }
          if (target.status !== 'done' && target.status !== 'aborted') {
            throw new InvalidStateTransitionError(
              state.status,
              'COMPLETE',
              `Gate jump target ${event.branchTo} is ${target.status}, expected terminal (upstream rework target)`,
            );
          }
          routes = applyJumpReset(phases, graph, event.branchTo, now, effects, state.runId, routes);
        } else if (completedPhase?.type === 'approval') {
          // Branch-route decision — target is a route id or a node id.
          const routeIds = new Set(graph.phases.map((p) => p.route).filter((r): r is string => r !== undefined));
          if (routeIds.has(event.branchTo)) {
            routes = { ...routes, [event.branchTo]: event.phaseId };
          } else {
            const target = phases[event.branchTo];
            if (!target) {
              throw new InvalidStateTransitionError(
                state.status,
                'COMPLETE',
                `Approval branch target ${event.branchTo} not found in run ${state.runId}`,
              );
            }
            if (target.status !== 'pending') {
              throw new InvalidStateTransitionError(
                state.status,
                'COMPLETE',
                `Approval branch target ${event.branchTo} is ${target.status}, expected pending`,
              );
            }
            phases[event.branchTo] = { ...target, status: 'active', startedAt: now };
            effects.push({
              type: 'persist_node_state',
              runId: state.runId,
              nodeId: event.branchTo,
              state: phases[event.branchTo],
            });
            const targetPhase = graph.phases.find((p) => p.id === event.branchTo);
            if (targetPhase && targetPhase.route !== undefined) {
              routes = { ...routes, [targetPhase.route]: event.phaseId };
            }
          }
        }
        // Single persist point for route changes — the stateless server
        // rebuilds state from the DB every dispatch, so a route change that
        // never reaches the DB (asymmetric per-branch persists let gate-jump
        // clearings die in memory) leaves stale activations alive across
        // rounds. Persist once here, never per branch.
        effects.push({ type: 'persist_run_state', runId: state.runId, status: 'running', routes });
      }

      // Activate next ready nodes
      activateReady(phases, graph, now, effects, state.runId, routes);

      // Completion — natural drain (no active, no eligible). Unchosen-route
      // nodes stay pending forever and never block completion.
      if (isDrained(phases, graph, routes)) {
        const nextState: FsmState = { ...state, status: 'completed', phases, routes };
        effects.push({ type: 'persist_run_state', runId: state.runId, status: 'completed', routes });
        return { nextState, effects };
      }

      return {
        nextState: { ...state, phases, routes },
        effects,
      };
    }

    case 'JUMP': {
      if (state.status !== 'running') {
        throw new InvalidStateTransitionError(state.status, 'JUMP');
      }

      const phases = clonePhases(state.phases);
      const now = new Date().toISOString();
      const effects: FsmEffect[] = [];

      const routes = applyJumpReset(phases, graph, event.targetPhaseId, now, effects, state.runId, state.routes);

      // Single activation point — prologue gating applies (entry-target jumps
      // re-armed the prefix; P pending → P only).
      activateReady(phases, graph, now, effects, state.runId, routes);

      effects.push({
        type: 'persist_run_state',
        runId: state.runId,
        status: 'running',
        routes,
      });

      return {
        nextState: {
          status: 'running',
          runId: state.runId,
          graphName: state.graphName,
          phases,
          routes,
          startedAt: state.startedAt,
        },
        effects,
      };
    }

    case 'FORCE_END': {
      if (state.status !== 'running') {
        throw new InvalidStateTransitionError(state.status, 'FORCE_END');
      }

      const phases = clonePhases(state.phases);
      const now = new Date().toISOString();
      const effects: FsmEffect[] = [];

      // Abort all nodes that are not in a terminal state.
      for (const [nodeId, ns] of Object.entries(phases)) {
        if (ns.status === 'pending' || ns.status === 'active') {
          phases[nodeId] = {
            ...ns,
            status: 'aborted',
            completedAt: now,
          };
          effects.push({
            type: 'persist_node_state',
            runId: state.runId,
            nodeId,
            state: phases[nodeId],
          });
        }
      }

      const nextState: FsmState = {
        status: 'terminated',
        runId: state.runId,
        graphName: state.graphName,
        phases,
        routes: state.routes,
        startedAt: state.startedAt,
      };

      effects.unshift({
        type: 'persist_run_state',
        runId: state.runId,
        status: 'terminated',
        routes: state.routes,
      });

      return { nextState, effects };
    }

    default: {
      const _exhaustive: never = event;
      throw new InvalidStateTransitionError(
        'unknown',
        (_exhaustive as FsmEvent).type,
        `Unknown event type: ${(_exhaustive as FsmEvent).type}`,
      );
    }
  }
}

/**
 * Thrown when an event is dispatched in an illegal state or when
 * a phase validation fails (missing phase, wrong status).
 *
 * Caught by the api/ layer and state-machine.dispatch().
 *
 * @param currentStatus  run-level FSM status at time of error
 * @param eventType      event type that triggered the error
 * @param message        optional custom message; auto-generated from status+event if omitted
 */
export class InvalidStateTransitionError extends Error {
  public readonly _tag = 'InvalidStateTransitionError';

  constructor(
    public readonly currentStatus: string,
    public readonly eventType: string,
    message?: string,
  ) {
    super(message ?? `Illegal transition: cannot dispatch ${eventType} from state ${currentStatus}`);
    this.name = 'InvalidStateTransitionError';
  }
}
