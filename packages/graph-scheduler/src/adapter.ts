/**
 * Runtime adapter (v2) — the MCP dispatch core over the embedded
 * LangGraph.js runtime.
 *
 * Maps the pull-based protocol to LangGraph:
 * - graph_start   = load + compile + invoke to first interrupt → snapshot + NodeDetail
 * - graph_advance = Command({ resume }) → next interrupt/END → snapshot + NodeDetail | null
 * - graph_jump    = Command({ resume: jump }) → backward reset + goto → snapshot + NodeDetail
 * - graph_force_end = run terminated (no per-node aborts; completed/terminated
 *   runs are a no-op) → { snapshot, node: null }
 *
 * The observable contract is preserved: pull-based loop, rework backward
 * reset (retryCount++ never zeroed, timestamps cleared), delta snapshots
 * (signature diff vs pre-dispatch state), content/accounting separation
 * (scheduler persists progress only), single-flight concurrency lock,
 * idempotent advance, crash recovery via checkpoints.
 *
 * @module
 */

import { Command } from '@langchain/langgraph';
import { Effect } from 'effect';
import type Database from 'libsql';
import type { GraphLoadMeta } from './api/graph-loader.js';
import {
  compileWorkflow,
  type CompiledGraph,
  type InterruptPayload,
  type LangGraphRuntime,
  type NodeDecision,
  type NodeStatus,
  type RunState,
} from './compile.js';
import { DEFAULT_CONVENTIONS, mergeChannelScopes, stripOutOfRunChannels } from './context/resolve-channels.js';
import { debugLog } from './debug.js';
import type { Workflow } from './graph-definition.js';
import { makeCheckpointSaver } from './lib/db/checkpoint-saver.js';
import type { GraphRepository, GraphRun } from './lib/db/repository.js';
import type { CompletionInfo, INodeDetail, InvalidStateError, NotFoundError } from './types.js';

/** Loaded graph bundle — what the runtime's graph loader produces. */
export interface GraphBundle {
  readonly tf: Workflow;
  readonly meta: GraphLoadMeta;
}

/** NodeDetail — the dispatch payload contract (v2.1: completion, no topic). */
export type NodeDetail = INodeDetail;

/** One-line snapshot row — full-field changed row. */
export interface ISnapshotNode {
  readonly nodeId: string;
  readonly status: NodeStatus;
  readonly retryCount: number;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly durationMs: number | null;
}

/**
 * Run snapshot — one builder, two delivery shapes.
 * Compact (hot path: start/advance/jump) = scalars + `progress` + `changed`,
 * no `nodes` array. Full (graph_status) = scalars + `progress` + `changed` +
 * the complete `nodes` array.
 */
export interface IGraphSnapshot {
  readonly runId: string;
  readonly graphName: string;
  readonly fsmState: string;
  readonly currentPhaseId: string | null;
  readonly nodeCount: number;
  readonly completedCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** single-line progress, e.g. `3/23 · requirement/present-candidates` */
  readonly progress: string;
  /** full one-line node rows — hot-path deliveries omit this (graph_status serves it) */
  readonly nodes?: ReadonlyArray<{ readonly nodeId: string; readonly status: NodeStatus; readonly retryCount: number }>;
  readonly changed: ReadonlyArray<ISnapshotNode>;
}

/** Dispatch envelope — every operation returns { snapshot, node }. */
export interface DispatchResult {
  readonly snapshot: IGraphSnapshot;
  readonly node: NodeDetail | null;
}

/** graph_start response — identity fields are start-specific. */
export interface StartResult extends DispatchResult {
  readonly runId: string;
  readonly resolvedFrom: 'project' | 'builtin' | 'fallback';
  readonly resolvedPath: string;
  readonly description?: string;
  readonly problems: string[];
}

/** Tagged domain error — members of the single SchedulerError surface. */
export type AdapterError = NotFoundError | InvalidStateError;

/** Adapter dependencies — the runtime layers the scheduler assembles. */
export interface AdapterDeps {
  readonly db: ReturnType<typeof Database>;
  readonly repo: GraphRepository['Type'];
  /** Loads a graph by name (fresh per dispatch — syntax v2; standalone — no subgraphs). */
  readonly loadGraph: (graphName: string) => Promise<GraphBundle>;
  /** Project-level ambient context (config.json `context`) — channel merge layer. */
  readonly projectContext: readonly string[];
}

