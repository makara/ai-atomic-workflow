/**
 * Scenario classification behavior pins (scenario-classify-clean,
 * function form) — through the hints capability: tool invocation →
 * scenario key, single-dimension (tool name + platform-native rules),
 * fail-open semantics, consumer extension map merge (native priority).
 * Classification is exercised as attachment behavior (run a
 * tool_result through `hints.use(fn)`, assert the appended hint text).
 * The tool-set vocabulary is internal implementation detail; tests
 * assert behavior and the public export surface only.
 *
 * @module
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as barrel from '../src/index.js';
import {
  createCapabilities,
  createHooks,
  SCENARIO_IDS,
  type HintDisplayFn,
  type HookEvent,
  type ScenarioHintBlock,
  type ScenarioId,
  type ToolMap,
} from '../src/index.js';
import { dispatchSync } from './helpers/dispatch.js';

const entries: readonly ScenarioHintBlock[] = SCENARIO_IDS.map((id) => ({
  id,
  body: `hint block for ${id}`,
}));

/** Display fn returning the matched scenario's block body (null when no coverage). */
function blockDisplay(toolMap?: ToolMap): HintDisplayFn {
  const fn: HintDisplayFn = (ctx) =>
    ctx.scenario === undefined ? null : (entries.find((b) => b.id === ctx.scenario)?.body ?? null);
  if (toolMap !== undefined) fn.toolMap = toolMap;
  return fn;
}

/** Run + narrow helper — returns the appended hint text (undefined = no hint attached). */
function hintTextFor(
  toolMap: ToolMap | undefined,
  input: { toolName: string; args?: Record<string, unknown> },
): string | undefined {
  const hooks = createHooks();
  const { hints } = createCapabilities(hooks);
  hints.use(blockDisplay(toolMap));
  const result = dispatchSync(hooks.tool_result.chain, {
    name: 'tool_result',
    payload: { toolName: input.toolName, args: input.args, content: [] },
  } as unknown as HookEvent);
  if (result === null || typeof result !== 'object' || !('content' in result)) return undefined;
  const content = result.content;
  if (!Array.isArray(content) || content.length === 0) return undefined;
  const last = content[content.length - 1];
  if (last === null || typeof last !== 'object' || !('text' in last)) return undefined;
  return typeof last.text === 'string' ? last.text : undefined;
}

