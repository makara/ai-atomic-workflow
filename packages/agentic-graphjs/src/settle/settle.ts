/**
 * The settle face — one report, folded and stored.
 *
 * A report lands through five steps: the recorded key is checked against the
 * node's declared set, produced through the judge when it is missing, the
 * frontier routes on it structurally, the writes go to the log, and — once
 * every node of the super-step has settled — one checkpoint is put. The
 * checkpointer assigns ids and timestamps, so the same prefix replays to the
 * same bytes.
 *
 * @module
 */

import type { ChannelWrite } from '../contract/channels.js';
import type { Checkpoint, ThreadConfig } from '../contract/checkpoint.js';
import type { ArtifactRef } from '../contract/log.js';
import type { CheckpointSaver } from '../contract/records.js';
import type { ReportInput } from '../contract/report.js';
import { defineOwn, ownValue } from '../fold/reducers.js';
import type { CompiledGraph, Json, NodeSpec } from '../ir.js';
import { type RefusalPayload, refuse } from '../refusals.js';
import type { Settlement } from '../step/node.js';
import { type Task, plan } from '../step/plan.js';
import { type RunResult, type RunState, RuntimeError, run } from '../step/run.js';
import { DEFAULT_KEY, type JudgePort, mechanicalKey, readsOf } from './judge.js';

/** The ports one settle reads and writes through. */
export type SettlePorts = {
  readonly saver: CheckpointSaver;
  readonly structureHash: string;
  readonly judge?: JudgePort;
};

/** The warning one settle may carry: the report replayed a fact the chain already holds. */
export type SettleWarning = { readonly code: 'ALREADY_SETTLED'; readonly note: string };

/** What a settle answers: the stepped result, the state to carry on, the checkpoint once one landed,
 *  and the warnings a replay rides (the ledger is untouched). */
export type SettleAnswer = {
  readonly result: RunResult;
  readonly state: RunState;
  readonly checkpointId?: string;
  readonly warnings?: readonly SettleWarning[];
};

/** The node's own writes — the settlement write policy, fixed at this one site: every
 *  channel whose `source` is `node` receives the report's result (a `merge` channel keyed by the
 *  node, any other reducer verbatim), and no channel sourced from `input` is ever written. The
 *  asset face declares the channels; it never restates this policy. */
function writesOf(graph: CompiledGraph, node: string, report: Omit<ReportInput, 'graph'>): ChannelWrite {
  const held: Json = report.result ?? null;
  const writes: Record<string, Json> = {};
  for (const channel of graph.channels) {
    if (channel.source !== 'node') continue;
    defineOwn(writes, channel.name, channel.reducer === 'merge' ? { [node]: held } : held);
  }
  return writes;
}

/** One artifact ref as the report handed it in, normalized to the object form: a string
 *  shorthand becomes `{ ref }`, an object keeps its fields — or `undefined` when the entry
 *  names no ref (not a string, or an object without a non-empty `ref`). */
function refOf(output: string | ArtifactRef): ArtifactRef | undefined {
  if (typeof output === 'string') return output === '' ? undefined : { ref: output };
  if (typeof output.ref !== 'string' || output.ref === '') return undefined;
  return {
    ref: output.ref,
    ...(output.mediaType === undefined ? {} : { mediaType: output.mediaType }),
    ...(output.bytes === undefined ? {} : { bytes: output.bytes }),
    ...(output.sha256 === undefined ? {} : { sha256: output.sha256 }),
  };
}

/** The normalized refs of one report, paired for the settle faces that read it. */
type RefsOutcome = { readonly refs: readonly ArtifactRef[] | undefined; readonly outside: boolean };

/** The artifact refs one report carries, normalized to the object form; `outside` marks an entry
 *  that names no ref — the settle reads that as a `succeeded` answering refs it cannot carry. */
function refsOf(outputs: readonly (string | ArtifactRef)[] | undefined): RefsOutcome {
  if (outputs === undefined) return { refs: undefined, outside: false };
  const refs: ArtifactRef[] = [];
  for (const output of outputs) {
    const ref = refOf(output);
    if (ref === undefined) return { refs: undefined, outside: true };
    refs.push(ref);
  }
  return { refs, outside: false };
}

/** The replay gate's read: the fact a settled report left on the chain — the task's block
 *  (its writes, or its keyed outcome) anywhere on the tuples. `undefined` = the chain holds
 *  no fact for the task (the frontier guard decides next). */
async function heldFact(
  saver: CheckpointSaver,
  config: ThreadConfig,
  taskId: string,
): Promise<'writes' | 'failed' | 'retry' | undefined> {
  const tuples = await saver.list(config);
  for (const tuple of tuples) {
    for (const block of tuple.pendingWrites ?? []) {
      if (block.taskId === taskId) return block.fact ?? 'writes';
    }
  }
  return undefined;
}

