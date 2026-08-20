/**
 * Scenario capability pins (hints-use-function-middleware) — the
 * `hints` capability: SDK-side classification → display decision →
 * append on the default `tool_result` seam (explicit hook target
 * overrides), loud guard on unknown hooks (MiddlewareHookError),
 * unwire detach. The display-decision function is the sole use()
 * parameter; the extension map rides the function's `toolMap`
 * property. Pure — no I/O.
 *
 * @module
 */

import { describe, expect, it } from 'vitest';
import {
  SCENARIO_IDS,
  createCapabilities,
  createHooks,
  type HintDisplayFn,
  type HookEvent,
  type Middleware,
  type ScenarioHintBlock,
  type ToolMap,
} from '../src/index.js';
import { dispatchSync } from './helpers/dispatch.js';

const entries: readonly ScenarioHintBlock[] = SCENARIO_IDS.map((id) => ({
  id,
  body: `hint block for ${id}`,
}));

/** A display function returning the matched scenario's block body (null when no coverage). */
function blockDisplay(toolMap?: ToolMap): HintDisplayFn {
  const fn: HintDisplayFn = (ctx) => {
    if (ctx.scenario === undefined) return null;
    return entries.find((b) => b.id === ctx.scenario)?.body ?? null;
  };
  if (toolMap !== undefined) fn.toolMap = toolMap;
  return fn;
}

/** Narrow a chain result to the appended hint text (undefined = no hint attached). */
function appendedTextOf(result: unknown): string | undefined {
  if (result === null || typeof result !== 'object' || !('content' in result)) return undefined;
  const content = result.content;
  if (!Array.isArray(content) || content.length === 0) return undefined;
  const last = content[content.length - 1];
  if (last === null || typeof last !== 'object' || !('text' in last)) return undefined;
  return typeof last.text === 'string' ? last.text : undefined;
}

/** Run the composed tool_result chain with the given ctx + payload. */
function runTool(
  chain: readonly Middleware[],
  input: { toolName: string; args?: Record<string, unknown>; content?: unknown; errorShaped?: boolean },
): unknown {
  return dispatchSync(chain, {
    name: 'tool_result',
    payload: {
      toolName: input.toolName,
      args: input.args,
      content: input.content ?? [],
      errorShaped: input.errorShaped,
    },
  } as unknown as HookEvent);
}

/** Wire the hints capability with a display fn and dispatch a canonical tool_result. */
function dispatchTool(
  fn: HintDisplayFn,
  input: { toolName: string; args?: Record<string, unknown>; content?: unknown; errorShaped?: boolean },
): unknown {
  const hooks = createHooks();
  const { hints } = createCapabilities(hooks);
  hints.use(fn);
  return runTool(hooks.tool_result.chain, input);
}

describe('scenario capability interface (G1/G3 — scenario-keyed hints contract, function form)', () => {
  it('self-wires the default tool_result seam', () => {
    const hooks = createHooks();
    const { hints } = createCapabilities(hooks);
    hints.use(blockDisplay());
    expect(hooks.tool_result.chain).toHaveLength(1);
    expect(typeof hooks.tool_result.unwire).toBe('function');
  });

  it('fails loudly on an unknown hook target (named error, no silent skip)', () => {
    const hooks = createHooks();
    const { hints } = createCapabilities(hooks);
    expect(() => hints.use(blockDisplay(), 'nope' as never)).toThrow(/Unknown canonical event: nope/);
  });

  it('is a pure data surface — the capability is exported from the barrel, adapter-free', () => {
    expect(typeof createCapabilities).toBe('function');
    expect(SCENARIO_IDS).toEqual(['find', 'read', 'write', 'verify', 'run']);
  });
});

