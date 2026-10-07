import { describe, expect, it } from 'vitest';

import {
  SaverError,
  createCheckpointSaver,
  createMemoryLog,
  createMemorySaver,
  serialize,
  stateOf,
  type ChannelSpec,
  type Checkpoint,
  type CheckpointMetadata,
  type CheckpointSaver,
  type Json,
  type RecordLogPort,
} from '../../src/internal.js';
// The task-id convention and its node cut are machinery the internal face does not carry (the
// replay reads them from their modules), so this test reads them the way the replay does.
import { nodeOf } from '../../src/entry/replay.js';
import { attemptOfTaskId, cutTaskId } from '../../src/persist/saver.js';

const CHANNELS: readonly ChannelSpec[] = [
  { name: 'executed', source: 'node', reducer: 'append' },
  { name: 'settlements', source: 'node', reducer: 'merge' },
];

/** One checkpoint, as the engine hands it over before the saver stamps it. */
function checkpoint(
  values: Readonly<Record<string, Json>>,
  versions: Readonly<Record<string, number>> = {},
): Checkpoint {
  return {
    v: 1,
    id: '',
    ts: '',
    channel_values: values,
    channel_versions: versions,
    versions_seen: Object.fromEntries(Object.keys(versions).map((name) => [name, { a: versions[name] ?? 0 }])),
  };
}

/** The metadata one step records with its checkpoint. */
const METADATA: CheckpointMetadata = { graph: 'line', structureHash: 'sh-1', source: 'loop', step: 1 };

/** A saver whose identity and clock count, so every test reads the same ids. */
function harness(log: RecordLogPort = createMemoryLog()): { saver: CheckpointSaver; log: RecordLogPort } {
  let ids = 0;
  let ticks = 0;
  return {
    log,
    saver: createCheckpointSaver({
      log,
      identity: { nextId: () => `cp-${(ids += 1)}` },
      clock: { now: () => `2026-09-30T00:00:${String((ticks += 1)).padStart(2, '0')}Z` },
    }),
  };
}

/** The field names one record carries. */
function fieldsOf(value: object): string[] {
  return Object.entries(value)
    .map(([name]) => name)
    .sort();
}

describe('the four methods', () => {
  it('stamps the checkpoint it is given and answers it by id or as the latest', async () => {
    const { saver } = harness();
    const first = await saver.put({ thread_id: 't1' }, checkpoint({ executed: ['a'] }), METADATA);
    await saver.put({ thread_id: 't1' }, checkpoint({ executed: ['a', 'b'] }, { executed: 2 }), {
      ...METADATA,
      step: 2,
    });

    expect(first).toEqual({ thread_id: 't1', checkpoint_id: 'cp-1' });
    const latest = await saver.getTuple({ thread_id: 't1' });
    expect(latest?.checkpoint.id).toBe('cp-2');
    expect(latest?.metadata.step).toBe(2);
    expect((await saver.getTuple(first))?.checkpoint.id).toBe('cp-1');
    expect(await saver.getTuple({ thread_id: 'absent' })).toBeUndefined();
    expect(await saver.getTuple({ thread_id: 't1', checkpoint_id: 'cp-9' })).toBeUndefined();
  });

  it('pairs each write with its task and hands back only the writes that followed the position', async () => {
    const { saver } = harness();
    await saver.put({ thread_id: 't1' }, checkpoint({}, {}), METADATA);
    await saver.putWrites({
      config: { thread_id: 't1', checkpoint_id: 'cp-1' },
      writes: [{ executed: 'a' }],
      taskId: 'task-1',
    });
    const second = await saver.put({ thread_id: 't1' }, checkpoint({ executed: ['a'] }, { executed: 1 }), {
      ...METADATA,
      step: 2,
    });
    await saver.putWrites({
      config: { thread_id: 't1', checkpoint_id: 'cp-2' },
      writes: [{ settlements: { k: 'v' } }],
      taskId: 'task-2',
    });

    const tuple = await saver.getTuple(second);
    expect(tuple?.pendingWrites).toEqual([{ taskId: 'task-2', writes: { settlements: { k: 'v' } }, attempt: 1 }]);
    expect((await saver.getTuple({ thread_id: 't1', checkpoint_id: 'cp-1' }))?.pendingWrites).toEqual([
      { taskId: 'task-1', writes: { executed: 'a' }, attempt: 1 },
    ]);
  });

  it('reads the state as the view over the stored values and their versions', async () => {
    const { saver } = harness();
    const config = await saver.put({ thread_id: 't1' }, checkpoint({ executed: ['a'] }, { executed: 3 }), METADATA);
    const tuple = await saver.getTuple(config);

    expect(stateOf(CHANNELS, tuple?.checkpoint as never)).toEqual({
      executed: { value: ['a'], version: 3 },
      settlements: { value: {}, version: 0 },
    });
  });
});