/** The note one unanswered success is refused with, in the order the guards fire: an artifact
 *  ref without a `ref`, a receipt state outside the closed vocabulary, then the bare external
 *  action without receipts. */
function unansweredReason(node: string, missingRef: boolean, outside: boolean): string {
  if (missingRef) return `${node} answered an artifact ref without a ref`;
  if (outside) return `${node} answered with a receipt state outside the closed vocabulary`;
  return `${node} answered an external action without receipts`;
}

/** The one refusal a key outside the declared set answers: the key by name and the declared
 *  candidates it may pick from. */
function undeclared(key: string, names: readonly string[]): RefusalPayload {
  return refuse('KEY_UNDECLARED', `'${key}' — candidates: ${names.join(', ')}`, names);
}

/** Where the folded values came from: the source of the first written channel. */
function sourceOf(graph: CompiledGraph, writes: ChannelWrite): string {
  for (const channel of graph.channels) {
    if (Object.hasOwn(writes, channel.name)) return channel.source;
  }
  return 'input';
}

/** The folded values one state carries, channel by channel. */
function valuesOf(state: RunState): Record<string, Json> {
  const values: Record<string, Json> = {};
  for (const [name, held] of Object.entries(state.channels)) defineOwn(values, name, held.value);
  return values;
}

/** The folded values, versions, and seen-entries one state stores; the checkpointer assigns `id` and `ts`. */
function checkpointOf(state: RunState): Checkpoint {
  const versions: Record<string, number> = {};
  const seen: Record<string, Readonly<Record<string, number>>> = {};
  for (const [name, held] of Object.entries(state.channels)) {
    defineOwn(versions, name, held.version);
    defineOwn(seen, name, { [name]: held.version });
  }
  return { v: 1, id: '', ts: '', channel_values: valuesOf(state), channel_versions: versions, versions_seen: seen };
}

/** The one routing face: a key with no entry on the node's router is a refused step — live and
 *  replayed alike. A missing router entry is a config fault the runtime refuses, never a silent
 *  halt-move, and a replayed chain refuses exactly where the live step refused. */
function step(graph: CompiledGraph, state: RunState, settlement: Settlement): RunResult | RefusalPayload {
  try {
    return run(graph, state, { kind: 'advance', settlement });
  } catch (error) {
    if (error instanceof RuntimeError && error.code === 'no-route') return refuse('infra', error.message);
    throw error;
  }
}

/** The one landing site: the step's fact and its step count sink at the position the step
 *  READ. A position's state is its own values plus the block that follows it, so a cut at any
 *  position rebuilds the frontier that position stood on, and the step count rides one above
 *  the tuple the chain last saw. An interrupt is a checkpointed position too: the checkpoint
 *  stands at the step's entry and the block rides after it, so a cold rebuild reads the same
 *  state — and the journal that follows never re-folds the carried state, because a suspended
 *  step re-applies its settlements when it resumes. */
async function storeAt(
  ports: SettlePorts,
  config: ThreadConfig,
  graph: CompiledGraph,
  state: RunState,
  settlement: Settlement,
): Promise<string | undefined> {
  const last = await ports.saver.getTuple(config);
  const stored = await ports.saver.put(config, checkpointOf(state), {
    graph: graph.id,
    structureHash: ports.structureHash,
    source: sourceOf(graph, settlement.writes ?? {}),
    step: last === undefined ? 0 : last.metadata.step + 1,
  });
  return stored.checkpoint_id;
}

/** The answer one landed step carries: the id rides only when the checkpointer assigned one. */
function answerWith(result: RunResult, state: RunState, checkpointId: string | undefined): SettleAnswer {
  return checkpointId === undefined ? { result, state } : { result, state, checkpointId };
}

/** The journal a keyed `failed` leaves: the fact and its routing key land together, after the
 *  checkpoint put above them. */
async function journalFailed(
  ports: SettlePorts,
  config: ThreadConfig,
  answered: Omit<ReportInput, 'graph'>,
  settlement: Settlement,
  refs: RefsOutcome,
): Promise<void> {
  await ports.saver.putOutcome({
    config,
    taskId: answered.taskId,
    outcome: 'failed',
    reason: answered.reason,
    key: settlement.key,
    writes: settlement.writes,
    receipts: answered.receipts,
    outputs: refs.refs,
  });
}

/** A `failed` that carries a resolvable key routes on it exactly as a success does: the step
 *  advances on the same router face, and the answer carries the state the step left — the
 *  pre-step state unfolded, plus the settlement, when the step halted. */
