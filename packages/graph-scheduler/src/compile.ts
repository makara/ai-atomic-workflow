/**
 * Graph compiler (v2) — compiles a validated workflow YAML into an
 * embedded LangGraph.js StateGraph.
 *
 * Syntax v2 = LangGraph construct transliteration:
 * - phase id → node id; `dependsOn` → the dependency-derived successor set
 *   (AND convergence = the only join mode), routed by each node fn's
 *   explicit `Command({goto})` — no static inter-node edges exist (entry
 *   wiring only), so a resumed node's goto is the EXCLUSIVE next-activation
 *   set (unselected branches stay pending, jumps never leak)
 * - flat assembly (subgraph composition deleted — graph-subgraph-route-unify):
 *   every phase compiles to its own id; nested execution is the frontend-
 *   launched `template: router` sibling run, never a compile-time assembly
 *   (the `loop` template is removed — loop/rework = flow self-edges)
 * - every node interrupts with its payload (task/skill/agent/channels/...);
 *   the resume value = the agent's decision; continue carries the
 *   condition-matched flow target (adapter-resolved via the transition
 *   table — no branchTo, no retry action); a self-edge re-entry increments
 *   the re-entered node's retryCount (bounded-loop counter); the operator
 *   `graph_jump` / advance `jump` channel resume (`{ action: 'jump',
 *   target }`) returns `Command({ goto: target })` with the backward-reset
 *   update (target + downstream terminal nodes → pending, retryCount++ each,
 *   never zeroed, upstream kept)
 * - direct-end = adapter-level completion (reported node done + run
 *   `completed`, graph not resumed — the pending interrupt becomes inert);
 *   force-end = adapter-level run termination (terminated flag + fsm_state) —
 *   node functions handle continue/jump decisions only
 *
 * The observable contract (pull-based start → advance → null, jump reset,
 * retryCount semantics, delta snapshots) is preserved by the adapter over
 * this graph (see src/adapter.ts).
 *
 * @module
 */

import { Annotation, Command, END, interrupt, START, StateGraph } from '@langchain/langgraph';
import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import { buildTransitionTable, parseFlow, type NodeTransitions, type TransitionTable } from './flow.js';
import type { Workflow } from './graph-definition.js';
import { handoffTaskTemplate, TASK_TEMPLATES } from './task-templates/index.js';
import type { CompletionInfo } from './types.js';

/** Node execution status — the v2 status vocabulary (no skip state). */
export type NodeStatus = 'pending' | 'active' | 'done';

/** Per-node timestamps — duration derived at snapshot time, never persisted as a column. */
export interface NodeTimestamps {
  startedAt?: string;
  completedAt?: string;
}

/** Run execution state — LangGraph channel values. */
export interface RunState {
  /** nodeId → status; merged by replace (reset writes pending over done). */
  nodeStatus: Record<string, NodeStatus>;
  /** nodeId → jump re-execution count; incremented at jump reset, never zeroed. */
  retryCount: Record<string, number>;
  /** nodeId → startedAt/completedAt (ISO 8601); duration derived at snapshot time. */
  nodeTimestamps: Record<string, NodeTimestamps>;
  /** force-end marker — set by the adapter's force-end path, never by nodes;
   *  direct-end (advance end) completes the run without setting it. */
  terminated?: boolean;
}

const RunStateAnnotation = Annotation.Root({
  nodeStatus: Annotation<Record<string, NodeStatus>>({
    reducer: (a, b) => ({ ...(a ?? {}), ...(b ?? {}) }),
    default: () => ({}),
  }),
  retryCount: Annotation<Record<string, number>>({
    reducer: (a, b) => {
      const merged = { ...(a ?? {}) };
      for (const [k, v] of Object.entries(b ?? {})) merged[k] = (merged[k] ?? 0) + v;
      return merged;
    },
    default: () => ({}),
  }),
  nodeTimestamps: Annotation<Record<string, NodeTimestamps>>({
    reducer: (a, b) => {
      const merged = { ...(a ?? {}) };
      for (const [k, v] of Object.entries(b ?? {})) {
        merged[k] = { ...(merged[k] ?? {}), ...(v ?? {}) };
      }
      return merged;
    },
    default: () => ({}),
  }),
  terminated: Annotation<boolean | undefined>({
    reducer: (a, b) => (b === undefined ? a : b),
    default: () => undefined,
  }),
});