/** Checkpoint thread config — the runId is the thread id. */
function threadConfig(runId: string): { configurable: { thread_id: string } } {
  return { configurable: { thread_id: runId } };
}

/** Invalid-state error — the v2 typed error for illegal transitions. */
function invalidState(runId: string, detail: string): AdapterError {
  return {
    _tag: 'InvalidStateError',
    runId,
    message: `Invalid state transition for run ${runId}: ${detail}`,
  };
}

/**
 * Resolve `{args.X}` template references in task text against the run's
 * start args. Unresolved references fall back to the literal (the confirm
 * node task keeps the literal when the arg is unset — same semantics as the
 * former flow-flatten helper).
 */
export function resolveArgs(template: string, args: Record<string, unknown> | null | undefined): string {
  if (args === null || args === undefined) return template;
  return template.replace(/\{args\.([A-Za-z0-9_.]+)\}/g, (_match, path: string) => {
    const value = path.split('.').reduce<unknown>((acc, key) => {
      if (acc === null || acc === undefined || typeof acc !== 'object') return undefined;
      return (acc as Record<string, unknown>)[key];
    }, args);
    return value === undefined || value === null ? `{args.${path}}` : String(value);
  });
}

/**
 * The runtime adapter — MCP-surface operations over a compiled LangGraph
 * runtime. One instance per scheduler runtime; stateless (graph definitions
 * load fresh per dispatch; execution state lives in checkpoints).
 */
export class GraphAdapter {
  private readonly deps: AdapterDeps;

  /** Per-run single-flight lock — one in-flight dispatch per run. */
  private readonly inflight = new Map<string, Promise<unknown>>();

  /** Last-reported nodeId per run — idempotent advance (completed nodeId → no-op success). */
  private readonly lastReported = new Map<string, string>();

  constructor(deps: AdapterDeps) {
    this.deps = deps;
  }

  /** Serialize a dispatch on a run — a second advance while one is in flight fails loudly. */
  private async singleFlight<T>(runId: string, op: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(runId);
    if (existing !== undefined) {
      throw invalidState(runId, 'concurrent dispatch in flight');
    }
    const task = op().finally(() => {
      this.inflight.delete(runId);
    });
    this.inflight.set(runId, task);
    return task;
  }

  /** Not-found error — also bounds the bookkeeping maps (clean-deleted runs drop their entries). */
  private notFound(runId: string): AdapterError {
    this.lastReported.delete(runId);
    this.inflight.delete(runId);
    return { _tag: 'NotFoundError', runId, message: `Run not found: ${runId}` };
  }

  /** Load + compile a graph fresh per dispatch (no in-memory graph cache). */
  private async loadCompiled(graphName: string): Promise<CompiledGraph> {
    const bundle = await this.deps.loadGraph(graphName);
    return this.compileBundle(bundle);
  }

  /** Compile from an already-loaded bundle with the run's checkpoint saver. */
  private compileBundle(bundle: GraphBundle): CompiledGraph {
    const saver = makeCheckpointSaver(this.deps.db);
    return compileWorkflow(bundle.tf, { checkpointer: saver });
  }

  /** Build the one-line nodes array from compiled node ids + state. */
  private buildNodeRows(compiled: CompiledGraph, state: RunState, activeNodeId?: string | null) {
    return compiled.nodeIds.map((nodeId) => ({
      nodeId,
      status: activeNodeId === nodeId ? 'active' : (state.nodeStatus[nodeId] ?? 'pending'),
      retryCount: state.retryCount[nodeId] ?? 0,
    }));
  }

