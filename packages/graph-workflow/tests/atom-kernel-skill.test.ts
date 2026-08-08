/**
 * Content assertions - atom-kernel SKILL.md:
 * - todo() platform spelling: clear-only boundary contract in the spellings
 *   table, no-todo platform no-op, in-node usage stays native tooling.
 * - High-Level Tool Registry (sole execution contract, merged from the
 *   retired atom-mcp-contract skill): call = registered tool execution, entry
 *   anatomy (contract/chain/plane + enforcement deferred), two-plane structure - query
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
    expect(section).toMatch(/An execution is a registered tool call `\{ intent, tool, args, bound \}`/);
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
    expect(section).toMatch(/[Uu]nknown tool names fail the call at analyze with the candidate list/);
  });

  it('ends read-only calls when the tool completes without writes; write calls verify per Entry: verify', () => {
    expect(section).toMatch(/Read-only calls end when the tool completes without writes/);
    expect(section).toMatch(/write calls verify per `Entry: verify` BEFORE reporting success/);
  });

  it('bounds the call-internal evidence loop with a default of 3 and an evidence-gap failure', () => {
    expect(section).toMatch(/bound \(default 3, per-call override allowed\)/);
    expect(section).toMatch(/call FAILS with evidence-gap list naming missing files\/symbols/);
  });

  it('layers loops: call-internal bounded loop vs graph gate cross-call rework', () => {
    expect(section).toMatch(/call-internal evidence loop = this contract, bounded/);
    expect(section).toMatch(/Cross-call rework = graph gates \(jumps \+ retryCount, atom-graph-spec\)/);
  });

  it('uses tool-call vocabulary - no step as execution unit in the registry section', () => {
    expect(section).not.toMatch(/step is a registered tool call/);
    expect(section).not.toMatch(/fail the step at analyze/);
    expect(section).not.toMatch(/step-internal evidence loop/);
  });
});

describe('atom-kernel SKILL.md - HLT Registry entry anatomy (merged from atom-mcp-contract)', () => {
  const skill = loadSkill();
  const section = skill.slice(skill.indexOf('## Registry Entries'));

  it('defines the closed registry intro with three views + deferred enforcement', () => {
    expect(section).toMatch(
      /\|`contract`\|Declared I\/O, verify obligations, index-registration obligations \(unconditional while index mounted\), n\/a rules\|/,
    );
    expect(section).toMatch(
      /\|`chain`\|Execution order - query plane: jcodemunch head \(\+ serena ground-truth confirmation step\)/,
    );
    expect(section).toMatch(
      /\*\*Enforcement\*\*: deferred per-platform \(all entries; per-platform allowed\/denied\/mandatory sets recorded now/,
    );
    expect(section).toMatch(
      /\|`plane`\|`query` \(jcodemunch head\)\|`mutation` \(serena sole\)\|`run` \(platform shell\)\|`utility` \(optional, declared use cases\)\|/,
    );
  });

  it('declares registry validation - three views + enforcement deferred; query head jcodemunch, mutation serena-only, run platform shell', () => {
    expect(section).toMatch(/Every entry has three views \(enforcement deferred per-entry\)/);
    expect(section).toMatch(/query-plane entries SHALL head with jcodemunch/);
    expect(section).toMatch(/mutation-plane entries SHALL use serena tools only/);
    expect(section).toMatch(/utility entries SHALL carry optional markers \+ use cases \+ n\/a rules/);
  });

  it('forbids cross-plane chains - validation errors both directions', () => {
    expect(section).toMatch(/Chain heads SHALL NOT cross planes/);
    expect(section).toMatch(
      /a locate chain headed by serena symbol tools, a write chain headed by jcodemunch - both validation errors/,
    );
  });

  it('declares the two-plane structure - query jcodemunch read-only, mutation serena sole, run platform shell', () => {
    const intro = skill.slice(skill.indexOf('# High-Level Tool Registry'));
    expect(intro).toMatch(
      /\*\*Query plane \(jcodemunch\)\*\* - locate\/search\/analyze chains head with jcodemunch index tools/,
    );
    expect(intro).toMatch(
      /\*\*Mutation \+ ground-truth plane \(serena\)\*\* - write\/verify chains name serena as the sole tool, zero fallback/,
    );
    expect(intro).toMatch(
      /\*\*Run class\*\* - platform shell \(`bash`, rtk prefix\) - the single class for arbitrary shell commands/,
    );
    expect(intro).toMatch(/utility tools never appear in a query\/mutation chain/);
  });

  it('covers the full closed tool set - query/mutation/run + utility entries', () => {
    expect(section).toMatch(
      /### Entry: locate\n\n- \*\*plane\*\*: query \(jcodemunch head \+ serena ground-truth confirmation\)/,
    );
    expect(section).toMatch(
      /### Entry: read\n\n- \*\*plane\*\*: mutation \(serena\) \+ query-plane locate when target unknown/,
    );
    expect(section).toMatch(/### Entry: write\n\n- \*\*plane\*\*: mutation \(serena\)/);
    expect(section).toMatch(/### Entry: verify\n\n- \*\*plane\*\*: mutation \(serena\)/);
    expect(section).toMatch(/### Entry: run\n\n- \*\*plane\*\*: run \(platform shell\)/);
    for (const entry of ['compress', 'review', 'archive', 'graph-ops']) {
      expect(section).toMatch(new RegExp(`### Entry: ${entry}\\n\\n- \\*\\*plane\\*\\*: utility`));
    }
  });

  it('heads locate with the query plane - jcodemunch index + serena ground-truth confirmation', () => {
    expect(section).toMatch(
      /jcodemunch index \(`search_symbols`, `find_references`, `check_references`, `get_blast_radius`, `plan_turn`, `check_edit_safe`, `check_delete_safe`, `get_impact_preview`\) - repository-scale, all languages, gitignore-aware/,
    );
    expect(section).toMatch(
      /serena ground-truth confirmation \(`find_symbol`, `find_referencing_symbols`, `find_implementations`, `find_declaration` - LSP\) - confirm critical candidates BEFORE mutation/,
    );
    expect(section).not.toMatch(/^  \d+\. serena symbol ops/m);
  });

  it('routes all writes to serena tools - surgical via replace_content/replace_in_files, no platform-native edit', () => {
    expect(section).toMatch(/symbol-level \(body replace \/ rename \/ insert \/ safe delete\) -> serena LSP tools/);
    expect(section).toMatch(
      /serena `replace_content` \(single file, ambiguity-guarded\) \/ `replace_in_files` \(multi-file, dry-run \+ expected_count guarded\)/,
    );
    expect(section).toMatch(/query-plane preflight BEFORE mutation \(edit\/delete legs/);
    expect(section).not.toMatch(/platform-native edit/);
  });

  it('defines the two-part verify loop in Entry: verify - register_edit unconditional while mounted', () => {
    expect(section).toMatch(/serena `get_diagnostics_for_file` \(min_severity 1, LSP-covered languages\)/);
    expect(section).toMatch(/re-read the changed region \(serena `read_file` - confirm applied state\)/);
    expect(section).toMatch(/register_edit count reported while the index is mounted \(obligation\)/);
    expect(section).toMatch(
      /`jcodemunch register_edit` after every edit while the index is mounted - unconditional \(mutation-plane obligation\)/,
    );
  });

  it('runs commands via the platform shell - rtk prefix preserved', () => {
    expect(section).toMatch(/platform shell \(`bash`\) - project cwd, stdout\/stderr captured - rtk prefix preserved/);
    expect(section).not.toMatch(/serena `execute_shell_command`/);
  });

  it('records deferred enforcement views', () => {
    expect(section).toMatch(/allowed\/denied\/mandatory sets/);
    expect(section).toMatch(/recorded now, implementation deferred until adaptation modules ship/);
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

  it('makes register_edit unconditional while mounted, n/a when unmounted in the schema notes', () => {
    expect(section).toMatch(
      /Required after every mutation while the index is mounted \(unconditional - mutation-plane obligation\)/,
    );
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

  it('fails loudly per plane - query plane down fails locate, mutation plane down fails write', () => {
    expect(section).toMatch(/\*\*Plane-down semantics\*\*/);
    expect(section).toMatch(
      /Query plane down \(jcodemunch unreachable\) -> locate\/search\/analyze fail naming jcodemunch/,
    );
    expect(section).toMatch(
      /Mutation plane down \(serena down, project unactivated\) -> write\/verify fail naming serena/,
    );
    expect(section).toMatch(/Never silent degrade, never cross-plane fallback/);
  });

  it('retries locate once within the query plane - no cross-plane fallback', () => {
    expect(section).toMatch(/retry once within the query plane/);
    expect(section).toMatch(/cross-plane fallback ban/);
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
    expect(section).toMatch(/Serena itself unavailable -> call fails loudly \(mutation plane has no non-serena tier\)/);
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
