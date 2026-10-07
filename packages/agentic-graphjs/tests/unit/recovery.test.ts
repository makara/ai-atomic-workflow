/**
 * The recovery routing experiment: what a non-success answer does.
 *
 * A `failed` that carries a resolvable key routes on it exactly as a success does — the fact
 * and its routing key journal together, under the failure's own kind; a keyless report moves
 * nothing, and a key no router can carry is refused, live and replayed alike. A task the chain
 * already consumed is never issued or routed a second time (the `NO_OUTSTANDING_TASK` guard).
 *
 * A rewind that names the work to keep stands on the frontier the rewound position left: the
 * nodes it did not name stay outstanding and are issued again.
 */

import { describe, expect, it } from 'vitest';

import {
  Annotation,
  END,
  START,
  StateGraph,
  createCheckpointSaver,
  createMemoryLog,
  createMemorySaver,
  createRuntime,
  settle,
  start,
  type CompiledGraph,
  type GraphSource,
  type SettlePorts,
  type ThreadConfig,
} from '../../src/internal.js';

const State = Annotation.Root({
  executed: Annotation({ source: 'node', reducer: 'append' }),
  settled: Annotation({ source: 'node', reducer: 'merge' }),
});

/** A fork whose gate declares two keys, both on a router: the failed report routes on one. */
function fork(): CompiledGraph {
  return new StateGraph(State)
    .addNode('gate', { task: 'which', keys: [{ name: 'onward' }, { name: 'finish' }] })
    .addNode('left', { task: 'L', keys: [{ name: 'done' }] })
    .addEdge(START, 'gate')
    .addConditionalEdges('gate', { onward: 'left', finish: END })
    .addEdge('left', END)
    .compile({ name: 'recover' });
}

/** A keyless chain head with a static hop: no router, so its default key is a no-op there —
 *  the build gate refuses any router that would disagree with the node's empty key set. */
function keyless(): CompiledGraph {
  return new StateGraph(State)
    .addNode('d', { task: 'D' })
    .addNode('e', { task: 'E' })
    .addEdge(START, 'd')
    .addEdge('d', 'e')
    .addEdge('e', END)
    .compile({ name: 'keyless' });
}

/** A fan-out over two branches: one super-step steps over both, so a settlement that names only
 *  one of them is a suspended super-step whose frontier the next position carries unchanged. */
function fanout(): CompiledGraph {
  return new StateGraph(State)
    .addNode('gate', { task: 'which', keys: [{ name: 'onward' }] })
    .addNode('left', { task: 'L', keys: [{ name: 'done' }] })
    .addNode('right', { task: 'R', keys: [{ name: 'done' }] })
    .addEdge(START, 'gate')
    .addEdge('gate', 'left')
    .addEdge('gate', 'right')
    .addEdge('left', END)
    .addEdge('right', END)
    .compile({ name: 'fanout' });
}

/** A deterministic host over one log: fresh ids, fixed clock, so a chain replays byte-exact. */
function host(log = createMemoryLog()): SettlePorts {
  let issued = 0;
  return {
    saver: createCheckpointSaver({
      log,
      identity: { nextId: () => String((issued += 1)) },
      clock: { now: () => '2026-10-03T00:00:00Z' },
    }),
    structureHash: 'h',
  };
}

/** The same chain over two savers, so the cold replay reads what the live run wrote. */
function sharedLog() {
  const log = createMemoryLog();
  let issued = 0;
  const clock = { now: () => '2026-10-03T00:00:00Z' };
  const saver = () => createMemorySaver({ log, identity: { nextId: () => String((issued += 1)) }, clock });
  return { log, saver };
}

const CONFIG: ThreadConfig = { thread_id: 't' };

