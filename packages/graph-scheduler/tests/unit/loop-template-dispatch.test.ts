/**
 * Load probes for the flow-model graphs (graph-flow) — the former
 * loop-template parents now declare the loop as a top-level `flow`
 * self-edge (inline bounded loop, never a subgraph sibling run):
 *
 * - first-principles-dev / arch-review-loop: full-startup flow graphs —
 *   startup → scope-entry; the round terminal reports a flow-defined
 *   condition ('remaining' re-enters scope-entry via the flow self-edge).
 * - graph-generate / graph-maintain: review round terminals with
 *   `-->|fail|` self-edges re-entering the round body head (implement /
 *   execute).
 * - openspec-engineer: implement + review round inlined with the flow
 *   self-edge implement-review -->|fail| implement.
 * - all seven loop-body graphs are deleted (fp-loop-body /
 *   engineer-review-body included) — the registry holds the 12 parents.
 */
import { Effect } from 'effect';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { createRuntime, type SchedulerRuntime } from '../../src/scheduler-runtime.js';

const PKG_ROOT = join(__dirname, '..', '..');

/** Read a built-in graph's top-level `flow` declaration (raw YAML — no schema). */
function flowOf(name: string): string[] {
  const raw = readFileSync(join(PKG_ROOT, 'graphs', `${name}.yaml`), 'utf-8');
  const graph = parseYaml(raw) as { flow?: string[] };
  return graph.flow ?? [];
}

describe('flow-model graphs load probe (graph-flow — loop = flow self-edge)', () => {
  let rt: SchedulerRuntime;

  beforeAll(async () => {
    rt = await Effect.runPromise(createRuntime({ dbPath: ':memory:' }));
  });

  afterAll(async () => {
    await rt.dispose();
  });

  it('first-principles-dev loads with the inlined flow — startup → scope-entry; flow self-edge fp-doc-update -->|remaining| scope-entry', async () => {
    // The former loop node is gone — the round body is inlined; the loop is
    // the flow self-edge from the round terminal back to the scope head.
    expect(flowOf('first-principles-dev')).toContain('fp-doc-update -->|remaining| scope-entry');
    const start = await rt.graphStart('first-principles-dev');
    expect(start.node?.nodeId).toBe('startup');
    const next = await rt.graphAdvance(start.runId, 'startup');
    expect(next.node?.nodeId).toBe('scope-entry');
    await rt.graphForceEnd(start.runId);
  });

  it('arch-review-loop loads with the inlined flow — startup → scope-entry; flow self-edge round-report -->|remaining| scope-entry', async () => {
    expect(flowOf('arch-review-loop')).toContain('round-report -->|remaining| scope-entry');
    const start = await rt.graphStart('arch-review-loop');
    expect(start.node?.nodeId).toBe('startup');
    const next = await rt.graphAdvance(start.runId, 'startup');
    expect(next.node?.nodeId).toBe('scope-entry');
    await rt.graphForceEnd(start.runId);
  });
});

describe('rewritten graphs load probe (graph-flow — loop bodies inlined + flow self-edges)', () => {
  let rt: SchedulerRuntime;

  beforeAll(async () => {
    rt = await Effect.runPromise(createRuntime({ dbPath: ':memory:' }));
  });

  afterAll(async () => {
    await rt.dispose();
  });

  // The 12 builtin registry entries — all seven loop-body subgraphs are
  // deleted (their rounds inlined + flow self-edges, graph-flow capability).
  const graphs = [
    'e2e-minimal',
    'arch-review',
    'adopt-with-docs',
    'graph-generate',
    'openspec-apply',
    'openspec-engineer',
    'arch-review-loop',
    'estate-maintain',
    'release-prep',
    'graph-maintain',
    'first-principles-dev',
    'spec-implement',
  ];
  for (const g of graphs) {
    it(`${g} starts and dispatches its first node`, async () => {
      const start = await rt.graphStart(g);
      expect(start.node).not.toBeNull();
      await rt.graphForceEnd(start.runId);
    });
  }

  it('openspec-engineer loads via the flow self-edge — loop template gone', async () => {
    // The loop template is removed; the implement + review round is inlined
    // and the rework loop is the flow self-edge implement-review -->|fail|
    // implement (graph-flow capability). The graph starts and dispatches.
    expect(flowOf('openspec-engineer')).toContain('implement-review -->|fail| implement');
    const start = await rt.graphStart('openspec-engineer');
    expect(start.node?.nodeId).toBe('to-spec');
    await rt.graphForceEnd(start.runId);
  });
});

describe('flow self-edge semantics (graph-flow)', () => {
  let rt: SchedulerRuntime;

  beforeAll(async () => {
    rt = await Effect.runPromise(createRuntime({ dbPath: ':memory:' }));
  });

  afterAll(async () => {
    await rt.dispose();
  });

  it('graph-maintain: review -->|fail| execute re-enters the body head; no-condition drains to completion', async () => {
    expect(flowOf('graph-maintain')).toContain('review -->|fail| execute');
    const { runId, node } = await rt.graphStart('graph-maintain');
    expect(node?.nodeId).toBe('startup');
    // Drive the chain to the round terminal (review).
    let current = node!;
    for (const expected of ['entry', 'audit', 'propose', 'approval', 'execute', 'review']) {
      const r = await rt.graphAdvance(runId, current.nodeId);
      expect(r.node?.nodeId).toBe(expected);
      current = r.node!;
    }
    // Review reports 'fail' → the flow self-edge re-enters execute (the
    // inlined round body head); the re-entered node's retryCount increments
    // (bounded-loop counter, never zeroed).
    const reentry = await rt.graphAdvance(runId, 'review', undefined, 'fail');
    expect(reentry.node?.nodeId).toBe('execute');
    expect(reentry.snapshot.changed.find((n) => n.nodeId === 'execute')?.retryCount).toBe(1);
    // execute → review again (second round).
    const review2 = await rt.graphAdvance(runId, 'execute');
    expect(review2.node?.nodeId).toBe('review');
    // Review passes with the declared exit condition 'pass' → the labeled
    // exit edge routes __handoff (never a missed-condition guard).
    const exited = await rt.graphAdvance(runId, 'review', undefined, 'pass');
    expect(exited.node?.nodeId).toBe('__handoff');
    // __handoff produces the two-element result report → natural drain.
    const drained = await rt.graphAdvance(runId, '__handoff');
    expect(drained.node).toBeNull();
    expect(drained.snapshot.fsmState).toBe('completed');
  });

  it('graph-generate: review -->|fail| implement re-enters the body head', async () => {
    expect(flowOf('graph-generate')).toContain('review -->|fail| implement');
    const { runId, node } = await rt.graphStart('graph-generate');
    expect(node?.nodeId).toBe('startup');
    let current = node!;
    for (const expected of ['entry', 'spec', 'spec-accept', 'implement', 'review']) {
      const r = await rt.graphAdvance(runId, current.nodeId);
      expect(r.node?.nodeId).toBe(expected);
      current = r.node!;
    }
    const reentry = await rt.graphAdvance(runId, 'review', undefined, 'fail');
    expect(reentry.node?.nodeId).toBe('implement');
    await rt.graphForceEnd(runId);
  });
});
