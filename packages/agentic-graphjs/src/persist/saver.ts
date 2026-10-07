/**
 * The checkpoint store — one position in a thread, its folded values, and the
 * writes that followed it.
 *
 * The saver is the state provider: a read hands back the checkpoint a position
 * stands on plus the writes recorded after it, and the state one works with is
 * the view over those two. Identity and the clock arrive from the host, so a
 * replay mints the same ids and stamps, and the four methods below are the whole
 * writing face — one `put` per super-step, one `putWrites` per settled task.
 *
 * @module
 */

import type { ChannelState } from '../contract/channels.js';
import type {
  Checkpoint,
  CheckpointListOptions,
  CheckpointMetadata,
  CheckpointTuple,
  PendingWrite,
  ThreadConfig,
} from '../contract/checkpoint.js';
import type { ArtifactRef, Receipt } from '../contract/log.js';
import type { CheckpointSaver, LogRecord, OutcomeRequest, SaverPorts, WriteRequest } from '../contract/records.js';
import { REDUCER_EMPTY, defineOwn, ownValue } from '../fold/reducers.js';
import type { ChannelSpec, Json } from '../ir.js';

/** The closed set of faults the saver raises. */
export type SaverFaultCode = 'unknown-checkpoint' | 'duplicate-checkpoint' | 'second-authority';

/** A fault raised where the request would break the saver's own contract. */
export class SaverError extends Error {
  readonly code: SaverFaultCode;

  constructor(code: SaverFaultCode, message: string) {
    super(message);
    this.name = 'SaverError';
    this.code = code;
  }
}

/** The fields metadata may carry — anything else would make the saver a second authority. The
 *  record is keyed by the contract's own fields, so it is complete by construction: a field added
 *  to `CheckpointMetadata` without a row here fails the assignment, and a row without a field
 *  fails it too. */
const METADATA_FIELDS: Record<keyof CheckpointMetadata, true> = {
  graph: true,
  structureHash: true,
  source: true,
  step: true,
};

/** One checkpoint of the chain with the record position it sits at. */
interface Held {
  readonly index: number;
  readonly checkpoint: Checkpoint;
  readonly metadata: CheckpointMetadata;
}

/** The checkpoints of one thread, in append order, each with its record position. */
function checkpointsOf(records: readonly LogRecord[]): Held[] {
  const held: Held[] = [];
  for (const [index, record] of records.entries()) {
    if (record.kind === 'checkpoint') held.push({ index, checkpoint: record.checkpoint, metadata: record.metadata });
  }
  return held;
}

/** The one cut of a task id: `node#k` names its node, and the tail after the last `#` is the
 *  ordinal only when it is all digits — an id whose tail is not is a node name carrying its own
 *  `#`, and it names no ordinal. `nodeOf` and `attemptOfTaskId` both read through this cut, so
 *  the node and the attempt can never disagree about where the node ends. */
export function cutTaskId(taskId: string): { readonly node: string; readonly ordinal?: number } {
  const hash = taskId.lastIndexOf('#');
  const tail = hash === -1 ? '' : taskId.slice(hash + 1);
  if (hash === -1 || !/^\d+$/.test(tail)) return { node: taskId };
  return { node: taskId.slice(0, hash), ordinal: Number.parseInt(tail, 10) };
}

/** The attempt ordinal a task id carries: `node#k` means its `k + 1`-th occurrence. This is the
 *  single derivation of the attempt counter — writers stamp with it, readers cross-check with it. */
export function attemptOfTaskId(taskId: string): number {
  const { ordinal } = cutTaskId(taskId);
  return ordinal === undefined ? 1 : ordinal + 1;
}

/** One block entry with the report's evidence riding beside it — the receipts and the artifact
 *  refs: the block is where the replay and the view read the evidence back, and evidence moves
 *  no state on its own. */
