/**
 * The replay face: a continuation's state, re-derived from the chain alone (rebuilt, not
 * cached), plus the readers a rebuild consults. `isRefusal` narrows a state read, `nodeOf`
 * cuts a task id's node, `keyOf` answers a block that predates key recording, and
 * `rebuild` folds the chain between two positions. Moved verbatim out of the runtime
 * module with the entry split; the folding itself did not change.
 *
 * @module
 */

import type { ChannelState } from '../contract/channels.js';
import type { CheckpointTuple, PendingWrite, ThreadConfig } from '../contract/checkpoint.js';
import type { RuntimeDeps } from '../contract/ports.js';
import { applyWrites } from '../fold/channels.js';
import { defineOwn, ownValue } from '../fold/reducers.js';
import type { CompiledGraph } from '../ir.js';
import { attemptOfTaskId, cutTaskId, stateOf } from '../persist/saver.js';
import { type RefusalPayload, refuse } from '../refusals.js';
import type { Settlement } from '../step/node.js';
import { type RunState, RuntimeError, resume, start } from '../step/run.js';

/** Whether a state read answered a refusal instead of a state — the guard a union of an
 *  interface and the refusal payload needs to narrow on its own terms. */
export function isRefusal(value: RunState | RefusalPayload): value is RefusalPayload {
  return 'code' in value && 'note' in value;
}

/** The node part of one task id: everything before the last `#` whose tail is all digits — the
 *  same cut `attemptOfTaskId` reads, so the node and the attempt agree by construction. */
export function nodeOf(taskId: string): string {
  return cutTaskId(taskId).node;
}

/** Resume one block with the runtime's own refusal folded into the replay's: a cold fold that
 *  cannot stand on a frontier refuses the replay as `infra`, it never throws through. */
function resumed(
  graph: CompiledGraph,
  channels: ChannelState,
  settled: Readonly<Record<string, Settlement>>,
  visits: Readonly<Record<string, number>>,
  over: readonly string[],
): RunState | RefusalPayload {
  try {
    return resume(graph, channels, settled, visits, over);
  } catch (error) {
    if (error instanceof RuntimeError) return refuse('infra', error.message);
    throw error;
  }
}

/** The mechanical key of one node — the fallback a rebuild uses for a block that predates key
 *  recording: its sole declared key, else the empty key that only static edges ignore. A block
 *  that carries its recorded key never consults this. */
function keyOf(graph: CompiledGraph, node: string): string {
  const spec = ownValue(graph.nodes, node);
  return spec !== undefined && spec.keys.length === 1 ? (spec.keys[0]?.name ?? '') : '';
}

/** The window one fact folds into: the channels the fold runs on, the facts settled on the
 *  way, and the occurrence counts the chain carries. */
type Fold = {
  channels: ChannelState;
  settled: Record<string, Settlement>;
  visits: Record<string, number>;
};

/** The one folding site: a fact and its writes land at the window the chain folds.
 *
 *  A fact carries the attempt ordinal it was journaled at, and the task id carries the
 *  chain's one counter. A fact whose attempt does not name its own occurrence is a chain
 *  edited after the fact — the replay answers that as a refusal, never as a silently
 *  different replay.
 *
 *  The key the settlement answered rides its block; `keyOf` is only the fallback for
 *  records written before keys landed (a multi-key node's answer is never derivable). */
function foldFact(fold: Fold, graph: CompiledGraph, entry: PendingWrite): RefusalPayload | undefined {
  const { taskId, writes, key: recorded, attempt } = entry;
  if (attempt !== undefined && attempt !== attemptOfTaskId(taskId)) {
    return refuse('infra', `'${taskId}' carries attempt ${attempt}, not its own ${attemptOfTaskId(taskId)}`);
  }
  fold.channels = applyWrites(graph.channels, fold.channels, writes);
  const node = nodeOf(taskId);
  defineOwn(fold.settled, node, { node, key: recorded ?? keyOf(graph, node), writes });
  defineOwn(fold.visits, node, (ownValue(fold.visits, node) ?? 0) + 1);
  return undefined;
}