describe('the state read', () => {
  it('reads a stored null back as the value it is, never as an absent channel', () => {
    const stored = { channel_values: { executed: null }, channel_versions: { executed: 1 } } as never;

    expect(stateOf(CHANNELS, stored).executed).toEqual({ value: null, version: 1 });
  });

  it('keeps a channel named like a prototype member on the state own face', () => {
    const stored = { channel_values: { ['__proto__']: 'held' }, channel_versions: {} } as never;
    const state = stateOf([{ name: '__proto__', source: 'node', reducer: 'replace' }], stored);

    expect(Object.hasOwn(state, '__proto__')).toBe(true);
    expect(state['__proto__']).toEqual({ value: 'held', version: 0 });
  });
});

describe('listing a thread', () => {
  it('lists newest first and honours limit and a starting point', async () => {
    const { saver } = harness();
    await saver.put({ thread_id: 't1' }, checkpoint({}), METADATA);
    await saver.put({ thread_id: 't1' }, checkpoint({}), { ...METADATA, step: 2 });
    await saver.put({ thread_id: 't1' }, checkpoint({}), { ...METADATA, step: 3 });
    await saver.put({ thread_id: 't2' }, checkpoint({}), METADATA);

    expect((await saver.list({ thread_id: 't1' })).map((tuple) => tuple.checkpoint.id)).toEqual([
      'cp-3',
      'cp-2',
      'cp-1',
    ]);
    expect((await saver.list({ thread_id: 't1' }, { limit: 2 })).map((tuple) => tuple.checkpoint.id)).toEqual([
      'cp-3',
      'cp-2',
    ]);
    expect((await saver.list({ thread_id: 't1' }, { before: 'cp-2' })).map((tuple) => tuple.checkpoint.id)).toEqual([
      'cp-1',
    ]);
    expect(await saver.list({ thread_id: 't2' })).toHaveLength(1);
  });

  it('refuses a starting point the thread does not carry', async () => {
    const { saver } = harness();
    await saver.put({ thread_id: 't1' }, checkpoint({}), METADATA);
    await expect(saver.list({ thread_id: 't1' }, { before: 'cp-7' })).rejects.toThrowError(SaverError);
    await expect(saver.list({ thread_id: 't1' }, { before: 'cp-7' })).rejects.toThrowError(/no checkpoint/);
  });
});

describe('the single-authority guards', () => {
  it('stores the stamped checkpoint and the metadata it was handed, nothing else', async () => {
    const { saver } = harness();
    const config = await saver.put({ thread_id: 't1' }, checkpoint({ executed: ['a'] }, { executed: 1 }), METADATA);
    const tuple = await saver.getTuple(config);

    expect(fieldsOf(tuple?.checkpoint as never)).toEqual([
      'channel_values',
      'channel_versions',
      'id',
      'ts',
      'v',
      'versions_seen',
    ]);
    expect(fieldsOf(tuple?.metadata as never)).toEqual(['graph', 'source', 'step', 'structureHash']);
    expect(tuple?.config).toEqual({ thread_id: 't1', checkpoint_id: 'cp-1' });
  });

  it('refuses metadata that carries anything beyond its four fields', async () => {
    const { saver } = harness();
    const carried = { ...METADATA, state: { executed: ['a'] } } as unknown as CheckpointMetadata;

    await expect(saver.put({ thread_id: 't1' }, checkpoint({}), carried)).rejects.toThrowError(SaverError);
    await expect(saver.put({ thread_id: 't1' }, checkpoint({}), carried)).rejects.toThrowError(
      /the chain is the authority/,
    );
    expect(await saver.list({ thread_id: 't1' })).toEqual([]);
  });

  it('never rewrites a position and refuses a repeated id', async () => {
    const stuck = createCheckpointSaver({
      log: createMemoryLog(),
      identity: { nextId: () => 'only' },
      clock: { now: () => '2026-09-30T00:00:00Z' },
    });
    await stuck.put({ thread_id: 't1' }, checkpoint({}), METADATA);
    await expect(stuck.put({ thread_id: 't1' }, checkpoint({}), METADATA)).rejects.toThrowError(/already exists/);
  });
});

