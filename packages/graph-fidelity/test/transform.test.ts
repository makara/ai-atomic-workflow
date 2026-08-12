import { describe, expect, test } from 'vitest';
import {
  ERROR_MARKER,
  applySessionFidelity,
  buildFidelityPlan,
  extractToolCalls,
  normalizeParams,
} from '../src/core/transform.js';

describe('normalizeParams', () => {
  test('sorts object keys — identical calls with different key order dedupe', () => {
    expect(normalizeParams({ b: 1, a: 2 })).toBe(normalizeParams({ a: 2, b: 1 }));
  });

  test('handles empty and non-object inputs', () => {
    expect(normalizeParams(undefined)).toBe('');
    expect(normalizeParams('x')).toBe('"x"');
  });
});

describe('buildFidelityPlan — dedup (superseded law)', () => {
  test('keeps the latest identical call; earlier results get a superseded marker', () => {
    const calls = [
      { id: 'c1', name: 'read', signature: 'read:{"path":"a.ts"}' },
      { id: 'c2', name: 'read', signature: 'read:{"path":"a.ts"}' },
      { id: 'c3', name: 'read', signature: 'read:{"path":"b.ts"}' },
    ];
    const plan = buildFidelityPlan(calls);
    expect(plan.has('c1')).toBe(true);
    expect(plan.get('c1')).toContain('superseded');
    expect(plan.has('c2')).toBe(false); // latest identical kept verbatim
    expect(plan.has('c3')).toBe(false);
  });

  test('different signatures never dedupe', () => {
    const plan = buildFidelityPlan([
      { id: 'c1', name: 'grep', signature: 'grep:{"q":"x"}' },
      { id: 'c2', name: 'grep', signature: 'grep:{"q":"y"}' },
    ]);
    expect(plan.size).toBe(0);
  });
});

describe('applySessionFidelity', () => {
  const parts = [
    { type: 'text', text: 'assistant summary' },
    { type: 'tool', toolCallId: 'c1', content: 'big output', isError: false },
    { type: 'tool', toolCallId: 'c2', content: 'current output', isError: false },
    { type: 'tool', toolCallId: 'c3', content: 'failed output', isError: true },
  ];

  test('replaces superseded tool results; keeps the latest + text parts untouched', () => {
    const plan = new Map([['c1', '[superseded — marker]']]);
    const out = applySessionFidelity(parts, plan);
    expect(out[0]).toEqual({ type: 'text', text: 'assistant summary' }); // L0 — untouched
    expect(out[1]).toEqual({ type: 'tool', toolCallId: 'c1', content: '[superseded — marker]', isError: false });
    expect(out[2]).toEqual({ type: 'tool', toolCallId: 'c2', content: 'current output', isError: false });
  });

  test('errored tool results shrink to the error marker (working face)', () => {
    const out = applySessionFidelity(parts, new Map());
    expect(out[3]).toEqual({ type: 'tool', toolCallId: 'c3', content: ERROR_MARKER, isError: true });
  });

  test('keepErrorContent opts out of error reduction', () => {
    const out = applySessionFidelity(parts, new Map(), { keepErrorContent: true });
    expect(out[3].content).toBe('failed output');
  });

  test('protected content — parts without tool-call ids pass through untouched (shape-convention protection)', () => {
    const out = applySessionFidelity([{ type: 'text', text: 'decision: continue' }], new Map([['x', 'marker']]));
    expect(out[0]).toEqual({ type: 'text', text: 'decision: continue' });
  });
});

describe('extractToolCalls', () => {
  test('extracts ids + names from assistant tool-call parts', () => {
    const parts = [
      { type: 'tool-call', toolCalls: [{ id: 'c1', name: 'read', input: { path: 'a.ts' } }] },
      { type: 'text', text: 'x' },
    ];
    const calls = extractToolCalls(parts);
    expect(calls).toEqual([{ id: 'c1', name: 'read', signature: 'read:{"path":"a.ts"}' }]);
  });
});

describe('fidelity coordinate mapping (classification lattice — signal-distribution)', () => {
  // Explicit tier-mapping pins: the mechanized faces of the lattice's fidelity
  // coordinate (L0 protection / L3 pruning) — conformance evidence for the
  // "Prune laws mechanized" requirement.

  test('L3 superseded — older identical call prunes to a recoverable marker, latest stays L0', () => {
    const parts = [
      { type: 'text', text: 'assistant summary' },
      { type: 'tool', toolCallId: 'c1', content: 'old result', isError: false },
      { type: 'tool', toolCallId: 'c2', content: 'new result', isError: false },
    ];
    const plan = buildFidelityPlan([
      { id: 'c1', name: 'read', signature: 'read:{"path":"a.ts"}' },
      { id: 'c2', name: 'read', signature: 'read:{"path":"a.ts"}' },
    ]);
    const out = applySessionFidelity(parts, plan);
    expect(out[1]).toEqual({
      type: 'tool',
      toolCallId: 'c1',
      content: expect.stringContaining('superseded'),
      isError: false,
    }); // L3
    expect(out[2]).toEqual({ type: 'tool', toolCallId: 'c2', content: 'new result', isError: false }); // L0 verbatim
  });

  test('L3 errored — failed tool result reduces to ERROR_MARKER (working face)', () => {
    const out = applySessionFidelity([{ type: 'tool', toolCallId: 'c1', content: 'boom', isError: true }], new Map());
    expect(out[0]).toEqual({ type: 'tool', toolCallId: 'c1', content: ERROR_MARKER, isError: true });
  });

  test('L0 protection structural — text parts never candidates, tool-role only', () => {
    const parts = [
      { type: 'text', text: 'node output: report written' },
      { type: 'text', text: 'decision: continue' },
      { type: 'tool', toolCallId: 'c1', content: 'big output', isError: false },
    ];
    const out = applySessionFidelity(parts, new Map([['c1', '[superseded — marker]']]));
    expect(out[0]).toEqual(parts[0]); // L0 protected
    expect(out[1]).toEqual(parts[1]); // L0 protected
    expect(out[2].content).toContain('superseded'); // L3 working face
  });
});
