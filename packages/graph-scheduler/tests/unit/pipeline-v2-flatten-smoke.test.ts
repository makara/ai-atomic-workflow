/**
 * Flatten smoke — openspec-pipeline v3 route-first branch-route resolution.
 *
 * Verifies that after merge-at-load flattening:
 * - the branch-route approval's continue targets (flow ids = route ids)
 *   survive as route references (never remapped to ghost nodes)
 * - the track flows' terminals feed the terminal join (unchosen-route nodes
 *   stay pending — route-aware readiness, no skip state)
 * - pipeline-accept judgment context auto-injects from the flattened carrier
 *   (create/spec-generate) — reads removed (schema field convergence)
 * - no end markers materialize (route-first: completion is natural drain)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { flattenFlowPhases } from '../../src/flow-flatten.js';
import type { Taskflow } from '../../src/schemas/index.js';

const GRAPHS_DIR = join(__dirname, '..', '..', 'graphs');

function loadGraph(name: string): Taskflow {
  const raw = readFileSync(join(GRAPHS_DIR, name), 'utf-8');
  return parseYaml(raw) as Taskflow;
}

const loader = (name: string): Taskflow | null => {
  switch (name) {
    case 'grill-with-docs':
    case 'openspec-create':
    case 'openspec-apply':
    case 'openspec-engineer':
      return loadGraph(`${name}.taskflow.yaml`);
    default:
      return null;
  }
};

describe('openspec-pipeline v3 flatten smoke — route-first branch-route carrier', () => {
  const pipeline = loadGraph('openspec-pipeline.taskflow.yaml');
  const flat = flattenFlowPhases(pipeline, loader, 1, 5);
  const phaseOf = (id: string): Taskflow['phases'][number] | undefined => flat.phases.find((p) => p.id === id);

  it('create flow materializes spec-scope/spec-gate/spec-generate — no end marker', () => {
    expect(phaseOf('create/spec-generate')).toBeDefined();
    expect(phaseOf('create/spec-scope')).toBeDefined();
    expect(phaseOf('create/spec-gate')).toBeDefined();
    // spec-done (end marker) deleted — route-first has no end type
    expect(phaseOf('create/spec-done')).toBeUndefined();
    // create entry inherits the flow's grill dependency (flattened terminal)
    expect(phaseOf('create/spec-scope')?.dependsOn).toEqual(['grill/grill-accept']);
    // child gate jump target prefixed to the flattened entry
    const gate = phaseOf('create/spec-gate');
    expect(gate?.jumps?.[0].to).toBe('create/spec-scope');
  });

  it('pipeline-accept depends on the create flow terminal — not the flow id', () => {
    const accept = phaseOf('pipeline-accept');
    expect(accept?.dependsOn).toEqual(['create/spec-generate']);
  });

  it('pipeline-accept carries no reads/channels — judgment context auto-injects from the carrier', () => {
    const accept = phaseOf('pipeline-accept');
    // reads removed (schema field convergence) — judgment context = direct
    // dependsOn outputs (auto-injected) + channels node: entries
    expect(accept?.reads).toBeUndefined();
    // no channels — the flow terminal dependency fully covers the former reads
    // reference; nothing extra to inject
    expect(accept?.channels).toBeUndefined();
    // the flattened terminal IS the node the old reads referenced — dependsOn
    // auto-injects its output into the approval's judgment context
    expect(accept?.dependsOn).toEqual(['create/spec-generate']);
    // exactly one spec-generate node — the reference is unambiguous
    const specGenerateNodes = flat.phases.filter((p) => p.id.includes('spec-generate'));
    expect(specGenerateNodes).toHaveLength(1);
    expect(specGenerateNodes[0].id).toBe('create/spec-generate');
  });

  it('branch-route continue targets stay as flow/route ids — never remapped', () => {
    const accept = phaseOf('pipeline-accept');
    const actions = accept?.routing?.actions ?? [];
    expect(actions.map((a) => a.action)).toEqual(['continue', 'continue']);
    // continue targets ARE the route ids (flow ids) — route-first keeps them
    expect(actions.map((a) => a.target)).toEqual(['minimal-track', 'detailed-track']);
  });

  it('no when fields anywhere — guards removed (route-first)', () => {
    for (const p of flat.phases) {
      expect(p.when, p.id).toBeUndefined();
    }
  });

  it('pipeline-done channels resolve to flattened terminals', () => {
    const done = phaseOf('pipeline-done');
    expect(done?.channels).toEqual(expect.arrayContaining(['node:grill/grilling', 'node:create/spec-generate']));
    expect(done?.channels).not.toEqual(expect.arrayContaining(['node:grill/grill-accept']));
    // channels reference real flattened nodes — no ghost refs (review F1)
    for (const c of (done?.channels ?? []) as string[]) {
      if (c.startsWith('node:')) {
        expect(phaseOf(c.slice('node:'.length))).toBeDefined();
      }
    }
  });

  it('create flow input interface — consensus channel propagates to spec-scope', () => {
    const createFlow = pipeline.phases.find((p) => p.id === 'create');
    expect(createFlow?.channels).toEqual(expect.arrayContaining(['node:grill/grilling']));
    // propagation: entry child spec-scope carries flow channels + own channels
    const specScope = phaseOf('create/spec-scope');
    expect(specScope?.channels).toEqual(expect.arrayContaining(['node:grill/grilling', './CONTEXT.md']));
  });

  it('pipeline-done joins on both track flow terminals (routes)', () => {
    const done = phaseOf('pipeline-done');
    // openspec-apply terminal = archive; openspec-engineer terminal = openspec-archive
    expect(done?.dependsOn).toEqual(
      expect.arrayContaining(['minimal-track/archive', 'detailed-track/openspec-archive']),
    );
  });

  it('no root end marker — completion is natural drain', () => {
    expect(phaseOf('pipeline-end')).toBeUndefined();
    // 'end' is not a Phase type (route-first) — string set check keeps the
    // assertion meaningful without a nonexistent type literal
    const phaseTypes = new Set(flat.phases.map((p) => p.type as string));
    expect(phaseTypes.has('end')).toBe(false);
  });

  it('grill entry cascade — tracks keep route membership; no written jump/retry actions', () => {
    const accept = phaseOf('pipeline-accept');
    const actions = accept?.routing?.actions ?? [];
    // retry/jump are AI-generated dynamic options — not written actions
    expect(actions.some((a) => a.action === 'jump' || a.action === 'retry')).toBe(false);
    // track flows carry their declared branch routes into the flattened graph
    expect(phaseOf('minimal-track/apply-change')?.route).toBe('minimal-track');
    expect(phaseOf('detailed-track/to-spec')?.route).toBe('detailed-track');
  });
});