describe('the recovery route', () => {
  it('routes a failed report that carries a key on that key', async () => {
    const graph = fork();
    const log = createMemoryLog();
    const ports = host(log);
    const answer = await settle(
      CONFIG,
      graph,
      start(graph),
      { taskId: 'gate#0', outcome: 'failed', reason: 'timeout', key: 'onward' },
      ports,
    );
    if ('refusal' in answer) throw new Error('expected a routed failure, not a refusal');
    // Assertion 1: the key is the routing signal — the failure moved the frontier, as a success would.
    expect(answer.state.active).toEqual(['left']);
    // The fact kept its own kind (a task fact stays distinguishable from an executed one) and it
    // carries the key and the write maps, so the replay reads the key instead of recomputing it.
    const records = await log.read('t');
    const facts = records.filter((record) => record.kind === 'outcome');
    expect(facts).toHaveLength(1);
    const fact = facts[0];
    expect(fact?.kind === 'outcome' && fact.entry.key === 'onward' && fact.entry.writes !== undefined).toBe(true);
    expect(records.some((record) => record.kind === 'writes')).toBe(false);
  });

  it('refuses an undeclared key on a failed report, and on a succeeded one', async () => {
    const graph = fork();
    const ports = host();
    const failed = await settle(
      CONFIG,
      graph,
      start(graph),
      { taskId: 'gate#0', outcome: 'failed', reason: 'timeout', key: 'nope' },
      ports,
    );
    const succeeded = await settle(
      CONFIG,
      graph,
      start(graph),
      { taskId: 'gate#0', outcome: 'succeeded', key: 'nope' },
      ports,
    );
    // Counterexample pair: the refusal guard is live on both arms — the state never moved.
    expect(failed).toEqual({
      refusal: { code: 'KEY_UNDECLARED', note: "'nope' — candidates: onward, finish", keys: ['onward', 'finish'] },
    });
    expect(succeeded).toEqual({
      refusal: {
        code: 'KEY_UNDECLARED',
        note: "'nope' — candidates: onward, finish",
        keys: ['onward', 'finish'],
      },
    });
  });
});

describe('the keyless route', () => {
  it('moves a keyless report across the static hop, and refuses a key a keyless node cannot carry', async () => {
    const ports = host();
    const moved = await settle(
      CONFIG,
      keyless(),
      start(keyless()),
      { taskId: 'd#0', outcome: 'succeeded', result: 'D' },
      ports,
    );
    if ('refusal' in moved) throw new Error('expected the keyless hop to move');
    // Assertion 2: the omitted key lands on the mechanical default and static edges ignore it —
    // a keyless report is never a refused move, it is the chain's honest way to step onward.
    expect(moved.state.active).toEqual(['e']);
    const refused = await settle(
      CONFIG,
      keyless(),
      start(keyless()),
      { taskId: 'd#0', outcome: 'succeeded', key: 'onward' },
      host(),
    );
    if (!('refusal' in refused)) throw new Error('expected a refusal, not a moved state');
    // Counterexample: a keyless node declares no candidates, so any carried key is outside the
    // set — the empty set is named verbatim and the refusal moved nothing. (A fresh chain: on
    // the settled one, `d#0` would answer the replay gate before the key is ever read.)
    expect(refused.refusal).toEqual({ code: 'KEY_UNDECLARED', note: "'onward' — candidates: ", keys: [] });
  });

  it('replays a routed failure from the journal — the live chain answers the spent task', async () => {
    const { saver } = sharedLog();
    const graph = fork();
    const source: GraphSource = {
      load: async (name: string) =>
        name === 'recover' ? { ok: true, graph, structureHash: 'h' } : { ok: false, code: 'GRAPH_UNREADABLE' },
    };
    const first = createRuntime({
      checkpointer: saver(),
      context: { threadId: 't' },
      graphs: source,
    });
    const opened = await first.take({ graph: 'recover' });
    expect(opened.kind === 'issued' && opened.tasks[0]?.id).toBe('gate#0');
    await first.report({ graph: 'recover', taskId: 'gate#0', outcome: 'failed', reason: 'timeout', key: 'onward' });
    const moved = await first.take({ graph: 'recover' });
    // The live chain moved on the key, exactly as a succeeded step would have.
    expect(moved.kind === 'issued' && moved.tasks[0]?.id).toBe('left#0');
    // A task the chain consumed is spent — re-reporting it answers the replay gate: the ledger
    // is untouched and the warning names the fact.
    expect(
      await first.report({ graph: 'recover', taskId: 'gate#0', outcome: 'failed', reason: 'timeout', key: 'onward' }),
    ).toEqual({
      kind: 'settled',
      checkpointId: expect.any(String),
      warnings: [{ code: 'ALREADY_SETTLED', note: "'gate#0' already settled (failed)" }],
    });
  });
});