/** Decision output of an executed node — the resume payload contract. */
export interface NodeDecision {
  /** continue = condition-matched advance (target = the resolved flow-edge
   *  target, adapter-validated) or plain continuation (no target — sequence
   *  default); jump = backward reset with target (operator graph_jump or
   *  the advance `jump` channel) */
  action?: 'continue' | 'jump';
  /** jump target — a node id (backward reset); continue target — the
   *  condition-matched flow-edge target (adapter-resolved, never authored) */
  target?: string;
}

/** Interrupt payload — everything the adapter needs to build a NodeDetail. */
export interface InterruptPayload {
  nodeId: string;
  type: 'main';
  task?: string;
  skill?: string;
  /** agent hints — peer-level advisory sub-agent type preferences (main phases) */
  agent?: string[];
  operations?: string[];
  channels?: string[];
  dependsOn?: string[];
  /** template parameters — machine-declared `template_args` applied to the
   *  template task text at load time; carried on the dispatch payload so the
   *  frontend assembles machine-declared card options (router selection
   *  options = `template_args.paths` — never parsed from task text). The
   *  scope-entry template's `terminal` (per-graph terminal name) and the
   *  router template's `questions` (caller-declared extra judgment entries
   *  `[{ prompt, condition }]` — the node has additional judgment and
   *  corresponding flow edges; prompt content and condition vocabulary come
   *  from the calling graph, never template semantics, accept-node
   *  consolidation) ride the same args surface; the framework-chain `node`
   *  discriminator does not exist (one template one file). The loop
   *  template_args shape does not exist (loops are flow self-edges). */
  template_args?: { paths?: string[]; terminal?: string; questions?: { prompt: string; condition: string }[] };
}

/** Flat node metadata — internal registration payload (addNode + node fn). */
interface CompiledNodeMeta {
  /** node id — the phase id (flat; no namespacing — composition is deleted) */
  nodeId: string;
  /** phase data carried in the interrupt payload */
  payload: InterruptPayload;
}

/** The LangGraph runtime surface the adapter drives — structural, not the concrete compiled type. */
export interface LangGraphRuntime {
  invoke(input: unknown, config: Record<string, unknown>): Promise<unknown>;
  getState(config: Record<string, unknown>): Promise<{
    values: RunState;
    next?: string[];
    tasks?: Array<{ interrupts?: Array<{ value?: InterruptPayload }> }>;
  }>;
  updateState(
    config: Record<string, unknown>,
    values: Partial<RunState>,
    options?: string | Record<string, unknown>,
  ): Promise<unknown>;
}

/** A compiled graph — the LangGraph state machine + its dispatch surface. */
export interface CompiledGraph {
  /** the compiled LangGraph graph, checkpointer-ready */
  graph: LangGraphRuntime;
  /** all node ids — jump-target enumeration */
  nodeIds: string[];
  /** downstream closure per node id — jump reset scope computation */
  downstream: ReadonlyMap<string, ReadonlySet<string>>;
  /**
   * flow transition table — node id → per-node transitions (condition →
   * target map + sequence default). Nodes without flow edges have no entry
   * (their default is the dependsOn-derived successor set).
   */
  flowTable: TransitionTable;
  /**
   * topological-ancestor closure per node id (from the dependsOn DAG) plus
   * the synthesized `__handoff` — the graph-internal jump-target guard.
   */
  ancestors: ReadonlyMap<string, ReadonlySet<string>>;
  /** node id → machine-declared completion options (default/choices/direct_end) */
  completion: ReadonlyMap<string, CompletionInfo>;
  /** graph metadata for dispatch assembly */
  meta: {
    name: string;
    description?: string;
    constraints: string[];
    context: string[];
  };
}

/** Compile a workflow into a LangGraph StateGraph (flat assembly — subgraph
 *  composition is deleted; nested execution is the frontend-launched router
 *  sibling run, so no child loading happens at compile time). */