function withEvidence(
  receipts: readonly Receipt[] | undefined,
  outputs: readonly ArtifactRef[] | undefined,
  block: PendingWrite,
): PendingWrite {
  if (receipts === undefined && outputs === undefined) return block;
  return {
    ...block,
    ...(receipts === undefined ? {} : { receipts }),
    ...(outputs === undefined ? {} : { outputs }),
  };
}

/** The writes recorded after one position, up to the checkpoint that follows them — each
 *  with the routing key the settlement answered, its attempt ordinal, and its receipts (the
 *  replay reads the key and the attempt off the block, never recomputing them, and reads the
 *  receipts only as evidence beside the folded state). */
function writesAfter(records: readonly LogRecord[], position: number): PendingWrite[] {
  const pairs: PendingWrite[] = [];
  // The tail is walked by index, never copied: the block ends at the next checkpoint anyway.
  for (let at = position + 1; at < records.length; at += 1) {
    const record = records[at];
    if (record.kind === 'checkpoint') break;
    // A progress marker is a host marker beside the work: it moves no state and joins no block,
    // so the replay that reads it folds exactly the state the replay without it would.
    if (record.kind === 'progress') continue;
    // A keyed `failed` fact is a state mover: it joins the block with its writes, its key, and its
    // kind, so the replay folds and routes exactly as the live step did and the view reads the kind
    // off the block. A keyless outcome — the `retry` ask or a `failed` without a key — moves no
    // state and rides the chain alone.
    if (record.kind === 'outcome') {
      if (record.entry.outcome !== 'retry' && record.entry.key !== undefined && record.entry.writes !== undefined) {
        pairs.push(
          withEvidence(record.entry.receipts, record.entry.outputs, {
            taskId: record.entry.taskId,
            writes: record.entry.writes,
            key: record.entry.key,
            fact: record.entry.outcome,
            attempt: record.entry.attempt,
          }),
        );
      }
      continue;
    }
    for (const writes of record.entry.writes) {
      pairs.push(
        withEvidence(record.entry.receipts, record.entry.outputs, {
          taskId: record.entry.taskId,
          writes,
          ...(record.entry.key === undefined ? {} : { key: record.entry.key }),
          attempt: record.entry.attempt,
        }),
      );
    }
  }
  return pairs;
}

/** One tuple: the checkpoint, the config that addresses it, and the writes that followed it. */
function tupleOf(threadId: string, records: readonly LogRecord[], held: Held): CheckpointTuple {
  return {
    config: { thread_id: threadId, checkpoint_id: held.checkpoint.id },
    checkpoint: held.checkpoint,
    metadata: held.metadata,
    pendingWrites: writesAfter(records, held.index),
  };
}

/**
 * The state a checkpoint stands on: one entry per declared channel, the stored
 * value when the checkpoint carries one and the reducer's empty otherwise, each
 * with the version the checkpoint recorded.
 */
export function stateOf(channels: readonly ChannelSpec[], checkpoint: Checkpoint): ChannelState {
  const state: Record<string, { readonly value: Json; readonly version: number }> = {};
  for (const spec of channels) {
    // A stored `null` is a value, not an absence: the fallback answers only a channel the
    // checkpoint carries no own entry for, so a cold fold reads exactly what the live fold wrote.
    const held = ownValue(checkpoint.channel_values, spec.name);
    defineOwn(state, spec.name, {
      value: held === undefined ? REDUCER_EMPTY[spec.reducer] : held,
      version: ownValue(checkpoint.channel_versions, spec.name) ?? 0,
    });
  }
  return state;
}

/** Build a saver over the ports. Every method reads the log; nothing is held between calls. */
/** `getTuple`: the position one config names, else the newest; the tuple carries the writes
 *  that followed it. */
async function getTupleOf(ports: SaverPorts, config: ThreadConfig): Promise<CheckpointTuple | undefined> {
  const records = await ports.log.read(config.thread_id);
  const held = checkpointsOf(records);
  const chosen =
    config.checkpoint_id === undefined
      ? held.at(-1)
      : held.find((entry) => entry.checkpoint.id === config.checkpoint_id);
  return chosen === undefined ? undefined : tupleOf(config.thread_id, records, chosen);
}