  /** Build the run snapshot — one builder, two delivery shapes (compact | full). */
  private buildSnapshot(
    run: GraphRun,
    compiled: CompiledGraph,
    state: RunState,
    prevState?: RunState,
    activeNodeId?: string | null,
    mode: 'compact' | 'full' = 'compact',
  ): IGraphSnapshot {
    const nodes = this.buildNodeRows(compiled, state, activeNodeId);
    let completedCount = 0;
    let currentPhaseId: string | null = null;
    for (const n of nodes) {
      if (n.status === 'done') completedCount++;
      if (n.status === 'active' && run.fsmState === 'running' && currentPhaseId === null) currentPhaseId = n.nodeId;
    }

    const changed: ISnapshotNode[] = [];
    for (const n of nodes) {
      const ts = state.nodeTimestamps[n.nodeId] ?? {};
      const isActiveDisplay = activeNodeId === n.nodeId;
      const signature = `${n.status}:${n.retryCount}:${ts.startedAt ?? ''}:${ts.completedAt ?? ''}`;
      const prevStatus = prevState?.nodeStatus?.[n.nodeId];
      const prevTs = prevState?.nodeTimestamps[n.nodeId];
      const prevSignature =
        prevStatus === undefined
          ? undefined
          : `${prevStatus}:${prevState?.retryCount[n.nodeId] ?? 0}:${prevTs?.startedAt ?? ''}:${prevTs?.completedAt ?? ''}`;
      if (isActiveDisplay || prevSignature === undefined || prevSignature !== signature) {
        changed.push({
          nodeId: n.nodeId,
          status: n.status,
          retryCount: n.retryCount,
          startedAt: ts.startedAt ?? null,
          completedAt: ts.completedAt ?? null,
          durationMs: ts.startedAt && ts.completedAt ? Date.parse(ts.completedAt) - Date.parse(ts.startedAt) : null,
        });
      }
    }
    return {
      runId: run.runId,
      graphName: run.graphName,
      fsmState: run.fsmState,
      currentPhaseId,
      nodeCount: nodes.length,
      completedCount,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      progress: `${completedCount}/${nodes.length}${currentPhaseId !== null ? ` · ${currentPhaseId}` : ''}`,
      ...(mode === 'full' ? { nodes } : {}),
      changed,
    };
  }

  /** Build a NodeDetail from an interrupt payload + run state + compiled metadata. */
  private buildNodeDetail(
    compiled: CompiledGraph,
    payload: InterruptPayload,
    state: RunState,
    args?: Record<string, unknown> | null,
  ): NodeDetail {
    const mergedChannels = mergeChannelScopes(
      DEFAULT_CONVENTIONS,
      this.deps.projectContext,
      compiled.meta.context,
      payload.channels ?? [],
    );
    const runNodeIds = new Set(compiled.nodeIds);
    const { channels } = stripOutOfRunChannels(mergedChannels, runNodeIds);
    const task = payload.task !== undefined ? resolveArgs(payload.task, args) : undefined;
    return {
      nodeId: payload.nodeId,
      type: payload.type,
      dependsOn: payload.dependsOn,
      skill: payload.skill,
      agent: payload.agent,
      operations: payload.operations,
      task,
      template_args: payload.template_args,
      completion: compiled.completion.get(payload.nodeId) ?? { default: 'continue' },
      channels,
      constraints: compiled.meta.constraints.map((c) => `[graph] ${c}`),
      retryCount: state.retryCount[payload.nodeId] ?? 0,
    };
  }

  /** Extract the interrupted node payload from a LangGraph state snapshot. */
  private interruptedPayload(state: {
    tasks?: Array<{ interrupts?: Array<{ value?: InterruptPayload }> }>;
  }): InterruptPayload | null {
    const task = state.tasks?.[0];
    const interrupt = task?.interrupts?.[0];
    return interrupt?.value ?? null;
  }

