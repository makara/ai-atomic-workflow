/**
 * The entry face — capability resolution and the seven runtime methods.
 *
 * The host resolves the capability tokens from its container and hands the module
 * a plain deps object; the module imports no container and owns no I/O. `take`
 * plans, `report` settles, `rewind` repositions, and `history`/`getState`/`status`
 * read (the three reads rebuild from the chain and write nothing back). A
 * continuation rebuilds its state from the journal alone (rebuilt, not cached):
 * each tuple carries the writes that followed it, one write block is one
 * super-step, and the node a task belongs to is the prefix of its id. The
 * chain-window readers (`statusOf`/`emptyStatus`) ride the status module; the state
 * re-derivation (`rebuild`) and the narrowing guard (`isRefusal`) ride the replay
 * module.
 *
 * Emission: fourteen entry-face signals fire through the optional
 * `logger` port only — never inside `settle`, `run`, `plan`, or `replay`. No
 * port injected is zero emission: silence is the declared default, not a
 * degraded path.
 *
 * @module
 */

import type { Checkpoint, CheckpointTuple, ThreadConfig } from '../contract/checkpoint.js';
import type { RuntimeDeps } from '../contract/ports.js';
import type { ReportInput } from '../contract/report.js';
import { defineOwn } from '../fold/reducers.js';
import type { CompiledGraph, Json } from '../ir.js';
import { type RefusalPayload, refuse } from '../refusals.js';
import type { StateSnapshot } from '../settle/judge.js';
import { type SettlePorts, type SettleWarning, settle } from '../settle/settle.js';
import { type Task, plan } from '../step/plan.js';
import type { RunState } from '../step/run.js';
import { isRefusal, rebuild } from './replay.js';
import { type RunStatus, emptyStatus, statusOf } from './status.js';

/** What `take` answers: the planned tasks, the drained lane, or the refusal. */
export type TakeResult =
  | { readonly kind: 'issued'; readonly tasks: readonly Task[] }
  | { readonly kind: 'unserved' }
  | { readonly kind: 'rejected'; readonly refusal: RefusalPayload };

/** What `report` answers: the checkpoint the settlement landed at, or the refusal. */
export type ReportResult =
  | {
      readonly kind: 'settled';
      readonly checkpointId?: string;
      /** A replay rides its warning here; the ledger stays as it stands. */
      readonly warnings?: readonly SettleWarning[];
    }
  | { readonly kind: 'rejected'; readonly refusal: RefusalPayload };

/** What `rewind` answers: the position the lane reopened at, or the refusal. */
export type RewindResult =
  | { readonly kind: 'rewound'; readonly to: string; readonly retained?: readonly string[] }
  | { readonly kind: 'rejected'; readonly refusal: RefusalPayload };

/** The seven methods the module exposes. One driver at a time per thread: every call queues
 *  behind the thread's own previous call, so two calls never read one position and write two
 *  children of it. */
export interface Runtime {
  take(input: { graph: string }): Promise<TakeResult>;
  report(input: ReportInput): Promise<ReportResult>;
  rewind(input: { to: string; retained?: readonly string[] }): Promise<RewindResult>;
  history(input: { graph: string }): Promise<readonly Checkpoint[]>;
  getState(input: { graph: string; at?: string }): Promise<StateSnapshot>;
  status(input: { graph: string; at?: string }): Promise<RunStatus>;
  /**
   * The binding fact one thread carries: the graph name the chain's newest step recorded —
   * the single read point behind `awf_status`/`awf_advance`/`awf_rewind`, whose call faces
   * carry no `graph` param. `undefined` = no binding yet: the empty view, not an error.
   */
  boundGraph(at?: string): Promise<string | undefined>;
}

/** What the lane holds between calls: the state to carry on, the checkpoint it stands on,
 *  and the work a rewind asked to keep settled. */
type Held = { readonly state?: RunState; readonly at?: string; readonly retained?: readonly string[] };

type Resolved =
  | { readonly graph: CompiledGraph; readonly structureHash: string; readonly state: RunState }
  | { readonly refusal: RefusalPayload };