describe('scenario capability behavior — SDK classification → display decision → append on tool_result', () => {
  it('appends the display function text for a read-classified execution', () => {
    const text = appendedTextOf(dispatchTool(blockDisplay(), { toolName: 'read', args: { path: 'src/a.ts' } }));
    expect(text).toBe('hint block for read');
  });

  it('no scenario coverage → display function not called, no hint (fail-open pass through)', () => {
    let called = false;
    const fn: HintDisplayFn = (ctx) => {
      called = true;
      return ctx.scenario === undefined ? null : 'x';
    };
    expect(dispatchTool(fn, { toolName: 'task', args: {} })).toBeUndefined();
    expect(called).toBe(false);
  });

  it('failed execution (errorShaped verdict) attaches nothing and never calls the display function', () => {
    let called = false;
    const fn: HintDisplayFn = () => {
      called = true;
      return 'x';
    };
    expect(dispatchTool(fn, { toolName: 'read', args: { path: 'a.ts' }, errorShaped: true })).toBeUndefined();
    expect(called).toBe(false);
  });

  it('odd content shapes pass through without throwing', () => {
    expect(() => dispatchTool(blockDisplay(), { toolName: 'read' })).not.toThrow();
  });

  it('compliant invocation attaches nothing — the display function sees compliant:true and null is silent (hint-tool-context)', () => {
    const hooks = createHooks();
    const { hints } = createCapabilities(hooks);
    const seen: Array<{ compliant: boolean }> = [];
    const fn: HintDisplayFn = (ctx) => {
      seen.push({ compliant: ctx.compliant });
      return ctx.compliant ? null : 'hint block for find';
    };
    fn.toolMap = { promoted_read: 'read' } satisfies ToolMap;
    hints.use(fn);
    expect(runTool(hooks.tool_result.chain, { toolName: 'promoted_read', args: { path: 'a.ts' } })).toBeUndefined();
    // rtk-prefixed bash is a compliant run — silent
    expect(runTool(hooks.tool_result.chain, { toolName: 'bash', args: { command: 'rtk yarn test' } })).toBeUndefined();
    // the display function WAS consulted (verdict visible), and null kept it silent
    expect(seen.map((s) => s.compliant)).toEqual([true, true]);
  });

  it('compliance is a hard floor — a non-null return on a compliant invocation still attaches nothing', () => {
    const hooks = createHooks();
    const { hints } = createCapabilities(hooks);
    const fn: HintDisplayFn = () => 'SHOULD NOT ATTACH';
    fn.toolMap = { promoted_read: 'read' } satisfies ToolMap;
    hints.use(fn);
    expect(runTool(hooks.tool_result.chain, { toolName: 'promoted_read', args: { path: 'a.ts' } })).toBeUndefined();
  });

  it('display context carries scenario, usedTool (bash resolves to the locate token) and promoted names', () => {
    const hooks = createHooks();
    const { hints } = createCapabilities(hooks);
    const seen: Array<Record<string, unknown>> = [];
    const fn: HintDisplayFn = (ctx) => {
      seen.push({ ...ctx });
      return 'hint block for find';
    };
    fn.toolMap = { tool_a: 'find', tool_b: 'find' } satisfies ToolMap;
    hints.use(fn);
    const cases: Array<[string, Record<string, unknown>]> = [
      ['glob', { pattern: '**/*.ts' }],
      ['bash', { command: 'rtk git log && find . -name "*.ts"' }],
    ];
    for (const [toolName, args] of cases) {
      runTool(hooks.tool_result.chain, { toolName, args });
    }
    expect(seen[0]).toMatchObject({ scenario: 'find', compliant: false, usedTool: 'glob', errorShaped: false });
    expect(seen[1]).toMatchObject({ scenario: 'find', usedTool: 'find' });
    for (const entry of seen) {
      expect(entry.promoted).toEqual(['tool_a', 'tool_b']);
    }
  });

  it('a multi-group return (string[]) appends every entry in order', () => {
    const hooks = createHooks();
    const { hints } = createCapabilities(hooks);
    const fn: HintDisplayFn = () => ['first group', 'second group'];
    hints.use(fn);
    const result = runTool(hooks.tool_result.chain, { toolName: 'read', args: { path: 'a.ts' } }) as {
      content: Array<{ text: string }>;
    };
    expect(result.content.map((b) => b.text)).toEqual(['first group', 'second group']);
  });

  it('a throwing display function fails open — nothing attaches, nothing throws', () => {
    const hooks = createHooks();
    const { hints } = createCapabilities(hooks);
    const fn: HintDisplayFn = () => {
      throw new Error('display exploded');
    };
    hints.use(fn);
    expect(() => runTool(hooks.tool_result.chain, { toolName: 'read', args: { path: 'a.ts' } })).not.toThrow();
  });

  it('the body attaches verbatim — no template markers, no interpolation machinery', () => {
    const hooks = createHooks();
    const { hints } = createCapabilities(hooks);
    const fn: HintDisplayFn = () => 'Hint: use tool_a for finding; use tool_b for ground truth';
    hints.use(fn);
    const text = appendedTextOf(runTool(hooks.tool_result.chain, { toolName: 'glob' }));
    expect(text).toBe('Hint: use tool_a for finding; use tool_b for ground truth');
  });
});