  /** Start a run — create run record + invoke to first interrupt. */
  async graphStart(graphName: string, args?: Record<string, unknown>): Promise<StartResult> {
    // Single-flight keyed on graphName (no runId exists pre-start): serializes
    // concurrent starts of the same graph — parallel same-graph starts fail
    // fast with 'concurrent dispatch in flight' rather than double-invoking.
    return this.singleFlight(graphName, async () => {
      const bundle = await this.deps.loadGraph(graphName);
      const compiled = this.compileBundle(bundle);
      const runId = crypto.randomUUID();

      await Effect.runPromise(this.deps.repo.createRun(runId, graphName, args));
      await Effect.runPromise(this.deps.repo.updateRunStatus(runId, 'running'));

      const graph = compiled.graph;
      const cfg = threadConfig(runId);
      await graph.invoke({}, { ...cfg, recursionLimit: 1000 });

      const st = await graph.getState(cfg);
      const state = st.values as RunState;
      const run = await Effect.runPromise(this.deps.repo.getRun(runId));
      const payload = this.interruptedPayload(st);
      const snapshot = this.buildSnapshot(run, compiled, state, undefined, payload?.nodeId ?? null);
      const node = payload ? this.buildNodeDetail(compiled, payload, state, run.args) : null;

      debugLog('runtime', { event: 'run_started', runId, graphName });
      return {
        runId,
        node,
        snapshot,
        resolvedFrom: bundle.meta.resolvedFrom,
        resolvedPath: bundle.meta.resolvedPath,
        description: bundle.meta.description,
        problems: bundle.meta.problems ?? [],
      };
    });
  }

  /** Guard — the run must exist and be active (not terminated/completed). */
  private async loadActiveRun(runId: string) {
    const run = await Effect.runPromise(this.deps.repo.getRun(runId)).catch(() => {
      throw this.notFound(runId);
    });
    if (run.fsmState === 'terminated') throw invalidState(runId, `run is terminated`);
    if (run.fsmState === 'completed') throw invalidState(runId, `run is completed`);
    return run;
  }

  /** Target resolution for the operator jump — jump targets are plain
   *  compiled node ids; unresolvable = loud fail. (Branch targets are
   *  removed — branch semantics are the `template: router` sibling run;
   *  loop/rework semantics are flow self-edges, graph-flow capability.) */
  private resolveTarget(compiled: CompiledGraph, target: string | undefined, runId: string): string | undefined {
    if (target === undefined) return undefined;
    if (!compiled.nodeIds.includes(target)) {
      throw invalidState(runId, `target '${target}' not in graph`);
    }
    return target;
  }

  /** Idempotency — a re-reported completed nodeId without `end` is a no-op success. */
  private isIdempotentReport(
    runId: string,
    nodeId: string,
    activeNodeId: string | null,
    preState: RunState,
    end: boolean | undefined,
  ): boolean {
    return (
      end !== true &&
      nodeId !== activeNodeId &&
      (this.lastReported.get(runId) === nodeId || preState.nodeStatus[nodeId] === 'done')
    );
  }

  /** nodeId validation — the report must name the active node (never silently resume another interrupt). */
  private assertActiveNode(runId: string, nodeId: string, activeNodeId: string | null): void {
    if (nodeId !== activeNodeId) {
      throw invalidState(runId, `node '${nodeId}' is not the active node (active: ${activeNodeId ?? 'none'})`);
    }
  }

  /** Direct-end — intentional early end: reported node done + run completed, no graph resume. */
  private async applyDirectEnd(
    runId: string,
    nodeId: string,
    graph: CompiledGraph['graph'],
    cfg: ReturnType<typeof threadConfig>,
    compiled: CompiledGraph,
    preState: RunState,
  ): Promise<DispatchResult> {
    await graph.updateState(cfg, {
      nodeStatus: { [nodeId]: 'done' },
      nodeTimestamps: { [nodeId]: { completedAt: new Date().toISOString() } },
    } as Partial<RunState>);
    await Effect.runPromise(this.deps.repo.updateRunStatus(runId, 'completed'));
    this.lastReported.delete(runId);
    const run2 = await Effect.runPromise(this.deps.repo.getRun(runId));
    const st2 = await graph.getState(cfg);
    return { snapshot: this.buildSnapshot(run2, compiled, st2.values as RunState, preState, null), node: null };
  }

  /** Natural drain — no interrupted task and no ready node → run completed. */
  private async drainIfComplete(
    runId: string,
    compiled: CompiledGraph,
    st: Awaited<ReturnType<LangGraphRuntime['getState']>>,
    preState: RunState,
  ): Promise<DispatchResult | null> {
    const payload = this.interruptedPayload(st);
    if (payload === null && (st.next?.length ?? 0) === 0) {
      const state = st.values as RunState;
      await Effect.runPromise(this.deps.repo.updateRunStatus(runId, 'completed'));
      this.lastReported.delete(runId);
      const run2 = await Effect.runPromise(this.deps.repo.getRun(runId));
      return { snapshot: this.buildSnapshot(run2, compiled, state, preState, null), node: null };
    }
    return null;
  }

