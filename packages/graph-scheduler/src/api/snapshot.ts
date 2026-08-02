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
import { resolveArgs } from '../flow-flatten.js';
import type { FsmNodeState } from '../fsm/effects.js';
import type { FsmState, TaskflowGraph } from '../fsm/transition.js';
import { UnknownPhaseTypeError } from '../phase-handler/errors.js';
import { resolvePhaseHandler } from '../phase-handler/index.js';
import type { IBaseNodeDetail, IFsmNodeState, INodeDetail } from '../phase-handler/types.js';
import { DispatchConfigError } from '../types.js';

/** Constant handler skill — dispatch types main/approval share it. */
const HANDLER_SKILL = 'atom-phase-handler';

/** per-node state entry in snapshots — status + retry + timing (M2) */
export interface ISnapshotNode {
  readonly nodeId: string;
  readonly status: string;
  readonly retryCount: number;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly durationMs: number | null;
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
  /** per-node execution states — enables jump-target enumeration without graph_status (M2) */
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
      case 'skipped':
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

/** Find the first active node in the FSM state — returns null if none. */
export function findActiveNode(
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
 * Handler resolution is static by type (main/approval); handlerSkill is the
 * constant 'atom-phase-handler'. No registry in context.
 */
export function buildNodeDetail(
  phaseId: string,
  nodeState: FsmNodeState,
  graph: TaskflowGraph,
  constraints: readonly string[],
  args?: Record<string, unknown>,
): Effect.Effect<INodeDetail | null, DispatchConfigError> {
  return Effect.try({
    try: () => {
      const phase = graph.phases.find((p) => p.id === phaseId);
      if (!phase) return null;

      // Base fields — common to all phase types
      const base: IBaseNodeDetail = {
        nodeId: phaseId,
        type: phase.type,
        dependsOn: phase.dependsOn,
        handlerSkill: HANDLER_SKILL,
        skill: phase.skill,
        when: phase.when,
        constraints,
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

      // Static type dispatch — main/approval; unknown type fails dispatch
      const handler = resolvePhaseHandler(phase.type);
      const extras = handler.extendNodeDetail(base, phase, handlerState);
      const detail = { ...base, ...extras };
      // Invocation args interpolation — {args.X} resolves against run start args
      if (typeof detail.task === 'string') {
        detail.task = resolveArgs(detail.task, args) ?? detail.task;
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
export function buildSnapshot(state: FsmState): IGraphSnapshot {
  if (state.status === 'idle') {
    return assembleSnapshot(
      { runId: '', graphName: '', fsmState: 'idle', createdAt: '', updatedAt: new Date().toISOString() },
      [],
    );
  }

  const nodes: ISnapshotNode[] = Object.entries(state.phases).map(([id, ns]) => ({
    nodeId: id,
    status: ns.status,
    retryCount: ns.retryCount,
    startedAt: ns.startedAt ?? null,
    completedAt: ns.completedAt ?? null,
    durationMs: ns.durationMs ?? null,
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
