/**
 * API CRUD — 4 write operations as Effect generators.
 *
 * Layer 2 aggregation — delegates graph loading to graph-loader.ts,
 * snapshot building to snapshot.ts, and FSM reconstruction to fsm-reconstruct.ts.
 *
 * @module
 */

import { Effect } from 'effect';

import { FileSystem } from '../filesystem.js';
import type { FsmNodeState } from '../fsm/effects.js';
import type { FsmEvent } from '../fsm/events.js';
import { assertLegalTransition } from '../fsm/state-machine.js';
import {
  InvalidStateTransitionError,
  transition,
  type FsmState,
  type TaskflowGraph,
  type TransitionResult,
} from '../fsm/transition.js';
import type { Taskflow } from '../graph-definition.js';
import { loadConstraintsFile } from '../lib/constraints.js';
import { GraphRepository, type GraphRun } from '../lib/db/repository.js';
import type { INodeDetail } from '../phase-handler/types.js';
import { RegistryLoader } from '../registry-loader.js';
import type {
  DispatchConfigError,
  InvalidStateError,
  NotFoundError,
  RegistryLoadError,
  SchedulerError,
} from '../types.js';

import { executeEffects, reconstructFsmState } from './fsm-reconstruct.js';
import { getContractWarnings, loadGraphForRun, loadGraphWithRegistry, toTaskflowGraph } from './graph-loader.js';
import { dropRunCaches, graphLoadCache, runConstraints } from './run-caches.js';
import { buildNodeDetail, buildSnapshot, findActiveNode, type IGraphSnapshot, type ISnapshotNode } from './snapshot.js';

/** Next node detail — returned alongside snapshot for agent dispatch. */
export type NodeDetail = INodeDetail;

/** Load a running-state variant of FsmState (phases map present). */
type RunState = Extract<FsmState, { phases: Record<string, FsmNodeState> }>;

/**
 * Shared skeleton for advance/jump/force-end: load persisted run + node states,
 * reconstruct FSM state, load graph (cache-aware).
 */
function loadRunContext(
  runId: string,
): Effect.Effect<
  { run: GraphRun; currentState: RunState; graph: TaskflowGraph; tf: Taskflow },
  SchedulerError,
  GraphRepository | FileSystem | RegistryLoader
> {
  return Effect.gen(function* () {
    const repo = yield* GraphRepository;
    const run = yield* repo.getRun(runId);
    const nodeStates = yield* repo.getNodeStates(runId);
    const currentState = (yield* reconstructFsmState(run, nodeStates)) as RunState;
    const tf = yield* loadGraphForRun(runId, run.graphName);
    const graph = yield* toTaskflowGraph(tf);
    return { run, currentState, graph, tf };
  });
}

/**
 * Dispatch a single FSM event, wrapping
 * InvalidStateTransitionError into a typed InvalidStateError.
 */
function dispatchEvent(
  runId: string,
  currentState: RunState | undefined,
  graph: TaskflowGraph,
  event: FsmEvent,
): Effect.Effect<TransitionResult, InvalidStateError> {
  return Effect.suspend(() => {
    try {
      assertLegalTransition(currentState?.status ?? 'idle', event.type);
      return Effect.succeed(transition(currentState ?? { status: 'idle' }, event, graph));
    } catch (err) {
      if (err instanceof InvalidStateTransitionError) {
        return Effect.fail(invalidState(runId, currentState?.status ?? 'idle', event.type));
      }
      throw err;
    }
  });
}

/**
 * Per-run project constraints snapshot — set at graphStart, stable for run lifetime.
 * Same-run advance/jump reuse snapshot; new run re-reads constraints file.
 * In-memory only — server restart drops, next run reloads fresh.
 */
/**
 * Build the next dispatchable node after a transition (null when run finished).
 * Shared tail for start/advance/jump.
 */
function buildNextNode(
  runId: string,
  nextState: FsmState,
  graph: TaskflowGraph,
  args?: Record<string, unknown>,
): Effect.Effect<NodeDetail | null, DispatchConfigError> {
  return Effect.gen(function* () {
    const active = nextState.status === 'running' ? findActiveNode(nextState.phases, graph) : null;
    if (!active) return null;
    const constraints = runConstraints.get(runId) ?? loadConstraintsFile();
    return yield* buildNodeDetail(active.phaseId, active.nodeState, graph, constraints, args);
  });
}

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
  {
    runId: string;
    node: NodeDetail | null;
    contractWarnings?: string[];
    /** Run snapshot — same shape as advance/jump; entry dispatch carries it (Run Mode consumption). */
    snapshot: IGraphSnapshot;
  },
  SchedulerError | RegistryLoadError,
  GraphRepository | FileSystem | RegistryLoader
