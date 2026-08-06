/**
 * Content assertions — atom-phase-handler SKILL.md activation prologue
 * consumption: main/approval branches consume the $load-constraints /
 * $run-mode-confirm prologue outputs, shared ## Constraints Block Format,
 * Constraint check visibility.
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

  it('documents NO constraints/runMode NodeDetail fields — prologue outputs instead', () => {
    expect(skill).not.toMatch(/`constraints`\|string\[\]\|all/);
    expect(skill).not.toMatch(/`runMode`\|`'manual' \| 'auto'`\|yes/);
    expect(skill).toMatch(/\$run-mode-confirm.*\.taskflow\/outputs\/<runId>\/\$run-mode-confirm\.output\.txt/s);
    expect(skill).toMatch(/\$load-constraints.*\.taskflow\/outputs\/<runId>\/\$load-constraints\.output\.txt/s);
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
    expect(mainBranch).toMatch(/Prepend `## Run Mode: <mode>` block \(always\) \+ constraints block/);
  });

  it('prepends constraints block to approval pre-call text', () => {
    const approvalSection = skill.slice(skill.indexOf('node.type = "approval"'));
    expect(approvalSection).toMatch(
      /Prepend `## Run Mode: <mode>` block \(always\) \+ constraints block \(per §Constraints Block Format, when constraints non-empty\) to pre-call text/,
    );
  });

  it('surfaces upstream CONSTRAINT VIOLATION markers in approval pre-call', () => {
    const approvalSection = skill.slice(skill.indexOf('node.type = "approval"'));
    expect(approvalSection).toMatch(/Surface upstream constraint violations/);
    expect(approvalSection).toMatch(/\[CONSTRAINT VIOLATION: <nodeId> × N\]/);
  });

  it('includes constraints + run mode in gate judgment context', () => {
    expect(skill).toMatch(/Constraints: <constraints>/);
    expect(skill).toMatch(/Run Mode: <mode>/);
  });

  it('documents the prologue degradation rule — missing output never blocks', () => {
    expect(skill).toMatch(/Missing\/corrupt prologue output → degrade, never block/);
    expect(skill).toMatch(/absence never auto/);
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

  // ── Gate jump contract ──────────────────────────────────
  // Content pins for the gate dispatch branch (route-first): the contract is
  // documentation-only for the agent side — completion() behavior is not
  // unit-testable; these assertions keep the written contract honest.

  it('defines the gate jump with declaration-order evaluation and pass-through', () => {
    const gateSection = skill.slice(skill.indexOf('node.type = "gate"'));
    expect(gateSection).toMatch(/For each jump \(declaration order\)/);
    expect(gateSection).toMatch(/first "true" selects the jump — stop evaluating/);
    expect(gateSection).toMatch(/no hit → pass through/);
  });

  it('documents the backward jump decision (target + label, mechanical reset)', () => {
    const gateSection = skill.slice(skill.indexOf('node.type = "gate"'));
    expect(gateSection).toMatch(/IApprovalDecision \{ action: "jump", target: <jump\.to>, label: <jump\.when> \}/);
    expect(skill).toMatch(/resets target \+ downstream terminal nodes/);
  });

  it('defines the no-hit fallback as pass through (no default edge exists)', () => {
    const gateSection = skill.slice(skill.indexOf('node.type = "gate"'));
    expect(gateSection).toMatch(/action: "continue" \} \(no target — pass through/);
    expect(gateSection).not.toMatch(/node\.default/);
  });

  it('fails loud on empty/absent jumps (gate without jumps is a pass-through)', () => {
    expect(skill).toMatch(/gate without rework jumps is a silent pass-through/);
  });

  it('documents judgment failure as conservative pass-through', () => {
    const gateSection = skill.slice(skill.indexOf('node.type = "gate"'));
    expect(gateSection).toMatch(/never fabricate a jump/);
  });

  // ── Language / reference hygiene ──────────────────────────

  it('is English-only (no CJK characters)', () => {
    expect(skill).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it('does not reference external docs/ directory', () => {
    expect(skill).not.toMatch(/docs\//);
  });
});
