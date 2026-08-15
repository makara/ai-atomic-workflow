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
import { DEFAULT_CONVENTIONS, mergeChannelScopes, stripCrossRunChannels } from '../context/resolve-channels.js';
import { debugLog } from '../debug.js';
import { resolveArgs } from '../flow-flatten.js';
import type { FsmNodeState } from '../fsm/effects.js';
import type { FsmState, WorkflowGraph } from '../fsm/transition.js';
import { UnknownPhaseTypeError } from '../phase-handler/errors.js';
import { resolvePhaseHandler } from '../phase-handler/index.js';
import type { IBaseNodeDetail, IFsmNodeState, INodeDetail } from '../phase-handler/types.js';
import type { Phase } from '../schemas/index.js';

import { DispatchConfigError, type NodeDetailInput } from '../types.js';

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
  readonly currentPhaseId: string | null;
  readonly nodeCount: number;
  readonly completedCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  /**
   * Per-node one-line states (`nodeId`, `status`, `retryCount`) — complete
   * jump-target enumeration + progress display. Always present.
   */
  readonly nodes: ReadonlyArray<{ readonly nodeId: string; readonly status: string; readonly retryCount: number }>;
  /**
   * Delta rows — full-field states for nodes whose state changed since the
   * last dispatch (per-run signature cursor). Present on dispatch responses;
   * absent when nothing changed or on pure status queries.
   */
  readonly changed?: ReadonlyArray<ISnapshotNode>;
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
 * Find the first active node — author phases in declaration order.
 * Returns null if none.
 */
