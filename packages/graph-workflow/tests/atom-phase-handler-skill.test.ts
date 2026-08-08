/**
 * Content assertions - atom-phase-handler SKILL.md activation prologue
 * consumption: main/approval branches consume the $load-constraints /
 * $run-mode-confirm prologue outputs, shared ## Constraints Block Format,
 * Constraint check visibility.
 *
 * Injection-rule details (cap/dedup) live in atom-graph-spec §Constraint
 * Layering (single source) - asserted there, handler side keeps the pointer.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function loadSkill(): string {
  const skillPath = resolve(__dirname, '../skills/atom-phase-handler/SKILL.md');
  return readFileSync(skillPath, 'utf-8');
}

function loadSpecSkill(): string {
  const specDir = resolve(__dirname, '../skills/atom-graph-spec');
  const siblings = readdirSync(specDir)
    .filter((f) => f.endsWith('.md'))
    .sort();
  const ordered = ['SKILL.md', ...siblings.filter((f) => f !== 'SKILL.md')];
  return ordered.map((f) => readFileSync(resolve(specDir, f), 'utf-8')).join('\n');
}

describe('atom-phase-handler SKILL.md - project constraints + gate branch contract', () => {
  const skill = loadSkill();

  // ── NodeDetail field ──────────────────────────────────────

  it('documents NO constraints/runMode NodeDetail fields - prologue outputs instead', () => {
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
    // Rule single-sourced in the canonical spec - handler SKILL points to it.
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
    expect(skill).toMatch(/## Run Mode: <mode>/);
    expect(skill).toMatch(/## Constraints/);
  });

  it('documents the prologue degradation rule - missing output never blocks', () => {
    expect(skill).toMatch(/Missing\/corrupt prologue output -> degrade, never block/);
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
  // documentation-only for the agent side - completion() behavior is not
  // unit-testable; these assertions keep the written contract honest.

  it('defines the gate jump with declaration-order evaluation and pass-through', () => {
    const gateSection = skill.slice(skill.indexOf('node.type = "gate"'));
    expect(gateSection).toMatch(/For each jump \(declaration order\)/);
    expect(gateSection).toMatch(/first "true" selects the jump - stop evaluating/);
    expect(gateSection).toMatch(/no hit -> pass through/);
  });

  it('documents the backward jump decision (target + label, mechanical reset)', () => {
    const gateSection = skill.slice(skill.indexOf('node.type = "gate"'));
    expect(gateSection).toMatch(/IApprovalDecision \{ action: "jump", target: <jump\.to>, label: <jump\.when> \}/);
    expect(skill).toMatch(/resets target \+ downstream terminal nodes/);
  });

  it('defines the no-hit fallback as pass through (no default edge exists)', () => {
    const gateSection = skill.slice(skill.indexOf('node.type = "gate"'));
    expect(gateSection).toMatch(/action: "continue" \} \(no target - pass through/);
    expect(gateSection).not.toMatch(/node\.default/);
  });

  it('fails loud on empty/absent jumps (gate without jumps is a pass-through)', () => {
    expect(skill).toMatch(/gate without rework jumps is a silent pass-through/);
  });

  it('documents judgment failure as conservative pass-through', () => {
    const gateSection = skill.slice(skill.indexOf('node.type = "gate"'));
    expect(gateSection).toMatch(/never fabricate a jump/);
  });

  // ── Todo node-boundary lifecycle ─────────────────────────

  it('defines the §Todo Lifecycle (node boundary) section', () => {
    expect(skill).toMatch(/## Todo Lifecycle \(node boundary\)/);
  });

  it('mandates dispatch clear before execution for every node type', () => {
    const dispatchRules = skill.slice(skill.indexOf('# Dispatch Rules'));
    expect(dispatchRules.match(/Clear todo per §Todo Lifecycle \(dispatch clear\)/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('mandates completion clear after persist, unconditional on success/failure', () => {
    const lifecycle = skill.slice(skill.indexOf('## Todo Lifecycle (node boundary)'));
    expect(lifecycle).toMatch(/after output\/decision persist, before return/);
    expect(lifecycle).toMatch(/unconditional on success\/failure/);
  });

  it('routes the clear through the todo() kernel contract - no platform spelling', () => {
    const lifecycle = skill.slice(skill.indexOf('## Todo Lifecycle (node boundary)'));
    expect(lifecycle).toMatch(/`todo\(\)` clear/);
    expect(lifecycle).toMatch(/atom-kernel §todo\(\) - Boundary Clear/);
    expect(lifecycle).not.toMatch(/todo rm/);
  });

  it('clears todo in the approval auto-execute early return path', () => {
    const autoPath = skill.slice(skill.indexOf('Recommendation exists -> auto-execute it'));
    expect(autoPath).toMatch(
      /Persist decision to .*[Cc]lear todo per §Todo Lifecycle \(completion clear\).*[Rr]eturn `\{ status: "done", output: "<json>", durationMs \}`/s,
    );
  });

  it('documents subagent propagation isolation', () => {
    const lifecycle = skill.slice(skill.indexOf('## Todo Lifecycle (node boundary)'));
    expect(lifecycle).toMatch(/never forwarded to subagents/);
    expect(lifecycle).toMatch(/child-scoped, cleared at child yield/);
  });

  it('documents todo lifecycle as boundary clears only (projection retired)', () => {
    const lifecycle = skill.slice(skill.indexOf('## Todo Lifecycle (node boundary)'));
    expect(lifecycle).toMatch(/Dispatch clear/);
    expect(lifecycle).toMatch(/Completion clear/);
    expect(lifecycle).not.toMatch(/Projection \(main nodes\)/);
    expect(lifecycle).not.toMatch(/§Step Projection/);
  });

  it('anchors main dispatch timing: clear -> assembly -> calls -> checks -> persist -> clear', () => {
    const rules = skill.slice(skill.indexOf('# Dispatch Rules'));
    const mainSection = rules.slice(rules.indexOf('### main type'));
    const clearIdx = mainSection.indexOf('Clear todo per §Todo Lifecycle (dispatch clear)');
    const assemblyIdx = mainSection.indexOf('Assemble inline context blocks');
    const callIdx = mainSection.indexOf('Execute tool calls per atom-kernel §High-Level Tool Registry');
    const persistIdx = mainSection.indexOf('Write output to `the run-scoped output stream');
    const completionClearIdx = mainSection.lastIndexOf('Clear todo per §Todo Lifecycle (completion clear)');
    expect(clearIdx).toBeGreaterThan(-1);
    expect(assemblyIdx).toBeGreaterThan(clearIdx);
    expect(callIdx).toBeGreaterThan(assemblyIdx);
    expect(persistIdx).toBeGreaterThan(callIdx);
    expect(completionClearIdx).toBeGreaterThan(persistIdx);
    expect(mainSection).not.toMatch(/Step 0 projection/);
    expect(mainSection).not.toMatch(/done gate/i);
  });

  // ── Tool usage check (tool-usage-contract) ─────────────

  it('defines the §Tool Usage Check class-based section', () => {
    expect(skill).toMatch(/## Tool Usage Check - class-based/);
    const section = skill.slice(skill.indexOf('## Tool Usage Check'));
    expect(section).toMatch(/Tool usage check:/);
    expect(section).toMatch(/used: locate — <chain-head evidence/);
    expect(section).toMatch(/violated: write/);
    expect(section).toMatch(/one line per declared operation class/);
  });

  it('generates the violation marker mechanically - never self-issued, missing block = all-class violation', () => {
    const section = skill.slice(skill.indexOf('## Tool Usage Check'));
    expect(section).toMatch(/the marker is generated by the check, never self-issued/);
    expect(section).toMatch(/Output with NO `Tool usage check:` block -> all declared classes counted as violated/);
  });

  it('defines registry injection - merged class set (node operations ∪ skill Operation classes)', () => {
    const section = skill.slice(skill.indexOf('## Registry Injection'));
    expect(section).toMatch(
      /`?node\.operations`? \(phase declaration, wins on conflict\) \+ the dispatched skill's `### Operation classes`/,
    );
    expect(section).toMatch(/`## Registry: <tool>` blocks/);
    expect(section).toMatch(/No declared classes \(neither phase nor skill\) -> no assembly, no warning/);
  });

  it('prefixes [TOOL USAGE VIOLATION: N] on violated lines', () => {
    const section = skill.slice(skill.indexOf('## Tool Usage Check'));
    expect(section).toMatch(/\[TOOL USAGE VIOLATION: <count>\]/);
  });

  it('surfaces tool-usage markers in approval pre-call', () => {
    const approvalSection = skill.slice(skill.indexOf('node.type = "approval"'));
    expect(approvalSection).toMatch(/\[TOOL USAGE VIOLATION: <nodeId> × N\]/);
  });

  it('adds the tool usage check step to main dispatch rules', () => {
    const mainRules = skill.slice(skill.indexOf('### main type'), skill.indexOf('## Main Inline Context Assembly'));
    expect(mainRules).toMatch(/Tool usage check per §Tool Usage Check/);
  });

  it('delegates main execution to atom-kernel §High-Level Tool Registry (HLT tool-call execution)', () => {
    const mainRules = skill.slice(skill.indexOf('### main type'), skill.indexOf('## Main Inline Context Assembly'));
    expect(mainRules).toMatch(/Main execution = HLT tool-call execution/);
    expect(mainRules).toMatch(
      /Execute tool calls per atom-kernel §High-Level Tool Registry: a call is a registered tool invocation/,
    );
    expect(mainRules).not.toMatch(/execute `node\.task` inline/);
    expect(mainRules).not.toMatch(/HLT step execution/);
  });

  // ── Language / reference hygiene ──────────────────────────

  it('is English-only (no CJK characters)', () => {
    expect(skill).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it('does not reference external docs/ directory', () => {
    expect(skill).not.toMatch(/docs\//);
  });
});
