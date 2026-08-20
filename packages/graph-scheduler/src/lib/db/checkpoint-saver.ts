/**
 * LibsqlCheckpointSaver — custom BaseCheckpointSaver over the existing libsql DB.
 *
 * Replaces the former two-table node persistence (graph_runs + node_states):
 * node execution state now lives in LangGraph checkpoints. DB zero migration —
 * the same libsql database file gains checkpoint tables (additive DDL, single
 * final shape, no ladder). The graph_runs table is retained for run identity /
 * progress / args / timestamps.
 *
 * Storage contract (per BaseCheckpointSaver):
 * - checkpoints: thread_id + checkpoint_ns + checkpoint_id → serialized
 *   checkpoint + metadata + parent id
 * - checkpoint_writes: thread_id + checkpoint_ns + checkpoint_id + task_id +
 *   idx → pending writes (channel → value)
 *
 * Serialization uses the default JsonPlusSerializer (serde) — the same codec
 * the memory saver uses, so checkpoint blobs are interoperable.
 *
 * @module
 */

import type { RunnableConfig } from '@langchain/core/runnables';
import {
  BaseCheckpointSaver,
  WRITES_IDX_MAP,
  copyCheckpoint,
  type Checkpoint,
  type CheckpointListOptions,
  type CheckpointTuple,
} from '@langchain/langgraph-checkpoint';
import type Database from 'libsql';
import { debugLog } from '../../debug.js';
import { deleteThreadCascade } from './helpers.js';

interface CheckpointRow {
  thread_id: string;
  checkpoint_ns: string;
  checkpoint_id: string;
  parent_checkpoint_id: string | null;
  type: string;
  checkpoint: Uint8Array | string;
  metadata: Uint8Array | string;
}

interface WriteRow {
  task_id: string;
  channel: string;
  type: string;
  value: Uint8Array | string;
}

/** Build a config for a checkpoint tuple. */
function checkpointConfig(threadId: string, checkpointNs: string, checkpointId: string): RunnableConfig {
  return { configurable: { thread_id: threadId, checkpoint_ns: checkpointNs, checkpoint_id: checkpointId } };
}

/**
 * Create a LibsqlCheckpointSaver bound to an open libsql Database handle.
 *
 * The saver reads/writes the checkpoints + checkpoint_writes tables; the
 * graph_runs table (run identity/progress) is managed by the repository —
 * the two coexist in the same DB file.
 */
export function makeCheckpointSaver(db: ReturnType<typeof Database>): LibsqlCheckpointSaver {
  return new LibsqlCheckpointSaver(db);
}

/** BaseCheckpointSaver over libsql — concrete saver for graph.compile(). */
export class LibsqlCheckpointSaver extends BaseCheckpointSaver {
  private readonly db: ReturnType<typeof Database>;

  constructor(db: ReturnType<typeof Database>) {
    super();
    this.db = db;
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId = config.configurable?.thread_id as string | undefined;
    if (threadId === undefined) throw new Error('thread_id is required in config.configurable');
    const checkpointNs = (config.configurable?.checkpoint_ns as string | undefined) ?? '';
    const checkpointId = config.configurable?.checkpoint_id as string | undefined;

    let row: CheckpointRow | undefined;
    if (checkpointId !== undefined) {
      row = this.db
        .prepare(
          `SELECT * FROM checkpoints
           WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?`,
        )
        .get(threadId, checkpointNs, checkpointId) as CheckpointRow | undefined;
    } else {
      // Latest checkpoint for the thread.
      row = this.db
        .prepare(
          `SELECT * FROM checkpoints
           WHERE thread_id = ? AND checkpoint_ns = ?
           ORDER BY created_at DESC, checkpoint_id DESC
           LIMIT 1`,
        )
        .get(threadId, checkpointNs) as CheckpointRow | undefined;
    }
    if (row === undefined) return undefined;

    const pendingWrites = await this._getPendingWrites(threadId, checkpointNs, row.checkpoint_id);
    const checkpoint = await this.serde.loadsTyped(row.type, row.checkpoint);
    const metadata = await this.serde.loadsTyped(row.type, row.metadata);
    const tuple: CheckpointTuple = {
      config: checkpointConfig(threadId, checkpointNs, row.checkpoint_id),
      checkpoint,
      metadata,
      pendingWrites,
    };
    if (row.parent_checkpoint_id !== null) {
      tuple.parentConfig = checkpointConfig(threadId, checkpointNs, row.parent_checkpoint_id);
    }
    return tuple;
  }