  /** Advance a run — resume with the agent's decision, return next node or null.
   *
   *  Dual channel (graph-flow capability): `condition` = normal advance — the
   *  reported flow-defined condition value, resolved via the transition table
   *  (no match → loud error — missed-condition guard); `jump` = forced
   *  rework — backward reset, target restricted to the node's topological
   *  ancestors ∪ `__handoff` (forward jumps rejected loudly). `end: true` =
   *  direct-end adapter completion. No condition/jump/end = sequence default. */
  async graphAdvance(
    runId: string,
    nodeId: string,
    end?: boolean,
    condition?: string,
    jump?: string,
  ): Promise<DispatchResult> {
    return this.singleFlight(runId, async () => {
      const run = await this.loadActiveRun(runId);

      const compiled = await this.loadCompiled(run.graphName);
      const graph = compiled.graph;
      const cfg = threadConfig(runId);

      // Pre-dispatch state — the delta diff base.
      const pre = await graph.getState(cfg);
      const preState = pre.values as RunState;

      // Idempotency — a re-reported completed nodeId without `end` is a
      // no-op success, recognized from persisted run state (restart-safe).
      // The report must NOT name the current interrupt: a node that
      // re-dispatched after a rework (interrupt + persisted 'done') is a
      // fresh completion of its next execution, never a duplicate re-report.
      // (terminated-run re-reports never reach this arm: force-end marks the
      // run terminated, and advance rejects terminated runs above.)
      const activeNodeId = this.interruptedPayload(pre)?.nodeId ?? null;
      if (this.isIdempotentReport(runId, nodeId, activeNodeId, preState, end)) {
        const payload = this.interruptedPayload(pre);
        return {
          snapshot: this.buildSnapshot(run, compiled, preState, preState, payload?.nodeId ?? null),
          node: payload ? this.buildNodeDetail(compiled, payload, preState, run.args) : null,
        };
      }

      // nodeId validation — the report must name the active node; wrong-node
      // reports fail loudly (never silently resume the current interrupt).
      this.assertActiveNode(runId, nodeId, activeNodeId);
      this.lastReported.set(runId, nodeId);

      // Direct-end — an intentional early end (direct_end report): the reported
      // node is marked done and the run completes (`completed`) WITHOUT
      // resuming the graph's continuation — the pending interrupt becomes
      // inert (advance/jump reject completed runs). Unfinished nodes stay
      // pending. Adapter-level completion — never a force-end, never
      // `terminated` (an intentional end is not an abnormal termination).
      if (end) {
        return this.applyDirectEnd(runId, nodeId, graph, cfg, compiled, preState);
      }

      // Dual-channel decision (graph-flow capability): `jump` = backward
      // reset (target ⊆ ancestors ∪ `__handoff` — forward rejected loudly,
      // the structure-integrity guard); `condition` = transition-table
      // lookup (no match → loud error — the missed-condition guard); none =
      // sequence default. Loop/branch semantics: loops are flow self-edges
      // (condition-matched re-entry); branch selection is the router sibling
      // run — no forward target routing from the decision.
      let decision: NodeDecision;
      if (jump !== undefined) {
        const allowed = new Set(compiled.ancestors.get(nodeId) ?? []);
        allowed.add('__handoff');
        if (!compiled.nodeIds.includes(jump) || !allowed.has(jump)) {
          throw invalidState(
            runId,
            `jump target '${jump}' is not a backward target of node '${nodeId}' (targets are restricted to topological ancestors ∪ '__handoff')`,
          );
        }
        decision = { action: 'jump', target: jump };
      } else if (condition !== undefined) {
        const target = compiled.flowTable.get(nodeId)?.conditions.get(condition);
        if (target === undefined) {
          throw invalidState(
            runId,
            `condition '${condition}' matches no outgoing flow edge of node '${nodeId}' (missed-condition guard)`,
          );
        }
        decision = { action: 'continue', target };
      } else {
        decision = { action: 'continue' };
      }

      await graph.invoke(new Command({ resume: decision }), { ...cfg, recursionLimit: 1000 });
      const st = await graph.getState(cfg);
      const state = st.values as RunState;

      // Natural drain — no interrupted task and no ready node.
      const drained = await this.drainIfComplete(runId, compiled, st, preState);
      if (drained !== null) return drained;

      const payload = this.interruptedPayload(st);
      const run2 = await Effect.runPromise(this.deps.repo.getRun(runId));
      return {
        snapshot: this.buildSnapshot(run2, compiled, state, preState, payload?.nodeId ?? null),
        node: payload ? this.buildNodeDetail(compiled, payload, state, run.args) : null,
      };
    });
  }