/** The one emitted slot of the three method chains (the read-face template's slot): the
 *  level the refusal pair rides and its two verbatim texts. A slot is assembled by the two
 *  factories below — one file-private source (no re-export, no hop through an internal
 *  facade), so the emitted table keeps its words and its count verbatim. */
type Signal = {
  readonly level: 'error' | 'warn';
  /** The first pair text, up to the dash (`report refused`, `getState read refused`). */
  readonly refused: string;
  /** The second pair's tail: the refusal names what refused before it (`settling`). */
  readonly before: string;
};

/** Assemble the write face's slot: the refused chain is answered `rejected`, emitted at `error`. */
function createErrorSignal(refused: string, before: string): Signal {
  return { level: 'error', refused, before };
}

/** Assemble one read face's slot: the refused chain is answered by the method's own empty
 *  view, emitted at `warn`, the text naming the method (`getState read refused`). */
function createReadSignal(refused: string): Signal {
  return { level: 'warn', refused: `${refused} read refused`, before: 'reading' };
}

const WRITE_STATE = createErrorSignal('report refused', 'settling');
const READ_STATE = createReadSignal('getState');
const READ_STATUS = createReadSignal('status');
const READ_HISTORY = createReadSignal('history');

/** The fault a read face raises over a call it cannot answer at all — a capability the runtime
 *  never carried, or an `at` the chain does not hold. A read answers its empty view only when the
 *  chain itself is unreadable; answering one of these as an empty window would show a caller a
 *  plausible view of a call that never happened. */
function raise(refusal: RefusalPayload): never {
  throw new Error(`${refusal.code} — ${refusal.note}`);
}

/** Whether a refusal is the call's own fault rather than the chain's — the two a read face raises
 *  instead of answering its empty view. */
function isArgumentFault(refusal: RefusalPayload): boolean {
  return refusal.code === 'CHECKPOINT_UNKNOWN' || refusal.code === 'CAPABILITY_MISSING';
}

/** The compiled product one name caches to. */
type Compiled = { readonly graph: CompiledGraph; readonly structureHash: string };

/** The lane one runtime instance carries: the deps, the per-name compiled cache, the held
 *  sessions, and the serial queue — all instance state, minted once and handed to every call.
 *  The module carries none: a fresh runtime starts empty. */
interface Lane {
  readonly deps: RuntimeDeps;
  readonly compiled: Map<string, Compiled>;
  readonly sessions: Map<string, Held>;
  readonly lanes: Map<string, Promise<unknown>>;
  readonly config: (at?: string) => ThreadConfig;
  readonly load: (name: string) => Promise<Compiled | { refusal: RefusalPayload }>;
  readonly stateFor: (graph: CompiledGraph, at?: string) => Promise<RunState | RefusalPayload>;
  readonly resolve: (graphName: string, slot: Signal, at?: string) => Promise<Resolved>;
}

/** The tokens the runtime cannot run without, in the order the refusal names them. */
function missingPorts(deps: RuntimeDeps): string[] {
  const missing: string[] = [];
  if (deps.checkpointer === undefined) missing.push('checkpointer');
  if (deps.graphs === undefined) missing.push('graphs');
  if (deps.context === undefined) missing.push('context');
  return missing;
}

/** The runtime a deps set with holes answers: every chain face refuses `infra`, every read
 *  raises `CAPABILITY_MISSING`. */
function refusedRuntime(deps: RuntimeDeps, missing: readonly string[]): Runtime {
  const error = `infra: missing ${missing.join(', ')} — register the token in the container`;
  deps.logger?.error(`runtime refused — ${error}`);
  const refused = () => Promise.resolve({ kind: 'rejected' as const, refusal: refuse('infra', error) });
  const raised = () => Promise.reject(new Error(`CAPABILITY_MISSING — the runtime is missing ${missing.join(', ')}`));
  return {
    take: refused,
    report: refused,
    rewind: refused,
    history: raised,
    getState: raised,
    status: raised,
    boundGraph: () => Promise.resolve(undefined),
  };
}

