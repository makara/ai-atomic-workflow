import { describe, expect, it } from 'vitest';

import {
  Annotation,
  END,
  START,
  StateGraph,
  createMemoryLog,
  createMemorySaver,
  createRuntime,
  type CompiledGraph,
  type GraphSource,
  type RecordLogPort,
} from '../../src/internal.js';

const State = Annotation.Root({
  executed: Annotation({ source: 'node', reducer: 'append' }),
  settled: Annotation({ source: 'node', reducer: 'merge' }),
});

/** A loop whose second lap re-enters `b`: the re-entry mints `b#1`, so the chain carries an
 *  occurrence count — the attempt counter the replay must keep aligned with its own reads. */
function cycleGraph(): CompiledGraph {
  return new StateGraph(State)
    .addNode('a', { task: 'A', keys: [{ name: 'done' }] })
    .addNode('b', { task: 'B', keys: [{ name: 'done' }] })
    .addNode('gate', { task: 'which', keys: [{ name: 'again' }, { name: 'done' }] })
    .addEdge(START, 'a')
    .addConditionalEdges('a', { done: 'b' })
    .addConditionalEdges('b', { done: 'gate' })
    .addConditionalEdges('gate', { again: 'b', done: END })
    .compile({ name: 'cycle' });
}

const cycleSource: GraphSource = {
  load: async () => ({ ok: true, graph: cycleGraph(), structureHash: 'h' }),
};

/** A fresh deterministic saver over one log — the bytes a cold read replays, id and clock alike. */
function saverOver(log: RecordLogPort) {
  let issued = 0;
  return createMemorySaver({
    log,
    identity: { nextId: () => String((issued += 1)) },
    clock: { now: () => '2026-09-30T00:00:00Z' },
  });
}

/** A cold runtime reading one log from its head — the same face the live run rode, cold. */
function replayOver(log: RecordLogPort) {
  return createRuntime({ checkpointer: saverOver(log), context: { threadId: 't' }, graphs: cycleSource });
}

/** A copy of one log's thread, with one record written beside the chain's own — a copy keeps
 *  the bytes, so any difference the comparison sees is exactly the difference the test made. */
async function copyWithMarker(log: RecordLogPort): Promise<RecordLogPort> {
  const copy = createMemoryLog();
  for (const record of await log.read('t')) {
    if (record.kind === 'writes' && record.entry.taskId === 'b#1') {
      await copy.append('t', { kind: 'progress', entry: { node: 'b', detail: 'checking the loop', at: '4' } });
    }
    await copy.append('t', record);
  }
  return copy;
}

/** The live cycle, run to drain: a#0, b#0, gate#0 (`again` → b#1), b#1, gate#1 (`done` → END). */
async function runCycle(runtime: ReturnType<typeof createRuntime>) {
  await runtime.take({ graph: 'cycle' });
  await runtime.report({ graph: 'cycle', taskId: 'a#0', outcome: 'succeeded', result: 'A', key: 'done' });
  await runtime.report({ graph: 'cycle', taskId: 'b#0', outcome: 'succeeded', result: 'B', key: 'done' });
  await runtime.report({ graph: 'cycle', taskId: 'gate#0', outcome: 'succeeded', result: 'loop', key: 'again' });
  await runtime.report({ graph: 'cycle', taskId: 'b#1', outcome: 'succeeded', result: 'B', key: 'done' });
  await runtime.report({ graph: 'cycle', taskId: 'gate#1', outcome: 'succeeded', result: 'end', key: 'done' });
}

describe('the activity face', () => {
  it('replays a chain whose attempt numbers stand as the chain journaled them', async () => {
    const log = createMemoryLog();
    const live = replayOver(log);
    await runCycle(live);

    const view = await live.status({ graph: 'cycle' });
    const replay = replayOver(await copyWithMarker(log));
    const replayView = await replay.status({ graph: 'cycle' });

    // A chain replays byte-identically whether or not progress markers stand beside it: the
    // marker is read and inert, so the replay that sees the markers folds exactly the state
    // the replay without them folds — one window because no marker moved it.
    expect(JSON.stringify(replayView)).toBe(JSON.stringify(view));
    expect(replayView).toEqual(view);
    expect(replayView.liveness.attempts).toEqual({ a: 1, b: 2, gate: 2 });
    expect(replayView.settlements.map((fact) => `${fact.taskId}@${fact.attempt}`)).toEqual([
      'a#0@1',
      'b#0@1',
      'gate#0@1',
      'b#1@2',
      'gate#1@2',
    ]);
    // A drained chain stays drained across the replay: the last block routed to END, and the
    // replay routes on the same recorded keys, so nothing stands outstanding to be issued.
    expect((await replay.take({ graph: 'cycle' })).kind).toBe('unserved');
  });

  it('refuses a replay whose journal carries an attempt the chain never counted', async () => {
    const log = createMemoryLog();
    const live = replayOver(log);
    await runCycle(live);
    const view = await live.status({ graph: 'cycle' });

    // The counterexample: the second lap's fact re-entered as `b#1`, its second occurrence, and
    // the journal carries that number. A hand-edit to it — attempt 5, a count the chain never
    // made — is a chain edited after the fact, and the replay must notice rather than replay
    // the edited chain as though it were the chain itself.
    const edited = createMemoryLog();
    for (const record of await log.read('t')) {
      if (record.kind === 'writes' && record.entry.taskId === 'b#1' && record.entry.attempt === 2) {
        await edited.append('t', { ...record, entry: { ...record.entry, attempt: 5 } });
      } else {
        await edited.append('t', record);
      }
    }

    const tampered = replayOver(edited);
    const redView = await tampered.status({ graph: 'cycle' });

    // The byte-compare is the guard's teeth: a replay that ignored the mismatch would answer
    // byte-identically to the honest chain — with the guard it answers RED, a refusal view.
    expect(JSON.stringify(redView)).not.toBe(JSON.stringify(view));
    expect(redView).not.toEqual(view);
    expect((await tampered.take({ graph: 'cycle' })).kind).toBe('rejected');

    // And while the chain is honest the counter stays its own: reading the view twice moves
    // nothing — the ledger's numbers are neither written back nor recomputed into a second one.
    const ledger = JSON.stringify(await log.read('t'));
    await live.status({ graph: 'cycle' });
    expect(JSON.stringify(await log.read('t'))).toBe(ledger);
  });
});

describe('the marker beside the chain', () => {
  it('keeps the marker beside the chain in every window that reads it', async () => {
    const log = createMemoryLog();
    const live = replayOver(log);
    await runCycle(live);

    const marked = await copyWithMarker(log);

    // A slice read at the position the marker names reads the same window the same read without
    // the marker makes: beside the chain means beside every window, not outside the last one.
    const clean = replayOver(log);
    const markedRead = replayOver(marked);
    expect(JSON.stringify(await markedRead.status({ graph: 'cycle', at: '4' }))).toBe(
      JSON.stringify(await clean.status({ graph: 'cycle', at: '4' })),
    );

    // And the whole replay is byte-identical through the marker-carrying journal — a drained
    // chain stays drained beside its host's markers exactly as it drains without them.
    expect(JSON.stringify(await replayOver(marked).status({ graph: 'cycle' }))).toBe(
      JSON.stringify(await replayOver(log).status({ graph: 'cycle' })),
    );
    expect((await replayOver(marked).take({ graph: 'cycle' })).kind).toBe('unserved');
    expect((await replayOver(log).take({ graph: 'cycle' })).kind).toBe('unserved');
  });
});
