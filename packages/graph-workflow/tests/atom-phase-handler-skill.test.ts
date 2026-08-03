/**
 * Content assertions — atom-phase-handler SKILL.md project constraints
 * injection: main/approval branches consume node.constraints, shared
 * ## Constraints Block Format, Constraint check visibility.
 *
 * Injection-rule details (cap/dedup) live in atom-graph-spec §Constraint
 * Layering (single source) — asserted there, handler side keeps the pointer.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function loadSkill(): string {
  const skillPath = resolve(__dirname, '../skills/atom-phase-handler/SKILL.md');
  return readFileSync(skillPath, 'utf-8');
}

function loadSpecSkill(): string {
  const specPath = resolve(__dirname, '../skills/atom-graph-spec/SKILL.md');
  return readFileSync(specPath, 'utf-8');
}

describe('atom-phase-handler SKILL.md — project constraints + gate branch contract', () => {
  const skill = loadSkill();

  // ── NodeDetail field ──────────────────────────────────────

  it('documents constraints field in NodeDetail base fields', () => {
    expect(skill).toMatch(/`constraints`\|string\[\]\|all\|Project constraints/);
  });

  // ── Constraints Block Format ──────────────────────────────

  it('defines shared ## Constraints Block Format section', () => {
    expect(skill).toMatch(/## Constraints Block Format/);
  });

  it('uses [project] source-layer prefix per bullet', () => {
    expect(skill).toMatch(/\[project\] <constraint/);
  });

  it('caps block length with explicit warning, no silent truncation', () => {
    // Rule single-sourced in the canonical spec — handler SKILL points to it.
    expect(skill).toMatch(/2 KB cap.*specified once in `atom-graph-spec` §Constraint Layering/);
    const layering = loadSpecSkill().slice(loadSpecSkill().indexOf('## Constraint Layering'));
    expect(layering).toMatch(/2 KB/);
    expect(layering).toMatch(/never silent truncation/);
  });

  it('deduplicates entries duplicating lang/git structured fields', () => {
    const layering = loadSpecSkill().slice(loadSpecSkill().indexOf('## Constraint Layering'));
    expect(layering).toMatch(/lang\.conversation.*lang\.documents.*git\.policy/s);
  });

  // ── Injection points ──────────────────────────────────────

  it('prepends constraints block to main branch inline task', () => {
    const mainBranch = skill.slice(skill.indexOf('node.type = "main"'), skill.indexOf('node.type = "approval"'));
    expect(mainBranch).toMatch(/Prepend project constraints block/);
  });

  it('prepends constraints block to approval pre-call text', () => {
    const approvalSection = skill.slice(skill.indexOf('node.type = "approval"'));
    expect(approvalSection).toMatch(
      /Prepend project constraints block \(per §Constraints Block Format\) to pre-call text/,
    );
  });

  it('surfaces upstream CONSTRAINT VIOLATION markers in approval pre-call', () => {
    const approvalSection = skill.slice(skill.indexOf('node.type = "approval"'));
    expect(approvalSection).toMatch(/Surface upstream constraint violations/);
    expect(approvalSection).toMatch(/\[CONSTRAINT VIOLATION: <nodeId> × N\]/);
  });

  it('includes constraints in eval auto-decision context', () => {
    expect(skill).toMatch(/Constraints: <node\.constraints>/);
  });

  // ── Verification visibility ───────────────────────────────

  it('defines Constraint check section with satisfied|unsatisfied lines', () => {
    const format = skill.slice(skill.indexOf('## Constraints Block Format'));
    expect(format).toMatch(/Constraint check:/);
    expect(format).toMatch(/unsatisfied: <constraint> — <evidence>/);
  });

  it('surfaces CONSTRAINT VIOLATION marker in result table + approval pre-call', () => {
    const format = skill.slice(skill.indexOf('## Constraints Block Format'));
    expect(format).toMatch(/CONSTRAINT VIOLATION: <count>/);
    expect(format).toMatch(/result table \+ approval pre-call/);
  });

  // ── Gate branch contract ──────────────────────────────────
  // Content pins for the gate dispatch branch (authority-split followup): the
  // contract is documentation-only for the agent side — completion() behavior
  // is not unit-testable; these assertions keep the written contract honest.

  it('defines the gate branch with array-order short-circuit eval', () => {
    const gateSection = skill.slice(skill.indexOf('node.type = "gate"'));
    expect(gateSection).toMatch(/array order, short-circuit/);
  });

  it('persists gate decisions without a label (machine path)', () => {
    const gateSection = skill.slice(skill.indexOf('node.type = "gate"'));
    expect(gateSection).toMatch(/label absent/);
  });

  it('defines the no-match marker with conservative degradation', () => {
    const gateSection = skill.slice(skill.indexOf('node.type = "gate"'));
    expect(gateSection).toContain('<no-match>');
    expect(gateSection).toMatch(/conservative/);
  });

  it('fails loud on empty/absent eval (gate without conditions is a pass-through)', () => {
    const gateSection = skill.slice(skill.indexOf('node.type = "gate"'));
    expect(gateSection).toMatch(/Eval empty\/absent → `status: "failed"`/);
  });

  it('documents completion-failure degradation as no-match fall-through', () => {
    const gateSection = skill.slice(skill.indexOf('node.type = "gate"'));
    expect(gateSection).toMatch(/completion fails/);
  });

  // ── Language / reference hygiene ──────────────────────────

  it('is English-only (no CJK characters)', () => {
    expect(skill).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it('does not reference external docs/ directory', () => {
    expect(skill).not.toMatch(/docs\//);
  });
});