export function compileWorkflow(tf: Workflow, options?: { checkpointer?: unknown }): CompiledGraph {
  const nodeMeta: CompiledNodeMeta[] = [];
  const nodeIds: string[] = [];
  const successors = new Map<string, Set<string>>();
  const predecessors = new Map<string, Set<string>>();
  const downstream = new Map<string, Set<string>>();

  // Phase 1 — collect structure (ids, deps). No graph registration yet:
  // Command({goto}) targets must be declared as `ends` on every node, so the
  // full id set must be known before registration.
  const completionMap = new Map<string, CompletionInfo>();
  // Completion derivation (graph-flow capability): choices come from the
  // node's labeled outgoing flow edges (the flow-defined condition
  // vocabulary — machine-declared from the transition table, never parsed
  // from task-text prose; the backtick channel is retired — the engine
  // reads zero prose, E12). The `direct end:` token is the only task-text
  // machine declaration (explicit declared token, kept). Flow parsing runs
  // after node registration below, so the condition-label choices are
  // appended once the transition table exists.
  for (const phase of tf.phases) {
    const id = phase.id;
    const directEndMatch = (phase.task ?? '').match(/direct end:\s*([^\n]+)/i);
    if (directEndMatch !== null) {
      completionMap.set(id, {
        default: 'continue',
        direct_end: directEndMatch[1].trim(),
      });
    }
  }

  // Pass — plain phases (no composition): template nodes get task text from
  // the builtin template registry (schema rejects an explicit `task` on a
  // template phase, so the template output is the single source).
  for (const phase of tf.phases) {
    const id = phase.id;
    const deps = [...(phase.dependsOn ?? [])];
    nodeMeta.push({
      nodeId: id,
      payload: {
        nodeId: id,
        type: 'main',
        task: phase.template !== undefined ? TASK_TEMPLATES[phase.template](phase.template_args) : phase.task,
        skill: phase.skill,
        agent: phase.agent,
        operations: phase.operations,
        channels: phase.channels,
        dependsOn: deps.length > 0 ? deps : undefined,
        template_args: phase.template_args,
      },
    });
    nodeIds.push(id);
    predecessors.set(id, new Set(deps));
    for (const dep of deps) {
      if (!successors.has(dep)) successors.set(dep, new Set());
      successors.get(dep)!.add(id);
    }
  }

  // Handoff synthesis — every graph gains a single root `__handoff` terminal
  // producing the unified two-element result report (composition is deleted,
  // so no per-level `<composing>/__handoff` exists). Appended post-schema
  // (plain main node), never `$`-prefixed, guard: a source-declared
  // `__handoff` phase id is never duplicated. The node depends on the graph's
  // terminals and declares every member's `node:` output stream as channels.
  const handoffId = '__handoff';
  if (!nodeIds.includes(handoffId)) {
    const terminals = nodeIds.filter((n) => (successors.get(n)?.size ?? 0) === 0);
    const memberChannels = nodeIds.map((n) => `node:${n}`);
    nodeMeta.push({
      nodeId: handoffId,
      payload: {
        nodeId: handoffId,
        type: 'main',
        task: handoffTaskTemplate(),
        operations: [],
        channels: memberChannels,
        dependsOn: terminals.length > 0 ? terminals : undefined,
      },
    });
    nodeIds.push(handoffId);
    predecessors.set(handoffId, new Set(terminals));
    for (const t of terminals) {
      if (!successors.has(t)) successors.set(t, new Set());
      successors.get(t)!.add(handoffId);
    }
  }

  // Downstream closure — jump reset scope (target + downstream terminals).
  const visit = (id: string, acc: Set<string>): void => {
    for (const s of successors.get(id) ?? []) {
      if (acc.has(s)) continue;
      acc.add(s);
      visit(s, acc);
    }
  };
  for (const id of nodeIds) {
    const acc = new Set<string>();
    visit(id, acc);
    downstream.set(id, acc);
  }

  // Flow transitions — parse the top-level `flow` edges (mermaid subset),
  // validate endpoints against the phase id set (loud failure naming the
  // edge), and build the per-node transition table. The table is the
  // conditional-routing authority: labeled edges = condition → target map,
  // unlabeled edges = sequence default; a node without flow edges keeps its
  // dependsOn-derived successor set as the default. Self-edges are inline
  // bounded loops (loop/rework semantics — never a subgraph mechanism).
  const flowTable = new Map<string, NodeTransitions>();
  if (tf.flow !== undefined) {
    const edges = parseFlow(tf.flow);
    for (const edge of edges) {
      if (!nodeIds.includes(edge.source)) {
        throw new Error(
          `flow edge '${edge.source} -->${edge.label !== undefined ? `|${edge.label}|` : ''} ${edge.target}' references undeclared source phase '${edge.source}'`,
        );
      }
      if (!nodeIds.includes(edge.target)) {
        throw new Error(
          `flow edge '${edge.source} -->${edge.label !== undefined ? `|${edge.label}|` : ''} ${edge.target}' references undeclared target phase '${edge.target}'`,
        );
      }
    }
    const table = buildTransitionTable(edges);
    for (const [id, entry] of table) flowTable.set(id, entry);
  }

  // Completion choices from the transition table — the flow condition
  // vocabulary of the node's labeled outgoing edges (machine-declared;
  // a node with no labeled edges carries no choices — sequence default).
  for (const [nodeId, entry] of flowTable) {
    const labels = [...entry.conditions.keys()];
    if (labels.length === 0) continue;
    const existing = completionMap.get(nodeId);
    completionMap.set(nodeId, {
      default: 'continue',
      ...(existing !== undefined && existing.direct_end !== undefined ? { direct_end: existing.direct_end } : {}),
      choices: labels,
    });
  }

  // Topological-ancestor closure — the graph-internal jump-target guard
  // (target ⊆ ancestors ∪ `__handoff`; forward jumps are structurally
  // impossible). Computed from the dependsOn DAG (predecessors).
  const ancestors = new Map<string, Set<string>>();
  const visitAncestors = (id: string, acc: Set<string>): void => {
    for (const p of predecessors.get(id) ?? []) {
      if (acc.has(p)) continue;
      acc.add(p);
      visitAncestors(p, acc);
    }
  };
  for (const id of nodeIds) {
    const acc = new Set<string>();
    visitAncestors(id, acc);
    ancestors.set(id, acc);
  }

  // Phase 2 — register nodes (each with `ends` = every node id, so Command
  // goto targets are declared). No static edges between nodes: EVERY
  // continuation travels through the node fn's explicit `Command({goto})`
  // (continue → the dependency-derived successor set or END; operator jump →
  // the target). A resumed node's goto is therefore EXCLUSIVE — unselected
  // branch nodes stay pending and jump resets never leak static successors
  // (LangGraph resume adds goto targets to static edges; with no static edges
  // the goto is the single routing authority).
  const builder = new StateGraph(RunStateAnnotation);
  for (const meta of nodeMeta) {
    builder.addNode(meta.nodeId, makeNodeFn(meta, successors, downstream, flowTable), { ends: nodeIds });
  }
  // Entry edges only — initial invoke wiring (never resume): every node with
  // no predecessor activates at START (no composing-phase entries exist —
  // composition is deleted).
  for (const id of nodeIds) {
    if ((predecessors.get(id)?.size ?? 0) === 0) {
      builder.addEdge(START, id as never);
    }
  }

  return {
    graph: builder.compile(
      options?.checkpointer !== undefined ? { checkpointer: options.checkpointer as BaseCheckpointSaver } : undefined,
    ) as unknown as LangGraphRuntime,
    nodeIds,
    downstream,
    flowTable,
    ancestors,
    completion: completionMap,
    meta: {
      name: tf.name,
      description: tf.description,
      constraints: [...(tf.constraints ?? [])],
      context: tf.context ?? [],
    },
  };
}

