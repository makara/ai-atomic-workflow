/**
 * The chain-window face: the read view of a run (`statusOf`/`emptyStatus`) and the shapes that
 * view carries. `shownReceipt` maps a receipt into the view's own vocabulary, and a fact's node
 * name is cut by `nodeOf` from the replay face — the window reads the chain, it never writes
 * back.
 *
 * @module
 */

import type { CheckpointTuple, PendingWrite } from '../contract/checkpoint.js';
import type { ArtifactRef, Receipt } from '../contract/log.js';
import type { CompiledGraph } from '../ir.js';
import { attemptOfTaskId } from '../persist/saver.js';
import { plan } from '../step/plan.js';
import type { RunState } from '../step/run.js';
import { nodeOf } from './replay.js';

/** One receipt as the view shows it: the external action's ref, and its state in the view's own
 *  vocabulary — only `settled` has reached its end; every other state shows as `unsettled`. */
export type StatusReceipt = {
  readonly ref: string;
  readonly state: 'settled' | 'unsettled';
};

/** One settled fact the chain window carries: the task, its node, the routing key it answered with
 *  (`''` where none was recorded), and the kind the journal carries — the block's own label, never a
 *  second derivation. */
export type StatusSettlement = {
  readonly taskId: string;
  readonly node: string;
  readonly key: string;
  readonly outcome: 'succeeded' | 'failed';
  /** The attempt ordinal the fact carried (read off the block, or the task id's own `#k`). */
  readonly attempt: number;
  /** The receipts the fact carried, mapped to the view's vocabulary; absent on a fact that
   *  recorded no external action. */
  readonly receipts?: readonly StatusReceipt[];
  /** The artifact refs the fact carried, in the object form the ledger stores; absent on a fact
   *  that recorded no artifacts. */
  readonly outputs?: readonly ArtifactRef[];
};

/** One superstep of the chain window: its step number and the task facts that block carried. */
export type StatusStep = { readonly step: number; readonly tasks: readonly string[] };

/** What `status` answers: the chain's own data at the read position, rebuilt per read, ordered
 *  oldest to newest (cursor last), truncated by nothing. */
export type RunStatus = {
  readonly graph: string;
  readonly cursor: { readonly checkpointId: string; readonly step: number };
  readonly outstanding: readonly { readonly id: string; readonly node: string; readonly attempt: number }[];
  readonly settlements: readonly StatusSettlement[];
  readonly liveness: {
    readonly progress: readonly StatusStep[];
    readonly attempts: Readonly<Record<string, number>>;
  };
};

/** One receipt as the view shows it: only `settled` has reached its end; every other state shows
 *  as `unsettled` — the view's own vocabulary, never the fact's. */
function shownReceipt(receipt: Receipt): StatusReceipt {
  return { ref: receipt.ref, state: receipt.state === 'settled' ? 'settled' : 'unsettled' };
}

/** The cursor of a chain with no position to stand on — the empty chain and the refusal shape
 *  share it. */
function emptyCursor(): { readonly checkpointId: string; readonly step: number } {
  return { checkpointId: '', step: 0 };
}

/** The chain window a read answers: `chain` carries the positions it stepped over in append
 *  order, cursor last, and `state` is the state rebuilt at the cursor. Settlement facts ride the
 *  blocks — key and kind read off the block, never recomputed — and the attempt ordinals ride
 *  `state.visits`: one settled task is one visit, and the window mints no second counter — the
 *  ordinal is read off the visit, never minted by the window. */
/** One block's settlements, in the order the host reported them. The block admits no `retry` —
 *  the ask moves no state and rides the chain alone — so a fact that joins one is only ever
 *  `failed`: the view carries the two kinds a settlement can have, never the ask's third. */
function blockSettlements(block: readonly PendingWrite[]): StatusSettlement[] {
  return block.map(({ taskId, key, fact, attempt, receipts, outputs }) => ({
    taskId,
    node: nodeOf(taskId),
    key: key ?? '',
    outcome: fact === 'failed' ? 'failed' : 'succeeded',
    attempt: attempt ?? attemptOfTaskId(taskId),
    ...(receipts === undefined ? {} : { receipts: receipts.map(shownReceipt) }),
    ...(outputs === undefined ? {} : { outputs }),
  }));
}

export function statusOf(
  graphId: string,
  graph: CompiledGraph,
  chain: readonly CheckpointTuple[],
  state: RunState,
): RunStatus {
  const settlements: StatusSettlement[] = [];
  const progress: StatusStep[] = [];
  for (const tuple of chain) {
    const block = tuple.pendingWrites ?? [];
    if (block.length === 0) continue;
    progress.push({ step: tuple.metadata.step, tasks: block.map(({ taskId }) => taskId) });
    settlements.push(...blockSettlements(block));
  }
  // `at` answers `Checkpoint | undefined`, so the guards below read the same absence the type
  // declares: an empty window is the only way a cursor is missing, and it says so.
  const cursor = chain.at(-1);
  return {
    graph: graphId,
    cursor:
      cursor === undefined ? emptyCursor() : { checkpointId: cursor.checkpoint.id, step: cursor.metadata.step + 1 },
    outstanding: plan(graph, state).map((task) => ({
      id: task.id,
      node: task.node,
      attempt: (state.visits[task.node] ?? 0) + 1,
    })),
    settlements,
    liveness: { progress, attempts: { ...state.visits } },
  };
}

/** The view of a chain with no chain to read — the refusal shape and the empty chain share it:
 *  no window, no outstanding work, no attempt counts, no cursor to stand on. */
export function emptyStatus(graph: string): RunStatus {
  return {
    graph,
    cursor: emptyCursor(),
    outstanding: [],
    settlements: [],
    liveness: { progress: [], attempts: {} },
  };
}
