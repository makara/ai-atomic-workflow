/**
 * Discipline consumer wiring pins (sdk-hooks-middleware) — the
 * graph-fidelity content consumed through the module's wired hooks:
 * the display function (SCENARIO_HINT_BLOCKS + inline tool-name sets,
 * hints-structure-simplify — no PROMOTED_TOOL_MAP, no fn.toolMap) runs
 * classify → display-decision → append on the `tool_result` chain, with
 * proactive notify feedback on attachment. Classification behavior
 * itself is SDK-pinned (platform-hooks-sdk suite). Pure — no I/O.
 *
 * @module
 */

import { describe, expect, it } from 'vitest';

import { SCENARIO_HINT_BLOCKS, SCENARIO_TOOL_NAMES } from '../src/hints.js';
import { createFidelityModule } from '../src/index.js';
import { dispatchChainSync } from './chain-dispatch.js';

/**
 * Discipline input — SDK-owned type (core/classify.ts; barrel-internal
 * since sdk-slim-round5). The structural shape suffices here: tool name +
 * optional args, consumed by the wired classify chain.
 */
interface DisciplineInput {
  readonly toolName: string;
  readonly args?: Readonly<Record<string, unknown>>;
}

/** Scenario id → block convenience lookup over the single-source array. */
const blockOf = (id: string) => SCENARIO_HINT_BLOCKS.find((block) => block.id === id)!;

/** One module instance — the wired hooks (capability config captured at bind time). */
const { hooks } = createFidelityModule();

/** Dispatch a tool_result through the module's wired tool_result chain; returns the appended hint text (undefined = no hint). */
function appendedText(input: DisciplineInput): string | undefined {
  const result = dispatchChainSync(hooks, 'tool_result', {
    toolName: input.toolName,
    args: input.args ?? {},
    errorShaped: false,
    content: [{ type: 'text', text: 'ORIGINAL' }],
  });
  if (result === null || typeof result !== 'object' || !('content' in result)) return undefined;
  const content = result.content;
  if (!Array.isArray(content) || content.length === 0) return undefined;
  const last = content[content.length - 1];
  if (last === null || typeof last !== 'object' || !('text' in last)) return undefined;
  return typeof last.text === 'string' ? last.text : undefined;
}

describe('discipline wiring — hints capability consumption', () => {
  it('wires the hints display middleware on the tool_result chain', () => {
    expect(hooks.tool_result.chain.length).toBeGreaterThan(0);
  });

  it('a serena write is silent — no hint attaches (consumer-promoted tool, no map → no SDK coverage)', () => {
    const text = appendedText({ toolName: 'mcp__serena_replace_content', args: { path: 'src/a.ts' } });
    expect(text).toBeUndefined();
    // the write block still carries the register obligation (single home)
    expect(blockOf('write').body).toContain('register_edit');
  });

  it('native write attaches the rendered write scenario hint (DO-NOT form)', () => {
    const text = appendedText({ toolName: 'edit', args: { path: 'src/a.ts' } });
    expect(text).toContain(
      'Hint: DO NOT use write/edit; use 1) get_blast_radius {repo: "owner/name", symbol: "parse_config", depth: 1}',
    );
    expect(text).toContain('replace_content {relative_path: "src/foo.ts"');
    expect(text).toContain('register_edit {repo: "owner/name", file_paths: ["src/foo.ts"]}');
  });

  it('no scenario coverage → no hint', () => {
    expect(appendedText({ toolName: 'task' })).toBeUndefined();
  });

  it('hint texts carry no deny/block wording and no retired-registry acronym', () => {
    for (const block of SCENARIO_HINT_BLOCKS) {
      const text = block.body;
      expect(text).not.toMatch(/block|deny|exit 2|hard/i);
      expect(text).not.toMatch(/HLT/);
    }
  });

  it('the closed set holds exactly the five tool-triggered scenarios (review excluded)', () => {
    expect(SCENARIO_HINT_BLOCKS.map((b) => b.id)).toEqual(['find', 'read', 'write', 'verify', 'run']);
  });

  it('state-changing setup tools carry no read scenario coverage (fail-open)', () => {
    // activate_project / onboarding / open_dashboard are setup/state-change
    // tools — NOT reads; the inline read set must not cover them and
    // classification must fall through to no scenario (no read hint).
    for (const name of ['activate_project', 'onboarding', 'open_dashboard']) {
      expect(SCENARIO_TOOL_NAMES.read).not.toContain(`serena_${name}`);
      expect(SCENARIO_TOOL_NAMES.read).not.toContain(`mcp__serena_${name}`);
      expect(appendedText({ toolName: `mcp__serena_${name}`, args: {} })).toBeUndefined();
    }
  });

  it('find_implementations has a single home in the query-plane find class (dedup, ADR 0208)', () => {
    expect(SCENARIO_TOOL_NAMES.find).toContain('mcp__jcodemunch_find_implementations');
    // removed from the serena read class — no double enumeration
    expect(SCENARIO_TOOL_NAMES.read).not.toContain('serena_find_implementations');
    expect(SCENARIO_TOOL_NAMES.read).not.toContain('mcp__serena_find_implementations');
  });

  it('diagnostic tools live in the verify scenario set (coverage, ADR 0208)', () => {
    for (const name of ['find_dead_code', 'get_untested_symbols', 'check_references']) {
      expect(SCENARIO_TOOL_NAMES.verify).toContain(`mcp__jcodemunch_${name}`);
      // a verify tool is consumer-promoted — silent via no SDK coverage
      expect(appendedText({ toolName: `mcp__jcodemunch_${name}`, args: {} })).toBeUndefined();
    }
  });

  it('bash non-locate commands attach the rendered run hint (DO-NOT wrapper form)', () => {
    const text = appendedText({ toolName: 'bash', args: { command: 'yarn test' } });
    expect(text).toContain('Hint: DO NOT use bash (raw); use rtk prefix');
    expect(text).toContain('rtk prefix');
    expect(text).toContain('npm/yarn/pnpm');
  });
});
