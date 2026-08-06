/**
 * API Snapshot — snapshot building, metrics aggregation, and NodeDetail construction.
 *
 * Extracted from crud.ts.
 * Builds IGraphSnapshot from FsmState, aggregates metrics, and constructs
 * NodeDetail for agent dispatch.
 *
 * @module
 */

import { Effect } from 'effect';
import { mergeChannelScopes, stripCrossRunChannels } from '../context/resolve-channels.js';
import { debugLog } from '../debug.js';
import { resolveArgs } from '../flow-flatten.js';
import type { FsmNodeState } from '../fsm/effects.js';
import type { FsmState, TaskflowGraph } from '../fsm/transition.js';
import { UnknownPhaseTypeError } from '../phase-handler/errors.js';
import { resolvePhaseHandler } from '../phase-handler/index.js';
import type { IBaseNodeDetail, IFsmNodeState, INodeDetail } from '../phase-handler/types.js';
import type { Phase } from '../schemas/index.js';

import { DispatchConfigError, type NodeDetailInput } from '../types.js';

/** Constant handler skill — dispatch types main/approval share it. */
const HANDLER_SKILL = 'atom-phase-handler';

/** per-node state entry in snapshots — status + retry + timing */
export interface ISnapshotNode {
  readonly nodeId: string;
  readonly status: string;
  readonly retryCount: number;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly durationMs: number | null;
  /**
   * Display-level annotation (branch-routing redesign): true when the node is
   * a pending node in a branch a decided gate routed away from — it will never
   * activate. Cosmetic — no FSM state change.
   */
  readonly unactivated?: boolean;
}

export interface IGraphSnapshot {
  readonly runId: string;
  readonly graphName: string;
  readonly fsmState: string;
  /** alias of fsmState — spec-compliant run status field (graph-mcp-api) */
  readonly status: string;
  readonly currentPhaseId: string | null;
  readonly nodeCount: number;
  readonly completedCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** per-node execution states — enables jump-target enumeration without graph_status */
  readonly nodes: ReadonlyArray<ISnapshotNode>;
}

/** Metrics extracted from a collection of node states. */
export interface ISnapshotMetrics {
  readonly currentPhaseId: string | null;
  readonly nodeCount: number;
  readonly completedCount: number;
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
  let currentPhaseId: string | null = null;
  const shouldFindActive = fsmState === 'running';
  for (const n of nodes) {
    switch (n.status) {
      case 'done':
      case 'aborted':
        completedCount++;
        break;
      case 'active':
        if (shouldFindActive && currentPhaseId === null) {
          currentPhaseId = n.nodeId;
        }
        break;
    }
  }
  return { currentPhaseId, nodeCount: nodes.length, completedCount };
}

/**
 * Find the first active node — prologue nodes first (they dispatch before
 * author nodes at each activation), then author phases in declaration order.
 * Returns null if none.
 */
