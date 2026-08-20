/**
 * OMP adapter wiring — the post-execution tool_result hook over the
 * CANONICAL payload (ADR 0193): the SDK normalizes the platform event
 * to `{ toolName, args, content, isError }` — the OMP face CARRIES the
 * invocation args (input → canonical `args`; round 14 R7 corrected the
 * stale "drops input" claim) — and the single registered handler
 * attaches tool-result hints (append-only). The R2 landing-transform
 * dispatch and usage observation were removed with the SDK delivery
 * cutover: message_end is no longer registered and tool_result carries
 * no registry dispatch — tests pin the direct handler behavior.
 *
 * @module
 */

import { describe, expect, it } from 'vitest';
import ompExtension from '../src/adapter-omp.js';

/** Stub platform api — multi-handler registry (the real platform keeps every subscription). */
function stubApi() {
  const handlers = new Map<string, Array<(event: never) => unknown>>();
  const api = {
    on: (event: string, handler: (event: never) => unknown) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    appendEntry: () => undefined,
  } as never;
  return { api, handlers };
}

/** The tool_result handler — the single registered entry (hints, no landing dispatch). */
function toolResultHandler(handlers: Map<string, Array<(event: never) => unknown>>): (event: never) => unknown {
  const list = handlers.get('tool_result');
  if (list === undefined || list.length !== 1)
    throw new Error('tool_result handler not registered (expect exactly one)');
  return list[0]!;
}

/** A platform-shaped tool_result event (the SDK normalizes to the canonical shape). */
function resultEvent(): Record<string, unknown> {
  return {
    type: 'tool_result',
    toolName: 'read',
    toolCallId: 'c1',
    input: { path: 'a.ts' },
    content: [{ type: 'text', text: 'ORIGINAL' }],
    isError: false,
  };
}

describe('OMP adapter — tool_result hook (canonical payload, direct handler behavior)', () => {
  it('registers exactly one tool_result handler (landing dispatch removed)', async () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    const list = handlers.get('tool_result');
    expect(list).toHaveLength(1);
  });

  it('classified result carries the hint appended to the original content', async () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    const out = (await toolResultHandler(handlers)(resultEvent() as never)) as
      { content?: Array<{ type: string; text?: string }> } | undefined;
    expect(out?.content).toBeDefined();
    expect(out?.content?.[0]).toEqual({ type: 'text', text: 'ORIGINAL' });
    expect((out?.content ?? []).length).toBeGreaterThan(1);
  });

  it('unclassified result passes through (undefined result)', async () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    const event = { ...resultEvent(), toolName: 'task', input: { task: 'x' } };
    const out = (await toolResultHandler(handlers)(event as never)) as unknown;
    expect(out).toBeUndefined();
  });

  it('failed execution (isError) attaches nothing', async () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    const event = { ...resultEvent(), isError: true };
    expect(await toolResultHandler(handlers)(event as never)).toBeUndefined();
  });

  it('message_end is no longer registered (usage observation removed)', () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    expect(handlers.has('message_end')).toBe(false);
  });
});
