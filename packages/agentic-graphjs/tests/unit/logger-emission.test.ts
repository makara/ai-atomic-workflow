/**
 * The logging port of the entry face: with no port injected the module answers
 * exactly what it answered before the port existed — the two rides below run one fixed script
 * each and their answer transcripts are compared byte-for-byte — and with a spy port the
 * emission table fires: eight or more signals, every one a refusal or a degradation the
 * module already answers, carried out through the port and nowhere else.
 */
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
  type Runtime,
  type RuntimeDeps,
} from '../../src/internal.js';
const State = Annotation.Root({
  executed: Annotation({ source: 'node', reducer: 'append' }),
  settled: Annotation({ source: 'node', reducer: 'merge' }),
});

/** A loop whose second lap re-enters `b`: the re-entry mints `b#1`, so the chain carries an
 *  occurrence count — the same fixture the replay suites ride, kept read-only here. */
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

/** `cycle` loads and nothing else answers: ghost names refuse through the same face. */
const mixedSource: GraphSource = {
  load: async (name) =>
    name === 'cycle' ? { ok: true, graph: cycleGraph(), structureHash: 'h' } : { ok: false, code: 'GRAPH_UNREADABLE' },
};

/** Nothing loads here: every read of this source answers a refusal — the refusal-class signals
 *  fire on it without any journal behind the call. */
const ghostSource: GraphSource = { load: async () => ({ ok: false, code: 'GRAPH_UNREADABLE' }) };

/** A deterministic checkpointer over one private log: the same journal bytes read twice read alike. */
function saverOver(log: RecordLogPort) {
  let issued = 0;
  return createMemorySaver({
    log,
    identity: { nextId: () => String((issued += 1)) },
    clock: { now: () => '2026-09-30T00:00:00Z' },
  });
}

/** A recording port: every emission rides `seen`, prefixed by the level it answers. */
function recorder() {
  const seen: string[] = [];
  return {
    seen,
    port: {
      info: (message: string) => seen.push(`info ${message}`),
      warn: (message: string) => seen.push(`warn ${message}`),
      error: (message: string) => seen.push(`error ${message}`),
      debug: (message: string) => seen.push(`debug ${message}`),
    },
  };
}

/** The cycle, journaled to drain: a#0, b#0, gate#0 (`again` → b#1), b#1, gate#1 (`done` → END). */
async function drain(runtime: Runtime): Promise<void> {
  await runtime.take({ graph: 'cycle' });
  await runtime.report({ graph: 'cycle', taskId: 'a#0', outcome: 'succeeded', result: 'A', key: 'done' });
  await runtime.report({ graph: 'cycle', taskId: 'b#0', outcome: 'succeeded', result: 'B', key: 'done' });
  await runtime.report({ graph: 'cycle', taskId: 'gate#0', outcome: 'succeeded', result: 'loop', key: 'again' });
  await runtime.report({ graph: 'cycle', taskId: 'b#1', outcome: 'succeeded', result: 'B', key: 'done' });
  await runtime.report({ graph: 'cycle', taskId: 'gate#1', outcome: 'succeeded', result: 'end', key: 'done' });
}

/** The journal with one hand-edited occurrence: `b#1` re-enters as attempt 5, a count the chain
 *  never made, so every cold read over this copy replays refused — the counterexample the
 *  emission table needs. A copy keeps the bytes, so the refusal is exactly the edit made here. */
async function tampered(): Promise<RecordLogPort> {
  const log = createMemoryLog();
  await drain(createRuntime({ checkpointer: saverOver(log), context: { threadId: 't' }, graphs: mixedSource }));
  const edited = createMemoryLog();
  for (const record of await log.read('t')) {
    if (record.kind === 'writes' && record.entry.taskId === 'b#1' && record.entry.attempt === 2) {
      await edited.append('t', { ...record, entry: { ...record.entry, attempt: 5 } });
    } else {
      await edited.append('t', record);
    }
  }
  return edited;
}

/** One full pass over one runtime, in one fixed order: the ghost refusals (load refused), the
 *  rewind refusal, then the chain read refused through its edited journal. */
