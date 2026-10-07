/**
 * The functional route, end to end: the capabilities are built as a plain deps
 * object and handed to `createRuntime`. `bun run example` prints the transcript
 * through both variants, and the example test holds the two together.
 */

import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import {
  Annotation,
  END,
  START,
  StateGraph,
  createMemoryLog,
  createMemorySaver,
  createRuntime,
  type CheckpointSaver,
  type CompiledGraph,
  type GraphSource,
  type Runtime,
} from 'agentic-graphjs';

/** A two-node chain over one appended channel; every node declares one key. */
export function chain(): CompiledGraph {
  const State = Annotation.Root({
    executed: Annotation({ source: 'node', reducer: 'append' }),
  });
  return new StateGraph(State)
    .addNode('plan', { task: 'plan', keys: [{ name: 'complete' }] })
    .addNode('settle', { task: 'settle', keys: [{ name: 'complete' }] })
    .addEdge(START, 'plan')
    .addConditionalEdges('plan', { complete: 'settle' })
    .addConditionalEdges('settle', { complete: END })
    .compile({ name: 'e2e' });
}

/** The graph source the runtime loads through: one name, one graph. */
export function graphSource(graph: CompiledGraph): GraphSource {
  return {
    load: (name) =>
      Promise.resolve(
        name === 'e2e' ? { ok: true, graph, structureHash: 'e2e-v1' } : { ok: false, code: 'GRAPH_UNREADABLE' },
      ),
  };
}

/** A deterministic in-memory checkpointer: fixed ids and clock, so a transcript reproduces. */
export function memorySaver(): CheckpointSaver {
  let issued = 0;
  return createMemorySaver({
    log: createMemoryLog(),
    identity: { nextId: () => String((issued += 1)) },
    clock: { now: () => '2026-10-02T00:00:00Z' },
  });
}

/** The drive's turn bound: a chain that keeps issuing is a defect, and the example says so
 *  instead of looping forever. */
const DRIVE_CAP = 64;

/** Drive the chain to its terminal and transcribe every answer, in order. */
export async function drive(runtime: Runtime): Promise<string[]> {
  const lines: string[] = [];
  for (let turn = 0; turn < DRIVE_CAP; turn += 1) {
    const taken = await runtime.take({ graph: 'e2e' });
    if (taken.kind === 'rejected') {
      lines.push(`final rejected (${taken.refusal.code}: ${taken.refusal.note})`);
      return lines;
    }
    if (taken.kind === 'unserved') {
      lines.push('final unserved');
      return lines;
    }
    for (const task of taken.tasks) {
      lines.push(`issue ${task.id} (${task.node})`);
      const settled = await runtime.report({
        graph: 'e2e',
        taskId: task.id,
        outcome: 'succeeded',
        result: `${task.node} done`,
      });
      lines.push(`settle ${task.id} -> ${settled.kind}`);
    }
  }
  lines.push(`final capped at ${DRIVE_CAP}`);
  return lines;
}

/** The functional route: a plain deps object. */
export async function run(): Promise<string[]> {
  return drive(
    createRuntime({
      checkpointer: memorySaver(),
      context: { threadId: 'e2e' },
      graphs: graphSource(chain()),
    }),
  );
}

// The real path, not the invoked one: a symlinked or wrapped entry must still answer as the entry.
const IS_ENTRY = process.argv[1] !== undefined && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (IS_ENTRY) {
  process.stdout.write(`${(await run()).join('\n')}\n`);
}
