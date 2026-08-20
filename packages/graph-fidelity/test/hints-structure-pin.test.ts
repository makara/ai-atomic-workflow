/**
 * hints-structure-simplify pins — the post-refactor invariants:
 * ① the display function returns `null` when the used tool matches its
 *    scenario's inline promoted set (compliance silence preserved after
 *    PROMOTED_TOOL_MAP deletion);
 * ② the resident five-scenario enumeration derives unchanged from the
 *    tool-name data (no parallel wording);
 * ③ the SDK classify native rules still work with no consumer map
 *    (`{ ...undefined }` snapshot — native priority, fail-open).
 * Pure — no I/O.
 *
 * @module
 */

import { describe, expect, it } from 'vitest';

import { createCapabilities, createHooks, type HintDisplayContext } from '@ai-atomic-workflow/platform-hooks-sdk';

import {
  PROMOTED_TOOL_NAMES,
  SCENARIO_CHAINS,
  SCENARIO_HINT_BLOCKS,
  SCENARIO_TOOL_NAMES,
  hintDisplay,
} from '../src/hints.js';
import { SCENARIO_ENUMERATION_GUIDANCE } from '../src/resident-data.js';
import { dispatchChainSync } from './chain-dispatch.js';

const ctx = (overrides: Partial<HintDisplayContext>): HintDisplayContext => ({
  scenario: 'read',
  compliant: false,
  usedTool: undefined,
  errorShaped: false,
  promoted: [],
  ...overrides,
});

describe('pin ① — display function compliance silence (inline sets)', () => {
  it('a promoted used tool returns null for its scenario (both serena surface forms)', () => {
    expect(hintDisplay(ctx({ scenario: 'write', usedTool: 'mcp__serena_replace_content' }))).toBeNull();
    expect(hintDisplay(ctx({ scenario: 'write', usedTool: 'serena_replace_content' }))).toBeNull();
  });

  it('a promoted jcodemunch tool returns null for its scenario', () => {
    expect(hintDisplay(ctx({ scenario: 'find', usedTool: 'mcp__jcodemunch_search_symbols' }))).toBeNull();
    expect(hintDisplay(ctx({ scenario: 'read', usedTool: 'mcp__jcodemunch_get_file_outline' }))).toBeNull();
    expect(hintDisplay(ctx({ scenario: 'verify', usedTool: 'mcp__jcodemunch_check_references' }))).toBeNull();
  });

  it('a non-promoted used tool returns the scenario block body', () => {
    const text = hintDisplay(ctx({ scenario: 'find', usedTool: 'grep' }));
    expect(text).toContain('Hint: DO NOT use grep/glob; use 1) search_text');
    expect(text).toBe(SCENARIO_HINT_BLOCKS.find((b) => b.id === 'find')?.body);
  });

  it('compliant verdict short-circuits to null (SDK hard floor)', () => {
    expect(hintDisplay(ctx({ scenario: 'run', compliant: true, usedTool: 'bash' }))).toBeNull();
  });

  it('no scenario → null', () => {
    expect(hintDisplay(ctx({ scenario: undefined }))).toBeNull();
  });
});