async function ride(runtime: Runtime): Promise<readonly string[]> {
  const answers: string[] = [];
  answers.push(JSON.stringify(await runtime.take({ graph: 'ghost' })));
  answers.push(
    JSON.stringify(await runtime.report({ graph: 'ghost', taskId: 'a#0', outcome: 'succeeded', result: 'A' })),
  );
  answers.push(JSON.stringify(await runtime.rewind({ to: 'nope' })));
  answers.push(JSON.stringify(await runtime.getState({ graph: 'ghost' })));
  answers.push(JSON.stringify(await runtime.status({ graph: 'ghost' })));
  answers.push(JSON.stringify(await runtime.getState({ graph: 'cycle' })));
  answers.push(JSON.stringify(await runtime.status({ graph: 'cycle' })));
  return answers;
}

/** The three refusal planes and their rides, moved out as one body: guard (unbound) →
 *  ghost (no journal) → chain (journal edited away from its own chain), the same calls in the
 *  same order the second block body used to write them. */
async function refusalPlanes(spy: ReturnType<typeof recorder>) {
  const unbound = createRuntime({
    context: { threadId: 'ses_guard' },
    graphs: mixedSource,
    logger: spy.port,
  } as unknown as RuntimeDeps);
  const guarded = await unbound.take({ graph: 'cycle' });

  const ghost = createRuntime({
    checkpointer: saverOver(createMemoryLog()),
    context: { threadId: 'ses_ghost' },
    graphs: ghostSource,
    logger: spy.port,
  });
  const chain = createRuntime({
    checkpointer: saverOver(await tampered()),
    context: { threadId: 'ses_chain', checkpointId: 'nope' },
    graphs: mixedSource,
    logger: spy.port,
  });
  await ride(ghost);
  const chainRun = await ride(chain);
  return { guarded, chainRun };
}

describe('the entry face emission', () => {
  it('answers the same with and without a logging port', async () => {
    const quiet = createRuntime({
      checkpointer: saverOver(await tampered()),
      context: { threadId: 't' },
      graphs: mixedSource,
    });
    const spy = recorder();
    const loud = createRuntime({
      checkpointer: saverOver(await tampered()),
      context: { threadId: 't' },
      graphs: mixedSource,
      logger: spy.port,
    });

    // The default silence is not a degraded path: the quiet module must answer the refusal
    // table byte-for-byte like the one holding a port — one ride each, one transcript each.
    const quietRun = await ride(quiet);
    const loudRun = await ride(loud);
    expect(loudRun).toEqual(quietRun);

    // And the injected port heard the refusals the two runtimes answered: every line is one
    // of the module's own signals, prefixed by the level it answers. The counterexample
    // journal makes the chain reads refuse, so the pass fires every load, rewind, and chain
    // slot exactly once — seven calls, seven emissions, the pass's full emission table.
    expect(spy.seen.length).toBe(7);
    expect(
      spy.seen.every(
        (line) =>
          line.startsWith('info ') ||
          line.startsWith('warn ') ||
          line.startsWith('error ') ||
          line.startsWith('debug '),
      ),
    ).toBe(true);
  });

  it('emits the guard, ghost, and chain refusals through the injected port', async () => {
    const spy = recorder();

    // The unbound plane: the guard refuses before any method fires, and the refusal is emitted.
    // Nothing loads anywhere, and the journal of the second plane was edited away from its own
    // chain: the read refusals fire per call, cold, with the chain or without one.
    const { guarded, chainRun } = await refusalPlanes(spy);

    expect('refusal' in guarded ? guarded.refusal.code : '').toBe('infra');
    // The set counts distinct emissions: guard + ghost (load refused x4, rewind refused) +
    // chain (the reads the edited journal refused, cold, on both planes).
    expect(new Set(spy.seen).size).toBeGreaterThanOrEqual(8);
    expect(
      spy.seen.every(
        (line) =>
          line.startsWith('info ') ||
          line.startsWith('warn ') ||
          line.startsWith('error ') ||
          line.startsWith('debug '),
      ),
    ).toBe(true);
    expect(chainRun.length).toBe(7);
  });
});