/**
 * Node function factory — every compiled node:
 * 1. interrupts with its payload (pull-based protocol — the agent executes
 *    the task and resumes with a decision)
 * 2. routes EVERY continuation via explicit `Command({goto})` — continue
 *    with a condition-resolved target (adapter-validated flow-edge target),
 *    the sequence default (the node's flow-table default — unlabeled edges
 *    — or the dependency-derived successor set when the node has no flow
 *    edges; END when empty), or jump → the reset target. No static edges
 *    exist between nodes, so a resumed node's goto is the EXCLUSIVE
 *    next-activation set: unselected branch targets stay pending, jump
 *    resets never leak static successors.
 */
function makeNodeFn(
  meta: CompiledNodeMeta,
  successors: ReadonlyMap<string, ReadonlySet<string>>,
  downstream: ReadonlyMap<string, ReadonlySet<string>>,
  flowTable: TransitionTable,
): (state: RunState) => Promise<unknown> {
  return async (state: RunState): Promise<unknown> => {
    const decision = interrupt(meta.payload) as unknown as NodeDecision | undefined;
    // Operator/graph-internal jump — the backward reset (graph_jump resume
    // or the advance `jump` channel). Rework/loop/branch semantics: the
    // jump reset is the backward rework; loops are flow self-edges
    // (condition-matched re-entry); branch selection is the router sibling
    // run — no forward branch activation from the decision.
    if (decision?.action === 'jump' && decision.target !== undefined) {
      return new Command({
        goto: decision.target,
        update: buildReworkUpdate(decision.target, state, meta.nodeId, downstream.get(decision.target)),
      });
    }
    // Continue — explicit goto. A condition-matched advance carries the
    // resolved target (adapter validates + resolves via the transition
    // table — the single authority); otherwise the sequence default: the
    // node's flow-table default (unlabeled edges), falling back to the
    // direct dependsOn successors when the node declares no unlabeled
    // default (an empty flow default SHALL route the graph's completion
    // through __handoff — the terminal-successor rewiring — not END).
    // END only when the effective default set is empty.
    const trans = flowTable.get(meta.nodeId);
    const next =
      decision?.target !== undefined
        ? [decision.target]
        : trans !== undefined && trans.default.length > 0
          ? trans.default
          : [...(successors.get(meta.nodeId) ?? [])];
    const update: Record<string, unknown> = {
      nodeStatus: { [meta.nodeId]: 'done' },
      nodeTimestamps: { [meta.nodeId]: { completedAt: new Date().toISOString() } },
    };
    // Flow re-entry — each pass through a re-entry edge SHALL increment the
    // re-entered node's retryCount (never zeroed): the bounded-loop counter
    // the agent-side bound check observes (constraint prose + retryCount).
    // Re-entry = the matched target equals the reported node (true
    // self-edge, e.g. `retry -->|again| retry`) or the target is already
    // completed (a loop re-entry edge, e.g. `review -->|fail| execute`
    // re-entering the completed round body head) — a forward activation of
    // a pending target never increments. The retryCount reducer ADDS
    // per-node values, so the partial update carries the increment (1),
    // never the absolute count.
    const reentryTarget = decision?.target;
    if (
      reentryTarget !== undefined &&
      (reentryTarget === meta.nodeId || (state.nodeStatus[reentryTarget] ?? '') === 'done')
    ) {
      update.retryCount = { [reentryTarget]: 1 };
    }
    return new Command({
      goto: next.length > 0 ? next : END,
      update,
    });
  };
}

