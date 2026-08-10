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
    expect(section).toMatch(/call-internal = this contract, bounded/);
    expect(section).toMatch(/cross-call rework = graph gates \(atom-graph-spec\)/);
  });

  it('uses tool-call vocabulary - no step as execution unit in the registry section', () => {
    expect(section).not.toMatch(/step is a registered tool call/);
    expect(section).not.toMatch(/fail the step at analyze/);
    expect(section).not.toMatch(/step-internal evidence loop/);
  });
});

describe('atom-kernel SKILL.md - HLT Registry entry anatomy (merged from atom-mcp-contract; scenario-keyed)', () => {
  const skill = loadSkill();
  const section = skill.slice(skill.indexOf('## Registry Entries'));

  it('defines the closed registry intro with three views + deferred enforcement', () => {
    expect(section).toMatch(/\|`contract`\|Declared I\/O, obligations, n\/a rules\|/);
    expect(section).toMatch(
      /\|`chain`\|Execution order - the scenario's designated adapter; in-project code: two-plane chain/,
    );
    expect(section).toMatch(
      /\*\*Enforcement\*\*: deferred per-platform \(all entries; per-platform allowed\/denied\/mandatory sets recorded now/,
    );
    expect(section).toMatch(
      /\|`scenario`\|Target domain x operation key - `in-project code` \/ `in-project non-code text \(indexed\|unindexed\)`.*`utility`\|/,
    );
  });

  it('declares registry validation - three views + enforcement deferred; scenario-keyed adapter assignment', () => {
    expect(section).toMatch(/Every entry has three views \(enforcement deferred per-entry\)/);
    expect(section).toMatch(
      /each scenario key has exactly one adapter - zero or multiple adapters per cell = validation error/,
    );
    expect(section).toMatch(
      /In-project-code chains SHALL keep the two-plane shape \(jcodemunch locate head \+ serena ground-truth; serena sole mutator\)/,
    );
    expect(section).toMatch(
      /Indexed-target entries SHALL carry the register_edit obligation; unindexed\/out-of-project entries SHALL declare `n\/a: not indexed`/,
    );
  });

  it('forbids cross-plane chains - validation errors both directions', () => {
    expect(section).toMatch(/each scenario key has exactly one adapter/);
    expect(section).toMatch(/zero or multiple adapters per cell = validation error/);
  });

  it('keeps allocation single-home - HLT-REGISTRY entries restate no parameter tables', () => {
    const registry = readFileSync(resolve(__dirname, '../skills/atom-kernel/HLT-REGISTRY.md'), 'utf-8');
    const entries = registry.slice(registry.indexOf('## Registry Entries'), registry.indexOf('## headroom'));
    expect(entries).not.toMatch(/\|`relative_path`\|/);
    expect(entries).not.toMatch(/\|`content`\|/);
    expect(entries).not.toMatch(/\|`hash`\|/);
    expect(entries).not.toMatch(/\|`file_paths`\|/);
  });

  it('hot-places tool parameter surfaces - compact tables in SKILL.md, full tables single-home in schemas', () => {
    const skillOnly = readFileSync(resolve(__dirname, '../skills/atom-kernel/SKILL.md'), 'utf-8');
    expect(skillOnly).toMatch(/Compact params \(full: SERENA-SCHEMAS.md\)/);
    expect(skillOnly).toMatch(/Compact params \(full: JCODEMUNCH-SCHEMAS.md\)/);
    expect(skillOnly).toMatch(/\|`replace_content`\|relative_path, needle, repl, mode/);
    expect(skillOnly).toMatch(
      /\|`search_symbols`\|repo, query, kind, language, max_results, token_budget, detail_level\|confidence\/freshness metadata\|/,
    );
    // headroom MCP-authoritative wording (no proxy contract text)
    expect(skillOnly).toMatch(/Context compression - contract \(MCP authoritative\), trigger \(>8KB\), proxy forms/);
  });

  it('declares graph-scheduler heat + headroom MCP authority in atom-pilot', () => {
    const pilot = readFileSync(resolve(__dirname, '../skills/atom-pilot/SKILL.md'), 'utf-8');
    expect(pilot).toMatch(/Parameter schema \(hot - pilot loop surface, same lifecycle, no split\)/);
    expect(pilot).toMatch(/execution-hot \(every dispatch\)/);
    expect(pilot).toMatch(/operation-cold \(operator use\)/);
  });

  it('keeps the hot surface summary-level - no full entries re-inlined into SKILL.md', () => {
    const skillOnly = readFileSync(resolve(__dirname, '../skills/atom-kernel/SKILL.md'), 'utf-8');
    expect(skillOnly).not.toMatch(/### Entry: /);
    expect(skillOnly).not.toMatch(/\|`contract`\|Declared I\/O/);
  });

  it('declares the scenario structure - one adapter per target domain x operation, two-plane as code-domain chain', () => {
    const intro = skill.slice(skill.indexOf('# High-Level Tool Registry'));
    expect(intro).toMatch(
      /\*\*Scenario structure\*\*: key = scenario `\(target domain x operation\)` -> exactly one adapter \+ obligations \+ n\/a rules/,
    );
    expect(intro).toMatch(/Core rows \(hot - every dispatch\)/);
    expect(intro).toMatch(/\|in-project code x locate\|jcodemunch -> serena LSP ground-truth\|-\|/);
    expect(intro).toMatch(
      /\|out-of-project x read\/write\|platform-native read\/write\|serena `project-root-bound`; jcodemunch `not indexed`\|/,
    );
    expect(intro).toMatch(/Adapter unavailable -> loud failure/);
  });

  it('covers the full closed tool set - query/mutation/run + utility entries', () => {
    expect(section).toMatch(
      /### Entry: locate\n\n- \*\*scenario\*\*: in-project code x locate \(jcodemunch head \+ serena ground-truth\)/,
    );
    expect(section).toMatch(
      /### Entry: read\n\n- \*\*scenario\*\*: in-project code x read \(serena\); in-project non-code text x read \(platform-native, permissive cell\)/,
    );
    expect(section).toMatch(/### Entry: write\n\n- \*\*scenario\*\*: in-project code x write \(serena sole\)/);
    expect(section).toMatch(
      /### Entry: verify\n\n- \*\*scenario\*\*: in-project code x verify \(serena diagnostics \+ re-read\)/,
    );
    expect(section).toMatch(/### Entry: run\n\n- \*\*scenario\*\*: run \(platform shell\)/);
    for (const entry of ['review', 'archive', 'graph-ops']) {
      expect(section).toMatch(new RegExp(`### Entry: ${entry}\\n\\n- \\*\\*scenario\\*\\*: utility`));
    }
    expect(section).toMatch(
      /### Entry: compress\n\n- \*\*scenario\*\*: compress \(any domain\) - headroom-ai platform-neutral contract/,
    );
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
    expect(section).toMatch(/register_edit obligation per §Entry: register_edit/);
    expect(section).toMatch(/register_edit per §Entry: register_edit \(mutation obligation on indexed targets\)/);
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
    expect(section).toMatch(/the scenario call fails loudly naming the adapter \+ reason/);
    expect(section).toMatch(/Scope is the scenario - never silent degrade, never cross-adapter fallback/);
  });

  it('retries locate once within the scenario adapter - no cross-adapter fallback', () => {
    expect(section).toMatch(/retry once within the scenario's adapter/);
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
    expect(section).toMatch(/Serena itself unavailable -> in-project scenarios fail loudly/);
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
