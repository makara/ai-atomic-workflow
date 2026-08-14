/**
 * OMP face pins — the R1 seam: normalize → chain (echo-only) →
 * denormalize as ONE pass. The R2 behaviors (errored-result fidelity,
 * compression, protection, dedup of identical calls) were disconnected
 * with the R2/R1 decoupling (ADR 0175): transcripts without an anchored
 * frame pass through unchanged, and the echo-only chain never touches
 * tool-result content.
 */
import { describe, expect, test } from 'vitest';
import ompExtension from '../src/adapters/omp.js';

const callBlock = (id: string, name: string, input: unknown, extra: Record<string, unknown> = {}) => ({
  type: 'tool-call',
  id,
  name,
  input,
  ...extra,
});

const resultBlock = (toolCallId: string, content: string, extra: Record<string, unknown> = {}) => ({
  type: 'tool-result',
  toolCallId,
  content,
  ...extra,
});

const RUN = '9e392f79f3c049069ae36fe22021a5ee';
const frame = (nodeId: string) =>
  `## Run Frame\nRun ${RUN} · node ${nodeId} · type main · task: t\ndeclared operations [read] · out of scope: write`;

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

describe('OMP context seam — echo-only chain in one pass', () => {
  test('no anchored frame → transcript forwarded unchanged (no dedup, no reduction)', () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    const messages = [
      { role: 'assistant', content: [callBlock('c1', 'read', { path: 'x' })] },
      { role: 'user', content: [resultBlock('c1', 'old content')] },
      { role: 'assistant', content: [callBlock('c2', 'read', { path: 'x' })] },
      { role: 'user', content: [resultBlock('c2', 'fresh content')] },
    ];
    const result = (handlers.get('context') as (e: never) => unknown)({
      type: 'context',
      messages,
    } as never) as { messages: typeof messages } | undefined;
    // Identical calls are NOT deduped and results are never reduced — the
    // seam reports no change (platform owns supersede semantics).
    expect(result).toBeUndefined();
  });

  test('kebab-case result key `tool-call-id` passes through untouched (no frame)', () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    const messages = [
      { role: 'assistant', content: [callBlock('c1', 'read', { path: 'x' })] },
      { role: 'user', content: [{ type: 'tool-result', 'tool-call-id': 'c1', content: 'old' }] },
      { role: 'assistant', content: [callBlock('c2', 'read', { path: 'x' })] },
      { role: 'user', content: [{ type: 'tool-result', 'tool-call-id': 'c2', content: 'new' }] },
    ];
    const out = (handlers.get('context') as (e: never) => unknown)({
      type: 'context',
      messages,
    } as never);
    expect(out).toBeUndefined();
  });

  test('non-string tool-call ids are ignored — passthrough, no crash', () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    const messages = [
      { role: 'assistant', content: [callBlock('c1', 'read', { path: 'x' })] },
      { role: 'user', content: [{ type: 'tool-result', toolCallId: 42, content: 'x' }] },
    ];
    const out = (handlers.get('context') as (e: never) => unknown)({ type: 'context', messages } as never);
    expect(out).toBeUndefined();
  });

  test('text blocks and unmatched results pass through untouched (no frame)', () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    const messages = [
      { role: 'assistant', content: [callBlock('c1', 'read', { path: 'x' })] },
      { role: 'user', content: [{ type: 'text', text: 'plain' }, resultBlock('c9', 'kept')] },
    ];
    const out = (handlers.get('context') as (e: never) => unknown)({ type: 'context', messages } as never);
    expect(out).toBeUndefined();
  });

  test('errored tool results are NOT reduced on the echo-only path — content verbatim (R2 fidelity removed)', () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    const messages = [
      { role: 'assistant', content: [callBlock('c1', 'read', { path: 'x' })] },
      { role: 'user', content: [resultBlock('c1', 'boom', { isError: true })] },
    ];
    const result = (handlers.get('context') as (e: never) => unknown)({
      type: 'context',
      messages,
    } as never);
    // No frame → no echo; no fidelity stage → no marker; unchanged.
    expect(result).toBeUndefined();
  });

  test('OMP context seam runs the echo stage at extension level', () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    const messages = [
      { role: 'assistant', content: [callBlock('c1', 'read', { path: 'x' })] },
      { role: 'user', content: [resultBlock('c1', 'old')] },
      {
        role: 'user',
        content: [{ type: 'text', text: frame('requirement/arch-review') }],
      },
    ];
    const handler = handlers.get('context');
    expect(handler).toBeTypeOf('function');
    const result = (handler as (e: { type: string; messages: typeof messages }) => unknown)({
      type: 'context',
      messages,
    }) as { messages: typeof messages };
    const serialized = JSON.stringify(result);
    // Echo only: the identity pointer lands on the last user-like message;
    // no reduction markers anywhere.
    expect(serialized).toContain('[seam] node requirement/arch-review');
    expect(serialized).not.toContain('[input removed due to failed tool call]');
    expect(serialized).not.toContain('[compressed — hash=');
  });

  test('session.compacting is not registered — the platform owns compaction', () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    expect(handlers.has('session.compacting')).toBe(false);
  });
});