/** `list`: the stored positions newest-first, with the before/limit window applied. */
async function listOf(
  ports: SaverPorts,
  config: ThreadConfig,
  options?: CheckpointListOptions,
): Promise<CheckpointTuple[]> {
  const records = await ports.log.read(config.thread_id);
  let held = checkpointsOf(records);
  if (options?.before !== undefined) {
    const at = held.findIndex((entry) => entry.checkpoint.id === options.before);
    if (at === -1) throw new SaverError('unknown-checkpoint', `no checkpoint is stored as '${options.before}'`);
    held = held.slice(0, at);
  }
  const newestFirst = [...held].reverse();
  return (options?.limit === undefined ? newestFirst : newestFirst.slice(0, options.limit)).map((entry) =>
    tupleOf(config.thread_id, records, entry),
  );
}

/** `put`: the metadata face checked against the frozen field set, the id minted once, and the
 *  parent named by the position this step ran at — the checkpoint it read, or none at the head. */
async function putOf(
  ports: SaverPorts,
  config: ThreadConfig,
  checkpoint: Checkpoint,
  metadata: CheckpointMetadata,
): Promise<ThreadConfig> {
  for (const [name] of Object.entries(metadata)) {
    if (!Object.hasOwn(METADATA_FIELDS, name)) {
      throw new SaverError('second-authority', `metadata may not carry '${name}' — the chain is the authority`);
    }
  }
  const records = await ports.log.read(config.thread_id);
  const id = ports.identity.nextId();
  if (checkpointsOf(records).some((entry) => entry.checkpoint.id === id)) {
    throw new SaverError('duplicate-checkpoint', `checkpoint '${id}' already exists`);
  }
  const stored: Checkpoint = {
    ...checkpoint,
    id,
    ts: ports.clock.now(),
    ...(config.checkpoint_id === undefined
      ? {}
      : { parent_config: { thread_id: config.thread_id, checkpoint_id: config.checkpoint_id } }),
  };
  await ports.log.append(config.thread_id, { kind: 'checkpoint', checkpoint: stored, metadata });
  return { thread_id: config.thread_id, checkpoint_id: id };
}

/** `putWrites`: the block's one write record, the attempt stamped off its own task id. */
async function putWritesOf(
  ports: SaverPorts,
  { config, writes, taskId, key, receipts, outputs }: WriteRequest,
): Promise<void> {
  const attempt = attemptOfTaskId(taskId);
  await ports.log.append(config.thread_id, {
    kind: 'writes',
    entry: {
      taskId,
      writes,
      attempt,
      ...(key === undefined ? {} : { key }),
      ...(receipts === undefined ? {} : { receipts }),
      ...(outputs === undefined ? {} : { outputs }),
    },
  });
}

/** `putOutcome`: the outcome's one journal record, the attempt stamped off its own task id. */
async function putOutcomeOf(
  ports: SaverPorts,
  { config, taskId, outcome, reason, key, writes, receipts, outputs }: OutcomeRequest,
): Promise<void> {
  const attempt = attemptOfTaskId(taskId);
  await ports.log.append(config.thread_id, {
    kind: 'outcome',
    entry: {
      taskId,
      outcome,
      attempt,
      ...(reason === undefined ? {} : { reason }),
      ...(key === undefined ? {} : { key }),
      ...(writes === undefined ? {} : { writes }),
      ...(receipts === undefined ? {} : { receipts }),
      ...(outputs === undefined ? {} : { outputs }),
    },
  });
}

export function createCheckpointSaver(ports: SaverPorts): CheckpointSaver {
  return {
    getTuple: (config) => getTupleOf(ports, config),
    list: (config, options) => listOf(ports, config, options),
    put: (config, checkpoint, metadata) => putOf(ports, config, checkpoint, metadata),
    putWrites: (request) => putWritesOf(ports, request),
    putOutcome: (request) => putOutcomeOf(ports, request),
  };
}
