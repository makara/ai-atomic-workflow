/**
 * Compaction boundary contract — the platform owns the
 * compaction decision and its summary; the module registers no
 * `session.compacting` handler, performs no awaited management, and
 * never patches the platform summary. Consumed-output elision is gone
 * (R2 compression suspended — ADR 0175), so compaction events complete
 * with zero plugin involvement.
 */
import { describe, expect, it } from 'vitest';
import ompExtension from '../src/adapters/omp.js';

const RUN = '2fc43e1e-d9b8-4da1-a911-f4f0c793214b';
const frame = (nodeId: string) =>
  `## Run Frame\nRun ${RUN} · node ${nodeId} · type main · task: t\ndeclared operations [read] · out of scope: write`;

const msg = (role: string, text: string) => ({ role, content: [{ type: 'text', text }] });

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

const fire = (handlers: Map<string, (event: never) => unknown>, name: string, event: unknown): unknown =>
  handlers.get(name)?.(event as never);

/** A multi-node transcript — consumed spans exist but must never elide. */
function multiNodeTranscript() {
  return [
    msg('user', frame('requirement/arch-review')),
    msg('assistant', 'small output'),
    msg('assistant', 'x'.repeat(1200)),
    msg('user', frame('adopt/adopting')),
    msg('assistant', 'grilling consensus'),
    msg('user', frame('adopt/adopt-accept')),
  ];
}

describe('compaction boundary — platform-owned', () => {
  it('registers NO session.compacting handler', () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    expect(handlers.has('session.compacting')).toBe(false);
  });

  it('consumed spans are never elided or stored (no context-exit machinery)', () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    const out = fire(handlers, 'context', { type: 'context', messages: multiNodeTranscript() }) as
      { messages: Array<{ content: unknown }> } | undefined;
    // The platform summary would be untouched by any event — no handler.
    const compacted = fire(handlers, 'session.compacting', { summary: 'Summarized prefix.' });
    expect(compacted).toBeUndefined();
    // No storage for consumed outputs; the seam output carries no elision
    // or compression markers (R2 compression suspended).
    const texts = (out?.messages ?? []).map((m) => String(m.content)).join(' ');
    expect(texts).not.toContain('[elided');
    expect(texts).not.toContain('[compressed — hash=');
  });

  it('compaction event never breaks the platform loop (zero-deny)', () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    const compacted = fire(handlers, 'session.compacting', { summary: 'Summarized prefix.' });
    expect(compacted).toBeUndefined();
    expect(handlers.has('session.compacting')).toBe(false);
  });
});