export function findActiveNode(
  phases: Record<string, FsmNodeState>,
  graph: TaskflowGraph,
): { phaseId: string; nodeState: FsmNodeState } | null {
  for (const p of [...graph.prologue, ...graph.phases]) {
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
 * Handler resolution is static by type (main/approval); handlerSkill is the
 * constant atom-phase-handler, loaded by plain name per the skill-resolution convention.
 * Run mode / constraints are NOT NodeDetail fields — they come from the
 * activation prologue outputs (agent-side consumption). Node-scope gate:
 * `node:` channel targets outside the run's flattened node set are stripped
 * at dispatch (shared predicate — stale-file protection).
 */
export function buildNodeDetail(input: NodeDetailInput): Effect.Effect<INodeDetail | null, DispatchConfigError> {
  return Effect.try({
    try: () => {
      // Prologue nodes dispatch like any other — look them up in the
      // synthesized prefix first, then author phases.
      const allPhases = [...input.graph.prologue, ...input.graph.phases];
      const phase = allPhases.find((p) => p.id === input.phaseId);
      if (!phase) return null;

      // Global-channel merge — two-scope context model: the default layer
      // (config.json `context`) merged with the graph's top-level `context:`,
      // prepended to the phase's own channels (dedup, config first). The
      // merge is deterministic per graph — no per-phase inheritance logic.
      // Phase channels get an identity-preserving fast path: when no outer
      // scope exists, mergeChannelScopes returns the phase's own array
      // reference, so the strip/dedup identity check below still
      // short-circuits.
      const mergedChannels = mergeChannelScopes(input.projectContext, input.graph.context, phase.channels);

      // Promotion self-skip — a node never receives its own promoted stream
      // (`node:<ownId>` from the global channel): self-read is undefined and
      // would inject the node's own stale output from a previous round.
      const selfSkipped =
        mergedChannels && mergedChannels.includes(`node:${input.phaseId}`)
          ? mergedChannels.filter((c) => c !== `node:${input.phaseId}`)
          : mergedChannels;

      // Dispatch-time run-scope gate — strip cross-run `node:` targets before
      // they reach the agent (the agent can no longer see out-of-run references).
      // Run node set = author phases + prologue (prologue is in every run).
      const runNodeIds = new Set(allPhases.map((p) => p.id));
      const { channels, warnings } = stripCrossRunChannels(selfSkipped, runNodeIds);
      for (const w of warnings) {
        debugLog('runtime', { event: 'cross_run_channel_stripped', nodeId: input.phaseId, warning: w });
      }

      // Base fields — common to all phase types
      const base: IBaseNodeDetail = {
        nodeId: input.phaseId,
        type: phase.type,
        dependsOn: phase.dependsOn,
        handlerSkill: HANDLER_SKILL,
        skill: phase.skill,
        retryAttempt: input.nodeState.retryCount,
      };

      // Adapt FsmNodeState to IFsmNodeState for handler consumption
      const handlerState: IFsmNodeState = {
        status: input.nodeState.status,
        retryCount: input.nodeState.retryCount,
        startedAt: input.nodeState.startedAt,
        completedAt: input.nodeState.completedAt,
        durationMs: input.nodeState.durationMs,
      };

      // Static type dispatch — main/approval; unknown type fails dispatch.
      // effectivePhase carries the run-scope-stripped channels (agent never
      // sees out-of-run `node:` references).
      const effectivePhase: Phase = channels === phase.channels ? phase : { ...phase, channels: [...(channels ?? [])] };
      const handler = resolvePhaseHandler(phase.type);
      const extras = handler.extendNodeDetail(base, effectivePhase, handlerState);
      const detail = { ...base, ...extras };
      // Invocation args interpolation — {args.X} resolves against run start args
      if (typeof detail.task === 'string') {
        detail.task = resolveArgs(detail.task, input.args) ?? detail.task;
      }
      return detail;
    },
    catch: (err: unknown): DispatchConfigError =>
      err instanceof UnknownPhaseTypeError
        ? new DispatchConfigError(err.message)
        : new DispatchConfigError(`Phase handler dispatch failed: ${String(err)}`),
  });
}

/** Build a GraphSnapshot from an FsmState. */
export function buildSnapshot(state: FsmState, graph?: TaskflowGraph): IGraphSnapshot {
  if (state.status === 'idle') {
    return assembleSnapshot(
      { runId: '', graphName: '', fsmState: 'idle', createdAt: '', updatedAt: new Date().toISOString() },
      [],
    );
  }

  // Display-level annotation: pending nodes on inactive routes will never
  // activate (route-first — route membership is declared, no inference).
  const unactivated = new Set<string>();
  if (graph) {
    for (const p of graph.phases) {
      if (p.route !== undefined && state.phases[p.id]?.status === 'pending' && !(p.route in state.routes)) {
        unactivated.add(p.id);
      }
    }
  }

  const nodes: ISnapshotNode[] = Object.entries(state.phases).map(([id, ns]) => ({
    nodeId: id,
    status: ns.status,
    retryCount: ns.retryCount,
    startedAt: ns.startedAt ?? null,
    completedAt: ns.completedAt ?? null,
    durationMs: ns.durationMs ?? null,
    unactivated: unactivated.has(id) || undefined,
  }));

  return assembleSnapshot(
    {
      runId: state.runId,
      graphName: state.graphName,
      fsmState: state.status,
      createdAt: state.startedAt,
      updatedAt: new Date().toISOString(),
    },
    nodes,
  );
}

/**
 * Assemble an IGraphSnapshot from run metadata + per-node states.
 * Shared by buildSnapshot() (FSM path) and query.ts buildFullSnapshot() (repository path).
 */
export function assembleSnapshot(
  meta: {
    readonly runId: string;
    readonly graphName: string;
    readonly fsmState: string;
    readonly createdAt: string;
    readonly updatedAt: string;
  },
  nodes: ReadonlyArray<ISnapshotNode>,
): IGraphSnapshot {
  const metrics = aggregateNodeMetrics(nodes, meta.fsmState);
  return {
    runId: meta.runId,
    graphName: meta.graphName,
    fsmState: meta.fsmState,
    status: meta.fsmState,
    currentPhaseId: metrics.currentPhaseId,
    nodeCount: metrics.nodeCount,
    completedCount: metrics.completedCount,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    nodes,
  };
}