describe('scenario capability re-wire semantics (concat chains, unwire)', () => {
  it('repeated use concatenates chains (additive, no shadowing)', () => {
    const hooks = createHooks();
    const { hints } = createCapabilities(hooks);
    hints.use(blockDisplay());
    hints.use(blockDisplay());
    expect(hooks.tool_result.chain).toHaveLength(2);
    const result = runTool(hooks.tool_result.chain, { toolName: 'read', args: { path: 'a.ts' } });
    // each wiring appends exactly one hint block → the composed result carries both
    const content = (result as { content: Array<{ text: string }> }).content;
    expect(content).toHaveLength(2);
    for (const block of content) {
      expect(block.text).toBe('hint block for read');
    }
  });

  it('unwire detaches the wiring — subsequent dispatches attach no hint from it', () => {
    const hooks = createHooks();
    const { hints } = createCapabilities(hooks);
    const unwire = hints.use(blockDisplay());
    expect(appendedTextOf(runTool(hooks.tool_result.chain, { toolName: 'read', args: { path: 'a.ts' } }))).toBe(
      'hint block for read',
    );
    unwire();
    expect(runTool(hooks.tool_result.chain, { toolName: 'read', args: { path: 'a.ts' } })).toBeUndefined();
  });

  it('registers on any canonical hook (single or array target)', () => {
    const hooks = createHooks();
    const { hints } = createCapabilities(hooks);
    hints.use(blockDisplay(), 'chat_message');
    expect(hooks.chat_message.chain).toHaveLength(1);
    hints.use(blockDisplay(), ['tool_result', 'context']);
    expect(hooks.tool_result.chain).toHaveLength(1);
    expect(hooks.context.chain).toHaveLength(1);
  });
});

describe('map snapshot semantics (hints-use-map-snapshot)', () => {
  it('post-wiring fn.toolMap mutation does not affect the wired chain', () => {
    const hooks = createHooks();
    const { hints } = createCapabilities(hooks);
    const seen: Array<string | undefined> = [];
    const fn: HintDisplayFn = (ctx) => {
      seen.push(ctx.scenario);
      return ctx.scenario === 'read' ? 'read hint' : null;
    };
    fn.toolMap = { tool_a: 'read' } satisfies ToolMap;
    hints.use(fn);
    runTool(hooks.tool_result.chain, { toolName: 'tool_a', args: {} });
    // mutate after wiring — the wired chain keeps the captured map: the
    // second dispatch still classifies 'read' (a live-read regression
    // would yield 'write' here)
    fn.toolMap = { tool_a: 'write' } satisfies ToolMap;
    runTool(hooks.tool_result.chain, { toolName: 'tool_a', args: {} });
    expect(seen).toEqual(['read', 'read']);
  });

  it('classify resolves against the latest wiring snapshot', () => {
    const hooks = createHooks();
    const { hints } = createCapabilities(hooks);
    const fnA: HintDisplayFn = () => null;
    fnA.toolMap = { tool_a: 'read' } satisfies ToolMap;
    const fnB: HintDisplayFn = () => null;
    fnB.toolMap = { tool_b: 'write' } satisfies ToolMap;
    hints.use(fnA);
    hints.use(fnB);
    // classify resolves against the LATEST wiring's snapshot (fnB) — a
    // tool only in fnA's map is no longer covered
    expect(hints.classify({ toolName: 'tool_a' })).toEqual({ compliant: false });
    expect(hints.classify({ toolName: 'tool_b' })).toEqual({ scenario: 'write', compliant: true });
  });

  it('two wirings with different maps classify independently (each chain uses its captured map)', () => {
    const hooks = createHooks();
    const { hints } = createCapabilities(hooks);
    const seenA: string[] = [];
    const fnA: HintDisplayFn = (ctx) => {
      seenA.push(ctx.scenario ?? 'none');
      return 'hint A';
    };
    fnA.toolMap = { shared_tool: 'read' } satisfies ToolMap;
    const seenB: string[] = [];
    const fnB: HintDisplayFn = (ctx) => {
      seenB.push(ctx.scenario ?? 'none');
      return 'hint B';
    };
    fnB.toolMap = { shared_tool: 'write' } satisfies ToolMap;
    hints.use(fnA);
    hints.use(fnB);
    // 'shared_tool' is compliant in BOTH captured maps → hard floor silences both,
    // but the display functions were consulted with their own captured verdicts.
    runTool(hooks.tool_result.chain, { toolName: 'shared_tool', args: {} });
    expect(seenA).toEqual(['read']);
    expect(seenB).toEqual(['write']);
  });
});