describe('pin ② — resident enumeration derives from the chain data', () => {
  it('each scenario line names its DO-NOT subject and numbered chain head', () => {
    expect(SCENARIO_ENUMERATION_GUIDANCE).toContain('- find — DO NOT use grep/glob; use 1) search_text');
    expect(SCENARIO_ENUMERATION_GUIDANCE).toContain('- read — DO NOT use read; use 1) get_file_outline');
    expect(SCENARIO_ENUMERATION_GUIDANCE).toContain('- write — DO NOT use write/edit; use 1) get_blast_radius');
    expect(SCENARIO_ENUMERATION_GUIDANCE).toContain('- verify — DO NOT use bash; use 1) get_diagnostics_for_file');
  });

  it('the write line names register_edit in the chain', () => {
    expect(SCENARIO_ENUMERATION_GUIDANCE).toContain('register_edit');
  });

  it('the run line names the rtk posture (no adapter steps)', () => {
    expect(SCENARIO_ENUMERATION_GUIDANCE).toContain('- run — DO NOT use bash; use rtk prefix');
  });

  it('no enumeration line carries the arrow symbol (hints-dont-use-format — dual meaning removed)', () => {
    expect(SCENARIO_ENUMERATION_GUIDANCE).not.toContain('→');
  });

  it('inline sets cover index_file → write and repo-structure → read (no fail-open regression)', () => {
    expect(SCENARIO_TOOL_NAMES.write).toContain('mcp__jcodemunch_index_file');
    expect(SCENARIO_TOOL_NAMES.read).toContain('mcp__jcodemunch_get_repo_outline');
    expect(SCENARIO_TOOL_NAMES.read).toContain('mcp__jcodemunch_get_file_tree');
  });
});