/** The config one call addresses: the thread, and the position the lane or the context names. */
function configFor(deps: RuntimeDeps, sessions: Map<string, Held>): Lane['config'] {
  return (at) => {
    const position = at ?? sessions.get(deps.context.threadId)?.at ?? deps.context.checkpointId;
    return position === undefined
      ? { thread_id: deps.context.threadId }
      : { thread_id: deps.context.threadId, checkpoint_id: position };
  };
}

/** The compiled product for one name, cached across calls; a bad name refuses with `GRAPH_UNREADABLE`. */
function loaderFor(deps: RuntimeDeps, compiled: Map<string, Compiled>): Lane['load'] {
  return async (name) => {
    const known = compiled.get(name);
    if (known !== undefined) return known;
    const answer = await deps.graphs.load(name);
    if (!answer.ok) return { refusal: refuse(answer.code, answer.message ?? `unknown graph '${name}'`) };
    const held = { graph: answer.graph, structureHash: answer.structureHash };
    compiled.set(name, held);
    return held;
  };
}

/** The state one call reads: the lane's held state, else the journal's rebuild at the position.
 *  A rewind clears the held state and moves the lane's position, so the next read re-derives
 *  from the chain at the rewound checkpoint — the frontier relocation is the read's own effect. */
function stateReaderFor(deps: RuntimeDeps, sessions: Map<string, Held>, config: Lane['config']): Lane['stateFor'] {
  return async (graph, at) => {
    const held = sessions.get(deps.context.threadId);
    const position = at ?? held?.at ?? deps.context.checkpointId;
    if (held?.state !== undefined && position === held.at) return held.state;
    return rebuild(deps, config, graph, position, held?.retained);
  };
}

/** The one resolving site the three method chains consult (the read-face template the
 *  contract folds): load the graph, then re-derive the state the chain stands on. A
 *  refused read emits its slot's pair here and answers the raw refusal — `report` wraps it
 *  as `rejected`, the two read faces answer their empty view, and the chain never leaks
 *  into an answer a method builds itself. `take` keeps its guarded sequence beside the
 *  site (guard, drift, chain read, and empty plan fire as its one chain, counted and
 *  emitted together): the site folds the template, never the guard. */
function resolverFor(deps: RuntimeDeps, load: Lane['load'], stateFor: Lane['stateFor']): Lane['resolve'] {
  return async (graphName, slot, at) => {
    const loaded = await load(graphName);
    if ('refusal' in loaded) {
      deps.logger?.[slot.level](`${slot.refused} — '${graphName}' is not loadable`);
      return { refusal: loaded.refusal };
    }
    const state = await stateFor(loaded.graph, at);
    if (isRefusal(state)) {
      deps.logger?.[slot.level](`${slot.refused} — the chain refused before ${slot.before}`);
      return { refusal: state };
    }
    return { graph: loaded.graph, structureHash: loaded.structureHash, state };
  };
}

/** The drift guard: a chain bound to another structure refuses `STRUCTURE_DRIFT`, so `take`
 *  never plans on a graph the thread was not bound to. */
function driftRefusal(graph: string, tuple: CheckpointTuple | undefined, hash: string): RefusalPayload | undefined {
  if (tuple === undefined || tuple.metadata.structureHash === hash) return undefined;
  return refuse('STRUCTURE_DRIFT', `'${graph}' — rebind with a new thread id`);
}

/** `take`: guard the binding, read the chain, plan — one serial step. */
async function takeCall(lane: Lane, input: { graph: string }): Promise<TakeResult> {
  const { deps, config } = lane;
  const loaded = await lane.load(input.graph);
  if ('refusal' in loaded) {
    deps.logger?.error(`take refused — '${input.graph}' is not loadable`);
    return { kind: 'rejected', refusal: loaded.refusal };
  }
  const tuple = await deps.checkpointer.getTuple(config());
  const drift = driftRefusal(input.graph, tuple, loaded.structureHash);
  if (drift !== undefined) {
    deps.logger?.error(`take refused — structure drift on '${input.graph}'`);
    return { kind: 'rejected', refusal: drift };
  }
  const state = await lane.stateFor(loaded.graph);
  if (isRefusal(state)) {
    deps.logger?.error(`take refused — the chain refused before planning`);
    return { kind: 'rejected', refusal: state };
  }
  const tasks = plan(loaded.graph, state);
  if (tasks.length === 0) {
    deps.logger?.warn(`take answered unserved — no runnable task on '${input.graph}'`);
    return { kind: 'unserved' };
  }
  lane.sessions.set(deps.context.threadId, {
    state,
    ...(tuple === undefined ? {} : { at: tuple.checkpoint.id }),
  });
  return { kind: 'issued', tasks };
}

