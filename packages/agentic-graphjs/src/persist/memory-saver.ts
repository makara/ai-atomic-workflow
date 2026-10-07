/**
 * The in-memory implementation — a record log in a map, and a saver over it.
 *
 * Identity and the clock still arrive from outside: an in-memory log is a
 * storage choice, not a licence for the package to mint ids or read a clock.
 * A caller may hand in an existing log, so two savers can read the same chain.
 *
 * @module
 */

import type { ClockPort, IdentityPort } from '../contract/log.js';
import type { CheckpointSaver, LogRecord, RecordLogPort } from '../contract/records.js';
import { createCheckpointSaver } from './saver.js';

/** An in-memory record log: one array per thread, kept in append order. */
export function createMemoryLog(): RecordLogPort {
  const threads = new Map<string, LogRecord[]>();
  return {
    append(threadId, record) {
      const held = threads.get(threadId);
      if (held === undefined) threads.set(threadId, [record]);
      else held.push(record);
      return Promise.resolve();
    },
    read(threadId) {
      return Promise.resolve([...(threads.get(threadId) ?? [])]);
    },
    clear(threadId) {
      threads.delete(threadId);
      return Promise.resolve();
    },
  };
}

/** The ports a memory saver needs: identity and the clock, plus an optional shared log. */
export interface MemorySaverPorts {
  readonly identity: IdentityPort;
  readonly clock: ClockPort;
  readonly log?: RecordLogPort;
}

/** A saver over an in-memory log, reading identity and the clock from the caller. */
export function createMemorySaver(ports: MemorySaverPorts): CheckpointSaver {
  return createCheckpointSaver({
    log: ports.log ?? createMemoryLog(),
    identity: ports.identity,
    clock: ports.clock,
  });
}
