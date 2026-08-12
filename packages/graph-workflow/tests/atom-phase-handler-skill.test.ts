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
    expect(skill).toMatch(/Activation Context Blocks \(single home\)/);
    expect(skill).toMatch(/CONTEXT-ASSEMBLY\.md §Activation Context Blocks/);
  });

  // ── Constraints Block Format ──────────────────────────────

  it('defines shared ## Constraints Block Format section', () => {
    expect(skill).toMatch(/# Constraints Block Format/);
  });

  it('uses [project] source-layer prefix per bullet', () => {
    expect(skill).toMatch(/\[project\] <constraint/);
  });

  it('caps block length with explicit warning, no silent truncation', () => {
    // Rule single-sourced in the canonical spec - handler SKILL points to it.
    expect(skill).toMatch(/2 KB cap.*per `atom-graph-spec` §Constraint Layering/);
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
    expect(mainBranch).toMatch(/run-mode block always; decision-UI block main-only/);
    expect(mainBranch).toMatch(/constraints block per §Constraints Block Format/);
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
    expect(skill).toMatch(/Source, paths, degrade: see CONTEXT-ASSEMBLY\.md §Activation Context Blocks/);
    expect(skill).toMatch(/Mode semantics: atom-kernel §approval\(\)/);
  });

  // ── Verification visibility ───────────────────────────────

  it('defines Checks block constraints row (ok | violation ×N)', () => {
    const format = skill.slice(skill.indexOf('# Checks Block'));
    expect(format).toMatch(/## Checks/);
    expect(format).toMatch(/constraints: ok \| violation ×N/);
  });

  it('surfaces CONSTRAINT VIOLATION marker in result table + approval pre-call', () => {
    const format = skill.slice(skill.indexOf('# Constraints Block Format'));
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
    expect(gateSection).toMatch(/judge failure handling - single home: atom-kernel §judge\(\)\)/);
  });

  // ── Todo node-boundary lifecycle ─────────────────────────

  it('defines the §Todo Lifecycle (node boundary) section', () => {
    expect(skill).toMatch(/## Todo Lifecycle \(node boundary\)/);
  });

  it('mandates dispatch clear before execution for every node type', () => {
    const dispatchRules = skill.slice(skill.indexOf('# Dispatch Rules'));
    expect(dispatchRules.match(/Clear todo per §Todo Lifecycle \(dispatch clear\)/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('mandates completion clear after report, unconditional on success/failure', () => {
    const lifecycle = skill.slice(skill.indexOf('## Todo Lifecycle (node boundary)'));
    expect(lifecycle).toMatch(/after output\/decision report, before return/);
    expect(lifecycle).toMatch(/unconditional on success\/failure/);
  });

  it('routes the clear through the todo() kernel contract - no platform spelling', () => {
    const lifecycle = skill.slice(skill.indexOf('## Todo Lifecycle (node boundary)'));
    expect(lifecycle).toMatch(/`todo\(\)` clear/);
    expect(lifecycle).toMatch(/atom-kernel §todo\(\) - Boundary Clear/);
    expect(lifecycle).not.toMatch(/todo rm/);
  });

  it('approval flow delegates the mode to approval() and clears todo before return', () => {
    // collapse: the handler assembles content, delegates the mode
    // decision to the kernel approval() contract, maps to IApprovalDecision,
    // keeps the decision in-session, clears todo, returns
    const approvalSection = skill.slice(skill.indexOf('### approval type'));
    expect(approvalSection).toMatch(/[Dd]elegate the mode decision to approval\(\)/);
    expect(approvalSection).toMatch(/[Aa]ssemble card content \+ recommendation/);
    expect(approvalSection).toMatch(/Map to IApprovalDecision/);
    expect(approvalSection).toMatch(/[Kk]eep the decision in the session/);
    expect(approvalSection).toMatch(
      /[Cc]lear todo per §Todo Lifecycle \(completion clear\).*[Rr]eturn `\{ status: "done", output: "<json>", durationMs \}`/s,
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

  it('anchors main dispatch timing: clear -> assembly -> calls -> checks -> report -> clear', () => {
    const rules = skill.slice(skill.indexOf('# Dispatch Rules'));
    const mainSection = rules.slice(rules.indexOf('### main type'));
    const clearIdx = mainSection.indexOf('Clear todo per §Todo Lifecycle (dispatch clear)');
    const assemblyIdx = mainSection.indexOf('Assemble inline context blocks');
    const callIdx = mainSection.indexOf('Execute tool calls per atom-kernel §High-Level Tool Registry');
    const reportIdx = mainSection.indexOf('Report the node output');
    const completionClearIdx = mainSection.lastIndexOf('Clear todo per §Todo Lifecycle (completion clear)');
    expect(clearIdx).toBeGreaterThan(-1);
    expect(assemblyIdx).toBeGreaterThan(clearIdx);
    expect(callIdx).toBeGreaterThan(assemblyIdx);
    expect(reportIdx).toBeGreaterThan(callIdx);
    expect(completionClearIdx).toBeGreaterThan(reportIdx);
    expect(mainSection).not.toMatch(/Step 0 projection/);
    expect(mainSection).not.toMatch(/done gate/i);
  });

  // ── Tool usage check (tool-usage-contract) ─────────────

  it('defines the §Checks Block tools row (scenario-keyed)', () => {
    expect(skill).toMatch(/# Checks Block/);
    const section = skill.slice(skill.indexOf('# Checks Block'));
    expect(section).toMatch(/tools: <chain-head evidence per declared class> \| n\/a: <structural reason>/);
    expect(section).toMatch(/one line per declared scenario \(operation class x target domain\)/);
  });

  it('generates the violation marker mechanically - never self-issued, missing block = all-class violation', () => {
    const section = skill.slice(skill.indexOf('# Checks Block'));
    expect(section).toMatch(/markers are generated by the check, never self-issued/);
    expect(section).toMatch(/no Checks block -> all declared scenarios violated/);
  });

  it('defines registry injection - merged class set (node operations ∪ skill Operation classes)', () => {
    const section = skill.slice(skill.indexOf('## Registry Injection'));
    expect(section).toMatch(
      /`?node\.operations`? \(wins on conflict\) \+ the dispatched skill's `### Operation classes`/,
    );
    expect(section).toMatch(/Block format \+ assembly: see CONTEXT-ASSEMBLY\.md §Main Inline Context Assembly step 4/);
    expect(section).toMatch(/No declared classes -> no assembly, no warning/);
    expect(section).toMatch(/undeclared operations degrade to the atom-kernel core scenario rows/);
  });

  it('prefixes [TOOL USAGE VIOLATION: N] on violated lines', () => {
    const section = skill.slice(skill.indexOf('# Checks Block'));
    expect(section).toMatch(/\[TOOL USAGE VIOLATION: <count>\]/);
  });

  it('surfaces tool-usage markers in approval pre-call', () => {
    const approvalSection = skill.slice(skill.indexOf('node.type = "approval"'));
    expect(approvalSection).toMatch(/\[TOOL USAGE VIOLATION: <nodeId> × N\]/);
  });

  it('adds the Checks scan step to main dispatch rules', () => {
    const mainRules = skill.slice(skill.indexOf('### main type'), skill.indexOf('## Main Inline Context Assembly'));
    expect(mainRules).toMatch(/Checks scan - assemble the `## Checks` block/);
  });

  it('delegates main execution to atom-kernel §High-Level Tool Registry (HLT tool-call execution)', () => {
    const mainRules = skill.slice(skill.indexOf('### main type'), skill.indexOf('## Main Inline Context Assembly'));
    expect(mainRules).toMatch(/Main execution = HLT tool-call execution/);
    expect(mainRules).toMatch(/Execute tool calls per atom-kernel §High-Level Tool Registry - registered invocation/);
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

  // ── Frame positive contract ─────────────────────────────
  // The discipline line is the deterministic render of node.operations —
  // pinned here per signal-distribution (classification lattice) so the
  // R3 boundary evidence is repo-owned (probe A only asserts the negative:
  // the platform injects no frame).

  it('pins the frame discipline line — declared echoed verbatim, out-of-scope = read/write/locate minus declared', () => {
    const frameBlock = skill.slice(skill.indexOf('## Run Frame'), skill.indexOf('## Constraints'));
    expect(frameBlock).toMatch(/declared operations \[<node\.operations>\]/);
    expect(frameBlock).toMatch(/out of scope: <read\/write\/locate minus declared>/);
    // Sample render per the deterministic mapping (declared [locate, read,
    // review] → write out of scope) is the graph's own dispatch evidence.
    expect(frameBlock).not.toMatch(/tool-surface|steer/);
  });
});
