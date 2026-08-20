/**
 * Resident content pins — PCL + full five-scenario enumeration +
 * independent jcodemunch entry (prompt-content-rebuild, ADR 0208: the
 * activate guidance and code-exploration entries are removed —
 * activation stays platform-native; the enumeration supersedes the
 * compressed posture; jcodemunch-resident-hints adds the third surface).
 * Full scenario blocks are never resident-injected (scenario-triggered
 * firing). The enumeration wording is single-sourced with the scenario
 * hint blocks (same reference-source extraction, tool-guidance rev 8).
 *
 * @module
 */

import { renderResidentBlock, type ResidentPrompt } from '@ai-atomic-workflow/platform-hooks-sdk';
import { describe, expect, it } from 'vitest';
import { PROMOTED_TOOL_NAMES, SCENARIO_HINT_BLOCKS, SCENARIO_TOOL_NAMES } from '../src/hints.js';
import {
  JCM_GUIDANCE_GROUPS,
  JCM_RESIDENT_GUIDANCE,
  PCL_VOCABULARY,
  SCENARIO_ENUMERATION_GUIDANCE,
} from '../src/resident-data.js';

/** Consumer-side resident prompt content — the shipped P0 set (PCL + five-scenario enumeration + jcodemunch; the attach call site composes the same entries — content constants are the single source). */
const PROMPTS: readonly ResidentPrompt[] = [
  { id: 'pcl', title: 'PCL', text: PCL_VOCABULARY },
  { id: 'scenarios', title: 'Tool Discipline', text: SCENARIO_ENUMERATION_GUIDANCE },
  { id: 'jcodemunch', title: 'jCodemunch', text: JCM_RESIDENT_GUIDANCE },
];

const blockOf = (id: string) => SCENARIO_HINT_BLOCKS.find((block) => block.id === id)!;