async function settleFailedKeyed(
  ports: SettlePorts,
  config: ThreadConfig,
  graph: CompiledGraph,
  state: RunState,
  answered: Omit<ReportInput, 'graph'>,
  task: Task,
  refs: RefsOutcome,
): Promise<SettleAnswer | { readonly refusal: RefusalPayload }> {
  // The guarded call sites leave no keyless fact here (a keyless failure journals its own
  // outcome before this helper is consulted): the fallback keeps the type total, not a path.
  const key = answered.key ?? DEFAULT_KEY;
  const settlement: Settlement = {
    node: task.node,
    key,
    writes: writesOf(graph, task.node, answered),
  };
  const stepped = step(graph, state, settlement);
  if ('code' in stepped) return { refusal: stepped };
  const checkpointId = await storeAt(ports, config, graph, state, settlement);
  await journalFailed(ports, config, answered, settlement, refs);
  if (stepped.kind === 'interrupt') {
    const settled = { ...state.settlements, [task.node]: settlement };
    return answerWith(stepped, { ...state, settlements: settled }, checkpointId);
  }
  return answerWith(stepped, stepped.state, checkpointId);
}

/** The one key the settlement routes on: the report's own when it is declared, else the
 *  mechanical default, else the judge's answer — refused when none of them holds. */
async function resolvedKey(
  ports: SettlePorts,
  graph: CompiledGraph,
  state: RunState,
  task: Task,
  spec: NodeSpec,
  names: readonly string[],
  answered: Omit<ReportInput, 'graph'>,
): Promise<string | { readonly refusal: RefusalPayload }> {
  if (
    answered.key !== undefined &&
    (names.length === 0 ? answered.key !== DEFAULT_KEY : !names.includes(answered.key))
  ) {
    return { refusal: undeclared(answered.key, names) };
  }
  const mechanical = mechanicalKey(names, answered.key);
  if (mechanical !== undefined) return mechanical;
  if (ports.judge === undefined) {
    return { refusal: refuse('infra', `node '${task.node}' — candidates: ${names.join(', ')}`) };
  }
  const reads = readsOf(spec.read);
  const judged = await ports.judge.judge({
    state: { values: valuesOf(state), next: state.active },
    task,
    // The judge reads the whole report, binding included: the graph under settlement is the one
    // this call already resolved, so the id it carries is that graph's own.
    report: { ...answered, graph: graph.id },
    keys: spec.keys,
    ...(reads === undefined ? {} : { reads }),
  });
  if (!names.includes(judged.key)) {
    return { refusal: undeclared(judged.key, names) };
  }
  return judged.key;
}

/** The `succeeded` face: one key resolves — the report's own, the mechanical default, or the
 *  judge's — and the step advances on it. A key outside the declared set is refused, live and
 *  replayed alike, and the step's fact lands with its routing key at the position the step read. */
async function settleSucceeded(
  ports: SettlePorts,
  config: ThreadConfig,
  graph: CompiledGraph,
  state: RunState,
  task: Task,
  spec: NodeSpec,
  names: readonly string[],
  answered: Omit<ReportInput, 'graph'>,
  refs: RefsOutcome,
): Promise<SettleAnswer | { readonly refusal: RefusalPayload }> {
  const key = await resolvedKey(ports, graph, state, task, spec, names, answered);
  if (typeof key !== 'string') return key;
  const settlement: Settlement = { node: task.node, key, writes: writesOf(graph, task.node, answered) };
  const result = step(graph, state, settlement);
  if ('code' in result) return { refusal: result };
  const checkpointId = await storeAt(ports, config, graph, state, settlement);
  await ports.saver.putWrites({
    config,
    writes: [settlement.writes ?? {}],
    taskId: answered.taskId,
    key: settlement.key,
    receipts: answered.receipts,
    outputs: refs.refs,
  });
  if (result.kind === 'interrupt') {
    const settled = { ...state.settlements, [task.node]: settlement };
    return answerWith(result, { ...state, settlements: settled }, checkpointId);
  }
  return answerWith(result, result.state, checkpointId);
}

/** The replay gate: a report whose fact the chain already holds is not re-settled — the
 *  ledger stays as it stands and the answer carries ALREADY_SETTLED (the caller still takes). */
async function alreadySettled(
  ports: SettlePorts,
  config: ThreadConfig,
  taskId: string,
  state: RunState,
): Promise<SettleAnswer | undefined> {
  const fact = await heldFact(ports.saver, config, taskId);
  if (fact === undefined) return undefined;
  const current = await ports.saver.getTuple(config);
  return {
    result: { kind: 'advance', state },
    state,
    ...(current === undefined ? {} : { checkpointId: current.checkpoint.id }),
    warnings: [{ code: 'ALREADY_SETTLED', note: `'${taskId}' already settled (${fact})` }],
  };
}

