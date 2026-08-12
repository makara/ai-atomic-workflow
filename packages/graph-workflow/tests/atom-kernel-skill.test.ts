/**
 * Content assertions - atom-kernel SKILL.md:
 * - todo() platform spelling: clear-only boundary contract in the spellings
 *   table, no-todo platform no-op, in-node usage stays native tooling.
 * - High-Level Tool Registry (sole execution contract, merged from the
 *   retired atom-mcp-contract skill): call = registered tool execution, entry
 *   anatomy (contract/chain/discipline/plane), two-plane structure - query
 *   plane jcodemunch head read-only, mutation plane serena sole, run platform shell,
 *   unconditional verify + index obligations while mounted, tool schemas.
 * - No Atomic Step Protocol chapter; Step Projection retired (todo lifecycle
 *   only).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function loadSkill(): string {
  // Whole skill dir: SKILL.md first, then siblings (sorted) - relocated
  // content (HLT-REGISTRY/SERENA-SCHEMAS/JCODEMUNCH-SCHEMAS) is part of the
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

describe('atom-kernel SKILL.md - High-Level Tool Registry tool-call definition', () => {
  const skill = loadSkill();
  const section = skill.slice(skill.indexOf('# High-Level Tool Registry'));

  it('declares the High-Level Tool Registry section as the execution contract home', () => {
    expect(section).toMatch(/# High-Level Tool Registry/);
    expect(section).toMatch(/the single execution contract for main-phase work/);
  });

  it('defines the call as a registered tool execution with exactly four fields - { intent, tool, args, bound }', () => {
    expect(section).toMatch(/An execution = registered call `\{ intent, tool, args, bound \}`/);
    for (const field of ['intent', 'tool', 'args', 'bound']) {
      expect(section).toMatch(new RegExp(`\\b${field}\\b`));
    }
    // Legacy 8-field shape rejected - no backward-compatible acceptance.
    expect(section).toMatch(
      /Legacy 8-field protocol fields \(`read_set`, `evidence`, `write_set`, `apply`, `verify`\) are REJECTED/,
    );
    expect(section).not.toMatch(/read_set,?\\s*\/\//);
  });

  it('requires tool to reference a registered high-level tool - unknown names fail at analyze', () => {
    expect(section).toMatch(/Unknown tool names fail at analyze \(candidate list\)/);
  });

  it('ends read-only calls when the tool completes without writes; write calls verify per Entry: verify', () => {
    expect(section).toMatch(/Read-only calls end without writes/);
    expect(section).toMatch(/write calls verify per `Entry: verify` BEFORE reporting success/);
  });

  it('bounds the call-internal evidence loop with a default of 3 and an evidence-gap failure', () => {
    expect(section).toMatch(/bound \(default 3, per-call override\)/);
    expect(section).toMatch(/call FAILS with evidence-gap list \(missing files\/symbols\)/);
  });

  it('layers loops: call-internal bounded loop vs graph gate cross-call rework', () => {
    expect(section).toMatch(/call-internal = this contract/);
    expect(section).toMatch(/cross-call rework = graph gates \(atom-graph-spec\)/);
  });

  it('uses tool-call vocabulary - no step as execution unit in the registry section', () => {
    expect(section).not.toMatch(/step is a registered tool call/);
    expect(section).not.toMatch(/fail the step at analyze/);
    expect(section).not.toMatch(/step-internal evidence loop/);
  });
});

describe('atom-kernel SKILL.md - HLT Registry entry anatomy (static prose + signal distribution)', () => {
  const skill = loadSkill();
  const registryFile = readFileSync(resolve(__dirname, '../skills/atom-kernel/HLT-REGISTRY.md'), 'utf-8');
  const rs = registryFile.indexOf('## Operation Obligations');
  const reRest = registryFile.slice(rs);
  const reEnd = reRest.indexOf('\n## ', 1);
  const registry = reEnd === -1 ? reRest : reRest.slice(0, reEnd);
  const hotTable = skill.slice(skill.indexOf('# High-Level Tool Registry'));

  it('presents the adapter rule as static prose in SKILL.md (rule-first, no enumeration)', () => {
    const intro = skill.slice(skill.indexOf('# High-Level Tool Registry'));
    expect(intro).toMatch(/\*\*Adapter rule \(single home — one static rule, no enumeration\)\*\*/);
    expect(intro).toMatch(/in-project code → serena/);
    expect(intro).toMatch(/Adapter unavailable -> loud failure/);
    expect(intro).not.toMatch(/generated from usage-constraint policy data/);
    expect(intro).not.toMatch(/generated:hot-table/);
    // No scenario enumeration table in the hot surface
    expect(hotTable).not.toMatch(/\|in-project-code x locate\|/);
  });

  it('keeps allocation single-home - no parameter tables restated in generated regions', () => {
    expect(registry).not.toMatch(/\|`relative_path`\|/);
    expect(registry).not.toMatch(/\|`content`\|/);
    expect(registry).not.toMatch(/\|`hash`\|/);
    expect(registry).not.toMatch(/\|`file_paths`\|/);
  });

  it('keeps the hot surface summary-level - no full entries re-inlined into SKILL.md', () => {
    const skillOnly = readFileSync(resolve(__dirname, '../skills/atom-kernel/SKILL.md'), 'utf-8');
    expect(skillOnly).not.toMatch(/### Entry: /);
    expect(skillOnly).not.toMatch(/\|`contract`\|Declared I\/O/);
  });

  it('obligations table covers the full closed tool set', () => {
    for (const entry of [
      'locate',
      'read',
      'write',
      'verify',
      'run',
      'compress',
      'review',
      'archive',
      'graph-ops',
      'register_edit',
    ]) {
      expect(registry).toMatch(new RegExp(`\\|${entry}\\|`));
    }
    expect(registry).toMatch(/\|write\|preflight \+ verify after write/);
    expect(registry).toMatch(/evidence-only/);
  });

  it('adapter rule table maps target domains to adapters (no operation enumeration)', () => {
    const rule = registryFile.slice(
      registryFile.indexOf('## Adapter Rule'),
      registryFile.indexOf('## Operation Obligations'),
    );
    expect(rule).toMatch(/\|in-project code\|jcodemunch → serena\|serena\|serena\|serena\|—\|—\|—\|/);
    expect(rule).toMatch(/\|run\|—\|—\|—\|—\|shell\|—\|—\|/);
    expect(rule).toMatch(/\|compress\|—\|—\|—\|—\|—\|headroom\|—\|/);
  });

  it('records signal-distribution discipline - no enforcement language', () => {
    const intro = skill.slice(skill.indexOf('# High-Level Tool Registry'));
    expect(intro).toMatch(/signal distribution/);
    expect(intro).toMatch(/zero denial/);
    expect(registryFile).toMatch(/signal distribution/);
    expect(registry).not.toMatch(/Enforcement\*\*: implemented/);
    expect(registry).not.toMatch(/deferred per-platform/);
    expect(registry).not.toMatch(/generated from usage-constraint policy data/);
    // Header-level deferred marker is gone too (high-level-tool deferred-marker removal).
    const registryHeader = registryFile.slice(0, registryFile.indexOf('## Adapter Rule'));
    expect(registryHeader).not.toMatch(/deferred/);
    expect(registryFile).not.toMatch(/generated:registry-entries/);
  });

  it('registry prose is portable - no project-specific paths', () => {
    expect(registry).not.toMatch(/packages\/usage-constraint/);
    expect(hotTable).not.toMatch(/packages\/usage-constraint/);
  });
});

