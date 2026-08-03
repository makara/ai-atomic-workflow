/**
 * Flatten smoke — openspec-pipeline v2 when-guard carrier resolution.
 *
 * Verifies design D1: after merge-at-load flattening, the track when guards
 * (which reference `spec-generate output`) resolve against a real flattened
 * node (`create/spec-generate`) — not a ghost id. Guards read
 * `.taskflow/outputs/create/spec-generate.output.txt` at runtime; a carrier
 * that fails to materialize under flattening would silently double-skip both
 * tracks (blocked-looking completion). This is the user-selected smoke layer
 * on top of the existing contract-test surface.
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

describe('openspec-pipeline v2 flatten smoke — when-guard carrier', () => {
  const pipeline = loadGraph('openspec-pipeline.taskflow.yaml');
  const flat = flattenFlowPhases(pipeline, loader, 1, 5);
  const phaseOf = (id: string): Taskflow['phases'][number] | undefined => flat.phases.find((p) => p.id === id);

  it('create flow materializes spec-generate terminal under flattening', () => {
    expect(phaseOf('create/spec-generate')).toBeDefined();
    expect(phaseOf('create/spec-scope')).toBeDefined();
    // create entry inherits the flow's grill dependency
    expect(phaseOf('create/spec-scope')?.dependsOn).toEqual(['grill/grill-accept']);
  });

  it('pipeline-accept depends on the create flow terminal — not the flow id', () => {
    const accept = phaseOf('pipeline-accept');
    expect(accept?.dependsOn).toEqual(['create/spec-generate']);
  });

  it('track when guards reference the flattened carrier node', () => {
    const minimal = phaseOf('minimal-track/apply-change');
    const detailed = phaseOf('detailed-track/to-spec');
    // when guard text (prose) references the carrier; flattened graph must
    // contain exactly one spec-generate node so the reference is unambiguous
    const specGenerateNodes = flat.phases.filter((p) => p.id.includes('spec-generate'));
    expect(specGenerateNodes).toHaveLength(1);
    expect(specGenerateNodes[0].id).toBe('create/spec-generate');
    expect(String(minimal?.when)).toMatch(/create\/spec-generate output shows spec_status: ok AND adr_created: false/);
    expect(String(detailed?.when)).toMatch(/create\/spec-generate output shows spec_status: ok AND adr_created: true/);
  });

  it('tracks inherit the flow when guard — whole track atomic skip', () => {
    for (const p of flat.phases) {
      if (p.id.startsWith('minimal-track/')) {
        expect(String(p.when)).toMatch(/adr_created: false/);
      }
      if (p.id.startsWith('detailed-track/')) {
        expect(String(p.when)).toMatch(/adr_created: true/);
      }
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

  it('pipeline-done joins on both flow terminals', () => {
    const done = phaseOf('pipeline-done');
    expect(done?.dependsOn).toEqual(
      expect.arrayContaining(['minimal-track/archive', 'detailed-track/openspec-archive']),
    );
  });

  it('grill entry cascade — idea restart targets resolve to flattened entry', () => {
    // pipeline-accept jump target: grill → flattened entry node
    const accept = phaseOf('pipeline-accept');
    const jumpAction = (accept?.routing?.actions ?? []).find((a) => a.action === 'jump');
    expect(jumpAction?.target).toBe('grill/grill-scope');
    // retry target: create → flattened entry node
    const retryAction = (accept?.routing?.actions ?? []).find((a) => a.action === 'retry');
    expect(retryAction?.target).toBe('create/spec-scope');
  });
});
