/**
 * Load probe — annotated convention entry (reported defect regression).
 *
 * Machine validation only: the engine never parses skill prose, so the
 * trailing parenthetical annotation is inert. A graph whose phase channels
 * carry an annotated convention entry loads cleanly — phase channels are
 * shape-passed (annotation never parsed). The machine convention guard
 * (convention-layer declaration warn, never error) still fires for bare
 * convention paths declared at graph level.
 */
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { toTaskflowGraph } from '../src/api/graph-loader.js';
import { validateGraphContracts } from '../src/context/contracts.js';
import type { Taskflow } from '../src/graph-definition.js';

describe('load probe — annotated convention entry (reported defect)', () => {
  it('graph load succeeds with annotated convention entry in phase channels', async () => {
    const graph: Taskflow = {
      name: 'probe-graph',

      phases: [
        {
          id: 'p',
          type: 'main',
          dependsOn: [],
          skill: 'annotated-skill',
          channels: [
            'node:up',
            'skill:codebase-design',
            './CONTEXT.md (project glossary per domain-modeling CONTEXT-FORMAT.md)',
          ],
          task: 'x',
          operations: [],
        },
      ],
    };
    // Schema/phase validation passes — the graph adapts cleanly.
    const adapted = await Effect.runPromise(toTaskflowGraph(graph));
    expect(adapted.phases.map((p) => p.id)).toEqual(['p']);

    // Machine checks: phase channels pass through unparsed — annotation never
    // interpreted, no errors, no convention warning at phase level.
    const { errors } = validateGraphContracts(graph, 'probe.yaml');
    expect(errors).toEqual([]);
  });

  it('machine convention guard still warns (never errors) on bare convention declaration at graph level', () => {
    const graph = {
      name: 'probe-graph',

      context: ['./CONTEXT.md', 'skill:codebase-design'],
      phases: [{ id: 'p', type: 'main', dependsOn: [], task: 'x', operations: [] }],
    };
    const { errors, warnings } = validateGraphContracts(graph, 'probe.yaml');
    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.includes('convention-layer') && w.includes('./CONTEXT.md'))).toBe(true);
  });
});
