/**
 * F8 — echo format pins + context event guards on the OMP face.
 *
 * The R1 echo renders identity + progress only: no mode segment (the
 * `GRAPH_FIDELITY_MODE` knob was removed with the R2 style prompts —
 * ADR 0175), no benefit graphic. The zero-deny boundary branches
 * (malformed context events — type mismatch, non-array) stay pinned.
 */
import { describe, expect, it } from 'vitest';
import ompExtension from '../src/adapters/omp.js';

function stubApi() {
  const handlers = new Map<string, (event: never) => unknown>();
  const api = {
    on: (event: string, handler: (event: never) => unknown) => {
      handlers.set(event, handler);
    },
    appendEntry: () => undefined,
  } as never;
  return { api, handlers };
}

const RUN = '9e392f79f3c049069ae36fe22021a5ee';
const frame = (nodeId: string) =>
  `## Run Frame\nRun ${RUN} · node ${nodeId} · type main · task: t\ndeclared operations [read] · out of scope: write`;

const msg = (role: string, text: string) => ({ role, content: [{ type: 'text', text }] });

function textOf(message: { content?: unknown } | undefined): string {
  return ((message?.content as Array<{ text?: string }> | undefined) ?? []).map((b) => b.text ?? '').join('\n');
}

describe('F8 · echo format pins (R1 identity-only)', () => {
  it('no mode segment ever rides the echo — the mode knob is gone (R2 style prompts removed)', () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    const context = handlers.get('context') as (e: never) => unknown;
    const result = context({
      type: 'context',
      messages: [
        { role: 'user', content: [{ type: 'text', text: frame('n1') }] },
        { role: 'user', content: [{ type: 'text', text: 'body' }] },
      ],
    } as never) as { messages: unknown[] } | undefined;
    const serialized = JSON.stringify(result);
    expect(serialized).toContain('[seam] node n1');
    expect(serialized).not.toMatch(/· mode /);
    expect(serialized).not.toContain('│'); // no benefit graphic
  });

  it('echo carries the progress segment when the frame carries N/M', () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    const context = handlers.get('context') as (e: never) => unknown;
    const result = context({
      type: 'context',
      messages: [
        { role: 'user', content: [{ type: 'text', text: `## Run Frame\nRun ${RUN} · node n2 · 3/25 · type main` }] },
        { role: 'user', content: [{ type: 'text', text: 'body' }] },
      ],
    } as never) as { messages: unknown[] } | undefined;
    // The echo appends to the LAST user-like message (the frame message).
    expect(textOf(result?.messages?.[1] as { content?: unknown })).toContain('▣ [seam] node n2 · 3/25');
  });
});

describe('F8 · context event guards', () => {
  it('malformed events (wrong type, non-array) degrade to undefined', () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    const handler = handlers.get('context') as (e: never) => unknown;
    expect(handler({ type: 'not-context', messages: [] } as never)).toBeUndefined();
    expect(handler({ type: 'context', messages: 'not-an-array' } as never)).toBeUndefined();
    expect(handler(undefined as never)).toBeUndefined();
  });

  it('no anchored frame → no echo (identity source rule)', () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    const context = handlers.get('context') as (e: never) => unknown;
    const result = context({
      type: 'context',
      messages: [msg('user', 'plain chat'), msg('assistant', 'work')],
    } as never);
    expect(result).toBeUndefined();
  });
});
