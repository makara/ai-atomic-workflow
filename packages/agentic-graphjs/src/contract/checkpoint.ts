/**
 * The checkpoint shapes — one position in a thread, its folded values, and the
 * writes that followed it.
 *
 * A checkpoint is a position, never a pointer into implementation: the state one
 * works with is the view over a checkpoint plus the writes that followed it, and
 * that view is assembled from these shapes alone. The store that holds them, and
 * the fold that replays them, live in the implementation files.
 *
 * @module
 */

import type { Json } from '../ir.js';
import type { ChannelWrite } from './channels.js';
import type { ArtifactRef, Receipt } from './log.js';

/** Which thread, and which checkpoint in it. */
export interface ThreadConfig {
  readonly thread_id: string;
  readonly checkpoint_id?: string;
}

/** A checkpoint: the folded channel values at one position and the versions behind them. The
 *  field names mirror LangGraph's `snake_case` — the parity is deliberate, and the module's own
 *  rows below stay `camelCase`. */
export interface Checkpoint {
  readonly v: number;
  readonly id: string;
  readonly ts: string;
  readonly channel_values: Readonly<Record<string, Json>>;
  readonly channel_versions: Readonly<Record<string, number>>;
  readonly versions_seen: Readonly<Record<string, Readonly<Record<string, number>>>>;
  /** The position this step ran at — the parent's config, absent at a thread's head. The
   *  chain is walkable backwards from it, so a replay re-derives the same parentage. */
  readonly parent_config?: ThreadConfig;
}

/** What a step records about itself: the graph it ran, the structure it ran, where it came from,
 *  and its step number. The graph name is the binding fact — the chain is its only authority. */
export interface CheckpointMetadata {
  readonly graph: string;
  readonly structureHash: string;
  readonly source: string;
  readonly step: number;
}

/** How far a `list` reads: newest first, at most `limit`, starting before `before`. */
export interface CheckpointListOptions {
  readonly limit?: number;
  readonly before?: string;
}

/** One pending write block: the task, the write map it contributed, the routing key it answered
 *  with, the kind it answered (`failed` or `retry`, absent on a success), the attempt ordinal the
 *  fact carried (`node#k` rides as `k + 1`), and the receipts and artifact refs the host handed
 *  in with the report (absent on a report that recorded no external action). The fields are the
 *  type labels themselves: the block is a named record, never a positional tuple. The
 *  replay folds and routes on the block; the view reads the kind, the key, the attempt, and the
 *  unsettled receipts off it — never recomputing them — and the fold cross-checks the attempt
 *  against the chain's own occurrence count. */
export interface PendingWrite {
  readonly taskId: string;
  readonly writes: ChannelWrite;
  readonly key?: string;
  readonly fact?: 'failed' | 'retry';
  readonly attempt?: number;
  readonly receipts?: readonly Receipt[];
  readonly outputs?: readonly ArtifactRef[];
}

/** A checkpoint with the config that addresses it and the writes that followed it. */
export interface CheckpointTuple {
  readonly config: ThreadConfig;
  readonly checkpoint: Checkpoint;
  readonly metadata: CheckpointMetadata;
  readonly pendingWrites?: readonly PendingWrite[];
}
