/**
 * Task-template contract tests — direct-import assertions on the builtin
 * task templates (graph-task-templates-externalize; session contract per
 * graph-langgraph-subgraph-align). The template-text blocks assert directly
 * (drift in contract words, session-ization, interaction compatibility,
 * registration completeness fails here first); the final block drives the
 * dispatch chain to verify the session handoff end-to-end.
 */
import { Effect } from 'effect';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { SchedulerRuntime } from '../../src/scheduler-runtime.js';
import { createRuntime } from '../../src/scheduler-runtime.js';
import * as adopting from '../../src/task-templates/adopting.js';
import * as handoff from '../../src/task-templates/handoff.js';
import * as templates from '../../src/task-templates/index.js';
import * as router from '../../src/task-templates/router.js';
import * as scopeEntry from '../../src/task-templates/scope-entry.js';
import * as startup from '../../src/task-templates/startup.js';

describe('handoff task template contract', () => {
  it('yields non-empty task text containing the two-element contract', () => {
    const text = templates.handoffTaskTemplate();
    expect(text.length).toBeGreaterThan(50);
    expect(text).toContain('tasks_done');
    expect(text).toContain('outputs');
  });

  it('carries the session contract — no report path, no file write, no path derivation', () => {
    const text = templates.handoffTaskTemplate();
    expect(text).not.toMatch(/\.graph-scheduler\/reports\//);
    expect(text).not.toMatch(/write the report|file write|derived from the dispatch nodeId/i);
  });

  it('remains interaction-compatible — self-decide, no confirmation tokens', () => {
    const text = templates.handoffTaskTemplate();
    expect(text).not.toMatch(/Interview:|confirm:/i);
  });
});

describe('startup task template contract', () => {
  it('yields non-empty task text naming the heavy startup steps', () => {
    const text = templates.startupTaskTemplate();
    expect(text.length).toBeGreaterThan(50);
    expect(text).toContain('.graph-scheduler/constraints.json');
    expect(text).toMatch(/activate_project/);
    expect(text).toMatch(/index_folder/);
  });

  it('remains interaction-compatible — self-decide, no confirmation tokens', () => {
    const text = templates.startupTaskTemplate();
    expect(text).not.toMatch(/Interview:|confirm:/i);
  });

  it('carries no report path or run identity', () => {
    const text = templates.startupTaskTemplate();
    expect(text).not.toMatch(/\.graph-scheduler\/reports\//);
    expect(text).not.toMatch(/runId|run identity/i);
  });
});

describe('router task template contract', () => {
  it('yields non-empty task text naming graph_assets, graph_start and the paths', () => {
    const text = templates.routerTaskTemplate({ paths: ['openspec-apply', 'openspec-engineer'] });
    expect(text.length).toBeGreaterThan(50);
    expect(text).toMatch(/graph_assets/);
    expect(text).toMatch(/graph_start/);
    expect(text).toContain('openspec-apply');
    expect(text).toContain('openspec-engineer');
    expect(text).toMatch(/chosen_graph/);
    expect(text).toMatch(/run_id/);
  });

  it('remains interaction-compatible — self-decide, no generic confirmation tokens', () => {
    const text = templates.routerTaskTemplate({ paths: ['a', 'b'] });
    expect(text).not.toMatch(/Interview:|confirm:/i);
    // The selection card is the only card surface, and only when the
    // criterion is ambiguous — the auto-selection paths are primary.
    expect(text).toMatch(/Exactly one candidate/);
  });

  it('carries no report path or run identity', () => {
    const text = templates.routerTaskTemplate({ paths: ['a'] });
    expect(text).not.toMatch(/\.graph-scheduler\/reports\//);
    expect(text).not.toMatch(/runId|run identity/i);
  });

  it('flags an empty paths list as a graph-authoring error', () => {
    const text = templates.routerTaskTemplate();
    expect(text).toMatch(/graph authoring error/);
  });

  it('presents caller-declared questions with condition mapping (accept-node consolidation)', () => {
    const text = templates.routerTaskTemplate({
      paths: ['arch-review'],
      questions: [
        {
          prompt:
            'Requirement ready? accept: proceed to adoption; revise: adjust the requirement input and re-run the arch-review review.',
          condition: 'revise',
        },
      ],
    });
    expect(text).toMatch(/Requirement ready\?/);
    expect(text).toMatch(/report condition 'revise'/);
    expect(text).toMatch(/transition-table routed/);
  });

  it('stays pure router without questions — no extra-judgment instructions', () => {
    const text = templates.routerTaskTemplate({ paths: ['a', 'b'] });
    expect(text).not.toMatch(/Extra judgment/);
    expect(text).not.toMatch(/report condition/);
  });
});

describe('per-node task template contracts (framework-graph dedup — one template one file)', () => {
  it('scope-entry composes the scope interview with the terminal data parameter', () => {
    const scope = templates.scopeEntryTaskTemplate({ terminal: 'round-report' });
    expect(scope).toMatch(/Execute scope interview per atom-scope-interview/);
    expect(scope).toContain('the prior round-report node output');
    expect(scope).toMatch(/direct end: end the round/);
    const scopeFp = templates.scopeEntryTaskTemplate({ terminal: 'fp-doc-update' });
    expect(scopeFp).toContain('the prior fp-doc-update node output');
    expect(scopeFp).not.toBe(scope);
  });

  it('scope-entry defaults the terminal (zero-arg compatibility)', () => {
    const text = templates.scopeEntryTaskTemplate();
    expect(text).toMatch(/Execute scope interview per atom-scope-interview/);
    expect(text).toContain('the prior round-report');
  });

  it('adopting single-sources the grilling encapsulation contract', () => {
    const adopting = templates.adoptingTaskTemplate();
    expect(adopting).toMatch(/mandatory rounds — whole frontier per round/);
    expect(adopting).toContain('{ decisions: [{ decision, rationale }], shared_understanding: boolean }');
    expect(adopting).toMatch(/mandatory closing question/);
  });

  it('adopting declares the nothing-to-adopt direct end (accept-node consolidation)', () => {
    const adopting = templates.adoptingTaskTemplate();
    expect(adopting).toMatch(/Nothing to adopt \(change_name\s+empty\) → direct end/);
    expect(adopting).toMatch(/direct end: end the round/);
    expect(adopting).toMatch(/direct_end \(true \| false\)/);
  });

  it('accept templates are deleted from the template surface', () => {
    // The accept-node consolidation removed the two redundant
    // confirmation cards — the grilling consensus IS the adoption
    // confirmation; the requirement confirmation is a caller-declared
    // accept loop on the requirement router node.
    expect('reviewAcceptTaskTemplate' in templates).toBe(false);
    expect('adoptAcceptTaskTemplate' in templates).toBe(false);
    expect('review-accept' in templates.TASK_TEMPLATES).toBe(false);
    expect('adopt-accept' in templates.TASK_TEMPLATES).toBe(false);
    expect('adoptScopeTaskTemplate' in templates).toBe(false);
    expect('adopt-scope' in templates.TASK_TEMPLATES).toBe(false);
  });

  it('no template module dispatches among node variants (factory ban — one template one file)', () => {
    // The framework-chain factory is deleted: each node template is a
    // standalone function; no template_args.node discriminator exists.
    expect('frameworkChainTaskTemplate' in templates).toBe(false);
    expect('node' in ({} as templates.TemplateArgs)).toBe(false);
  });

  it('every template module file exports exactly one template function (one template one file)', () => {
    // Module-file-level assertion: the template modules (excluding
    // index.ts — the registry surface — and contracts.ts — the
    // contract-prose single sources) each export exactly one function
    // whose name ends in TaskTemplate. A regression that adds a second
    // template export to any module fails here — the index-namespace-level
    // registry check alone cannot see it. Static imports: the module set
    // is closed (the 7 files are known at author time — this test pins
    // that the set does not grow without updating the registry).
    const modules = [
      ['adopting.ts', adopting],
      ['handoff.ts', handoff],
      ['router.ts', router],
      ['scope-entry.ts', scopeEntry],
      ['startup.ts', startup],
    ] as const;
    // physical file set matches the imported set (no orphan module on disk)
    const dir = join(__dirname, '..', '..', 'src', 'task-templates');
    const onDisk = readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && f !== 'index.ts' && f !== 'contracts.ts')
      .sort();
    expect(onDisk).toEqual(modules.map(([name]) => name).sort());
    for (const [name, ns] of modules) {
      const templateExports = Object.keys(ns).filter((k) => k.endsWith('TaskTemplate'));
      expect(templateExports, `${name} exports exactly one template function`).toHaveLength(1);
      // the exported template resolves in the registry under its kebab name
      const kebab = templateExports[0]
        .replace(/TaskTemplate$/, '')
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .toLowerCase();
      expect(templates.TASK_TEMPLATES[kebab as keyof typeof templates.TASK_TEMPLATES]).toBe(
        ns[templateExports[0] as keyof typeof ns],
      );
    }
  });
});

describe('contract-prose single sources (F3/F10 dedup)', () => {
  it('grilling encapsulation contract is a single non-empty body', () => {
    expect(templates.GRILLING_ENCAPSULATION_CONTRACT.length).toBeGreaterThan(100);
    expect(templates.GRILLING_ENCAPSULATION_CONTRACT).toContain('whole frontier per round');
  });

  it('change-name resolution rule is a single non-empty body', () => {
    expect(templates.CHANGE_NAME_RESOLUTION_RULE).toContain('NEVER ask');
    expect(templates.CHANGE_NAME_RESOLUTION_RULE).toContain('blocked + candidates');
  });
});

describe('task-template registry completeness', () => {
  it('enumerates exactly the index exports — both directions (handoff + startup + router + 2 per-node templates)', () => {
    // Mechanical both-directions check: the index module namespace IS the
    // export set (minus TASK_TEMPLATES itself and the contract-prose
    // constants — non-template exports). Registry keys are the short
    // template names (function name minus the `TaskTemplate` suffix) — a
    // template exported from index.ts but missing from TASK_TEMPLATES (or a
    // list entry that resolves to no export) fails here.
    const exports = Object.fromEntries(
      Object.entries(templates).filter(
        ([name]) =>
          name !== 'TASK_TEMPLATES' &&
          !['GRILLING_ENCAPSULATION_CONTRACT', 'CHANGE_NAME_RESOLUTION_RULE'].includes(name),
      ),
    );
    const registry = Object.fromEntries(
      Object.entries(exports).map(([name, fn]) => [
        name
          .replace(/TaskTemplate$/, '')
          // kebab-case — registry keys are the short template names in
          // kebab form (scopeEntryTaskTemplate -> scope-entry)
          .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
          .toLowerCase(),
        fn,
      ]),
    );
    expect(Object.keys(templates.TASK_TEMPLATES).sort()).toEqual(Object.keys(registry).sort());
    // The template set — delegation, loop and accept templates removed
    // (loop/rework semantics are flow self-edges — graph-flow capability;
    // the accept templates are deleted by the accept-node consolidation;
    // adopt-scope is deleted — the adoption goal is confirmed by the
    // framework's scope-entry + requirement accept loop + adopting grilling);
    // startup (independent opt-in feature), router
    // (parameterized path-selection template) and the 2 per-node framework
    // templates (framework-graph shared-chain dedup — one template one
    // file; the framework-chain factory is deleted).
    expect(Object.keys(templates.TASK_TEMPLATES).sort()).toEqual([
      'adopting',
      'handoff',
      'router',
      'scope-entry',
      'startup',
    ]);
    expect('adopt-scope' in templates.TASK_TEMPLATES).toBe(false);
    for (const [name, fn] of Object.entries(templates.TASK_TEMPLATES)) {
      expect(fn).toBe(registry[name]);
    }
  });
});

describe('session handoff dispatch (graph-langgraph-subgraph-align)', () => {
  it('dispatches the root handoff with the session contract — one synthesized terminal', async () => {
    const graph = JSON.stringify({
      name: 'path-root',
      phases: [
        { id: 'entry', type: 'main', task: 'entry work', operations: [] },
        { id: 'requirement', type: 'main', dependsOn: ['entry'], task: 'requirement work', operations: [] },
        { id: 'final', type: 'main', dependsOn: ['requirement'], task: 'final work', operations: [] },
      ],
    });
    const taskflowDir = join(tmpdir(), `tpl-session-${Math.random().toString(36).slice(2)}`);
    mkdirSync(taskflowDir, { recursive: true });
    writeFileSync(join(taskflowDir, 'path-root.yaml'), graph);
    const rt: SchedulerRuntime = await Effect.runPromise(
      createRuntime({ dbPath: ':memory:', taskflowDir, context: [] }),
    );
    try {
      const start = await rt.graphStart('path-root');
      expect(start.node?.nodeId).toBe('entry');
      // The compiled graph is FLAT — exactly ONE synthesized `__handoff`
      // terminal at the root, no composing namespacing.
      const status = await rt.graphStatus(start.runId);
      expect(status.nodes!.map((n) => n.nodeId).sort()).toEqual(['__handoff', 'entry', 'final', 'requirement']);
      expect(status.nodes!.filter((n) => n.nodeId === '__handoff')).toHaveLength(1);
      let n = await rt.graphAdvance(start.runId, 'entry');
      expect(n.node?.nodeId).toBe('requirement');
      n = await rt.graphAdvance(start.runId, 'requirement');
      expect(n.node?.nodeId).toBe('final');
      n = await rt.graphAdvance(start.runId, 'final');
      // The root handoff terminal dispatches after the last source phase —
      // plain id, never a namespaced composing terminal.
      expect(n.node?.nodeId).toBe('__handoff');
      // The handoff task text is exactly the handoffTaskTemplate() — the
      // session contract, no report path, no file-write instruction.
      expect(n.node?.task).toBe(templates.handoffTaskTemplate());
      expect(n.node?.task).toContain('tasks_done');
      expect(n.node?.task).not.toMatch(/\.graph-scheduler\/reports\//);
      expect(n.node?.task).not.toMatch(/write the report|derived from the dispatch nodeId/i);
      await rt.graphForceEnd(start.runId);
    } finally {
      rmSync(taskflowDir, { recursive: true, force: true });
    }
  });

  it('dispatches the standalone handoff with the session contract', async () => {
    const graph = JSON.stringify({
      name: 'standalone-root',
      phases: [{ id: 'agent-a', type: 'main', task: 'do a', operations: [] }],
    });
    const taskflowDir = join(tmpdir(), `tpl-standalone-${Math.random().toString(36).slice(2)}`);
    mkdirSync(taskflowDir, { recursive: true });
    writeFileSync(join(taskflowDir, 'standalone-root.yaml'), graph);
    const rt: SchedulerRuntime = await Effect.runPromise(
      createRuntime({ dbPath: ':memory:', taskflowDir, context: [] }),
    );
    try {
      const start = await rt.graphStart('standalone-root');
      expect(start.node?.nodeId).toBe('agent-a');
      const n = await rt.graphAdvance(start.runId, 'agent-a');
      expect(n.node?.nodeId).toBe('__handoff');
      expect(n.node?.task).toContain('tasks_done');
      expect(n.node?.task).not.toMatch(/\.graph-scheduler\/reports\//);
      expect(n.node?.task).not.toMatch(/write the report|derived from the dispatch nodeId/i);
      await rt.graphForceEnd(start.runId);
    } finally {
      rmSync(taskflowDir, { recursive: true, force: true });
    }
  });
});

describe('router template dispatch (graph-router-template)', () => {
  it('dispatches the router node with the paths-injected task and machine-declared template_args', async () => {
    const child = JSON.stringify({
      name: 'r-sub',
      phases: [{ id: 'r-a', type: 'main', task: 'sub work', operations: [] }],
    });
    const parent = JSON.stringify({
      name: 'router-root',
      phases: [
        { id: 'pick', type: 'main', template: 'router', template_args: { paths: ['r-sub'] } },
        { id: 'done', type: 'main', dependsOn: ['pick'], task: 'final work', operations: [] },
      ],
    });
    const taskflowDir = join(tmpdir(), `tpl-router-${Math.random().toString(36).slice(2)}`);
    mkdirSync(taskflowDir, { recursive: true });
    writeFileSync(join(taskflowDir, 'r-sub.yaml'), child);
    writeFileSync(join(taskflowDir, 'router-root.yaml'), parent);
    const rt: SchedulerRuntime = await Effect.runPromise(
      createRuntime({ dbPath: ':memory:', taskflowDir, context: [] }),
    );
    try {
      const start = await rt.graphStart('router-root');
      expect(start.node?.nodeId).toBe('pick');
      // Template args injected into the task text — the paths are named.
      expect(start.node?.task).toContain('r-sub');
      expect(start.node?.task).toMatch(/graph_start/);
      // Machine-declared template_args ride the NodeDetail — the frontend
      // selection card options come from here, never from task-text parsing.
      expect(start.node?.template_args?.paths).toEqual(['r-sub']);
      // No branch targets compile from the router paths — the paths are
      // graphs started as sibling runs, not completion choices.
      expect(start.node?.completion).toEqual({ default: 'continue' });
      await rt.graphForceEnd(start.runId);
    } finally {
      rmSync(taskflowDir, { recursive: true, force: true });
    }
  });

  it('fails load when a router path does not resolve to a graph', async () => {
    const graph = JSON.stringify({
      name: 'broken-router',
      phases: [{ id: 'pick', type: 'main', template: 'router', template_args: { paths: ['no-such-graph'] } }],
    });
    const taskflowDir = join(tmpdir(), `tpl-badrouter-${Math.random().toString(36).slice(2)}`);
    mkdirSync(taskflowDir, { recursive: true });
    writeFileSync(join(taskflowDir, 'broken-router.yaml'), graph);
    const rt: SchedulerRuntime = await Effect.runPromise(
      createRuntime({ dbPath: ':memory:', taskflowDir, context: [] }),
    );
    try {
      await expect(rt.graphStart('broken-router')).rejects.toThrow(/no-such-graph/);
    } finally {
      rmSync(taskflowDir, { recursive: true, force: true });
    }
  });
});
