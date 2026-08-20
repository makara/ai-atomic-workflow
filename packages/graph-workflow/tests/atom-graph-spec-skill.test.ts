/**
 * Content assertions - graph-subgraph-route-unify authoring surface:
 * subgraph composition (`use` field) is DELETED engine-wide; `template:
 * router` + `template_args.paths` is the SOLE nested-execution declaration
 * (frontend-launched sibling runs). Pinned across the authoring skills:
 * - atom-graph-spec (SKILL.md + PHASESCHEMA.md + ROUTING.md +
 *   YAML-EXAMPLES.md) - schema surface: no `use` field, router template
 *   semantics, single-layer type ownership, inventory router wording.
 * - atom-graph-design / atom-graph-writer - the authoring flow emits the
 *   router form, never composing phases.
 * - atom-pilot / atom-kernel - exactly ONE root `__handoff` per graph (no
 *   `<composing>/__handoff`); result-report wording single-sourced in
 *   `task-templates/handoff.ts` (debt Card 15/23).
 *
 * Negative pins: every deleted composition phrase is absent from the
 * authoring family (compile-time assembly, namespaced member dispatch,
 * `<composing>/__handoff`, `graph/subgraph` terminology, `expands <use>
 * subgraph`, composing phases).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function loadPackage(dir: string): string {
  const abs = resolve(__dirname, '../skills', dir);
  const files = readdirSync(abs)
    .filter((f) => f.endsWith('.md'))
    .sort();
  const skillIndex = files.indexOf('SKILL.md');
  if (skillIndex !== -1) {
    files.splice(skillIndex, 1);
    files.unshift('SKILL.md');
  }
  return files.map((f) => readFileSync(resolve(abs, f), 'utf-8')).join('\n');
}

const spec = loadPackage('atom-graph-spec');
const design = loadPackage('atom-graph-design');
const writer = loadPackage('atom-graph-writer');
const pilot = loadPackage('atom-pilot');
const kernel = loadPackage('atom-kernel');
const authoring = [spec, design, writer].join('\n');

describe('atom-graph-spec - schema surface (use field deleted)', () => {
  it('lists no `use` field in the per-phase field table', () => {
    const phaseFields = spec.slice(spec.indexOf('## Phase Fields'), spec.indexOf('## Router Template'));
    expect(phaseFields).not.toMatch(/\|`use`\|/);
  });

  it('lists `template` + `template_args` as the per-phase fields replacing `use`', () => {
    const phaseFields = spec.slice(spec.indexOf('## Phase Fields'), spec.indexOf('## Router Template'));
    expect(phaseFields).toMatch(/\|`template`\|/);
    expect(phaseFields).toMatch(/\|`template_args`\|/);
    const graphSchema = spec.slice(spec.indexOf('# Graph Schema'), spec.indexOf('# Topology Constraints'));
    expect(graphSchema).toMatch(
      /per-phase fields \(`id`, `dependsOn`, `skill`, `operations`, `task`, `channels`, `template`\)/,
    );
    expect(graphSchema).not.toMatch(/`use`/);
  });

  it('declares `type` main-only with the flow type removed', () => {
    const phaseFields = spec.slice(spec.indexOf('## Phase Fields'), spec.indexOf('## Router Template'));
    expect(phaseFields).toMatch(/closed enum: `main` only \(the `flow` type is removed\)/);
  });

  it('marks the strict declared surface without `use` (unknown key rejects load)', () => {
    expect(spec).toMatch(
      /ANY key outside the declared surface \(`id`\/`type`\/`dependsOn`\/`operations`\/`agent`\/`skill`\/`channels`\/`task`\/`template`\/`template_args`\) is rejected at load/,
    );
    expect(spec).not.toMatch(/`use`/);
  });

  it('retains the auto-supplied removed-field rule (uniform unknown-key rejection, no use clause)', () => {
    expect(spec).toMatch(/Unknown phase keys reject uniformly at schema parse \(PhaseSchema `\.strict\(\)`/);
    expect(spec).toMatch(/removed fields like `route`\/`routing`\/`join`\/`mode`\/`jumps`\/`reads`/);
    expect(spec).not.toMatch(/removed fields like `use`/);
  });

  it('documents single-layer type ownership (composition layer removed with the use field)', () => {
    expect(spec).toMatch(/Phase types belong to a single layer/);
    expect(spec).toMatch(/the composition layer was removed with the use field and the agent type/);
    expect(spec).not.toMatch(/\|Composition\|/);
  });
});

describe('atom-graph-spec - router template is the SOLE nested-execution declaration', () => {
  it('defines the ## Router Template section with paths-as-graphs semantics', () => {
    expect(spec).toMatch(/## Router Template \(template: router\)/);
    expect(spec).toMatch(/A `template: router` phase is a \*\*path-selection node\*\*/);
    expect(spec).toMatch(/one-shot SELECTION nested-execution declaration/);
  });

  it('marks template_args.paths as the one-shot selection form (graph names, non-graph fails load)', () => {
    expect(spec).toMatch(/one-shot selection form/);
    expect(spec).toMatch(/paths are graph names \(subgraph composition deleted\)/);
    expect(spec).toMatch(/Non-graph path entries fail load/);
    expect(spec).toMatch(/sibling inputs pass via `graph_start` args/);
  });

  it('declares template mutually exclusive with task only (use field no longer exists)', () => {
    expect(spec).toMatch(/Mutually exclusive with `task` \(the use field no longer exists\)/);
    expect(spec).toMatch(/`template` × `task` is rejected/);
    expect(spec).not.toMatch(/mutually exclusive with `use`/);
  });

  it('routes router activation as a sibling run via graph_start - never branchTo', () => {
    expect(spec).toMatch(/Activation = sibling run\*\* - the chosen graph starts via `graph_start`/);
    expect(spec).toMatch(/NO `branchTo` — router paths are never in-run branch targets/);
    expect(spec).toMatch(/read its report via `channels: \[node:<router>\]`/);
  });

  it('ROUTING.md router section: no task, no branchTo, sole nested-execution declaration', () => {
    expect(spec).toMatch(
      /No `task`, no `branchTo` \(the use field no longer exists\); router = sole nested-execution declaration/,
    );
    expect(spec).toMatch(/the node reports `chosen_graph` \/ `run_id` \/ result fields/);
  });

  it('SKILL.md activation bullet: nested execution is router-sibling-only, no compile-time composition plumbing', () => {
    expect(spec).toMatch(
      /Nested execution is router-sibling-only — a `template: router` node launches the chosen graph as a sibling run \(`graph_start`\), driven by the frontend; no compile-time composition plumbing exists/,
    );
  });

  it('YAML-EXAMPLES: Router Nesting Example declares template: router + template_args.paths', () => {
    expect(spec).toMatch(/## Router Nesting Example/);
    expect(spec).toMatch(/template: router/);
    expect(spec).toMatch(/template_args:\n\s+paths:\n\s+- skill-author/);
  });

  it('inventory rows spell router goals as sibling-run launches, never expands-use', () => {
    expect(spec).toMatch(
      /router entries state "Launches the <graph> graph as a sibling run \(router template — single path auto-select\)"/,
    );
    expect(spec).not.toMatch(/expands <use> subgraph/);
  });
});

