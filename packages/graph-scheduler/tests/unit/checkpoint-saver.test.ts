/**
 * Unit tests for LibsqlCheckpointSaver.putWrites — stable per-channel idx
 * (contract v2.1, run-record spec: "Checkpoint write idx SHALL be stable per
 * channel").
 *
 * Two custom channels in one write batch must persist under distinct idx —
 * the former `writes.indexOf([channel, value])` fallback built a fresh array
 * per comparison and never matched, collapsing every custom channel onto the
 * same conflict key in checkpoint_writes (channels clobbered each other).
 */
import type { RunnableConfig } from '@langchain/core/runnables';
import { type Checkpoint } from '@langchain/langgraph-checkpoint';
import { Effect } from 'effect';
import Database from 'libsql';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeCheckpointSaver, type LibsqlCheckpointSaver } from '../../src/lib/db/checkpoint-saver.js';
import { migrate } from '../../src/lib/db/migration.js';

const THREAD = 'run-custom-channels';
const CHECKPOINT_ID = 'cp-1';

interface Fixture {
  db: ReturnType<typeof Database>;
  saver: LibsqlCheckpointSaver;
  config: RunnableConfig;
}

function makeFixture(): Fixture {
  const db = new Database(':memory:');
  Effect.runSync(migrate(db));
  const saver = makeCheckpointSaver(db);
  const config: RunnableConfig = {
    configurable: { thread_id: THREAD, checkpoint_ns: '', checkpoint_id: CHECKPOINT_ID },
  };
  return { db, saver, config };
}

/** Minimal checkpoint row — enough for put() to persist + getTuple to re-read. */
function minimalCheckpoint(id: string): Checkpoint {
  return {
    v: 1,
    id,
    ts: new Date().toISOString(),
    channel_values: {},
    channel_versions: {},
    versions_seen: {},
  };
}

/** All checkpoint_writes rows for the thread — channel + idx pairs. */
function writeRows(db: ReturnType<typeof Database>): Array<{ channel: string; idx: number; task_id: string }> {
  return db
    .prepare('SELECT task_id, channel, idx FROM checkpoint_writes WHERE thread_id = ? ORDER BY idx')
    .all(THREAD) as Array<{ channel: string; idx: number; task_id: string }>;
}

/** channel → value from a checkpoint tuple's pending writes. */
function pendingValues(
  tuple: { pendingWrites?: Array<[string, string, unknown]> } | undefined,
): Record<string, unknown> {
  return Object.fromEntries((tuple?.pendingWrites ?? []).map(([, channel, value]) => [channel, value]));
}

describe('LibsqlCheckpointSaver.putWrites — stable per-channel idx', () => {
  let fix: Fixture;

  beforeEach(async () => {
    fix = makeFixture();
    await fix.saver.put(fix.config, minimalCheckpoint(CHECKPOINT_ID), {}, {});
  });

  afterEach(() => {
    fix.db.close();
  });

  it('two custom channels in one batch persist under distinct idx — both re-read', async () => {
    const writes: Array<[string, unknown]> = [
      ['nodeStatus', { agentA: 'done' }],
      ['retryCount', { agentA: 1 }],
    ];
    await fix.saver.putWrites(fix.config, writes, 'task-1');

    // Re-read via the saver's own getTuple — both channels' values survive.
    const values = pendingValues(await fix.saver.getTuple(fix.config));
    expect(values.nodeStatus).toEqual({ agentA: 'done' });
    expect(values.retryCount).toEqual({ agentA: 1 });

    // Distinct idx in checkpoint_writes — never the same conflict key.
    const rows = writeRows(fix.db);
    expect(rows).toHaveLength(2);
    const idxs = rows.map((r) => r.idx);
    expect(new Set(idxs).size).toBe(2);
    expect(rows.map((r) => r.channel).sort()).toEqual(['nodeStatus', 'retryCount']);
  });

  it('standard channel mixed with custom channels — all three keep distinct idx', async () => {
    const writes: Array<[string, unknown]> = [
      ['messages', [{ type: 'human', content: 'hi' }]],
      ['nodeStatus', { a: 'done' }],
      ['retryCount', { a: 2 }],
    ];
    await fix.saver.putWrites(fix.config, writes, 'task-1');

    const rows = writeRows(fix.db);
    expect(rows).toHaveLength(3);
    const idxs = rows.map((r) => r.idx);
    expect(new Set(idxs).size).toBe(3);

    const values = pendingValues(await fix.saver.getTuple(fix.config));
    expect(values.messages).toEqual([{ type: 'human', content: 'hi' }]);
    expect(values.nodeStatus).toEqual({ a: 'done' });
    expect(values.retryCount).toEqual({ a: 2 });
  });

  it('same custom channel across two checkpoints does not collide (per-checkpoint idx scope)', async () => {
    await fix.saver.putWrites(fix.config, [['nodeStatus', { a: 'done' }]], 'task-1');
    // Second checkpoint — the write belongs to a different checkpoint_id.
    const config2: RunnableConfig = {
      configurable: { thread_id: THREAD, checkpoint_ns: '', checkpoint_id: 'cp-2' },
    };
    await fix.saver.put(config2, minimalCheckpoint('cp-2'), {}, {});
    await fix.saver.putWrites(config2, [['nodeStatus', { a: 'active' }]], 'task-1');

    const value1 = pendingValues(await fix.saver.getTuple(fix.config)).nodeStatus;
    const value2 = pendingValues(await fix.saver.getTuple(config2)).nodeStatus;
    expect(value1).toEqual({ a: 'done' });
    expect(value2).toEqual({ a: 'active' });
  });
});

describe('LibsqlCheckpointSaver.deleteThread — cascade cleanup (run-record spec: Cleanup single source)', () => {
  let fix: Fixture;

  beforeEach(async () => {
    fix = makeFixture();
    await fix.saver.put(fix.config, minimalCheckpoint(CHECKPOINT_ID), {}, {});
    await fix.saver.putWrites(fix.config, [['nodeStatus', { a: 'done' }]], 'task-1');
  });

  afterEach(() => {
    fix.db.close();
  });

  it("removes the thread's checkpoints and checkpoint_writes rows", async () => {
    const count = (table: string): number =>
      (fix.db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE thread_id = ?`).get(THREAD) as { n: number }).n;

    expect(count('checkpoints')).toBe(1);
    expect(count('checkpoint_writes')).toBe(1);

    await fix.saver.deleteThread(THREAD);

    expect(count('checkpoints')).toBe(0);
    expect(count('checkpoint_writes')).toBe(0);
  });

  it('leaves other threads untouched', async () => {
    const other: RunnableConfig = {
      configurable: { thread_id: 'other-thread', checkpoint_ns: '', checkpoint_id: 'cp-other' },
    };
    await fix.saver.put(other, minimalCheckpoint('cp-other'), {}, {});

    await fix.saver.deleteThread(THREAD);

    const otherCount = (
      fix.db.prepare('SELECT COUNT(*) AS n FROM checkpoints WHERE thread_id = ?').get('other-thread') as {
        n: number;
      }
    ).n;
    expect(otherCount).toBe(1);
  });
});
