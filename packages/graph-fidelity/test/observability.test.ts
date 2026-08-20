/**
 * R1 observability pins — the OMP `input` seam: mechanical PCL
 * detection (mark-only) via the SDK-bound canonical `user_input`
 * handler (ADR 0192/0193). The SDK normalizes the input event to
 * `{ text }` and builds the DeliveryContext: `ctx.appendEntry` is
 * translated to the factory-captured `api.appendEntry`. Handler code
 * carries zero platform handles (no ctx.__api cast — removed with the
 * SDK delivery cutover).
 */
import { describe, expect, it } from 'vitest';
import ompExtension from '../src/adapter-omp.js';
import { detectPcl } from '../src/pcl.js';

function stubApi() {
  const handlers = new Map<string, (event: never, ctx: unknown) => unknown>();
  const entries: Array<{ type: string; data?: unknown }> = [];
  const api = {
    on: (event: string, handler: (event: never, ctx: unknown) => unknown) => {
      handlers.set(event, handler);
    },
    appendEntry: (customType: string, data?: unknown) => {
      entries.push({ type: customType, data });
    },
  } as never;
  return { api, handlers, entries };
}

describe('R1 observability surface', () => {
  it('registers the input seam only (R2 lifecycle handlers are gone; session-end seam removed round 14 R6)', () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    expect(handlers.get('input')).toBeTypeOf('function');
    for (const removed of ['auto_compaction_end', 'ttsr_triggered', 'tool_execution_start']) {
      expect(handlers.has(removed)).toBe(false);
    }
    // The session-end seam is REMOVED (round 14 R6 — the inert
    // onSessionEnd chain was deleted with its registrations):
    // session_shutdown, session_stop, and session_start are all absent.
    expect(handlers.has('session_shutdown')).toBe(false);
    expect(handlers.has('session_stop')).toBe(false);
    expect(handlers.has('session_start')).toBe(false);
    // message_end (usage observation) is no longer registered — the
    // observation dispatch was removed with the SDK delivery cutover.
    expect(handlers.has('message_end')).toBe(false);
  });
});

describe('input seam — mechanical PCL detection (mark-only)', () => {
  it('marks vocabulary hits via ctx.appendEntry; never handled, never modifies text', async () => {
    const { api, handlers, entries } = stubApi();
    ompExtension(api);
    const input = handlers.get('input') as (e: never, ctx: unknown) => unknown;
    // The SDK builds the DeliveryContext from the factory-captured api;
    // the per-event ctx carries only the notify surface.
    const result = await input({ type: 'input', text: 'Status please', source: 'interactive' } as never, {});
    expect(result).toBeUndefined();
    const marks = entries.filter((e) => e.type === 'graph-fidelity.pcl');
    expect(marks).toHaveLength(1);
    expect(marks[0]?.data).toEqual({ text: 'Status please', matched: 'status' });
  });

  it('non-PCL input → no mark, no entry, no side effects', async () => {
    const { api, handlers, entries } = stubApi();
    ompExtension(api);
    const input = handlers.get('input') as (e: never, ctx: unknown) => unknown;
    expect(
      await input({ type: 'input', text: 'Continue the review analysis', source: 'interactive' } as never, {}),
    ).toBeUndefined();
    expect(entries.filter((e) => e.type === 'graph-fidelity.pcl')).toHaveLength(0);
  });

  it('detectPcl matches the leading keyword patterns case-insensitively', () => {
    expect(detectPcl('status')).toBe('status');
    expect(detectPcl('SHOW PROGRESS')).toBe('progress');
    expect(detectPcl('back to requirement review')).toBe('back');
    expect(detectPcl('jump to adopt')).toBe('jump');
    expect(detectPcl('re-run the review')).toBe('re-run');
    expect(detectPcl('end this round')).toBe('end');
    expect(detectPcl('abort run')).toBe('abort');
    expect(detectPcl('skip')).toBe('skip');
    expect(detectPcl('history')).toBe('history');
    expect(detectPcl('ordinary chat about the plan')).toBeUndefined();
  });
});