/** The ports one settle call rides: the saver, the structure hash the binding carries, and
 *  the judge when the host injected one. */
function settlePortsFor(deps: RuntimeDeps, structureHash: string): SettlePorts {
  return {
    saver: deps.checkpointer,
    structureHash,
    ...(deps.judge === undefined ? {} : { judge: deps.judge }),
  };
}

/** `report`: resolve the chain, settle the call, hold the state the settle landed on. */
async function reportCall(lane: Lane, input: ReportInput): Promise<ReportResult> {
  const { deps, config } = lane;
  const r = await lane.resolve(input.graph, WRITE_STATE);
  if ('refusal' in r) {
    return { kind: 'rejected', refusal: r.refusal };
  }
  const answer = await settle(config(), r.graph, r.state, input, settlePortsFor(deps, r.structureHash));
  if ('refusal' in answer) {
    deps.logger?.error(`report refused — settle refused this call`);
    return { kind: 'rejected', refusal: answer.refusal };
  }
  lane.sessions.set(deps.context.threadId, {
    state: answer.state,
    ...(answer.checkpointId === undefined ? {} : { at: answer.checkpointId }),
  });
  if (answer.warnings !== undefined && answer.warnings.length > 0) {
    deps.logger?.warn('report settled with warnings — replay degraded');
  }
  return {
    kind: 'settled',
    ...(answer.checkpointId === undefined ? {} : { checkpointId: answer.checkpointId }),
    ...(answer.warnings === undefined ? {} : { warnings: answer.warnings }),
  };
}

/** The retained work the chain does not carry after `to`, if any: an id the chain never
 *  recorded there would replay as nothing, silently keeping a rewind that named work nothing
 *  had settled. */
async function unknownRetained(lane: Lane, to: string, retained: readonly string[]): Promise<readonly string[]> {
  const chain = [...(await lane.deps.checkpointer.list(lane.config()))].reverse();
  const cut = chain.findIndex((entry) => entry.checkpoint.id === to) + 1;
  const carried = new Set(chain.slice(cut).flatMap((entry) => (entry.pendingWrites ?? []).map(({ taskId }) => taskId)));
  return retained.filter((taskId) => !carried.has(taskId));
}

/** `rewind`: move the lane's position and drop the held state, so the next read re-derives at
 *  `to` and the named work replays over that position instead of being re-issued. */
async function rewindCall(lane: Lane, input: { to: string; retained?: readonly string[] }): Promise<RewindResult> {
  const { deps } = lane;
  const tuple = await deps.checkpointer.getTuple({ thread_id: deps.context.threadId, checkpoint_id: input.to });
  if (tuple === undefined) {
    deps.logger?.error(`rewind refused — '${input.to}' names no checkpoint`);
    return {
      kind: 'rejected',
      refusal: refuse('CHECKPOINT_UNKNOWN', `'${input.to}' — take a legal id from history()`),
    };
  }
  if (input.retained !== undefined) {
    const unknown = await unknownRetained(lane, input.to, input.retained);
    if (unknown.length > 0) {
      deps.logger?.error(`rewind refused — '${unknown.join(', ')}' name work the chain does not carry`);
      return {
        kind: 'rejected',
        refusal: refuse(
          'BAD_CALL',
          `'${unknown.join(', ')}' — retained ids the chain does not carry after '${input.to}'`,
        ),
      };
    }
  }
  lane.sessions.set(deps.context.threadId, {
    at: input.to,
    ...(input.retained === undefined ? {} : { retained: input.retained }),
  });
  return input.retained === undefined
    ? { kind: 'rewound', to: input.to }
    : { kind: 'rewound', to: input.to, retained: input.retained };
}