describe('scenario classification (single-dimension, through the middleware)', () => {
  it('native write/edit/ast_edit attach the write hint', () => {
    expect(hintTextFor(undefined, { toolName: 'write' })).toBe('hint block for write');
    expect(hintTextFor(undefined, { toolName: 'edit', args: { path: 'src/a.ts' } })).toBe('hint block for write');
    expect(hintTextFor(undefined, { toolName: 'ast_edit' })).toBe('hint block for write');
  });

  it('native read attaches the read hint unconditionally (no file-type judgment)', () => {
    for (const path of ['src/a.ts', 'docs/report.md', 'data/input.json', 'docs/design.pdf']) {
      expect(hintTextFor(undefined, { toolName: 'read', args: { path } })).toBe('hint block for read');
    }
    expect(hintTextFor(undefined, { toolName: 'read' })).toBe('hint block for read');
    expect(hintTextFor(undefined, { toolName: 'read', args: {} })).toBe('hint block for read');
  });

  it('read with selector suffixes still attaches the read hint', () => {
    expect(hintTextFor(undefined, { toolName: 'read', args: { path: 'src/a.ts:50-200' } })).toBe('hint block for read');
    expect(hintTextFor(undefined, { toolName: 'read', args: { path: 'docs/report.md:50-200' } })).toBe(
      'hint block for read',
    );
  });

  it('locate tools and bash locate commands attach the find hint', () => {
    expect(hintTextFor(undefined, { toolName: 'glob' })).toBe('hint block for find');
    expect(hintTextFor(undefined, { toolName: 'grep' })).toBe('hint block for find');
    for (const command of ['find . -name "*.ts"', 'ls src', 'fd -e ts', 'rg TODO', 'ag foo', 'tree src']) {
      expect(hintTextFor(undefined, { toolName: 'bash', args: { command } })).toBe('hint block for find');
    }
  });

  it('rtk/proxy-wrapped locate commands attach the find hint', () => {
    expect(hintTextFor(undefined, { toolName: 'bash', args: { command: 'rtk ls src' } })).toBe('hint block for find');
    expect(hintTextFor(undefined, { toolName: 'bash', args: { command: 'rtk proxy find .' } })).toBe(
      'hint block for find',
    );
    expect(hintTextFor(undefined, { toolName: 'bash', args: { command: 'rtk git log && find . -name "*.ts"' } })).toBe(
      'hint block for find',
    );
  });

  it('bash non-locate commands attach the run hint', () => {
    expect(hintTextFor(undefined, { toolName: 'bash', args: { command: 'yarn test' } })).toBe('hint block for run');
    expect(hintTextFor(undefined, { toolName: 'bash' })).toBe('hint block for run');
  });

  it('rtk-prefixed bash is compliant — no run hint attaches (hint-tool-context)', () => {
    expect(hintTextFor(undefined, { toolName: 'bash', args: { command: 'rtk yarn test' } })).toBeUndefined();
    expect(hintTextFor(undefined, { toolName: 'bash', args: { command: 'rtk proxy yarn test' } })).toBeUndefined();
  });

  it('internal-URI write/read routes attach no hint (exemption class)', () => {
    expect(hintTextFor(undefined, { toolName: 'write', args: { path: 'skill://foo/SKILL.md' } })).toBeUndefined();
    expect(
      hintTextFor(undefined, { toolName: 'edit', args: { filePath: 'xd://mcp__graph_scheduler_graph_advance' } }),
    ).toBeUndefined();
    expect(hintTextFor(undefined, { toolName: 'read', args: { path: 'rule://bar' } })).toBeUndefined();
    expect(hintTextFor(undefined, { toolName: 'read', args: { path: 'artifact://x' } })).toBeUndefined();
  });

  it('unknown tools have no scenario coverage without a consumer map (fail-open)', () => {
    expect(hintTextFor(undefined, { toolName: 'task' })).toBeUndefined();
    expect(hintTextFor(undefined, { toolName: 'some_mcp_tool' })).toBeUndefined();
    expect(hintTextFor(undefined, { toolName: 'ask' })).toBeUndefined();
  });
});

describe('consumer tool map extension (fn.toolMap)', () => {
  const mapped: ToolMap = {
    tool_a_read: 'read',
    tool_b_write: 'write',
    tool_c_verify: 'verify',
    tool_d_locate: 'find',
  };

  it('consumer-mapped tools are compliant — no hint attaches (hint-tool-context)', () => {
    // A mapped tool IS a promoted tool: using it is the correct behavior,
    // so the middleware silences the hint (compliant suppression).
    expect(hintTextFor(mapped, { toolName: 'tool_a_read' })).toBeUndefined();
    expect(hintTextFor(mapped, { toolName: 'tool_b_write' })).toBeUndefined();
    expect(hintTextFor(mapped, { toolName: 'tool_c_verify' })).toBeUndefined();
    expect(hintTextFor(mapped, { toolName: 'tool_d_locate' })).toBeUndefined();
  });

  it('tools omitted from the map have no coverage (fail-open)', () => {
    expect(hintTextFor(mapped, { toolName: 'tool_e_unmapped' })).toBeUndefined();
  });

  it('native rules take priority over consumer map entries', () => {
    const overridden: ToolMap = { read: 'write', bash: 'find', edit: 'verify' };
    expect(hintTextFor(overridden, { toolName: 'read' })).toBe('hint block for read');
    expect(hintTextFor(overridden, { toolName: 'bash', args: { command: 'yarn test' } })).toBe('hint block for run');
    expect(hintTextFor(overridden, { toolName: 'edit' })).toBe('hint block for write');
  });

  it('native locate/URI rules still apply with a map present', () => {
    expect(hintTextFor(mapped, { toolName: 'bash', args: { command: 'find .' } })).toBe('hint block for find');
    expect(hintTextFor(mapped, { toolName: 'write', args: { path: 'skill://x' } })).toBeUndefined();
  });
});

