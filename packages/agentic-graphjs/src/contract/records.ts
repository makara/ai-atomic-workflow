/**
 * The record shapes the journal and the store answer through.
 *
 * The record log holds the chain and nothing derived from it: the state is the
 * view over a checkpoint plus the writes that followed it. These shapes name the
 * records themselves — one logged entry, one outcome, one progress marker — plus
 * the two faces that carry them: the append-read-clear face the journal answers
 * and the five-method face every checkpoint store answers.
 *
 * @module
 */

import type { ChannelWrite } from './channels.js';
import type {
  Checkpoint,
  CheckpointListOptions,
  CheckpointMetadata,
  CheckpointTuple,
  ThreadConfig,
} from './checkpoint.js';
import type { ArtifactRef, ClockPort, IdentityPort, LogEntry, OutcomeEntry, ProgressEntry, Receipt } from './log.js';

/** One record the log holds: a checkpoint with its metadata, the writes one task applied,
 *  the outcome of a report that did not succeed, or one progress marker the host wrote. */
export type LogRecord =
  | { readonly kind: 'checkpoint'; readonly checkpoint: Checkpoint; readonly metadata: CheckpointMetadata }
  | { readonly kind: 'writes'; readonly entry: LogEntry }
  | { readonly kind: 'outcome'; readonly entry: OutcomeEntry }
  | { readonly kind: 'progress'; readonly entry: ProgressEntry };

/** The durable face — the chain itself, in append order. */
export interface RecordLogPort {
  /** Append one record to the chain — the only write the log takes; the append order is the
   *  order the replay folds in. */
  append(threadId: string, record: LogRecord): Promise<void>;
  /** Read the whole chain in append order — the replay folds from it, never from a cache, so a
   *  lost record is a visible gap, not a silent one. */
  read(threadId: string): Promise<readonly LogRecord[]>;
  /** Clear the chain — the log owns no derived state, so clearing is the whole teardown. */
  clear(threadId: string): Promise<void>;
}

/** One journal request for a settled task's writes: the task, the write map it contributed,
 *  and the report's trailing face — the routing key it answered with, the receipts, and the
 *  artifact refs. The request is a named record, never a positional list. */
export interface WriteRequest {
  readonly config: ThreadConfig;
  readonly writes: readonly ChannelWrite[];
  readonly taskId: string;
  readonly key?: string;
  readonly receipts?: readonly Receipt[];
  readonly outputs?: readonly ArtifactRef[];
}

/** One journal request for a report's non-success outcome: the terminal failure or the retry
 *  ask. A `failed` that carries a routing key also carries its writes, so a replay folds and
 *  routes on them. */
export interface OutcomeRequest {
  readonly config: ThreadConfig;
  readonly taskId: string;
  readonly outcome: 'failed' | 'retry';
  readonly reason?: string;
  readonly key?: string;
  readonly writes?: ChannelWrite;
  readonly receipts?: readonly Receipt[];
  readonly outputs?: readonly ArtifactRef[];
}

/** The five-method face every saver answers. */
export interface CheckpointSaver {
  getTuple(config: ThreadConfig): Promise<CheckpointTuple | undefined>;
  list(config: ThreadConfig, options?: CheckpointListOptions): Promise<CheckpointTuple[]>;
  put(config: ThreadConfig, checkpoint: Checkpoint, metadata: CheckpointMetadata): Promise<ThreadConfig>;
  putWrites(request: WriteRequest): Promise<void>;
  putOutcome(request: OutcomeRequest): Promise<void>;
}

/** The ports a saver reads and writes through. */
export interface SaverPorts {
  readonly log: RecordLogPort;
  readonly identity: IdentityPort;
  readonly clock: ClockPort;
}