/**
 * Compute the backward-reset state update for a jump target: target +
 * downstream terminal nodes → pending, retryCount++ each, upstream kept.
 * Used by the adapter's graph_jump path (operator control — the ONLY
 * backward reset; node decisions never trigger it).
 */
export function buildReworkUpdate(
  target: string,
  state: RunState,
  completedNodeId: string | undefined,
  targetDownstream: ReadonlySet<string> | undefined,
): Pick<RunState, 'nodeStatus' | 'retryCount' | 'nodeTimestamps'> {
  const nodeStatus: Record<string, NodeStatus> = completedNodeId ? { [completedNodeId]: 'done' } : {};
  const retryCount: Record<string, number> = {};
  const nodeTimestamps: Record<string, NodeTimestamps> = {};
  const resetScope = new Set<string>([target]);
  if (targetDownstream) {
    // downstream TERMINAL nodes only — nodes already terminal (done);
    // pending/active members are untouched (they have not run yet).
    for (const id of targetDownstream) {
      if (state.nodeStatus[id] === 'done') resetScope.add(id);
    }
  }
  for (const id of resetScope) {
    nodeStatus[id] = 'pending';
    retryCount[id] = 1; // ++ each — reducer adds; never zeroed
    // Explicit undefined values — the nodeTimestamps reducer merges per-node
    // objects ({...old, ...new}), so an empty object would merge as a no-op
    // and stale timestamps would survive the reset. Spreading undefined
    // overwrites the old values (JSON persistence drops the keys → null on
    // reload, matching the in-memory cleared snapshot).
    nodeTimestamps[id] = { startedAt: undefined, completedAt: undefined };
  }
  return { nodeStatus, retryCount, nodeTimestamps };
}

/** Export the annotation for the adapter's state typing. */
export type RunStateAnnotation = typeof RunStateAnnotation;
