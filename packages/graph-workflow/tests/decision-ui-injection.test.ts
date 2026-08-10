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
    // skills-lock.json pins the upstream set; deployment is repo-local only
    // (.agents/skills) — home-dir copies are never assumed or touched.
    const lock = JSON.parse(readFileSync(resolve(__dirname, '../../../skills-lock.json'), 'utf-8'));
    for (const [name, rel] of Object.entries(UPSTREAM_SKILLS)) {
      const mirror = join(REFS, rel, 'SKILL.md');
      const deployed = join(agents, name, 'SKILL.md');
      expect(lock.skills[name], `${name} locked in skills-lock.json`).toBeTruthy();
      expect(existsSync(mirror), `${name} mirror exists`).toBe(true);
      expect(existsSync(deployed), `${name} deployed copy exists at ${agents}`).toBe(true);
      expect(read(deployed), `${name} deployed == mirror at ${agents}`).toBe(read(mirror));
    }
  });

  it('handler SKILL.md main step 1 prepends the ## Decision UI block', () => {
    const handler = read(join(SKILLS, 'atom-phase-handler/SKILL.md'));
    const mainSection = handler.slice(handler.indexOf('### main type'));
    expect(mainSection).toMatch(/run-mode block always; decision-UI block main-only/);
    expect(mainSection).toMatch(/see CONTEXT-ASSEMBLY\.md §Main Inline Context Assembly/);
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
    expect(cards).toMatch(/approval\(\) - Card Format, Mode Dispatch/);
    // Checkpoint interpretation rule is single-sourced in the handler's
    // context assembly (round-4 no-fork ruling) — cards points at the
    // approval() contract, assembly declares the injection semantics.
    const assembly = read(join(SKILLS, 'atom-phase-handler/CONTEXT-ASSEMBLY.md'));
    expect(assembly).toMatch(/confirmation-point interpretation rule/);
    expect(assembly).toMatch(/upstream skills stay untouched/);
  });

  it('no upstream skill content was modified in packages sources (zero fork residue)', () => {
    const entries = readdirSync(SKILLS);
    for (const name of Object.keys(UPSTREAM_SKILLS)) {
      expect(entries).not.toContain(name);
    }
  });
});