describe('resident content — PCL + five-scenario enumeration + jcodemunch (3-surface set)', () => {
  it('PCL vocabulary is present in the rendered block', () => {
    const block = renderResidentBlock(PROMPTS);
    expect(block).toContain('[resident] PCL:');
    expect(block).toContain('start graph: graph_start');
  });

  it('the five-scenario enumeration is present with all scenarios named', () => {
    expect(SCENARIO_ENUMERATION_GUIDANCE).toContain('find');
    expect(SCENARIO_ENUMERATION_GUIDANCE).toContain('read');
    expect(SCENARIO_ENUMERATION_GUIDANCE).toContain('write');
    expect(SCENARIO_ENUMERATION_GUIDANCE).toContain('verify');
    expect(SCENARIO_ENUMERATION_GUIDANCE).toContain('run');
  });

  it('no activate guidance entry is resident (removed per ADR 0208)', () => {
    const block = renderResidentBlock(PROMPTS);
    expect(block).not.toContain('[resident] Activate:');
    expect(SCENARIO_ENUMERATION_GUIDANCE).not.toContain('activate_project');
    expect(SCENARIO_ENUMERATION_GUIDANCE).not.toContain('before doing anything else');
    expect(PROMPTS.map((p) => p.id)).not.toContain('activate');
  });

  it('no code-exploration entry is resident (superseded by the enumeration)', () => {
    const block = renderResidentBlock(PROMPTS);
    expect(block).not.toContain('[resident] Code Exploration:');
    expect(PROMPTS.map((p) => p.id)).not.toContain('code-exploration');
  });

  it('the resident set is exactly PCL + scenarios + jcodemunch (three entries)', () => {
    expect(PROMPTS.map((p) => p.id)).toEqual(['pcl', 'scenarios', 'jcodemunch']);
  });

  it('no discipline entry is resident — no selector line, no cold-read pointer', () => {
    const block = renderResidentBlock(PROMPTS);
    expect(block).not.toContain('[resident] Discipline:');
    expect(block).not.toContain('find · read · write · verify · run');
  });

  it('scenario hint blocks are NOT resident-injected', () => {
    const block = renderResidentBlock(PROMPTS);
    for (const hint of SCENARIO_HINT_BLOCKS) {
      expect(block).not.toContain(hint.body);
    }
  });

  it('the enumeration names concrete chain steps per scenario (decision-time resolvability)', () => {
    expect(SCENARIO_ENUMERATION_GUIDANCE).toContain('DO NOT use grep/glob; use 1) search_text');
    expect(SCENARIO_ENUMERATION_GUIDANCE).toContain('DO NOT use read; use 1) get_file_outline');
    expect(SCENARIO_ENUMERATION_GUIDANCE).toContain('DO NOT use write/edit; use 1) get_blast_radius');
    expect(SCENARIO_ENUMERATION_GUIDANCE).toContain('DO NOT use bash; use 1) get_diagnostics_for_file');
    expect(SCENARIO_ENUMERATION_GUIDANCE).toContain('register_edit');
  });

  it('carries no retired-registry residue', () => {
    const block = renderResidentBlock(PROMPTS);
    expect(block).not.toContain('HLT');
  });

  it('PCL vocabulary constant stays the source (single home)', () => {
    expect(PCL_VOCABULARY).toContain('start graph: graph_start');
  });

  it('every scenario hint body begins with the Hint: prefix (presentation label)', () => {
    for (const hint of SCENARIO_HINT_BLOCKS) {
      expect(hint.body).toMatch(/^Hint: /);
    }
  });

  it('the five-scenario enumeration renders as a multi-line list (one line per scenario)', () => {
    const lines = SCENARIO_ENUMERATION_GUIDANCE.split('\n').filter((l) => l.trim().startsWith('- '));
    expect(lines).toHaveLength(5);
    expect(lines[0]).toMatch(/^- find —/);
    expect(lines[1]).toMatch(/^- read —/);
    expect(lines[2]).toMatch(/^- write —/);
    expect(lines[3]).toMatch(/^- verify —/);
    expect(lines[4]).toMatch(/^- run —/);
  });

  it('register_edit obligation is named in the enumeration, trigger wording single-homed in the write block (hint-tool-context)', () => {
    const writeHint = blockOf('write').body;
    // the enumeration names the obligation (derived from the chain data source)
    expect(SCENARIO_ENUMERATION_GUIDANCE).toContain('register_edit');
    // the trigger wording + n/a case live in the write hint block (single wording home)
    expect(writeHint).toContain('while index in use');
    const nA = 'n/a if not indexed or jcodemunch not mounted';
    expect(writeHint).toContain(nA);
  });

  it('enumeration tool names derive from the chain data source (same consumer data)', () => {
    // the blocks carry concrete chain names (no template markers); the
    // enumeration carries the derived chain names from the same data
    expect(SCENARIO_ENUMERATION_GUIDANCE).toContain('search_for_pattern');
    expect(blockOf('find').body).toContain('search_text');
    expect(SCENARIO_ENUMERATION_GUIDANCE).toContain('get_symbol_source');
    expect(blockOf('read').body).toContain('get_symbol_source');
    expect(SCENARIO_ENUMERATION_GUIDANCE).toContain('check_references');
    expect(blockOf('verify').body).toContain('check_references');
    expect(SCENARIO_ENUMERATION_GUIDANCE).toContain('rtk prefix');
    expect(blockOf('run').body).toContain('rtk prefix');
  });

  it('find content aligns with the CLI-locate classifier (round 12)', () => {
    // the find block names the locate surfaces that align with the classifier
    expect(blockOf('find').body).toContain('search_symbols');
    expect(blockOf('find').body).toContain('platform-native locate');
  });

  it('run claim matches the classifier behavior — full bash coverage, SAFE as preferred (round 12)', () => {
    expect(blockOf('run').body).toContain('rtk prefix');
    expect(blockOf('run').body).toContain('npm/yarn/pnpm');
    // the derived enumeration names the rtk posture for run
    expect(SCENARIO_ENUMERATION_GUIDANCE).toContain('rtk prefix');
  });

  it('the jcodemunch entry is present in the rendered resident block (round 13)', () => {
    const block = renderResidentBlock(PROMPTS);
    expect(block).toContain('[resident] jCodemunch:');
    expect(block).toContain(JCM_RESIDENT_GUIDANCE);
  });

  it('the jcodemunch entry covers every "Other AI Agents" source tool (round 13)', () => {
    // session-start sequence
    expect(JCM_RESIDENT_GUIDANCE).toContain('resolve_repo');
    expect(JCM_RESIDENT_GUIDANCE).toContain('index_folder');
    expect(JCM_RESIDENT_GUIDANCE).toContain('suggest_queries');
    // finding
    expect(JCM_RESIDENT_GUIDANCE).toContain('search_symbols');
    expect(JCM_RESIDENT_GUIDANCE).toContain('search_text');
    expect(JCM_RESIDENT_GUIDANCE).toContain('search_columns');
    // reading
    expect(JCM_RESIDENT_GUIDANCE).toContain('get_file_outline');
    expect(JCM_RESIDENT_GUIDANCE).toContain('get_symbol_source');
    expect(JCM_RESIDENT_GUIDANCE).toContain('get_context_bundle');
    expect(JCM_RESIDENT_GUIDANCE).toContain('get_file_content');
    // repo structure
    expect(JCM_RESIDENT_GUIDANCE).toContain('get_repo_outline');
    expect(JCM_RESIDENT_GUIDANCE).toContain('get_file_tree');
    // relationships & impact
    expect(JCM_RESIDENT_GUIDANCE).toContain('find_importers');
    expect(JCM_RESIDENT_GUIDANCE).toContain('find_references');
    expect(JCM_RESIDENT_GUIDANCE).toContain('check_references');
    expect(JCM_RESIDENT_GUIDANCE).toContain('get_dependency_graph');
    expect(JCM_RESIDENT_GUIDANCE).toContain('get_blast_radius');
    expect(JCM_RESIDENT_GUIDANCE).toContain('get_changed_symbols');
    expect(JCM_RESIDENT_GUIDANCE).toContain('find_dead_code');
    expect(JCM_RESIDENT_GUIDANCE).toContain('get_symbol_importance');
    expect(JCM_RESIDENT_GUIDANCE).toContain('get_class_hierarchy');
    expect(JCM_RESIDENT_GUIDANCE).toContain('get_call_hierarchy');
    expect(JCM_RESIDENT_GUIDANCE).toContain('get_hotspots');
    expect(JCM_RESIDENT_GUIDANCE).toContain('get_dependency_cycles');
    // session awareness
    expect(JCM_RESIDENT_GUIDANCE).toContain('plan_turn');
    expect(JCM_RESIDENT_GUIDANCE).toContain('get_session_context');
    expect(JCM_RESIDENT_GUIDANCE).toContain('register_edit');
    // token budget
    expect(JCM_RESIDENT_GUIDANCE).toContain('get_ranked_context');
    // post-edit freshness
    expect(JCM_RESIDENT_GUIDANCE).toContain('index_file');
  });

  it('the jcodemunch guidance derives from the tool-name arrays — every group item resolves and renders (no parallel literal)', () => {
    for (const group of JCM_GUIDANCE_GROUPS) {
      for (const item of group.items) {
        // array-backed single representation: the name resolves against the
        // hints.ts registry and the rendered guidance carries it verbatim
        expect(PROMOTED_TOOL_NAMES[item.name] === true, `unresolved guidance name: ${item.name}`).toBe(true);
        expect(JCM_RESIDENT_GUIDANCE).toContain(item.name);
      }
    }
  });

  it('the jcodemunch guidance renders the group table in order, one line per group', () => {
    const lines = JCM_RESIDENT_GUIDANCE.split('\n').filter((line) => line.trim().startsWith('- '));
    expect(lines).toHaveLength(JCM_GUIDANCE_GROUPS.length);
    JCM_GUIDANCE_GROUPS.forEach((group, index) => {
      expect(lines[index]).toMatch(new RegExp(`^- ${group.label}: `));
      expect(lines[index]).toContain(group.items[0]!.name);
    });
  });

  it('the jcodemunch entry preserves the session-start sequence order (round 13)', () => {
    const idx = [
      JCM_RESIDENT_GUIDANCE.indexOf('resolve_repo'),
      JCM_RESIDENT_GUIDANCE.indexOf('index_folder'),
      JCM_RESIDENT_GUIDANCE.indexOf('suggest_queries'),
    ];
    expect(idx[0]).toBeGreaterThanOrEqual(0);
    expect(idx[1]).toBeGreaterThan(idx[0]);
    expect(idx[2]).toBeGreaterThan(idx[1]);
  });

  it('the find block leads with the DO-NOT subject naming the exact trigger — no template marker (hints-dont-use-format)', () => {
    expect(blockOf('find').body).toMatch(/^Hint: DO NOT use grep\/glob; use 1\) search_text \{/);
    expect(blockOf('find').body).not.toContain('{usedTool}');
    expect(blockOf('find').body).not.toContain('→');
    expect(SCENARIO_ENUMERATION_GUIDANCE).not.toContain('DO NOT use Grep/Glob/ls');
  });

  it('index_file maps to the write scenario (round 13)', () => {
    expect(SCENARIO_TOOL_NAMES.write).toContain('mcp__jcodemunch_index_file');
  });

  it('repo-structure tools map to the read scenario (round 13)', () => {
    expect(SCENARIO_TOOL_NAMES.read).toContain('mcp__jcodemunch_get_repo_outline');
    expect(SCENARIO_TOOL_NAMES.read).toContain('mcp__jcodemunch_get_file_tree');
  });

  it('check_references maps to a single scenario home — verify (round 13)', () => {
    expect(SCENARIO_TOOL_NAMES.verify).toContain('mcp__jcodemunch_check_references');
  });

  it('jcodemunch entry wording is single-sourced with the scenario blocks (round 13)', () => {
    // find — the block carries the concrete chain names; the JCM entry carries the same names
    expect(JCM_RESIDENT_GUIDANCE).toContain('search_symbols');
    expect(blockOf('find').body).toContain('search_symbols');
    expect(JCM_RESIDENT_GUIDANCE).toContain('search_text');
    expect(blockOf('find').body).toContain('search_text');
    // read — same naming relationship
    expect(JCM_RESIDENT_GUIDANCE).toContain('get_file_outline');
    expect(blockOf('read').body).toContain('get_file_outline');
    expect(JCM_RESIDENT_GUIDANCE).toContain('get_symbol_source');
    expect(blockOf('read').body).toContain('get_symbol_source');
    expect(JCM_RESIDENT_GUIDANCE).toContain('get_context_bundle');
    expect(JCM_RESIDENT_GUIDANCE).toContain('get_file_content');
    // verify — the block keeps its literal evidence names
    expect(JCM_RESIDENT_GUIDANCE).toContain('check_references');
    expect(blockOf('verify').body).toContain('check_references');
    expect(JCM_RESIDENT_GUIDANCE).toContain('find_dead_code');
    // write obligations — register_edit + index_file on the block; register_edit named in the derived enumeration
    expect(JCM_RESIDENT_GUIDANCE).toContain('register_edit');
    expect(blockOf('write').body).toContain('register_edit');
    expect(JCM_RESIDENT_GUIDANCE).toContain('index_file');
    expect(SCENARIO_ENUMERATION_GUIDANCE).toContain('register_edit');
  });
});
