import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PKG = resolve(__dirname, '..');
const SKILLS = join(PKG, 'skills');
const REFS = resolve(__dirname, '../../../.refs/skills/skills');

const read = (p: string) => readFileSync(p, 'utf-8');

/** Upstream skills consumed by graphs — project-owned copies must NOT exist (round-4 ruling: no fork). */
const UPSTREAM_SKILLS: Record<string, string> = {
  'to-spec': 'engineering/to-spec',
  'to-tickets': 'engineering/to-tickets',
  grilling: 'productivity/grilling',
  'domain-modeling': 'engineering/domain-modeling',
};

describe('semantic injection layer — no upstream fork, Decision UI block present', () => {
  it('no fork dirs for upstream skills under packages/graph-workflow/skills', () => {
    for (const name of Object.keys(UPSTREAM_SKILLS)) {
      expect(existsSync(join(SKILLS, name)), `${name} must not be forked into packages`).toBe(false);
    }
  });

  it('repo-local deployment copies are byte-identical to the .refs mirror', () => {
    const agents = resolve(__dirname, '../../../.agents/skills');
    const home = join(process.env.HOME ?? '/Users/makarawang', '.agents/skills');
    for (const [name, rel] of Object.entries(UPSTREAM_SKILLS)) {
      const mirror = join(REFS, rel, 'SKILL.md');
      for (const root of [agents, home]) {
        const deployed = join(root, name, 'SKILL.md');
        expect(existsSync(mirror), `${name} mirror exists`).toBe(true);
        expect(existsSync(deployed), `${name} deployed copy exists at ${root}`).toBe(true);
        expect(read(deployed), `${name} deployed == mirror at ${root}`).toBe(read(mirror));
      }
    }
  });

  it('handler SKILL.md main step 1 prepends the ## Decision UI block', () => {
    const handler = read(join(SKILLS, 'atom-phase-handler/SKILL.md'));
    const mainSection = handler.slice(handler.indexOf('### main type'));
    expect(mainSection).toMatch(/## Decision UI/);
    expect(mainSection).toMatch(/confirmation-point interpretation rule/);
  });

  it('CONTEXT-ASSEMBLY.md defines the Decision UI block format + prepend order', () => {
    const assembly = read(join(SKILLS, 'atom-phase-handler/CONTEXT-ASSEMBLY.md'));
    expect(assembly).toMatch(/# Decision UI Block/);
    expect(assembly).toMatch(/Every user-confirmation point in this node's execution/);
    expect(assembly).toMatch(/recommendation present \+ auto -> execute it; no recommendation -> card/);
    expect(assembly).toMatch(/decision-UI block -> constraints block -> agent hints block/);
  });

  it('kernel approval() contract carries the main-node checkpoint note', () => {
    const kernel = read(join(SKILLS, 'atom-kernel/SKILL.md'));
    expect(kernel).toMatch(/approval\(\) - Decision UI/);
    expect(kernel).toMatch(/see APPROVAL-CARDS\.md/);
    const cards = read(join(SKILLS, 'atom-kernel/APPROVAL-CARDS.md'));
    expect(cards).toMatch(/## Main-Node Checkpoints/);
    expect(cards).toMatch(/Upstream skill content is never modified/);
  });

  it('no upstream skill content was modified in packages sources (zero fork residue)', () => {
    const entries = readdirSync(SKILLS);
    for (const name of Object.keys(UPSTREAM_SKILLS)) {
      expect(entries).not.toContain(name);
    }
  });
});
