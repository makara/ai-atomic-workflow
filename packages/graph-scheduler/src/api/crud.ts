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
import { GraphRepository, type GraphRun } from '../lib/db/repository.js';
import type { INodeDetail } from '../phase-handler/types.js';
import { RegistryLoader } from '../registry-loader.js';
import type {
  DispatchConfigError,
  InvalidStateError,
  NextNodeInput,
  NotFoundError,
  RegistryLoadError,
  SchedulerError,
} from '../types.js';

import { ConfigService } from '../config-service.js';
import { executeEffects, reconstructFsmState } from './fsm-reconstruct.js';
import { getContractWarnings, loadGraphForRun, loadGraphWithRegistry, toTaskflowGraph } from './graph-loader.js';
import { dropRunCaches, graphLoadCache } from './run-caches.js';
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
  GraphRepository | FileSystem | RegistryLoader | ConfigService
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
 * Build the next dispatchable node after a transition (null when run finished).
 * Shared tail for start/advance/jump.
 */
function buildNextNode(input: NextNodeInput): Effect.Effect<NodeDetail | null, DispatchConfigError, ConfigService> {
  return Effect.gen(function* () {
    const active = input.state.status === 'running' ? findActiveNode(input.state.phases, input.graph) : null;
    if (!active) return null;
    const config = yield* ConfigService;
    return yield* buildNodeDetail({
      phaseId: active.phaseId,
      nodeState: active.nodeState,
      graph: input.graph,
      args: input.args,
      projectContext: config.context,
    });
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
 * @param args      — optional invocation arguments (accessible via {args.X} in templates);
 *                    `args.mode` short-circuits the built-in $run-mode-confirm prologue node
 */
export function graphStart(
  graphName: string,
  args?: Record<string, unknown>,
): Effect.Effect<
  {
    runId: string;
    node: NodeDetail | null;
    contractWarnings?: string[];
    /** Resolution source of the loaded graph — project | builtin | fallback. */
    resolvedFrom: 'project' | 'builtin' | 'fallback';
    /** Absolute path the graph was loaded from. */
    resolvedPath: string;
    /** Graph top-level description — purpose-focused identity text; absent when undeclared. */
    description?: string;
    /** Run snapshot — same shape as advance/jump; entry dispatch carries it (jump nav + progress display). */
    snapshot: IGraphSnapshot;
  },
  SchedulerError | RegistryLoadError,
  GraphRepository | FileSystem | RegistryLoader | ConfigService
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
    // Cache graph definition for subsequent advance/jump within this run
    graphLoadCache.set(runId, tf);

    // Create run row + node state rows in DB (prologue nodes included — they
    // are run members and dispatch first; an author-declared reserved id is
    // both a prologue member and a phase — seed it once)
    yield* repo.createRun(runId, graphName, args);
    const prologueIds = new Set(graph.prologue.map((p) => p.id));
    const nodes = [...graph.prologue, ...graph.phases.filter((p) => !prologueIds.has(p.id))].map(
      (p: { id: string }) => ({
        nodeId: p.id,
      }),
    );
    yield* repo.createNodeStates(runId, nodes);

    // Execute transition effects
    yield* executeEffects(result.effects, repo, graph);

    // Build next node
    const node = yield* buildNextNode({ runId, state: nextState, graph, args: args ?? null });
    // Contract warnings captured at load — surfaced for decision gates
    return {
      runId,
      node,
      contractWarnings: getContractWarnings(graphName),
      resolvedFrom: tf.resolvedFrom,
      resolvedPath: tf.resolvedPath,
      description: tf.description,
      snapshot: buildSnapshot(nextState, graph),
    };
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
 * @param branchTo   — routing decision target (route-first): gate jump target
 *                    (backward rework — terminal upstream node) or approval
 *                    branch-route target (node or route id — activates route)
 * @param endRun     — approval `end` action: complete the run immediately
 */
export function graphAdvance(
  runId: string,
  nodeId: string,
  durationMs: number,
  branchTo?: string,
  endRun?: boolean,
): Effect.Effect<
  { snapshot: IGraphSnapshot; node: NodeDetail | null },
  SchedulerError,
  GraphRepository | FileSystem | RegistryLoader | ConfigService
> {
  return Effect.gen(function* () {
    const { run, currentState, graph } = yield* loadRunContext(runId);

    // Always dispatch COMPLETE event — output stays in agent session
    const event: FsmEvent = { type: 'COMPLETE', phaseId: nodeId, durationMs, branchTo, endRun };
    const result = yield* dispatchEvent(runId, currentState, graph, event);

    // Execute effects
    const repo = yield* GraphRepository;
    yield* executeEffects(result.effects, repo, graph);

    // Build return
    const nextState = result.nextState;
    const snapshot = buildSnapshot(nextState, graph);
    const node = yield* buildNextNode({
      runId,
      state: nextState,
      graph,
      args: run.args,
    });

    return { snapshot, node };
  });
}

/**
 * Jump to a target phase — reset target + downstream terminal nodes, re-activate (upstream kept).
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
  GraphRepository | FileSystem | RegistryLoader | ConfigService
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
    const snapshot = buildSnapshot(nextState, graph);
    const node = yield* buildNextNode({
      runId,
      state: nextState,
      graph,
      args: run.args,
    });

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
): Effect.Effect<IGraphSnapshot, SchedulerError, GraphRepository | FileSystem | RegistryLoader | ConfigService> {
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

    return buildSnapshot(result.nextState, graph);
  });
}