describe('atom-kernel SKILL.md - tool schemas (merged from atom-mcp-contract)', () => {
  const skill = loadSkill();
  const section = skill.slice(skill.indexOf('# Tool Schemas'));

  it('declares the Tool Schemas section', () => {
    expect(section).toMatch(/# Tool Schemas/);
  });

  it('covers all four mounted server families', () => {
    expect(section).toMatch(/## serena/);
    expect(section).toMatch(/## jcodemunch/);
    expect(section).toMatch(/## headroom/);
    expect(section).toMatch(/## graph-scheduler/);
  });

  it('documents the serena full execution surface - replace_in_files, read_file slicing, no run table', () => {
    expect(section).toMatch(/#### replace_in_files - multi-file replace \(one call\)/);
    expect(section).toMatch(/#### read_file - sliced file read/);
    expect(section).not.toMatch(/#### execute_shell_command - run command/);
  });

  it('scopes register_edit to indexed targets, n/a for unindexed/unmounted in the schema notes', () => {
    expect(section).toMatch(
      /Required after every mutation on indexed targets \(in-project code \+ indexed non-code-text subtypes\) while the index is mounted - unconditional within scope/,
    );
    expect(section).toMatch(/Unindexed target \(markdown\/plain text, out-of-project\) -> `n\/a: not indexed`/);
    expect(section).toMatch(/`n\/a: jcodemunch not in use` \(never silent\)/);
  });

  it('keeps the schema-first protocol: parameter names never guessed, docs before first call', () => {
    const registrySection = skill.slice(skill.indexOf('# High-Level Tool Registry'));
    expect(registrySection).toMatch(/Parameter names NEVER guessed/);
    expect(registrySection).toMatch(/read the platform's full tool docs before first call/);
  });
});

describe('atom-kernel SKILL.md - fault tolerance', () => {
  const skill = loadSkill();
  const section = skill.slice(skill.indexOf('## Fault Tolerance'));

  it('fails loudly per scenario - adapter down fails the scenario call', () => {
    expect(section).toMatch(/\*\*Adapter-down semantics\*\*/);
    expect(section).toMatch(/the call fails loudly naming the adapter \+ reason/);
    expect(section).toMatch(/Scope is the cell - never silent degrade, never cross-adapter fallback/);
  });

  it('retries locate once within the scenario adapter - no cross-adapter fallback', () => {
    expect(section).toMatch(/retry once within the cell's adapter/);
    expect(section).toMatch(/never unbounded blind retry/);
  });

  it('covers LSP index lag on fresh files - ground-truth confirmation retries, freshness metadata consumed', () => {
    expect(section).toMatch(/LSP index lag \(fresh files\)/);
    expect(section).toMatch(/the ground-truth confirmation retries/);
    expect(section).toMatch(/consume the metadata, do not fabricate certainty/);
  });

  it('rejects gitignored/invisible declared-I/O entries at analyze', () => {
    expect(section).toMatch(/Gitignored\/invisible paths/);
    expect(section).toMatch(/rejected at analyze with visibility error/);
  });

  it('gates intra-serena tiers by per-tier preconditions; serena unavailable -> loud failure', () => {
    expect(section).toMatch(/precondition \(e.g. LSP coverage per language\) gates the intra-serena tier/);
    expect(section).toMatch(/Serena itself unavailable → in-project code cells fail loudly/);
  });

  it('covers the index staleness window - overview-first reads when the index has no entry', () => {
    expect(section).toMatch(/Index staleness window: reads of just-created files may lag the index/);
    expect(section).toMatch(/degrades to mutation-plane overview-first reads when the index has no entry/);
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