  /** Jump to a target phase — backward reset + goto; returns the next node. */
  async graphJump(runId: string, targetPhaseId: string): Promise<DispatchResult> {
    return this.singleFlight(runId, async () => {
      const run = await this.loadActiveRun(runId);
      const compiled = await this.loadCompiled(run.graphName);
      const resolvedTarget = this.resolveTarget(compiled, targetPhaseId, runId);
      const graph = compiled.graph;
      const cfg = threadConfig(runId);
      const pre = await graph.getState(cfg);
      const preState = pre.values as RunState;

      // Jump = resume the current interrupt with a jump decision → the node
      // fn applies the backward reset + goto.
      await graph.invoke(new Command({ resume: { action: 'jump', target: targetPhaseId } as NodeDecision }), {
        ...cfg,
        recursionLimit: 1000,
      });
      const st = await graph.getState(cfg);
      const state = st.values as RunState;
      const payload = this.interruptedPayload(st);
      const run2 = await Effect.runPromise(this.deps.repo.getRun(runId));
      return {
        snapshot: this.buildSnapshot(run2, compiled, state, preState, payload?.nodeId ?? null),
        node: payload ? this.buildNodeDetail(compiled, payload, state, run.args) : null,
      };
    });
  }

  /** Force-end a run — run terminated, irreversible. Guards: completed/terminated runs are a no-op. */
  async graphForceEnd(runId: string): Promise<DispatchResult> {
    return this.singleFlight(runId, async () => {
      const run = await Effect.runPromise(this.deps.repo.getRun(runId)).catch(() => {
        throw this.notFound(runId);
      });
      const compiled = await this.loadCompiled(run.graphName);
      const graph = compiled.graph;
      const cfg = threadConfig(runId);
      const st = await graph.getState(cfg);
      const state = st.values as RunState;

      // Guard parity with advance/jump — a completed or terminated run is
      // untouched (no-op); the snapshot is returned unchanged.
      if (run.fsmState === 'completed' || run.fsmState === 'terminated') {
        return { snapshot: this.buildSnapshot(run, compiled, state, state, null), node: null };
      }

      // Terminate — run-level flag only. Node statuses stay untouched: nothing
      // consumes per-node status after termination (jump/advance reject
      // terminated runs), so no per-node aborted annotations are written.
      await graph.updateState(cfg, { terminated: true } as Partial<RunState>);
      await Effect.runPromise(this.deps.repo.updateRunStatus(runId, 'terminated'));
      this.lastReported.delete(runId);
      const run2 = await Effect.runPromise(this.deps.repo.getRun(runId));
      const st2 = await graph.getState(cfg);
      return { snapshot: this.buildSnapshot(run2, compiled, st2.values as RunState, state, null), node: null };
    });
  }

  /** Query run status — full snapshot, no node content. */
  async graphStatus(runId: string): Promise<IGraphSnapshot> {
    const run = await Effect.runPromise(this.deps.repo.getRun(runId)).catch(() => {
      throw this.notFound(runId);
    });
    const compiled = await this.loadCompiled(run.graphName);
    const graph = compiled.graph;
    const st = await graph.getState(threadConfig(runId));
    const state = st.values as RunState;
    const payload = this.interruptedPayload(st);
    return this.buildSnapshot(run, compiled, state, undefined, payload?.nodeId ?? null, 'full');
  }
}