describe('rebuilding from the chain', () => {
  it('rebuilds byte-identically from the same chain through a fresh saver', async () => {
    const log = createMemoryLog();
    const { saver } = harness(log);
    await saver.put({ thread_id: 't1' }, checkpoint({ executed: ['a'] }, { executed: 1 }), METADATA);
    await saver.putWrites({
      config: { thread_id: 't1', checkpoint_id: 'cp-1' },
      writes: [{ executed: 'b' }],
      taskId: 'task-1',
    });
    const config = await saver.put({ thread_id: 't1' }, checkpoint({ executed: ['a', 'b'] }, { executed: 2 }), {
      ...METADATA,
      step: 2,
    });
    const fresh = harness(log).saver;

    const before = await saver.getTuple(config);
    const after = await fresh.getTuple(config);
    expect(serialize(after as never)).toBe(serialize(before as never));
    // The block rides the bytes too: the tuple the writes followed serializes the same from both
    // savers, and the named record carries no positional slot for the serializer to trip over.
    const written = await saver.getTuple({ thread_id: 't1', checkpoint_id: 'cp-1' });
    const writtenFresh = await fresh.getTuple({ thread_id: 't1', checkpoint_id: 'cp-1' });
    expect(written?.pendingWrites).toHaveLength(1);
    expect(serialize(writtenFresh as never)).toBe(serialize(written as never));
    expect(stateOf(CHANNELS, after?.checkpoint as never)).toEqual(stateOf(CHANNELS, before?.checkpoint as never));
    expect(stateOf(CHANNELS, after?.checkpoint as never).executed).toEqual({ value: ['a', 'b'], version: 2 });
  });

  it('wires a memory saver over caller-supplied identity and clock', async () => {
    let ticks = 0;
    const saver = createMemorySaver({ identity: { nextId: () => 'only' }, clock: { now: () => `t${(ticks += 1)}` } });
    const config = await saver.put({ thread_id: 't9' }, checkpoint({ executed: ['a'] }), METADATA);

    expect(await saver.getTuple(config)).toMatchObject({
      checkpoint: { id: 'only', ts: 't1' },
      config: { thread_id: 't9', checkpoint_id: 'only' },
    });
  });
});

/**
 * The one task-id convention: `node#k` names its node, and the tail after the last `#` is the
 * ordinal only when it is all digits — a node carrying its own `#` is never cut in half, and
 * `nodeOf` and `attemptOfTaskId` read the same cut, so the two can never disagree.
 */
describe('the task id cut', () => {
  it('reads the ordinal off the last hash, and only when the tail is all digits', () => {
    expect(cutTaskId('a#2')).toEqual({ node: 'a', ordinal: 2 });
    expect(cutTaskId('a#b#3')).toEqual({ node: 'a#b', ordinal: 3 });
    expect(cutTaskId('a#x')).toEqual({ node: 'a#x' });
    expect(cutTaskId('a')).toEqual({ node: 'a' });
  });

  it('cuts the node and the attempt through the same read, so the two never disagree', () => {
    expect(attemptOfTaskId('a#2')).toBe(3);
    expect(nodeOf('a#2')).toBe('a');
    expect(attemptOfTaskId('a#x')).toBe(1);
    expect(nodeOf('a#x')).toBe('a#x');
  });
});
