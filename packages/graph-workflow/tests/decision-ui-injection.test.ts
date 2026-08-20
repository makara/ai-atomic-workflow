import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PKG = resolve(__dirname, '..');
const SKILLS = join(PKG, 'skills');

const read = (p: string) => readFileSync(p, 'utf-8');

/** Upstream skills consumed by graphs — project-owned copies must NOT exist (round-4 ruling: no fork). */
const UPSTREAM_SKILLS: Record<string, string> = {
  'to-spec': 'engineering/to-spec',
  'to-tickets': 'engineering/to-tickets',
  grilling: 'productivity/grilling',
  'domain-modeling': 'engineering/domain-modeling',
  // OpenSpec family — upstream source: .omp/skills (OpenSpec CLI generated;
  // deployment copies never edited; graphs resolve these by name at dispatch).
  'openspec-propose': '.omp/skills/openspec-propose',
  'openspec-apply-change': '.omp/skills/openspec-apply-change',
  'openspec-archive-change': '.omp/skills/openspec-archive-change',
  'openspec-sync-specs': '.omp/skills/openspec-sync-specs',
  'openspec-update-change': '.omp/skills/openspec-update-change',
  'openspec-explore': '.omp/skills/openspec-explore',
};

describe('semantic injection layer — no upstream fork, Decision UI block present', () => {
  it('no fork dirs for upstream skills under packages/graph-workflow/skills', () => {
    for (const name of Object.keys(UPSTREAM_SKILLS)) {
      expect(existsSync(join(SKILLS, name)), `${name} must not be forked into packages`).toBe(false);
    }
  });

  it('handler SKILL.md main step 1 prepends the ## Decision UI block', () => {
    const handler = read(join(SKILLS, 'atom-phase-handler/SKILL.md'));
    const mainSection = handler.slice(handler.indexOf('### main type'));
    expect(mainSection).toMatch(/decision-UI block main-only; constraints block per §Constraints Block Format/);
    expect(mainSection).toMatch(/see CONTEXT-ASSEMBLY\.md §Main Inline Context Assembly/);
  });

  it('CONTEXT-ASSEMBLY.md defines the Decision UI sub-section + 4-block prepend order', () => {
    const assembly = read(join(SKILLS, 'atom-phase-handler/CONTEXT-ASSEMBLY.md'));
    expect(assembly).toMatch(/# Decision UI Block/);
    expect(assembly).toMatch(/explicit-declaration mapping/);
    expect(assembly).toMatch(/Approval\(\) cards present ONLY at points the node explicitly declares/);
    expect(assembly).toMatch(
      /single-form card always presented - options \+\s*custom free input \+ recommendation marked/,
    );
    // consolidated 4-block set (adopt-scope-and-handler-blocks): Run Frame
    // → Context (decision-ui sub-section) → Constraints → Checks → task text
    expect(assembly).toMatch(/`## Run Frame` \(unconditional, first/);
    expect(assembly).toMatch(/`## Context` \(conditional, second/);
    expect(assembly).toMatch(/`## Constraints` \(unconditional, third/);
    expect(assembly).toMatch(/`## Checks` \(unconditional, last/);
    expect(assembly).toMatch(/decision-ui:/);
  });

  it('kernel approval() contract carries the main-node checkpoint note', () => {
    const kernel = read(join(SKILLS, 'atom-kernel/SKILL.md'));
    expect(kernel).toMatch(/approval\(\) - Decision UI/);
    expect(kernel).toMatch(/see APPROVAL-CARDS\.md/);
    const cards = read(join(SKILLS, 'atom-kernel/APPROVAL-CARDS.md'));
    expect(cards).toMatch(/approval\(\) - Card Format/);
    expect(cards).toMatch(/No mode dispatch, no auto-execution/);
    // Checkpoint interpretation rule is single-sourced in the handler's
    // context assembly (round-4 no-fork ruling) — cards points at the
    // approval() contract, assembly declares the injection semantics.
    const assembly = read(join(SKILLS, 'atom-phase-handler/CONTEXT-ASSEMBLY.md'));
    expect(assembly).toMatch(/confirmation-point interpretation rule/);
    expect(assembly).toMatch(/upstream skills stay untouched/);
    expect(assembly).toMatch(/explicit-declaration mapping/);
  });

  it('no upstream skill content was modified in packages sources (zero fork residue)', () => {
    const entries = readdirSync(SKILLS);
    for (const name of Object.keys(UPSTREAM_SKILLS)) {
      expect(entries).not.toContain(name);
    }
  });
});