describe('the replayed failure', () => {
  it('a cold replay reads the key from the journal — no second routing', async () => {
    const { saver } = sharedLog();
    const graph = fork();
    const source: GraphSource = {
      load: async (name: string) =>
        name === 'recover' ? { ok: true, graph, structureHash: 'h' } : { ok: false, code: 'GRAPH_UNREADABLE' },
    };
    const first = createRuntime({
      checkpointer: saver(),
      context: { threadId: 't' },
      graphs: source,
    });
    await first.take({ graph: 'recover' });
    await first.report({ graph: 'recover', taskId: 'gate#0', outcome: 'failed', reason: 'timeout', key: 'onward' });
    await first.take({ graph: 'recover' });
    // The cold side reads the key from the journal: the same chain, the same frontier, and the
    // consumed task is not issued or routed again on the cold side either.
    const second = createRuntime({
      checkpointer: saver(),
      context: { threadId: 't' },
      graphs: source,
    });
    const replay = await second.take({ graph: 'recover' });
    expect(replay.kind === 'issued' && replay.tasks.map((task) => task.id)).toEqual(['left#0']);
    expect(
      await second.report({ graph: 'recover', taskId: 'gate#0', outcome: 'failed', reason: 'timeout', key: 'onward' }),
    ).toEqual({
      kind: 'settled',
      checkpointId: expect.any(String),
      warnings: [{ code: 'ALREADY_SETTLED', note: "'gate#0' already settled (failed)" }],
    });
  });
});

describe('the rewind frontier', () => {
  it('keeps the node a rewind does not name outstanding beside the work it kept', async () => {
    const { saver } = sharedLog();
    const graph = fanout();
    const source: GraphSource = {
      load: (name: string) =>
        Promise.resolve(
          name === 'fanout' ? { ok: true, graph, structureHash: 'h' } : { ok: false, code: 'GRAPH_UNREADABLE' },
        ),
    };
    const lane = createRuntime({ checkpointer: saver(), context: { threadId: 't' }, graphs: source });
    await lane.take({ graph: 'fanout' });
    await lane.report({ graph: 'fanout', taskId: 'gate#0', outcome: 'succeeded', key: 'onward' });
    await lane.take({ graph: 'fanout' });
    await lane.report({ graph: 'fanout', taskId: 'left#0', outcome: 'succeeded', key: 'done' });
    // The super-step over `left`/`right` settled only `left`, so the position stands at its entry
    // with the same frontier — the position the rewind lands on still carries both branches.
    const chain = await lane.history({ graph: 'fanout' });
    const rewound = await lane.rewind({ to: chain.at(-1)?.id ?? '', retained: ['left#0'] });
    expect(rewound.kind).toBe('rewound');
    // Assertion: the retained replay keeps `left` settled and leaves `right` outstanding — the
    // branch the rewind did not name is issued again instead of vanishing with the frontier.
    const again = await lane.take({ graph: 'fanout' });
    expect(again.kind === 'issued' && again.tasks.map((task) => task.id)).toEqual(['right#0']);
    expect((await lane.getState({ graph: 'fanout' })).next).toEqual(['right']);
  });
});