/** `history`: the read is bound to the graph it names — a name the module cannot load answers
 *  no chain at all instead of the thread's own. */
async function historyCall(lane: Lane, input: { graph: string }): Promise<readonly Checkpoint[]> {
  const r = await lane.resolve(input.graph, READ_HISTORY);
  if ('refusal' in r) {
    if (isArgumentFault(r.refusal)) raise(r.refusal);
    return [];
  }
  const tuples = await lane.deps.checkpointer.list(lane.config());
  return tuples.map((tuple) => tuple.checkpoint);
}

/** `getState`: the read faces answer a refused chain with the empty snapshot — the chain stays
 *  in the refusal (read through `resolve`), never rebuilt into the view the method answers. */
async function getStateCall(lane: Lane, input: { graph: string; at?: string }): Promise<StateSnapshot> {
  const r = await lane.resolve(input.graph, READ_STATE, input.at);
  if ('refusal' in r) {
    if (isArgumentFault(r.refusal)) raise(r.refusal);
    return { values: {}, next: [] };
  }
  const values: Record<string, Json> = {};
  for (const [name, value] of Object.entries(r.state.channels)) defineOwn(values, name, value.value);
  return { values, next: [...r.state.active] };
}

/** `status`: a refused chain answers the empty status, named through its own slot; a live chain
 *  is read through the same site and reported by `statusOf`, unchanged. */
async function statusCall(lane: Lane, input: { graph: string; at?: string }): Promise<RunStatus> {
  const r = await lane.resolve(input.graph, READ_STATUS, input.at);
  if ('refusal' in r) {
    if (isArgumentFault(r.refusal)) raise(r.refusal);
    return emptyStatus(input.graph);
  }
  const chain = [...(await lane.deps.checkpointer.list(lane.config()))].reverse();
  const cut = input.at === undefined ? chain.length : chain.findIndex((tuple) => tuple.checkpoint.id === input.at) + 1;
  return statusOf(input.graph, r.graph, cut === 0 ? [] : chain.slice(0, cut), r.state);
}

/** `boundGraph`: the binding fact, assembled where it is read — see `Runtime.boundGraph`; the
 *  interface keeps the full text, the implementation stays a reference (one source per fact). */
async function boundGraphCall(lane: Lane, at?: string): Promise<string | undefined> {
  const tuples = await lane.deps.checkpointer.list(lane.config(at));
  return tuples[0]?.metadata.graph;
}

/** Bind the seven methods (the six chain faces and the binding read) to one injected capability set. */
export function createRuntime(deps: RuntimeDeps): Runtime {
  const missing = missingPorts(deps);
  if (missing.length > 0) return refusedRuntime(deps, missing);
  const compiled = new Map<string, Compiled>();
  const sessions = new Map<string, Held>();
  const lanes = new Map<string, Promise<unknown>>();
  const config = configFor(deps, sessions);
  const load = loaderFor(deps, compiled);
  const stateFor = stateReaderFor(deps, sessions, config);
  const resolve = resolverFor(deps, load, stateFor);
  const lane: Lane = { deps, compiled, sessions, lanes, config, load, stateFor, resolve };

  /** Run one call as the thread's next step, after the call its lane already runs. The queue's
   *  tail swallows the outcome, so a refused call still lets the next one through. */
  function serial<T>(work: () => Promise<T>): Promise<T> {
    const thread = deps.context.threadId;
    const queued = (lanes.get(thread) ?? Promise.resolve()).then(work);
    lanes.set(
      thread,
      queued.then(
        () => undefined,
        () => undefined,
      ),
    );
    return queued;
  }

  /** Every face rides the lane, reads included: a read queued behind a write never mixes a
   *  pre-call held state with a post-call chain. */
  return {
    take: (input) => serial(() => takeCall(lane, input)),
    report: (input) => serial(() => reportCall(lane, input)),
    rewind: (input) => serial(() => rewindCall(lane, input)),
    history: (input) => serial(() => historyCall(lane, input)),
    getState: (input) => serial(() => getStateCall(lane, input)),
    status: (input) => serial(() => statusCall(lane, input)),
    boundGraph: (at) => serial(() => boundGraphCall(lane, at)),
  };
}
