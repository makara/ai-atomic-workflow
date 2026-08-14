/**
 * R1 observability pins — the OMP `input` seam: mechanical PCL
 * detection (mark-only) via the slimmed `wireObservability`. All R2
 * wiring (usage metering, compaction outcome, tool-execution counters,
 * accumulator persistence, settle drains) was disconnected with the
 * R2/R1 decoupling (ADR 0175) — those pins are gone; the reference
 * accumulator shapes keep running under test/context-management.
 */
import { describe, expect, it } from 'vitest';
import { wireObservability, type OmpObservabilityApi } from '../src/adapters/omp.js';
import { detectPcl } from '../src/core/pcl.js';

function stubApi() {
  const handlers = new Map<string, (event: never) => unknown>();
  const entries: Array<{ type: string; data?: unknown }> = [];
  // Test-scaffold exemption: ExtensionAPI.on carries 40+ typed event
  // overloads — a full stub is impractical; the cast is confined to the
  // test seam and the wiring surface is a real Pick of the platform type.
  const api = {
    on: (event: string, handler: (event: never) => unknown) => {
      handlers.set(event, handler);
    },
    appendEntry: (customType: string, data?: unknown) => {
      entries.push({ type: customType, data });
    },
  } as unknown as OmpObservabilityApi;
  return { api, handlers, entries };
}

describe('R1 observability surface', () => {
  it('registers ONLY the input seam (R2 lifecycle handlers are gone)', () => {
    const { api, handlers } = stubApi();
    wireObservability(api);
    expect(handlers.get('input')).toBeTypeOf('function');
    for (const removed of [
      'message_end',
      'session_stop',
      'session_shutdown',
      'auto_compaction_end',
      'ttsr_triggered',
      'tool_execution_start',
    ]) {
      expect(handlers.has(removed)).toBe(false);
    }
  });
});

describe('input seam — mechanical PCL detection (mark-only)', () => {
  it('marks vocabulary hits via appendEntry; never handled, never modifies text', () => {
    const { api, handlers, entries } = stubApi();
    wireObservability(api);
    const input = handlers.get('input') as (e: never) => unknown;
    const result = input({ type: 'input', text: 'Status please', source: 'interactive' } as never);
    expect(result).toBeUndefined();
    const marks = entries.filter((e) => e.type === 'graph-fidelity.pcl');
    expect(marks).toHaveLength(1);
    expect(marks[0]?.data).toEqual({ text: 'Status please', matched: 'status' });
  });

  it('non-PCL input → no mark, no entry, no side effects', () => {
    const { api, handlers, entries } = stubApi();
    wireObservability(api);
    const input = handlers.get('input') as (e: never) => unknown;
    expect(
      input({ type: 'input', text: 'Continue the review analysis', source: 'interactive' } as never),
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