/** The report as the guards leave it: a node that can act outside itself is done only when the
 *  host's receipts say it is. On a node whose capabilities reach outside (`tool` or `command`),
 *  a `succeeded` that brings no receipts, or a state outside the closed vocabulary (`reserved |
 *  settled | ambiguous`), answers as `failed`: the chain records its own failure and routes on
 *  the report's key when it resolves — the failed-edge routing keeps its authority — and the
 *  replay that reads the fact later folds the same failure, never a silent degradation to
 *  green. The same guard stands on the artifact refs: a `succeeded` whose object form names no
 *  `ref` answers as `failed` — the ledger carries refs it can resolve, never a malformed set. */
function unansweredReport(
  node: string,
  spec: NodeSpec,
  report: Omit<ReportInput, 'graph'>,
  refs: RefsOutcome,
): Omit<ReportInput, 'graph'> {
  const outside = (report.receipts ?? []).some(
    (receipt) => receipt.state !== 'reserved' && receipt.state !== 'settled' && receipt.state !== 'ambiguous',
  );
  const unanswered =
    report.outcome === 'succeeded' &&
    ((spec.capabilities.some((cap) => cap === 'tool' || cap === 'command') &&
      (report.receipts === undefined || report.receipts.length === 0 || outside)) ||
      refs.outside);
  return unanswered ? { ...report, outcome: 'failed', reason: unansweredReason(node, refs.outside, outside) } : report;
}

/** The `failed`/`retry` face: the keyless outcomes journal themselves — `retry` as the ask to
 *  re-mint the task, a `failed` without a key as the terminal failure — and neither moves the
 *  state or the frontier; a keyed failure routes on its key, anything else is refused. */
async function settleOther(
  ports: SettlePorts,
  config: ThreadConfig,
  graph: CompiledGraph,
  state: RunState,
  answered: Omit<ReportInput, 'graph'>,
  task: Task,
  names: readonly string[],
  refs: RefsOutcome,
): Promise<SettleAnswer | { readonly refusal: RefusalPayload }> {
  // This face only ever answers `failed` or `retry`: `settle` routes every success away.
  const outcome = answered.outcome === 'retry' ? ('retry' as const) : ('failed' as const);
  if (outcome === 'failed' && answered.reason === undefined) {
    return {
      refusal: refuse('SETTLEMENT_UNANCHORED', `outcome 'failed' carries no reason — candidates: ${names.join(', ')}`),
    };
  }
  if (outcome === 'retry' || answered.key === undefined) {
    await ports.saver.putOutcome({
      config,
      taskId: answered.taskId,
      outcome,
      reason: answered.reason,
      key: answered.key,
      receipts: answered.receipts,
      outputs: refs.refs,
    });
    return { result: { kind: 'advance', state }, state };
  }
  if (names.length === 0 ? answered.key !== DEFAULT_KEY : !names.includes(answered.key)) {
    return { refusal: undeclared(answered.key, names) };
  }
  return settleFailedKeyed(ports, config, graph, state, answered, task, refs);
}

/** One report, settled: check, judge, route, write, and store one checkpoint per super-step. */
export async function settle(
  config: ThreadConfig,
  graph: CompiledGraph,
  state: RunState,
  // The graph rides this call as its own argument, so the settlement reads every report field
  // but the binding: the mechanism face names exactly that (`ReportInput` keeps the binding for
  // the runtime's call face, where the graph is the caller's own declaration).
  report: Omit<ReportInput, 'graph'>,
  ports: SettlePorts,
): Promise<SettleAnswer | { readonly refusal: RefusalPayload }> {
  const settled = await alreadySettled(ports, config, report.taskId, state);
  if (settled !== undefined) return settled;
  const task = plan(graph, state).find((item) => item.id === report.taskId);
  if (task === undefined) return { refusal: refuse('NO_OUTSTANDING_TASK', `${report.taskId}`) };
  const spec = ownValue(graph.nodes, task.node);
  if (spec === undefined) return { refusal: refuse('NO_OUTSTANDING_TASK', `${task.node}`) };
  const names = spec.keys.map((item) => item.name);
  const refs = refsOf(report.outputs);
  const answered = unansweredReport(task.node, spec, report, refs);
  return answered.outcome === 'succeeded'
    ? settleSucceeded(ports, config, graph, state, task, spec, names, answered, refs)
    : settleOther(ports, config, graph, state, answered, task, names, refs);
}