/** The window fold: each write block folded over its own checkpoint, in append order, and the
 *  frontier the last complete block routes to. A block that settles only part of the set it
 *  stepped over is a suspended super-step: nothing of it advanced, so the position stands at
 *  its entry with the same frontier and the same occurrence counts (the live step left exactly
 *  that, and the block stays pending). The occurrence counts are rebuilt from the chain alone:
 *  one settlement is one visit, so a task id minted after a replay is the id the same run
 *  minted before it. */
function foldWindow(graph: CompiledGraph, chain: readonly CheckpointTuple[], cut: number): RunState | RefusalPayload {
  let held: RunState = start(graph);
  for (const tuple of chain.slice(0, cut)) {
    const fold: Fold = {
      channels: stateOf(graph.channels, tuple.checkpoint),
      settled: {},
      visits: { ...held.visits },
    };
    const block = tuple.pendingWrites ?? [];
    // The set this block stepped over: the frontier the previous position stood on. A block
    // that settles only part of it is a suspended super-step, and `resume` keeps the rest.
    const over = held.active;
    for (const entry of block) {
      const refusal = foldFact(fold, graph, entry);
      if (refusal !== undefined) return refusal;
    }
    const complete = block.length > 0 && over.every((node) => Object.hasOwn(fold.settled, node));
    if (!complete) {
      held = {
        channels: stateOf(graph.channels, tuple.checkpoint),
        active: [...over],
        settlements: {},
        visits: held.visits,
      };
    } else {
      const next = resumed(graph, fold.channels, fold.settled, fold.visits, over);
      if (isRefusal(next)) return next;
      held = next;
    }
  }
  return held;
}

/** The retained work stays settled: the writes it recorded after the rewound position replay
 *  over the rewound state, so a rewind keeps exactly the work it names (`retained`). The
 *  retained replay reads the same attempt rule as the window fold — through the one folding
 *  site: a fact whose attempt does not name its own occurrence refuses the read, it never
 *  folds sideways. */
function replayRetained(
  graph: CompiledGraph,
  chain: readonly CheckpointTuple[],
  cut: number,
  keep: ReadonlySet<string>,
  held: RunState,
): RunState | RefusalPayload {
  const fold: Fold = { channels: held.channels, settled: {}, visits: { ...held.visits } };
  let replayed = false;
  for (const tuple of chain.slice(cut)) {
    for (const entry of tuple.pendingWrites ?? []) {
      if (!keep.has(entry.taskId)) continue;
      const refusal = foldFact(fold, graph, entry);
      if (refusal !== undefined) return refusal;
      replayed = true;
    }
  }
  if (!replayed) return held;
  // The retained replay stands on the frontier the rewound position left: the nodes it did
  // not name stay outstanding beside the successors the ones it named routed.
  return resumed(graph, fold.channels, fold.settled, fold.visits, held.active);
}

/**
 * The state the journal's chain stands on: the chain reversed to append
 * order, cut at the position, each write block folded over its own
 * checkpoint, and the frontier the last complete block routes to.
 */
export async function rebuild(
  deps: RuntimeDeps,
  config: () => ThreadConfig,
  graph: CompiledGraph,
  at?: string,
  retained?: readonly string[],
): Promise<RunState | RefusalPayload> {
  const tuples = await deps.checkpointer.list(config());
  if (tuples.length === 0) return start(graph);
  const chain = [...tuples].reverse();
  const cut = at === undefined ? chain.length : chain.findIndex((tuple) => tuple.checkpoint.id === at) + 1;
  if (cut === 0) return refuse('CHECKPOINT_UNKNOWN', `'${at ?? ''}' — take a legal id from history()`);
  const held = foldWindow(graph, chain, cut);
  if (isRefusal(held)) return held;
  if (retained === undefined || retained.length === 0) return held;
  return replayRetained(graph, chain, cut, new Set(retained), held);
}