describe('atom-graph-design / atom-graph-writer - router-only nesting emission', () => {
  it('design confirms nested-execution nodes as router + template_args.paths (sibling runs)', () => {
    expect(design).toMatch(
      /Nested execution nodes \(`template: router` \+ `template_args.paths`\) - which graphs to launch as sibling runs/,
    );
    expect(design).toMatch(/Router template for nested execution/);
    expect(design).toMatch(/paths are graph names, the only nested-execution form/);
    expect(design).toMatch(/starts the chosen graph via `graph_start` as a sibling run/);
    expect(design).toMatch(
      /sibling inputs \(report path \/ change name \/ adoption echo\) pass via `graph_start` args/,
    );
    expect(design).toMatch(
      /nested execution declares `template: router` \+ `template_args.paths` \(the sole nested-execution form/,
    );
  });

  it('design keeps type main-only and never mentions composing phases', () => {
    expect(design).toMatch(/`type`: `main` only \(the `flow` type is removed\)/);
    expect(design).not.toMatch(/composing phase/);
    expect(design).not.toMatch(/`use`/);
  });

  it('writer emits the router form as the sole nested-execution declaration', () => {
    expect(writer).toMatch(
      /Nested execution emits `template: router` \+ `template_args.paths` \(the sole nested-execution declaration\)/,
    );
    expect(writer).toMatch(/Router template nodes \(`template: router`\) carry NO authored task/);
    expect(writer).not.toMatch(/composing phase/);
    expect(writer).not.toMatch(/`use`/);
  });
});

describe('atom-pilot / atom-kernel - single root __handoff, handoff.ts single-source', () => {
  it('pilot: every graph gains exactly ONE root __handoff (no per-level <composing>/__handoff)', () => {
    expect(pilot).toMatch(/single root `__handoff` main terminal at compile time/);
    expect(pilot).toMatch(/no per-level `<composing>\/__handoff` exists/);
    expect(pilot).toMatch(/subgraph composition is deleted \(graph-subgraph-route-unify\)/);
  });

  it('pilot: result-report wording single-sourced in task-templates/handoff.ts', () => {
    expect(pilot).toMatch(/single-sourced in `task-templates\/handoff\.ts`/);
  });

  it('kernel: single root __handoff node, no per-level <composing>/__handoff', () => {
    expect(kernel).toMatch(/via the single root `__handoff` node/);
    expect(kernel).toMatch(/no per-level `<composing>\/__handoff` exists/);
  });

  it('kernel: handoff contract wording referenced, never re-encoded (debt Card 15/23)', () => {
    expect(kernel).toMatch(/SINGLE-SOURCED in `task-templates\/handoff\.ts`/);
    expect(kernel).toMatch(/never re-encodes it \(debt Card 15\/23\)/);
  });
});

describe('graph-workflow authoring family - deleted composition wording absent', () => {
  it('no compile-time assembly / subgraph composition mechanism wording', () => {
    expect(authoring).not.toMatch(/subgraphs compose at compile time/);
    expect(authoring).not.toMatch(/compile-time assembly/);
    expect(authoring).not.toMatch(/composed members dispatch by namespaced node id/);
  });

  it('no <composing>/__handoff, graph/subgraph terminology, or composing phases', () => {
    expect(authoring).not.toMatch(/<composing>\/__handoff/);
    expect(authoring).not.toMatch(/graph\/subgraph/);
    expect(authoring).not.toMatch(/composing phase/);
    expect(authoring).not.toMatch(/## Subgraph Composition/);
  });

  it('no `use` field, expands-use inventory, or namespaced composing-id dispatch in the authoring surface', () => {
    expect(authoring).not.toMatch(/`use`/);
    expect(authoring).not.toMatch(/expands <use> subgraph/);
    expect(authoring).not.toMatch(/namespaced `composingId/);
    expect(authoring).not.toMatch(/composingId\/childId/);
  });

  it('is English-only (no CJK characters)', () => {
    expect(authoring).not.toMatch(/[\u4e00-\u9fff]/);
  });
});