describe('closed scenario set (review revoked — role-triggered, never tool-triggered)', () => {
  it('contains exactly the five ids', () => {
    expect(SCENARIO_IDS).toEqual(['find', 'read', 'write', 'verify', 'run']);
  });

  it('no review key exists anywhere in the attach surface', () => {
    // a review-mapped tool resolves to a key outside the registry — the
    // display function lookup misses and the middleware degrades to no attach.
    expect(hintTextFor({ review_tool: 'review' as ScenarioId }, { toolName: 'review_tool' })).toBeUndefined();
  });
});

describe('hints capability — classify primitive (spec: Scenario-keyed hints contract)', () => {
  it('classify returns scenario + compliance verdict; empty result for uncovered (fail-open)', () => {
    const hooks = createHooks();
    const { hints } = createCapabilities(hooks);
    hints.use(blockDisplay({ mapped_tool: 'write' }));
    expect(hints.classify({ toolName: 'read', args: { path: 'a.ts' } })).toEqual({
      scenario: 'read',
      compliant: false,
    });
    // a mapped tool is a promoted tool → compliant
    expect(hints.classify({ toolName: 'mapped_tool' })).toEqual({ scenario: 'write', compliant: true });
    // rtk-prefixed bash → compliant run
    expect(hints.classify({ toolName: 'bash', args: { command: 'rtk yarn test' } })).toEqual({
      scenario: 'run',
      compliant: true,
    });
    expect(hints.classify({ toolName: 'bash', args: { command: 'yarn test' } })).toEqual({
      scenario: 'run',
      compliant: false,
    });
    expect(hints.classify({ toolName: 'task' })).toEqual({ compliant: false });
  });
});

describe('vocabulary internal (spec: Vocabulary internal — no tool-set constants in the barrel)', () => {
  it('no vocabulary constant is exported from the barrel', () => {
    const names = Object.keys(barrel);
    for (const name of names) {
      expect(name).not.toMatch(/^(NATIVE_|LOCATE_|INTERNAL_)/);
    }
  });

  it('the hints capability is the scenario-registry entry for consumer extension', () => {
    expect(typeof barrel.createCapabilities).toBe('function');
    expect(typeof barrel.createHints).toBe('function');
    // A mapped tool is a promoted tool → compliant → silent (hint-tool-context).
    expect(hintTextFor({ mapped_tool: 'read' }, { toolName: 'mapped_tool' })).toBeUndefined();
  });
});

describe('zero third-party vocabulary (scenario-classify-clean — source + comments + tests)', () => {
  it('the SDK tree contains no third-party tool vocabulary', () => {
    // Forbidden words built from parts so the assertion file itself never
    // contains the literal strings (self-reference would otherwise match).
    const forbidden = [['ser', 'ena'].join(''), ['jcode', 'munch'].join('')];
    const pattern = new RegExp(`\\b(?:${forbidden.join('|')})\\b`, 'i');
    const root = join(import.meta.dirname, '..');
    const offenders: string[] = [];
    for (const entry of ['src', 'test']) {
      collectOffenders(join(root, entry), offenders, pattern);
    }
    expect(offenders).toEqual([]);
  });
});

function collectOffenders(dir: string, offenders: string[], pattern: RegExp): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectOffenders(full, offenders, pattern);
    } else if (name.endsWith('.ts')) {
      const text = readFileSync(full, 'utf8');
      if (pattern.test(text)) {
        offenders.push(full);
      }
    }
  }
}
