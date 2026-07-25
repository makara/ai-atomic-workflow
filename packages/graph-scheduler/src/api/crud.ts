/**
 * API CRUD — 4 write operations as Effect generators.
 *
 * Layer 2 — each function: load graph → rebuild state machine from persisted
 * state → dispatch FsmEvent → traverse effects[] → call lib/ modules.
 *
 * Dependencies:
 * - Layer 1: fsm/state-machine (createStateMachine), fsm/events (FsmEvent),
 *            fsm/effects (FsmEffect, FsmNodeState), fsm/transition (FsmState, TaskflowGraph)
 * - Layer 3: lib/db/repository (GraphRepository), lib/agent-registry (AgentRegistryService),
 *            graph-definition (loadGraph), topology (findUpstream),
 *            phase-handler (resolvePhaseHandler, PhaseHandlerRegistry)
 *
 * @module
 */

import { Effect } from 'effect';
import type { Taskflow } from '../graph-definition.js';

import type { FsmEffect, FsmNodeState } from '../fsm/effects.js';
import type { FsmEvent } from '../fsm/events.js';
import { createStateMachine } from '../fsm/state-machine.js';
import { type FsmState, type TaskflowGraph, type TransitionResult } from '../fsm/transition.js';
import { FileSystem, loadGraph, loadGraphFromPath } from '../graph-definition.js';
import { AgentRegistryService, type AgentRegistryEntry } from '../lib/agent-registry.js';
import { GraphRepository, type GraphRun, type NodeStateEntry, type NodeStateUpdate } from '../lib/db/repository.js';
import { PhaseHandlerRegistry } from '../phase-handler/registry.js';
import {
  UnknownPhaseTypeError,
  type IBaseNodeDetail,
  type IFsmNodeState,
  type INodeDetail,
} from '../phase-handler/types.js';
import { RegistryLoader } from '../registry-loader.js';
import { findDownstream, findUpstream } from '../topology.js';
import type {
  GraphDefinitionError,
  InvalidStateError,
  NotFoundError,
  PersistenceError,
  RegistryLoadError,
  SchedulerError,
} from '../types.js';

// ---------------------------------------------------------------------------
// Public DTOs
// ---------------------------------------------------------------------------

/** Unified snapshot returned by write/query operations (ADR 0020 D5). */
export interface IGraphSnapshot {
  readonly runId: string;
  readonly graphName: string;
  readonly fsmState: string;
  readonly currentPhaseId: string | null;
  readonly nodeCount: number;
  readonly completedCount: number;
  readonly failedCount: number;
  readonly updatedAt: string;
}
/** Next node detail — returned alongside snapshot for agent dispatch. */
export type NodeDetail = INodeDetail;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function notFound(runId: string): NotFoundError {
  return { _tag: 'NotFoundError', runId, message: `Run not found: ${runId}` };
}

function invalidState(runId: string, currentStatus: string, attemptedAction: string): InvalidStateError {
  return {
    _tag: 'InvalidStateError',
    runId,
    currentStatus,
    attemptedAction,
    message: `Invalid state transition: run ${runId} is ${currentStatus}, cannot ${attemptedAction}`,
  };
}

/**
 * Load a graph definition — registry-aware.
 * Tries registry resolution first (name → registry entry path),
 * falls back to direct loadGraph() (name → `${name}.taskflow.yaml`).
 */
// ---------------------------------------------------------------------------
// Graph definition cache — avoid repeated disk reads within same run.
// Key = runId. Each run loads its graph once; advance/jump reuse.
// ---------------------------------------------------------------------------

const graphLoadCache = new Map<string, Taskflow>();

function loadGraphWithRegistry(
  graphName: string,
): Effect.Effect<Taskflow, SchedulerError | RegistryLoadError, FileSystem | RegistryLoader> {
  return Effect.gen(function* () {
    // Try registry resolution — catch failure if graph not in registry
    const resolvedPath = yield* Effect.either(
      Effect.gen(function* () {
        const registryLoader = yield* RegistryLoader;
        return yield* registryLoader.resolveGraph(graphName);
      }),
    );

    if (resolvedPath._tag === 'Right') {
      return yield* loadGraphFromPath(resolvedPath.right, graphName);
    }
    // Fallback: direct load by name → `${graphName}.taskflow.yaml`
    return yield* loadGraph(graphName);
  });
}

/**
 * Load a graph definition for a run — cache-aware.
 * First call for a run loads from disk; subsequent calls reuse cached.
 * Cache key = runId, so different runs don't collide even with same graphName.
 */
