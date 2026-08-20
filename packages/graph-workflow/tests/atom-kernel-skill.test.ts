/**
 * Content assertions - atom-kernel SKILL.md:
 * - todo() platform spelling: clear-only boundary contract in the spellings
 *   table, no-todo platform no-op, in-node usage stays native tooling.
 * - Tool Discipline (HLT instruction layer completely removed): hint-based
 *   tool guidance (every-match, zero deny), register_edit as the mounted
 *   MCP call, kernel primitives unaffected, factual tool schemas.
 * - No Atomic Step Protocol chapter; Step Projection retired (todo lifecycle
 *   only); no HLT registry residue.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function loadSkill(): string {
  // Whole skill dir: SKILL.md first, then siblings (sorted) - relocated
  // content (SERENA-SCHEMAS/JCODEMUNCH-SCHEMAS) is part of the
  // contract and must still match the pinned phrases below.
  const skillDir = resolve(__dirname, '../skills/atom-kernel');
  const files = readdirSync(skillDir)
    .filter((f) => f.endsWith('.md'))
    .sort();
  const skillIndex = files.indexOf('SKILL.md');
  if (skillIndex !== -1) {
    files.splice(skillIndex, 1);
    files.unshift('SKILL.md');
  }
  return files.map((f) => readFileSync(resolve(skillDir, f), 'utf-8')).join('\n');
}

describe('atom-kernel SKILL.md - todo() state-machine spelling', () => {
  const skill = loadSkill();

  it('spellings table carries a todo() row with state-machine semantics', () => {
    const spellings = skill.slice(skill.indexOf('## Platform Spellings'));
    expect(spellings).toMatch(/\|`todo\(\)`\|State-machine task list - pending\/in_progress\/completed/);
    expect(spellings).toMatch(/boundary clear at execution-unit boundaries; no-todo platform -> no-op/);
  });

  it('defines the todo() boundary-clear contract section with state machine', () => {
    expect(skill).toMatch(/# todo\(\) - Boundary Clear/);
    const section = skill.slice(skill.indexOf('# todo() - Boundary Clear'));
    expect(section).toMatch(/state-machine semantics \+ per-platform spellings in §Platform Spellings/);
    expect(section).toMatch(/the contract is the state machine, never the op names/);
  });

  it('maps no-todo platform to a no-op without error', () => {
    const section = skill.slice(skill.indexOf('# todo() - Boundary Clear'));
    expect(section).toMatch(/No-todo platform -> no-op, no error/);
  });

  it('names the handler as the only consumer - boundary clears only', () => {
    const section = skill.slice(skill.indexOf('# todo() - Boundary Clear'));
    expect(section).toMatch(/atom-phase-handler enforces the node-boundary lifecycle/);
    expect(section).not.toMatch(/§Step Projection/);
  });

  it('keeps the task() heading intact after the todo() section', () => {
    expect(skill).toMatch(/# task\(\) - Dispatch/);
    expect(skill.indexOf('# task() - Dispatch')).toBeGreaterThan(skill.indexOf('# todo() - Boundary Clear'));
  });
});

describe('atom-kernel SKILL.md - no Atomic Step Protocol chapter', () => {
  const skill = loadSkill();

  it('has no Atomic Step Protocol chapter heading', () => {
    expect(skill).not.toMatch(/# Atomic Step Protocol/);
  });

  it('has no reference to the retired atom-mcp-contract skill', () => {
    expect(skill).not.toMatch(/atom-mcp-contract/);
  });
});

describe('atom-kernel SKILL.md - Tool Discipline (direct specification)', () => {
  const skill = loadSkill();
  const section = skill.slice(skill.indexOf('# Tool Discipline'));

  it('declares the resident Tool Discipline prompt as the discipline home', () => {
    expect(section).toMatch(/# Tool Discipline/);
    expect(section).toMatch(/resident Tool Discipline prompt/);
  });

  it('names the scenario set - post-hoc primary, zero deny, closed five', () => {
    expect(section).toMatch(/scenario-keyed hints/);
    expect(section).toMatch(/post-hoc primary/);
    expect(section).toMatch(/zero deny/);
    for (const scenario of ['find', 'read', 'write', 'verify', 'run']) {
      expect(section).toMatch(new RegExp(scenario));
    }
    expect(section).toMatch(/are the parameter reference/);
    // pointer semantics - no module-delivery indirection
    expect(section).not.toMatch(/delivered by the graph-fidelity discipline module/);
  });

  it('toolizes index freshness as the mounted MCP call', () => {
    expect(section).toMatch(/mcp__jcodemunch_register_edit/);
    expect(section).toMatch(/n\/a: not indexed/);
    // full register_edit obligation single-sourced in the cold jcodemunch docs
    expect(skill).toMatch(/\{repo, file_paths, reindex\?\}/);
  });

  it('keeps kernel primitives untouched - platform contracts, unaffected by the tool-discipline layer', () => {
    expect(section).toMatch(/task \/ approval \/ interview \/ todo/);
    expect(section).toMatch(/platform contracts/);
    expect(section).toMatch(/unaffected/);
  });

  it('has no retired-registry residue - no registered-call contract, no registry pointer, no acronym', () => {
    expect(section).not.toMatch(/registered call `\{ intent, tool, args, bound \}`/);
    expect(section).not.toMatch(/HLT-REGISTRY\.md/);
    expect(section).not.toMatch(/Closed set of high-level tools/);
    expect(skill).not.toMatch(/# High-Level Tool Registry/);
    expect(skill).not.toMatch(/HLT/);
  });
});

describe('atom-kernel SKILL.md - tool schemas (factual reference retained)', () => {
  const skill = loadSkill();
  const section = skill.slice(skill.indexOf('# Tool Schemas'));

  it('declares the Tool Schemas section', () => {
    expect(section).toMatch(/# Tool Schemas/);
  });

  it('covers the mounted server families (no context-module section)', () => {
    expect(section).toMatch(/## serena/);
    expect(section).toMatch(/## jcodemunch/);
    // compression is the graph-fidelity-context module's internal dependency —
    // no kernel section, no schema block (single home outside the kernel)
    expect(section).not.toMatch(/headroom/);
    // graph-scheduler family coverage = the exact-name detection list
    // (§Graph-Scheduler Tool Detection) — schema params single-sited in
    // atom-pilot §MCP Reference (no duplicate ## graph-scheduler section)
    expect(skill).toMatch(/# Graph-Scheduler Tool Detection/);
    for (const tool of [
      'graph_start',
      'graph_advance',
      'graph_status',
      'graph_list',
      'graph_assets',
      'graph_force_end',
      'graph_jump',
      'graph_init',
      'graph_clean_completed',
      'graph_clean_all',
    ]) {
      expect(skill).toMatch(new RegExp(tool));
    }
  });

  it('documents the serena full execution surface - replace_in_files, read_file slicing, no run table', () => {
    expect(section).toMatch(/#### replace_in_files - multi-file replace \(one call\)/);
    expect(section).toMatch(/#### read_file - sliced file read/);
    expect(section).not.toMatch(/#### execute_shell_command - run command/);
  });

  it('scopes register_edit to indexed targets, n/a for unindexed/unmounted, MCP-toolized', () => {
    expect(section).toMatch(
      /Required after every mutation on indexed targets \(in-project code \+ indexed non-code-text subtypes\) while the index is mounted - unconditional within scope/,
    );
    expect(section).toMatch(/mcp__jcodemunch_register_edit/);
    expect(section).toMatch(/Unindexed target \(markdown\/plain text, out-of-project\) -> `n\/a: not indexed`/);
    expect(section).toMatch(/`n\/a: jcodemunch not in use` \(never silent\)/);
  });

  it('keeps the schema-first protocol: parameter names never guessed, docs before first call', () => {
    const disciplineSection = skill.slice(skill.indexOf('# Tool Discipline'));
    expect(disciplineSection).toMatch(/parameter names NEVER guessed/);
    expect(disciplineSection).toMatch(/read full tool docs first/);
  });
});

describe('atom-kernel SKILL.md - fault tolerance (Tool Discipline)', () => {
  const skill = loadSkill();
  const section = skill.slice(skill.indexOf('# Tool Discipline'));

  it('is schema-first - parameter names never guessed, full docs first', () => {
    expect(section).toMatch(/Schema-first - parameter names NEVER guessed/);
    expect(section).toMatch(/read full tool docs first/);
  });

  it('repairs and retries once, then registers cache invalidation', () => {
    expect(section).toMatch(/Errors repair \+ retry ONCE/);
    expect(section).toMatch(/mcp__jcodemunch_register_edit/);
    expect(section).toMatch(/n\/a: not indexed/);
  });
});

describe('atom-kernel SKILL.md - Step Projection retired (todo lifecycle only)', () => {
  const skill = loadSkill();

  it('has no Step Projection section - projection contract retired', () => {
    expect(skill).not.toMatch(/# Step Projection/);
    expect(skill).not.toMatch(/step plan/);
    expect(skill).not.toMatch(/done gate/);
    expect(skill).not.toMatch(/8-step cap|SHALL NOT exceed 8 steps/);
  });

  it('keeps todo() boundary-clear spelling - lifecycle governance only', () => {
    expect(skill).toMatch(/Boundary Clear/);
    expect(skill).toMatch(/node-boundary lifecycle \(dispatch \+ completion clears\)/);
  });
});