  async *list(config: RunnableConfig, options?: CheckpointListOptions): AsyncGenerator<CheckpointTuple> {
    const threadId = config.configurable?.thread_id as string | undefined;
    const checkpointNs = (config.configurable?.checkpoint_ns as string | undefined) ?? '';
    const beforeId = options?.before?.configurable?.checkpoint_id as string | undefined;
    const limit = options?.limit;

    let rows: CheckpointRow[];
    if (threadId !== undefined) {
      rows = this.db
        .prepare(
          `SELECT * FROM checkpoints
           WHERE thread_id = ? AND checkpoint_ns = ?
           ${beforeId !== undefined ? 'AND checkpoint_id < ?' : ''}
           ORDER BY created_at DESC, checkpoint_id DESC
           LIMIT ?`,
        )
        .all(
          ...[threadId, checkpointNs, ...(beforeId !== undefined ? [beforeId] : []), limit ?? -1].filter(
            (v) => v !== undefined,
          ),
        ) as CheckpointRow[];
    } else {
      rows = this.db
        .prepare(
          `SELECT * FROM checkpoints
           WHERE checkpoint_ns = ?
           ${beforeId !== undefined ? 'AND checkpoint_id < ?' : ''}
           ORDER BY created_at DESC, checkpoint_id DESC
           LIMIT ?`,
        )
        .all(
          ...[checkpointNs, ...(beforeId !== undefined ? [beforeId] : []), limit ?? -1].filter((v) => v !== undefined),
        ) as CheckpointRow[];
    }

    for (const row of rows) {
      const pendingWrites = await this._getPendingWrites(threadId ?? row.thread_id, checkpointNs, row.checkpoint_id);
      const tuple: CheckpointTuple = {
        config: checkpointConfig(row.thread_id, row.checkpoint_ns, row.checkpoint_id),
        checkpoint: await this.serde.loadsTyped(row.type, row.checkpoint),
        metadata: await this.serde.loadsTyped(row.type, row.metadata),
        pendingWrites,
      };
      if (row.parent_checkpoint_id !== null) {
        tuple.parentConfig = checkpointConfig(row.thread_id, row.checkpoint_ns, row.parent_checkpoint_id);
      }
      yield tuple;
    }
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: Record<string, unknown>,
    _newVersions: Record<string, string | number>,
  ): Promise<RunnableConfig> {
    const threadId = config.configurable?.thread_id as string | undefined;
    if (threadId === undefined) throw new Error('thread_id is required in config.configurable');
    const checkpointNs = (config.configurable?.checkpoint_ns as string | undefined) ?? '';
    const parentCheckpointId = config.configurable?.checkpoint_id as string | undefined;

    const prepared = copyCheckpoint(checkpoint);
    const [, checkpointBlob] = await this.serde.dumpsTyped(prepared);
    const [, metadataBlob] = await this.serde.dumpsTyped(metadata);
    const type = 'json';

    debugLog('runtime', {
      event: 'checkpoint_put',
      threadId,
      checkpointId: checkpoint.id,
      parentCheckpointId: parentCheckpointId ?? null,
    });

    this.db
      .prepare(
        `INSERT INTO checkpoints (thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, type, checkpoint, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (thread_id, checkpoint_ns, checkpoint_id) DO UPDATE SET
           parent_checkpoint_id = excluded.parent_checkpoint_id,
           type = excluded.type,
           checkpoint = excluded.checkpoint,
           metadata = excluded.metadata,
           created_at = excluded.created_at`,
      )
      .run(
        threadId,
        checkpointNs,
        checkpoint.id,
        parentCheckpointId ?? null,
        type,
        Buffer.from(checkpointBlob as Uint8Array),
        Buffer.from(metadataBlob as Uint8Array),
        new Date().toISOString(),
      );

    return checkpointConfig(threadId, checkpointNs, checkpoint.id);
  }

  async putWrites(config: RunnableConfig, writes: Array<[string, unknown]>, taskId: string): Promise<void> {
    const threadId = config.configurable?.thread_id as string | undefined;
    const checkpointNs = (config.configurable?.checkpoint_ns as string | undefined) ?? '';
    const checkpointId = config.configurable?.checkpoint_id as string | undefined;
    if (threadId === undefined) throw new Error('thread_id is required in config.configurable');
    if (checkpointId === undefined) throw new Error('checkpoint_id is required in config.configurable');

    const stmt = this.db.prepare(
      `INSERT INTO checkpoint_writes (thread_id, checkpoint_ns, checkpoint_id, task_id, idx, channel, type, value)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (thread_id, checkpoint_ns, checkpoint_id, task_id, idx) DO UPDATE SET
         channel = excluded.channel,
         type = excluded.type,
         value = excluded.value`,
    );
    for (const [channel, value] of writes) {
      // Stable per-channel idx: framework standard channels map to fixed
      // indices; custom channels take their in-batch position. The fallback
      // must use value comparison — `writes.indexOf([channel, value])` creates
      // a new array per call and never matches (custom channels all collapse
      // onto idx -1 and clobber each other in checkpoint_writes).
      const idx = WRITES_IDX_MAP[channel] ?? writes.findIndex(([c]) => c === channel);
      const [, valueBlob] = await this.serde.dumpsTyped(value);
      stmt.run(
        threadId,
        checkpointNs,
        checkpointId,
        taskId,
        idx,
        channel,
        'json',
        Buffer.from(valueBlob as Uint8Array),
      );
    }
  }

  async deleteThread(threadId: string): Promise<void> {
    debugLog('runtime', { event: 'checkpoint_thread_deleted', threadId });
    this.db.transaction(() => {
      deleteThreadCascade(this.db, threadId);
    })();
  }

  private async _getPendingWrites(
    threadId: string,
    checkpointNs: string,
    checkpointId: string,
  ): Promise<Array<[string, string, unknown]>> {
    const rows = this.db
      .prepare(
        `SELECT task_id, channel, type, value FROM checkpoint_writes
         WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?
         ORDER BY idx`,
      )
      .all(threadId, checkpointNs, checkpointId) as WriteRow[];
    return Promise.all(
      rows.map(
        async (r) => [r.task_id, r.channel, await this.serde.loadsTyped(r.type, r.value)] as [string, string, unknown],
      ),
    );
  }
}
