/**
 * Content assertions - atom-phase-handler SKILL.md activation prologue
 * consumption: main/gate dispatch share the ## Constraints Block Format and
 * Constraint check visibility; the decision-UI block is main-only (approval()
 * single-form card, no run-mode block).
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

/** SKILL.md + sibling .md files (DECISION-CARDS.md etc.) — the full package contract surface. */
function loadSkillPackage(): string {
  const dir = resolve(__dirname, '../skills/atom-phase-handler');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => readFileSync(resolve(dir, f), 'utf-8'))
    .join('\n');
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
    const mainBranch = skill.slice(skill.indexOf('node.type = "main"'), skill.indexOf('### gate type'));
    expect(mainBranch).toMatch(/decision-UI block main-only; constraints block per §Constraints Block Format/);
    expect(mainBranch).toMatch(/constraints block per §Constraints Block Format/);
  });

  it('main nodes prepend the decision-UI block (approval() single-form) + constraints block', () => {
    // Surviving contract: no approval node type / run-mode block — the
    // decision-UI block (approval() single-form card) is prepended to main
    // node context alongside the constraints block.
    const mainSection = skill.slice(skill.indexOf('### main type'), skill.indexOf('### gate type'));
    expect(mainSection).toMatch(/decision-UI block main-only; constraints block per §Constraints Block Format/);
    expect(skill).not.toMatch(/## Run Mode/);
  });

  it('surfaces CONSTRAINT VIOLATION markers in result table + decision-card pre-call', () => {
    const checksSection = skill.slice(skill.indexOf('# Checks Block'));
    expect(checksSection).toMatch(/surfaces in result table \+ decision-card pre-call/);
    expect(skill).toMatch(/\[CONSTRAINT VIOLATION: <count>\]/);
  });

  it('includes constraints in gate judgment context (Run Mode block removed)', () => {
    expect(skill).toMatch(/## Constraints/);
    expect(skill).not.toMatch(/## Run Mode: <mode>/);
  });

  it('documents the prologue degradation rule - missing output never blocks', () => {
    expect(skill).toMatch(/Source, paths, degrade: see CONTEXT-ASSEMBLY\.md §Activation Context Blocks/);
    expect(skill).toMatch(/`NodeDetail` has no `runMode`/);
  });

  // ── Verification visibility ───────────────────────────────

  it('defines Checks block constraints row (ok | violation ×N)', () => {
    const format = skill.slice(skill.indexOf('# Checks Block'));
    expect(format).toMatch(/## Checks/);
    expect(format).toMatch(/constraints: ok \| violation ×N/);
  });

  it('surfaces CONSTRAINT VIOLATION marker in result table + decision-card pre-call', () => {
    const format = skill.slice(skill.indexOf('# Constraints Block Format'));
    expect(format).toMatch(/CONSTRAINT VIOLATION: <count>/);
    expect(format).toMatch(/result table \+ decision-card pre-call/);
  });

  // ── Loop/rework contract ────────────────────────────────
  // Content pins for the single main dispatch path: in-run rework decisions
  // are removed (no retry/jump node action, no branchTo); loop/rework =
  // top-level `flow` self-edges (`A -->|condition| A` — inline bounded
  // loops, condition-matched transition-table re-entry); backward rework
  // rides the advance `jump` channel (backward-only); branch = `template:
  // router` subgraph selection. The contract is documentation-only for the
  // agent side — these assertions keep the written contract honest.

  it('defines loop/rework as flow self-edges, not an in-run decision or loop template', () => {
    const pkg = loadSkillPackage();
    expect(pkg).toMatch(/Flow Self-Edge Loop/);
    expect(pkg).toMatch(/inline bounded loop/);
    expect(pkg).toMatch(/condition-matched re-entry/);
    expect(pkg).not.toMatch(/template: loop/);
    expect(pkg).not.toMatch(/node\.type = "gate"/);
  });

  it('documents rework decision removal — no retry/branchTo node action; backward rework rides the advance jump channel', () => {
    const pkg = loadSkillPackage();
    expect(pkg).toMatch(/# Rework Decision \(removed\)/);
    expect(pkg).toMatch(/no in-run target routing/);
    expect(pkg).toMatch(/operator `graph_jump` \(PCL, graph-external\) is the operator-level backward reset/);
    expect(pkg).toMatch(/advance `jump` channel/);
    expect(pkg).not.toMatch(/action: "jump", target: <rework target>/);
  });

  it('defines continue-only node decisions (no default edge exists)', () => {
    const pkg = loadSkillPackage();
    expect(pkg).toMatch(/`action: 'continue'` always/);
    expect(pkg).not.toMatch(/node\.default/);
  });

  it('documents the removed jumps field — rework is flow self-edges, not a gate field', () => {
    const pkg = loadSkillPackage();
    expect(pkg).not.toMatch(/`jumps`/);
    expect(pkg).toMatch(/flow self-edges/);
    expect(pkg).not.toMatch(/node\.type = "gate"/);
  });

  it('documents inline until-condition evaluation — no judge() primitive remains', () => {
    const pkg = loadSkillPackage();
    expect(pkg).not.toMatch(/judge\(\)/);
    expect(pkg).not.toMatch(/judge failure handling/);
  });

  // ── Todo node-boundary lifecycle ─────────────────────────

  it('defines the §Todo Lifecycle (node boundary) section', () => {
    expect(skill).toMatch(/## Todo Lifecycle \(node boundary\)/);
  });

  it('mandates dispatch clear before execution (single main path)', () => {
    const dispatchRules = skill.slice(skill.indexOf('# Dispatch Rules'));
    expect(dispatchRules.match(/Clear todo per §Todo Lifecycle \(dispatch clear\)/g)?.length).toBeGreaterThanOrEqual(1);
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

  it('approval flow: single-form card; continue-only decisions; todo cleared before return', () => {
    // Surviving contract: approval() is a single-form card (always presented,
    // never auto-executed) — the handler no longer delegates a mode decision
    // or maps to IApprovalDecision; node decisions carry `action: 'continue'`
    // (no branchTo, no retry), output/decision kept in the agent session
    // (platform-persisted), todo cleared, then return. Decision routing
    // (continue / end: true, operator graph_jump) lives in DECISION-CARDS.md.
    const pkg = loadSkillPackage();
    expect(pkg).not.toMatch(/delegate the mode decision to approval\(\)/i);
    expect(pkg).not.toMatch(/Map to IApprovalDecision/);
    expect(pkg).toMatch(/keep it in the agent session \(platform-persisted\)/);
    expect(pkg).not.toMatch(/via `graph_advance` `branchTo`/);
    expect(skill).toMatch(/[Cc]lear todo per §Todo Lifecycle \(completion clear\)/);
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
    const callIdx = mainSection.indexOf('Execute tool calls per atom-kernel §Tool Schemas');
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

  it('declares operation classes - evidence-only (no registry injection)', () => {
    const section = skill.slice(skill.indexOf('## Tool Usage Check Resolution'));
    expect(section).toMatch(
      /`?node\.operations`? \(wins on conflict\) \+ the dispatched skill's `### Operation classes`/,
    );
    expect(section).toMatch(/Block format \+ assembly: see CONTEXT-ASSEMBLY\.md §Main Inline Context Assembly step 4/);
    expect(section).toMatch(/No declared classes -> no assembly, no warning/);
    expect(section).toMatch(/declared classes resolve against the scenario-keyed hint registry keys/);
    expect(section).toMatch(/no scenario coverage/);
  });

  it('prefixes [TOOL USAGE VIOLATION: N] on violated lines', () => {
    const section = skill.slice(skill.indexOf('# Checks Block'));
    expect(section).toMatch(/\[TOOL USAGE VIOLATION: <count>\]/);
  });

  it('surfaces tool-usage markers in the node output via §Markers', () => {
    const markers = skill.slice(skill.indexOf('## Markers'));
    expect(markers).toMatch(/\[TOOL USAGE VIOLATION: <count>\]/);
    expect(markers).toMatch(/prefix output with the count/);
  });

  it('adds the Checks scan step to main dispatch rules', () => {
    const mainRules = skill.slice(skill.indexOf('### main type'), skill.indexOf('## Main Inline Context Assembly'));
    expect(mainRules).toMatch(/Checks scan - assemble the `## Checks` block/);
  });

  it('delegates main execution to atom-kernel §Tool Schemas + §Tool Discipline', () => {
    const mainRules = skill.slice(skill.indexOf('### main type'), skill.indexOf('## Main Inline Context Assembly'));
    expect(mainRules).toMatch(/Main execution = tool-call execution/);
    expect(mainRules).toMatch(/Execute tool calls per atom-kernel §Tool Schemas/);
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