describe('pin ④ — block bodies are native-tool-keyed unique chains (prompt-native-tool-chains)', () => {
  const blockOf = (id: string) => SCENARIO_HINT_BLOCKS.find((block) => block.id === id)!;

  it('the find/read blocks lead with the DO-NOT subject and the numbered chain head', () => {
    expect(blockOf('find').body.startsWith('Hint: DO NOT use grep/glob; use 1) search_text {')).toBe(true);
    expect(blockOf('read').body.startsWith('Hint: DO NOT use read; use 1) get_file_outline {')).toBe(true);
  });

  it('every chain step name in the blocks resolves to a tool-name array entry', () => {
    for (const [id, { steps }] of Object.entries(SCENARIO_CHAINS)) {
      for (const step of steps) {
        expect(PROMOTED_TOOL_NAMES[step] === true, `unresolved chain step in ${id}: ${step}`).toBe(true);
        expect(blockOf(id).body).toContain(step);
      }
    }
  });

  it('each DO-NOT subject names the exact native trigger instruction (hints-dont-use-format — no generic class)', () => {
    const writeBody = blockOf('write').body;
    expect(writeBody).toContain('DO NOT use write/edit;');
    expect(writeBody).toContain('DO NOT use ast_edit;');
    expect(blockOf('read').body).toContain('DO NOT use read;');
    expect(blockOf('verify').body).toContain('DO NOT use bash (bare test run);');
    expect(blockOf('run').body).toContain('DO NOT use bash (raw);');
    expect(blockOf('find').body).toContain('DO NOT use grep/glob;');
    expect(blockOf('find').body).toContain('DO NOT use lsp;');
    expect(blockOf('find').body).toContain('DO NOT use find / ls / fd / rg / ag / tree;');
  });

  it('block content satisfies the spec tool sets (locate family / consultation family / read 3-step cap / obligations)', () => {
    const findBody = blockOf('find').body;
    expect(findBody).toContain('search_text');
    expect(findBody).toContain('search_symbols');
    expect(findBody).toContain('find_references');
    expect(findBody).toContain('find_importers');
    const writeBody = blockOf('write').body;
    expect(writeBody).toContain('get_blast_radius');
    expect(writeBody).toContain('find_references');
    expect(writeBody).toContain('search_text');
    expect(writeBody).toContain('get_symbol_source');
    expect(writeBody).toContain('get_file_outline');
    expect(writeBody).toContain('verify after write');
    expect(writeBody).toContain('register_edit');
    expect(writeBody).toContain('index_file');
    const readBody = blockOf('read').body;
    expect(readBody).toContain('get_file_outline');
    expect(readBody).toContain('get_symbol_source');
    expect(readBody).toContain('get_context_bundle');
    expect(readBody).toContain('get_file_content');
    expect(readBody).toContain('read_file');
    expect(readBody).not.toContain('4)'); // 3-step cap (at most three numbered steps)
  });

  it('every sample-head tool name in a block body is registry-backed and allowed for its scenario (reverse drift check)', () => {
    // Sample heads always render as `name {` (verbatim shapes follow);
    // the family mentions render bare (slash-separated). All are
    // registry-backed and belong to the scenario's chain ∪ explicit
    // block mentions — a mistyped/drifted name fails here.
    const allowedExtras: Readonly<Record<string, readonly string[]>> = {
      find: ['search_symbols', 'find_symbol', 'get_file_tree', 'find_file', 'find_references', 'find_importers'],
      read: ['get_file_content', 'get_context_bundle', 'read_file'],
      write: [
        'replace_symbol_body',
        'rename_symbol',
        'find_references',
        'search_text',
        'get_symbol_source',
        'get_file_outline',
        'index_file',
        'get_diagnostics_for_file',
      ],
      verify: ['find_dead_code', 'get_untested_symbols'],
      run: ['execute_shell_command'],
    };
    for (const block of SCENARIO_HINT_BLOCKS) {
      const allowed: Readonly<Record<string, true>> = Object.fromEntries(
        [...SCENARIO_CHAINS[block.id].steps, ...(allowedExtras[block.id] ?? [])].map((name) => [name, true]),
      );
      const sampleHeads = block.body.match(/[a-z][a-z_]+(?=\s*\{)/g) ?? [];
      for (const head of sampleHeads) {
        expect(PROMOTED_TOOL_NAMES[head] === true, `unresolved sample tool in ${block.id}: ${head}`).toBe(true);
        expect(allowed[head] === true, `sample tool outside ${block.id} chain: ${head}`).toBe(true);
      }
      const bareNames = block.body.match(/(?:^|[^a-z_])([a-z][a-z_]{2,})(?:$|[^a-z_])/g) ?? [];
      for (const token of bareNames) {
        const name = token.replace(/[^a-z_]/g, '');
        if (PROMOTED_TOOL_NAMES[name] === true) {
          expect(allowed[name] === true, `registry name outside ${block.id} chain: ${name}`).toBe(true);
        }
      }
    }
  });

  it('the display decision is a keyed lookup — the rendered body is the derived block body', () => {
    for (const block of SCENARIO_HINT_BLOCKS) {
      expect(hintDisplay(ctx({ scenario: block.id, usedTool: 'grep' }))).toBe(block.body);
    }
  });
});

describe('pin ③ — SDK classify with no consumer map (native rules only)', () => {
  it('native write tools classify with an undefined toolMap snapshot', () => {
    const hooks = createHooks();
    const { hints } = createCapabilities(hooks);
    hints.use(() => 'SHOULD NOT ATTACH');
    expect(hints.classify({ toolName: 'edit' })).toEqual({ scenario: 'write', compliant: false });
  });

  it('native read classifies unconditionally', () => {
    const hooks = createHooks();
    const { hints } = createCapabilities(hooks);
    hints.use(() => null);
    expect(hints.classify({ toolName: 'read' })).toEqual({ scenario: 'read', compliant: false });
  });

  it('rtk-prefixed bash is a compliant run (native rule, no map needed)', () => {
    const hooks = createHooks();
    const { hints } = createCapabilities(hooks);
    hints.use(() => null);
    expect(hints.classify({ toolName: 'bash', args: { command: 'rtk yarn test' } })).toEqual({
      scenario: 'run',
      compliant: true,
    });
  });

  it('the wired chain attaches nothing for an unclassified consumer tool (fail-open)', () => {
    const hooks = createHooks();
    const { hints } = createCapabilities(hooks);
    hints.use((c) => (c.scenario === undefined ? null : 'SHOULD NOT ATTACH'));
    const result = dispatchChainSync(hooks, 'tool_result', {
      toolName: 'mcp__jcodemunch_search_symbols',
      args: {},
      errorShaped: false,
      content: [],
    });
    // no scenario coverage — the base handler result passes through untouched
    expect(result).toBeUndefined();
  });
});
