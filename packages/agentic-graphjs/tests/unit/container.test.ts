import { InjectionMode, Lifetime, asFunction, asValue, createContainer } from 'awilix';
import { describe, expect, it } from 'vitest';

import {
  Annotation,
  END,
  PORTS,
  START,
  StateGraph,
  createMemoryLog,
  createMemorySaver,
  createRuntime,
  runtimeContainer,
  runtimeRegistrations,
  type CompiledGraph,
  type GraphSource,
  type PortToken,
  type Runtime,
  type RuntimeCradle,
  type RuntimeDeps,
} from '../../src/index.js';

const State = Annotation.Root({
  executed: Annotation({ source: 'node', reducer: 'append' }),
  settled: Annotation({ source: 'node', reducer: 'merge' }),
});

/** A three-node static chain; every node declares one key, so the mechanical face covers it. */
function chainGraph(): CompiledGraph {
  return new StateGraph(State)
    .addNode('a', { task: 'A', keys: [{ name: 'done' }] })
    .addNode('b', { task: 'B', keys: [{ name: 'done' }] })
    .addNode('c', { task: 'C', keys: [{ name: 'done' }] })
    .addEdge(START, 'a')
    .addConditionalEdges('a', { done: 'b' })
    .addConditionalEdges('b', { done: 'c' })
    .addConditionalEdges('c', { done: END })
    .compile({ name: 'chain' });
}

function sourceFor(graph: CompiledGraph): GraphSource {
  return {
    load: async (name) =>
      name === 'chain' ? { ok: true, graph, structureHash: 'h' } : { ok: false, code: 'GRAPH_UNREADABLE' },
  };
}

/** A fresh deterministic checkpointer over its own in-memory log. */
function freshSaver() {
  let issued = 0;
  return createMemorySaver({
    log: createMemoryLog(),
    identity: { nextId: () => String((issued += 1)) },
    clock: { now: () => '2026-10-02T00:00:00Z' },
  });
}

/** The functional route's capability set: one plain deps object. */
function host(graph: CompiledGraph): RuntimeDeps {
  return {
    checkpointer: freshSaver(),
    context: { threadId: 't' },
    graphs: sourceFor(graph),
  };
}

/** One run of the chain transcribed: every answer in order, so two routes can be compared. */
async function runChain(runtime: Runtime): Promise<unknown[]> {
  const transcript: unknown[] = [];
  for (const [taskId, result] of [
    ['a#0', 'A'],
    ['b#0', 'B'],
    ['c#0', 'C'],
  ] as const) {
    const taken = await runtime.take({ graph: 'chain' });
    transcript.push(taken.kind, taken.kind === 'issued' ? taken.tasks.map((task) => task.id) : undefined);
    const settled = await runtime.report({ graph: 'chain', taskId, outcome: 'succeeded', result });
    transcript.push(settled.kind, settled.kind === 'settled' ? settled.checkpointId : undefined);
  }
  transcript.push(await runtime.take({ graph: 'chain' }), await runtime.getState({ graph: 'chain' }));
  return transcript;
}

describe('the Awilix convenience face', () => {
  it('functional, helper, and standard-Awilix routes answer the same', async () => {
    const functional = createRuntime(host(chainGraph()));

    const helperContainer = runtimeContainer({
      checkpointer: () => freshSaver(),
      context: () => ({ threadId: 't' }),
      graphs: () => sourceFor(chainGraph()),
    });
    const helper = createRuntime(helperContainer.createScope().cradle);

    const standard = createContainer<RuntimeCradle>({ injectionMode: InjectionMode.CLASSIC, strict: true });
    standard.register('checkpointer', asFunction(() => freshSaver()).scoped());
    standard.register('context', asFunction(() => ({ threadId: 't' })).scoped());
    standard.register('graphs', asFunction(() => sourceFor(chainGraph())).singleton());
    // Hand-written standard Awilix: the four optional rows still register the declared
    // defaults, or the runtime's first read of one would hit the container's strict refusal.
    standard.register('judge', asValue(undefined));
    standard.register('logger', asValue(undefined));
    standard.register('store', asValue(undefined));
    standard.register('writer', asValue(undefined));

    const [byFunction, byHelper, byStandard] = await Promise.all([
      runChain(functional),
      runChain(helper),
      runChain(createRuntime(standard.createScope().cradle)),
    ]);
    expect(byHelper).toEqual(byFunction);
    expect(byStandard).toEqual(byFunction);
    expect(byFunction.at(-2)).toEqual({ kind: 'unserved' });
  });

  it('the registrations mirror PORTS row for row, as native Awilix resolvers', () => {
    const registrations = runtimeRegistrations({
      checkpointer: () => freshSaver(),
      context: () => ({ threadId: 't' }),
      graphs: () => sourceFor(chainGraph()),
    });
    expect(Object.keys(registrations).sort()).toEqual(Object.keys(PORTS).sort());
    const supplied: readonly PortToken[] = ['checkpointer', 'context', 'graphs'];
    for (const [token, row] of Object.entries(PORTS)) {
      const resolver = (registrations as Record<string, { lifetime?: string; resolve(): unknown }>)[token];
      expect(typeof resolver?.resolve, token).toBe('function');
      if (supplied.includes(token as PortToken)) {
        expect(resolver?.lifetime, token).toBe(row.lifetime === 'singleton' ? Lifetime.SINGLETON : Lifetime.SCOPED);
      } else {
        // No factory: the row carries the declared default, not a lifetime claim.
        expect(resolver?.resolve(), token).toBeUndefined();
      }
    }
    // The table is standard Awilix: a hand-built container registers it unchanged.
    const container = createContainer<RuntimeCradle>({ injectionMode: InjectionMode.CLASSIC, strict: true });
    container.register(registrations);
    expect(container.resolve('checkpointer')).toBeDefined();
  });
});

describe('the registration face', () => {
  it('lazy instantiation and scope semantics stay Awilix-native', () => {
    let built = 0;
    const container = runtimeContainer({
      graphs: () => sourceFor(chainGraph()),
      context: () => {
        built += 1;
        return { threadId: 't' };
      },
    });
    expect(built).toBe(0);

    const one = container.createScope();
    const two = container.createScope();
    expect(one.cradle.context).toBe(one.cradle.context);
    expect(one.cradle.context).not.toBe(two.cradle.context);
    expect(one.cradle.graphs).toBe(two.cradle.graphs);
    expect(one.cradle.graphs).toBe(container.cradle.graphs);
    expect(built).toBe(2);
  });

  it('an absent factory keeps the declared default — strict outside, infra inside', async () => {
    const bare = runtimeContainer();
    expect(() => bare.resolve('handle')).toThrow();
    const taken = await createRuntime(bare.cradle).take({ graph: 'chain' });
    expect(taken.kind === 'rejected' ? taken.refusal.code : '').toBe('infra');
    expect(taken.kind === 'rejected' ? taken.refusal.note : '').toContain('checkpointer');
  });

  it('a scoped factory reads the per-call rows the consumer registers on the scope', async () => {
    const seen: string[] = [];
    const container = runtimeContainer({
      graphs: () => sourceFor(chainGraph()),
      context: () => ({ threadId: 't' }),
      checkpointer: (cradle) => {
        seen.push(String(cradle.handle));
        return freshSaver();
      },
    });
    const scope = container.createScope();
    scope.register('handle', asValue('h-1'));
    await createRuntime(scope.cradle).take({ graph: 'chain' });
    expect(seen).toEqual(['h-1']);
  });
});