> {
  return Effect.gen(function* () {
    const repo = yield* GraphRepository;
    const tf = yield* loadGraphWithRegistry(graphName);
    const graph = yield* toTaskflowGraph(tf);

    // Dispatch START
    const result = yield* dispatchEvent('', undefined, graph, { type: 'START', graphName, args });

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
    // Snapshot project constraints for run lifetime — new run re-reads file
    runConstraints.set(runId, loadConstraintsFile());
    // Cache graph definition for subsequent advance/jump within this run
    graphLoadCache.set(runId, tf);

    // Create run row + node state rows in DB
    yield* repo.createRun(runId, graphName, args);
    const nodes = tf.phases.map((p: { id: string }, i: number) => ({
      nodeId: p.id,
      topoOrder: i,
    }));
    yield* repo.createNodeStates(runId, nodes);

    // Execute transition effects
    yield* executeEffects(result.effects, repo, graph);

    // Build next node
    const node = yield* buildNextNode(runId, nextState, graph, args);
    // Contract warnings captured at load — surfaced for decision gates
    return { runId, node, contractWarnings: getContractWarnings(graphName), snapshot: buildSnapshot(nextState) };
  });
}

/**
 * Advance a graph run — report agent node completion.
 *
 * Loads persisted state, dispatches COMPLETE event, executes effects,
 * and returns the updated snapshot + next node.
 *
 * Output is NOT passed to graph-scheduler — it lives in agent session
 * or on-disk files per the design principle.
 *
 * @param runId      — run identifier
 * @param nodeId     — completed phase identifier
 * @param durationMs — execution duration in milliseconds
 * @param skip       — mark node as skipped (when guard false).
 */
export function graphAdvance(
  runId: string,
  nodeId: string,
  durationMs: number,
  skip?: boolean,
): Effect.Effect<
  { snapshot: IGraphSnapshot; node: NodeDetail | null },
  SchedulerError,
  GraphRepository | FileSystem | RegistryLoader
> {
  return Effect.gen(function* () {
    const { run, currentState, graph } = yield* loadRunContext(runId);

    // Always dispatch COMPLETE event — output stays in agent session
    const event: FsmEvent = { type: 'COMPLETE', phaseId: nodeId, durationMs, skip };
    const result = yield* dispatchEvent(runId, currentState, graph, event);

    // Execute effects
    const repo = yield* GraphRepository;
    yield* executeEffects(result.effects, repo, graph);

    // Build return
    const nextState = result.nextState;
    const snapshot = buildSnapshot(nextState);
    const node = yield* buildNextNode(runId, nextState, graph, run.args ?? undefined);

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
  GraphRepository | FileSystem | RegistryLoader
> {
  return Effect.gen(function* () {
    const { run, currentState, graph } = yield* loadRunContext(runId);

    const normalizedState = run.fsmState === 'blocked' ? 'running' : run.fsmState;
    if (normalizedState !== 'running') {
      return yield* Effect.fail(invalidState(runId, run.fsmState, 'JUMP'));
    }

    const event: FsmEvent = { type: 'JUMP', targetPhaseId };
    const result = yield* dispatchEvent(runId, currentState, graph, event);

    const repo = yield* GraphRepository;
    yield* executeEffects(result.effects, repo, graph);

    const nextState = result.nextState;
    const snapshot = buildSnapshot(nextState);
    const node = yield* buildNextNode(runId, nextState, graph, run.args ?? undefined);

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
): Effect.Effect<IGraphSnapshot, SchedulerError, GraphRepository | FileSystem | RegistryLoader> {
  return Effect.gen(function* () {
    const { run, currentState, graph } = yield* loadRunContext(runId);

    const normalizedState = run.fsmState === 'blocked' ? 'running' : run.fsmState;
    if (normalizedState !== 'running') {
      return yield* Effect.fail(invalidState(runId, run.fsmState, 'FORCE_END'));
    }

    const event: FsmEvent = { type: 'FORCE_END' };
    const result = yield* dispatchEvent(runId, currentState, graph, event);

    const repo = yield* GraphRepository;
    yield* executeEffects(result.effects, repo, graph);

    // Terminal state — drop per-run caches, run will never dispatch again
    dropRunCaches(runId);

    return buildSnapshot(result.nextState);
  });
}