export function findActiveNode(
  phases: Record<string, FsmNodeState>,
  graph: WorkflowGraph,
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
 * Handler resolution is static by type (main/approval); the dispatch handler
 * skill is the constant atom-phase-handler (agent-side knowledge — not carried
 * in the payload). Run mode is NOT a NodeDetail field (graph_start args.mode);
 * graph-level constraints ARE carried (NodeDetail.constraints — `[graph]`-
 * prefixed dispatch facts) while project-level constraints arrive via the
 * agent-side activation session copy (pilot-loaded compiled artifact).
 * Node-scope gate: `node:` channel targets outside the run's flattened node
 * set are stripped at dispatch (shared predicate — stale-file protection).
 */
export function buildNodeDetail(input: NodeDetailInput): Effect.Effect<INodeDetail | null, DispatchConfigError> {
  return Effect.try({
    try: () => {
      const phase = input.graph.phases.find((p) => p.id === input.phaseId);
      if (!phase) return null;

      // Global-channel merge — two-scope context model: the default layer
      // (config.json `context`) merged with the graph's top-level `context:`,
      // prepended to the phase's own channels (dedup, config first). The
      // merge is deterministic per graph — no per-phase inheritance logic.
      // Phase channels get an identity-preserving fast path: when no outer
      // scope exists, mergeChannelScopes returns the phase's own array
      // reference, so the strip/dedup identity check below still
      // short-circuits.
      // Three-tier channel model: convention layer (platform-shipped exact
      // files, default-loaded) merged first, then the project default layer
      // (config.json `context`), then the graph's top-level `context:`,
      // prepended to the phase's own channels (dedup, order preserved).
      const mergedChannels = mergeChannelScopes(
        DEFAULT_CONVENTIONS,
        input.projectContext,
        input.graph.context,
        phase.channels,
      );

      // Promotion self-skip — a node never receives its own promoted stream
      // (`node:<ownId>` from the global channel): self-read is undefined and
      // would inject the node's own stale output from a previous round.
      const selfSkipped =
        mergedChannels && mergedChannels.includes(`node:${input.phaseId}`)
          ? mergedChannels.filter((c) => c !== `node:${input.phaseId}`)
          : mergedChannels;

      // Dispatch-time run-scope gate — strip cross-run `node:` targets before
      // they reach the agent (the agent can no longer see out-of-run references).
      const runNodeIds = new Set(input.graph.phases.map((p) => p.id));
      const { channels, warnings } = stripCrossRunChannels(selfSkipped, runNodeIds);
      for (const w of warnings) {
        debugLog('runtime', { event: 'cross_run_channel_stripped', nodeId: input.phaseId, warning: w });
      }

      // Base fields — common to all phase types. Graph-level constraints
      // become dispatch facts: `[graph]`-prefixed entries from the loaded
      // definition (unbypassable — machine channel); project-level rules
      // arrive agent-side (pilot activation session copy) and are merged
      // into the ## Constraints block by the dispatch handler.
      const base: IBaseNodeDetail = {
        nodeId: input.phaseId,
        type: phase.type,
        dependsOn: phase.dependsOn,
        skill: phase.skill,
        operations: phase.operations,
        constraints: (input.graph.constraints ?? []).map((c) => `[graph] ${c}`),
        retryCount: input.nodeState.retryCount,
      };

      // Adapt FsmNodeState to IFsmNodeState for handler consumption
      const handlerState: IFsmNodeState = {
        status: input.nodeState.status,
        retryCount: input.nodeState.retryCount,
        startedAt: input.nodeState.startedAt,
        completedAt: input.nodeState.completedAt,
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

/** Module-level per-run snapshot cursor — nodeId → 'status:retryCount' signature of the last dispatched snapshot. */
const snapshotCursorCache = new Map<string, Map<string, string>>();

/** Drop a run's snapshot cursor — run lifecycle cleanup (force-end/clean). */
export function dropSnapshotCursor(runId: string): void {
  snapshotCursorCache.delete(runId);
}

/** Clear all snapshot cursors — clean-all path. */
export function snapshotCursorCacheClear(): void {
  snapshotCursorCache.clear();
}

/** Build a GraphSnapshot from an FsmState. */
export function buildSnapshot(state: FsmState, graph?: WorkflowGraph): IGraphSnapshot {
  if (state.status === 'idle') {
    return assembleSnapshot(
      { runId: '', graphName: '', fsmState: 'idle', createdAt: '', updatedAt: new Date().toISOString() },
      [],
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

  // Delta snapshot — full rows only for nodes whose state changed since the
  // last dispatch (per-run signature cursor); one-line rows for everyone.
  const signatures = new Map<string, string>();
  for (const [id, ns] of Object.entries(state.phases)) {
    signatures.set(id, `${ns.status}:${ns.retryCount}`);
  }
  const prev = snapshotCursorCache.get(state.runId);
  const changed: ISnapshotNode[] = [];
  for (const [id, ns] of Object.entries(state.phases)) {
    if (!prev || prev.get(id) !== signatures.get(id)) {
      changed.push({
        nodeId: id,
        status: ns.status,
        retryCount: ns.retryCount,
        startedAt: ns.startedAt ?? null,
        completedAt: ns.completedAt ?? null,
        durationMs: ns.startedAt && ns.completedAt ? Date.parse(ns.completedAt) - Date.parse(ns.startedAt) : null,
        unactivated: unactivated.has(id) || undefined,
      });
    }
  }
  snapshotCursorCache.set(state.runId, signatures);

  const nodes: Array<{ nodeId: string; status: string; retryCount: number }> = Object.entries(state.phases).map(
    ([id, ns]) => ({ nodeId: id, status: ns.status, retryCount: ns.retryCount }),
  );

  return assembleSnapshot(
    {
      runId: state.runId,
      graphName: state.graphName,
      fsmState: state.status,
      createdAt: state.startedAt,
      updatedAt: new Date().toISOString(),
    },
    nodes,
    changed,
  );
}

/**
 * Assemble an IGraphSnapshot from run metadata + per-node states.
 * Shared by buildSnapshot() (FSM path) and query.ts buildFullSnapshot() (repository path).
 * `changed` carries full-field rows for nodes whose state changed since the
 * last dispatch (delta payload); `nodes` carries one-line rows (jump-target
 * enumeration + progress display).
 */
export function assembleSnapshot(
  meta: {
    readonly runId: string;
    readonly graphName: string;
    readonly fsmState: string;
    readonly createdAt: string;
    readonly updatedAt: string;
  },
  nodes: ReadonlyArray<{ readonly nodeId: string; readonly status: string; readonly retryCount: number }>,
  changed?: ReadonlyArray<ISnapshotNode>,
): IGraphSnapshot {
  const metrics = aggregateNodeMetrics(nodes, meta.fsmState);
  return {
    runId: meta.runId,
    graphName: meta.graphName,
    fsmState: meta.fsmState,
    currentPhaseId: metrics.currentPhaseId,
    nodeCount: metrics.nodeCount,
    completedCount: metrics.completedCount,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    nodes,
    ...(changed && changed.length > 0 ? { changed } : {}),
  };
}