function loadGraphForRun(
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
 * Also runs each phase through its PhaseHandler's validate() and normalize()
 * per ADR 0025 — contract: validate after schema.parse(), normalize before FSM.
 *
 * Requires PhaseHandlerRegistry in context (injected by createRuntime).
 */
export function toTaskflowGraph(tf: Taskflow): Effect.Effect<TaskflowGraph, never, PhaseHandlerRegistry> {
  return Effect.gen(function* () {
    const reg = yield* PhaseHandlerRegistry;

    const validatedPhases: Array<Taskflow['phases'][number]> = [];
    for (const p of tf.phases) {
      const result = yield* Effect.gen(function* () {
        const handler = yield* reg.resolvePhaseHandler(p.type);
        const validated = handler.validate(p);
        return handler.normalize(validated);
      }).pipe(
        Effect.catchAll((err) => {
          if (err instanceof UnknownPhaseTypeError) return Effect.succeed(p);
          return Effect.fail(err);
        }),
      );
      validatedPhases.push(result);
    }

    return { name: tf.name ?? 'unnamed', phases: validatedPhases };
  });
}
/** Metrics extracted from a collection of node states. */
export interface ISnapshotMetrics {
  readonly currentPhaseId: string | null;
  readonly nodeCount: number;
  readonly completedCount: number;
  readonly failedCount: number;
}

/**
 * Aggregate snapshot metrics from a flat list of node status entries.
 * Used by buildSnapshot() and query.ts graphStatus().
 */
export function aggregateNodeMetrics(
  nodes: ReadonlyArray<{ readonly status: string; readonly nodeId: string }>,
  fsmState: string,
): ISnapshotMetrics {
  let completedCount = 0;
  let failedCount = 0;
  let currentPhaseId: string | null = null;
  const shouldFindActive = fsmState === 'running';
  for (const n of nodes) {
    switch (n.status) {
      case 'done':
        completedCount++;
        break;
      case 'failed':
        failedCount++;
        break;
      case 'active':
        if (shouldFindActive && currentPhaseId === null) {
          currentPhaseId = n.nodeId;
        }
        break;
    }
  }
  return { currentPhaseId, nodeCount: nodes.length, completedCount, failedCount };
}

/** Find the first active node in the FSM state — returns null if none. */
function findActiveNode(
  phases: Record<string, FsmNodeState>,
  graph: TaskflowGraph,
): { phaseId: string; nodeState: FsmNodeState } | null {
  for (const p of graph.phases) {
    const ns = phases[p.id];
    if (ns && ns.status === 'active') {
      return { phaseId: p.id, nodeState: ns };
    }
  }
  return null;
}

/**
 * Build a NodeDetail from a phase + its FSM state.
 *
 * Uses PhaseHandlerRegistry for type-specific field extension
 * and AgentRegistryService for handlerSkill/entrySkill/agent resolution.
 * Requires PhaseHandlerRegistry in context.
 */
function buildNodeDetail(
  phaseId: string,
  nodeState: FsmNodeState,
  graph: TaskflowGraph,
  skillMap: Map<string, AgentRegistryEntry>,
): Effect.Effect<NodeDetail | null, never, PhaseHandlerRegistry> {
  return Effect.gen(function* () {
    const phase = graph.phases.find((p) => p.id === phaseId);
    if (!phase) return null;

    const entry = skillMap.get(phase.type);
    if (!entry) {
      throw new Error(`No agent registered for type "${phase.type}"`);
    }

    // Base fields — common to all phase types
    const base: IBaseNodeDetail = {
      nodeId: phaseId,
      type: phase.type,
      handlerSkill: entry.skill,
      entrySkill: phase.skill ?? entry.skill,
      agent: entry.agent,
      retryAttempt: nodeState.retryCount,
    };

    // Adapt FsmNodeState to IFsmNodeState for handler consumption
    const handlerState: IFsmNodeState = {
      status: nodeState.status,
      retryCount: nodeState.retryCount,
      startedAt: nodeState.startedAt,
      completedAt: nodeState.completedAt,
      durationMs: nodeState.durationMs,
    };

    // PhaseHandler — type-specific field extension
    const reg = yield* PhaseHandlerRegistry;
    return yield* reg.resolvePhaseHandler(phase.type).pipe(
      Effect.flatMap((handler) =>
        Effect.sync(() => {
          const extras = handler.extendNodeDetail(base, phase, handlerState);
          return { ...base, ...extras };
        }),
      ),
      Effect.catchAll((err) => {
        if (err instanceof UnknownPhaseTypeError) return Effect.succeed(base);
        return Effect.fail(err);
      }),
    );
  });
}

/** Build a GraphSnapshot from an FsmState. */
function buildSnapshot(state: FsmState): IGraphSnapshot {
  if (state.status === 'idle') {
    return {
      runId: '',
      graphName: '',
      fsmState: 'idle',
      currentPhaseId: null,
      nodeCount: 0,
      completedCount: 0,
      failedCount: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  const nodes = Object.entries(state.phases).map(([id, ns]) => ({
    nodeId: id,
    status: ns.status,
  }));
  const metrics = aggregateNodeMetrics(nodes, state.status);

  return {
    runId: state.runId,
    graphName: state.graphName,
    fsmState: state.status,
    currentPhaseId: metrics.currentPhaseId,
    nodeCount: metrics.nodeCount,
    completedCount: metrics.completedCount,
    failedCount: metrics.failedCount,
    updatedAt: new Date().toISOString(),
  };
}

/** Known valid FsmNodeState status values — used for runtime guard (N3). */
const VALID_NODE_STATUSES: Record<string, true> = {
  pending: true,
  active: true,
  done: true,
  blocked: true,
  skipped: true,
};

/** Reconstruct an FsmState from persisted run + node states. */
function reconstructFsmState(
  run: GraphRun,
  nodeStates: ReadonlyArray<NodeStateEntry>,
): Effect.Effect<FsmState, PersistenceError> {
  return Effect.gen(function* () {
    const phases: Record<string, FsmNodeState> = {};
    for (const ns of nodeStates) {
      if (!VALID_NODE_STATUSES[ns.status]) {
        return yield* Effect.fail<PersistenceError>({
          _tag: 'PersistenceError',
          operation: 'reconstructFsmState',
          message: `Unknown node status "${ns.status}" for node "${ns.nodeId}"`,
        });
      }
      phases[ns.nodeId] = {
        status: ns.status as FsmNodeState['status'],
        retryCount: ns.retryCount,
        startedAt: ns.startedAt ?? undefined,
        completedAt: ns.completedAt ?? undefined,
      };
    }

    switch (run.fsmState) {
      case 'running':
        return {
          status: 'running',
          runId: run.runId,
          graphName: run.graphName,
          phases,
          startedAt: run.createdAt,
        };
      case 'blocked':
        // Map legacy 'blocked' runs to 'running' — 'blocked' removed from FsmState
        return {
          status: 'running',
          runId: run.runId,
          graphName: run.graphName,
          phases,
          startedAt: run.createdAt,
        };
      case 'terminated':
        return {
          status: 'terminated',
          runId: run.runId,
          graphName: run.graphName,
          phases,
          startedAt: run.createdAt,
        };
      default:
        return yield* Effect.fail<PersistenceError>({
          _tag: 'PersistenceError',
          operation: 'reconstructFsmState',
          message: `Unknown fsmState: ${run.fsmState}`,
        });
    }
  });
}

/**
 * Execute all FSM effects in order — delegates to GraphRepository.
 *
 * - persist_node_state → repo.updateNodeState
 * - persist_run_state  → repo.updateRunStatus
 * - reset_upstream     → findUpstream → repo.resetUpstreamNodes
 * - reset_downstream   → findDownstream → repo.resetDownstreamNodes
 */
function executeEffects(
  effects: readonly FsmEffect[],
  repo: GraphRepository['Type'],
  graph: TaskflowGraph,
): Effect.Effect<void, PersistenceError> {
  return Effect.gen(function* () {
    for (const effect of effects) {
      switch (effect.type) {
        case 'persist_node_state': {
          const update: NodeStateUpdate = {
            status: effect.state.status,
            retryCount: effect.state.retryCount,
            startedAt: effect.state.startedAt,
            completedAt: effect.state.completedAt,
          };
          yield* repo.updateNodeState(effect.runId, effect.nodeId, update);
          break;
        }
        case 'persist_run_state': {
          yield* repo.updateRunStatus(effect.runId, effect.status);
          break;
        }
        case 'reset_upstream': {
          const upstreamIds = findUpstream(effect.fromNodeId, graph.phases);
          yield* repo.resetUpstreamNodes(effect.runId, upstreamIds);
          break;
        }
        case 'reset_downstream': {
          const downstreamIds = findDownstream(effect.nodeId, graph.phases);
          if (downstreamIds.length > 0) {
            yield* repo.resetDownstreamNodes(effect.runId, downstreamIds);
          }
          break;
        }
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Public API — write operations
// ---------------------------------------------------------------------------

/**
 * Start a new graph run.
 *
 * Loads the graph definition, creates a state machine, dispatches START,
 * persists the new run and node states, and returns the run ID + first node.
 *
 * @param graphName — graph name (resolved via registry or `${graphName}.taskflow.yaml`)
 * @param args      — optional invocation arguments (accessible via {args.X} in templates)
 */
export function graphStart(
  graphName: string,
  args?: Record<string, unknown>,
): Effect.Effect<
  { runId: string; node: NodeDetail | null },
  SchedulerError | RegistryLoadError,
  GraphRepository | FileSystem | RegistryLoader | AgentRegistryService | PhaseHandlerRegistry
> {
  return Effect.gen(function* () {
    const repo = yield* GraphRepository;
    const skillMap = yield* AgentRegistryService;
    const tf = yield* loadGraphWithRegistry(graphName);
    const graph = yield* toTaskflowGraph(tf);

    // Dispatch START
    const sm = createStateMachine(graph);
    let result: TransitionResult;
    try {
      result = sm.dispatch({ type: 'START', graphName, args });
    } catch (err) {
      // Wrap InvalidStateTransitionError into InvalidStateError
      if (err instanceof Error && err.name === 'InvalidStateTransitionError') {
        return yield* Effect.fail<InvalidStateError>({
          _tag: 'InvalidStateError',
          runId: '',
          currentStatus: 'idle',
          attemptedAction: 'START',
          message: err.message,
        });
      }
      throw err;
    }

    const nextState = result.nextState;
    if (nextState.status === 'idle') {
      return yield* Effect.fail<InvalidStateError>({
        _tag: 'InvalidStateError',
        runId: '',
        currentStatus: 'idle',
        attemptedAction: 'START',
        message: 'START transition did not produce a running state',
      });
    }

    const runId = nextState.runId;
    // Cache graph definition for subsequent advance/jump within this run
    graphLoadCache.set(runId, tf);

    // Create run row + node state rows in DB
    yield* repo.createRun(runId, graphName, args);
    const nodes = tf.phases.map((p: { id: string; type?: string }, i: number) => ({
      nodeId: p.id,
      type: p.type ?? 'agent',
      topoOrder: i,
    }));
    yield* repo.createNodeStates(runId, nodes);

    // Execute transition effects
    yield* executeEffects(result.effects, repo, graph);

    // Build next node
    const active = findActiveNode(nextState.phases, graph);
    let node: NodeDetail | null = null;
    if (active) {
      node = yield* buildNodeDetail(active.phaseId, active.nodeState, graph, skillMap);
    }

    return { runId, node };
  });
}

/**
 * Advance a graph run — report agent node completion.
 *
 * Loads persisted state, dispatches COMPLETE event, executes effects,
 * and returns the updated snapshot + next node.
 *
 * Output is NOT passed to graph-scheduler — it lives in agent session
 * or on-disk files per the design principle (§11.0 of the analysis report).
 *
 * @param runId      — run identifier
 * @param nodeId     — completed phase identifier
 * @param durationMs — execution duration in milliseconds
 */
export function graphAdvance(
  runId: string,
  nodeId: string,
  durationMs: number,
): Effect.Effect<
  { snapshot: IGraphSnapshot; node: NodeDetail | null },
  SchedulerError,
  GraphRepository | FileSystem | RegistryLoader | AgentRegistryService | PhaseHandlerRegistry
> {
  return Effect.gen(function* () {
    const repo = yield* GraphRepository;
    const skillMap = yield* AgentRegistryService;

    // Load persisted state
    const run = yield* repo.getRun(runId);
    const nodeStates = yield* repo.getNodeStates(runId);
    const currentState = (yield* reconstructFsmState(run, nodeStates)) as Extract<
      FsmState,
      { phases: Record<string, FsmNodeState> }
    >;

    // Load graph definition (cache-aware — first advance for this run loads from disk)
    const tf = yield* loadGraphForRun(runId, run.graphName);
    const graph = yield* toTaskflowGraph(tf);

    // Always dispatch COMPLETE event — no output, topology-only
    const event: FsmEvent = { type: 'COMPLETE', phaseId: nodeId, durationMs };
    // Route through createStateMachine().dispatch() for single-entry LEGAL_EVENTS validation.
    const sm = createStateMachine(graph, currentState);
    let result: TransitionResult;
    try {
      result = sm.dispatch(event);
    } catch (err) {
      if (err instanceof Error && err.name === 'InvalidStateTransitionError') {
        return yield* Effect.fail(invalidState(runId, currentState.status, event.type));
      }
      throw err;
    }

    // Execute effects
    yield* executeEffects(result.effects, repo, graph);

    // Build return
    const nextState = result.nextState;
    const snapshot = buildSnapshot(nextState);
    const active = nextState.status === 'running' ? findActiveNode(nextState.phases, graph) : null;
    let node: NodeDetail | null = null;
    if (active) {
      node = yield* buildNodeDetail(active.phaseId, active.nodeState, graph, skillMap);
    }

    return { snapshot, node };
  });
}

/**
 * Jump to a target phase — reset target + upstream, re-activate.
 * Used after approval REWORK decision. Only valid when run is in running state.
 *
 * @param runId         — run identifier
 * @param targetPhaseId — phase to re-execute
 */
export function graphJump(
  runId: string,
  targetPhaseId: string,
): Effect.Effect<
  { snapshot: IGraphSnapshot; node: NodeDetail | null },
  SchedulerError,
  GraphRepository | FileSystem | RegistryLoader | AgentRegistryService | PhaseHandlerRegistry
> {
  return Effect.gen(function* () {
    const repo = yield* GraphRepository;
    const skillMap = yield* AgentRegistryService;

    const run = yield* repo.getRun(runId);

    const normalizedState = run.fsmState === 'blocked' ? 'running' : run.fsmState;
    if (normalizedState !== 'running') {
      return yield* Effect.fail(invalidState(runId, run.fsmState, 'JUMP'));
    }

    const nodeStates = yield* repo.getNodeStates(runId);
    const currentState = (yield* reconstructFsmState(run, nodeStates)) as Extract<
      FsmState,
      { phases: Record<string, FsmNodeState> }
    >;

    const tf = yield* loadGraphForRun(runId, run.graphName);
    const graph = yield* toTaskflowGraph(tf);

    const event: FsmEvent = { type: 'JUMP', targetPhaseId };
    const sm = createStateMachine(graph, currentState);
    let result: TransitionResult;
    try {
      result = sm.dispatch(event);
    } catch (err) {
      if (err instanceof Error && err.name === 'InvalidStateTransitionError') {
        return yield* Effect.fail(invalidState(runId, currentState.status, 'JUMP'));
      }
      throw err;
    }

    yield* executeEffects(result.effects, repo, graph);

    const nextState = result.nextState;
    const snapshot = buildSnapshot(nextState);
    const active = nextState.status === 'running' ? findActiveNode(nextState.phases, graph) : null;
    let node: NodeDetail | null = null;
    if (active) {
      node = yield* buildNodeDetail(active.phaseId, active.nodeState, graph, skillMap);
    }

    return { snapshot, node };
  });
}

/**
 * Force-end a run — skip all unfinished nodes, terminate.
 *
 * Valid for running or blocked runs. Returns snapshot without a next node.
 *
 * @param runId — run identifier
 */
export function graphForceEnd(
  runId: string,
): Effect.Effect<IGraphSnapshot, SchedulerError, GraphRepository | FileSystem | RegistryLoader | PhaseHandlerRegistry> {
  return Effect.gen(function* () {
    const repo = yield* GraphRepository;

    const run = yield* repo.getRun(runId);

    const normalizedState = run.fsmState === 'blocked' ? 'running' : run.fsmState;
    if (normalizedState !== 'running') {
      return yield* Effect.fail(invalidState(runId, run.fsmState, 'FORCE_END'));
    }

    const nodeStates = yield* repo.getNodeStates(runId);
    const currentState = (yield* reconstructFsmState(run, nodeStates)) as Extract<
      FsmState,
      { phases: Record<string, FsmNodeState> }
    >;

    const tf = yield* loadGraphForRun(runId, run.graphName);
    const graph = yield* toTaskflowGraph(tf);

    const event: FsmEvent = { type: 'FORCE_END' };
    const sm = createStateMachine(graph, currentState);
    let result: TransitionResult;
    try {
      result = sm.dispatch(event);
    } catch (err) {
      if (err instanceof Error && err.name === 'InvalidStateTransitionError') {
        return yield* Effect.fail(invalidState(runId, currentState.status, 'FORCE_END'));
      }
      throw err;
    }

    yield* executeEffects(result.effects, repo, graph);

    return buildSnapshot(result.nextState);
  });
}
