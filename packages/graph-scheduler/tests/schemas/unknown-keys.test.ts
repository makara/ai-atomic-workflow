/**
 * Unit tests for unknownPhaseKeys — tolerant schema-unknown phase key
 * detection. Detection requires no schema-valid load (raw parsed YAML
 * suffices) — schema-invalid graphs still report their extra fields for
 * graph-maintain cleanup (notification → auto-handling).
 */
import { describe, expect, it } from 'vitest';
import { PHASE_FIELD_KEYS, unknownPhaseKeys } from '../../src/schemas/index.js';

describe('unknownPhaseKeys — tolerant key audit', () => {
  it('reports nothing for a clean graph', () => {
    const parsed = {
      name: 'g',
      phases: [{ id: 'p1', type: 'main', task: 'x', operations: [] }],
    };
    expect(unknownPhaseKeys(parsed)).toEqual([]);
  });

  it('reports unknown phase keys with phase id and keys', () => {
    const parsed = {
      name: 'g',
      phases: [{ id: 'p1', type: 'main', task: 'x', operations: [], routing: { actions: [] }, mode: 'auto' }],
    };
    expect(unknownPhaseKeys(parsed)).toEqual([{ phaseId: 'p1', keys: ['routing', 'mode'] }]);
  });

  it('reports per-phase findings for multiple phases', () => {
    const parsed = {
      name: 'g',
      phases: [
        { id: 'p1', type: 'main', task: 'x', operations: [], topic: 't' },
        { id: 'p2', type: 'main', task: 'y', operations: [], maxDepth: 3 },
      ],
    };
    expect(unknownPhaseKeys(parsed)).toEqual([
      { phaseId: 'p1', keys: ['topic'] },
      { phaseId: 'p2', keys: ['maxDepth'] },
    ]);
  });

  it('reports every known surface field as known — no false positives', () => {
    const phase: Record<string, unknown> = { id: 'p1', type: 'main' };
    for (const key of PHASE_FIELD_KEYS) phase[key] = key === 'type' ? 'main' : `v-${key}`;
    expect(unknownPhaseKeys({ name: 'g', phases: [phase] })).toEqual([]);
  });

  it('is tolerant of non-object / missing phases shapes — never throws', () => {
    expect(unknownPhaseKeys(null)).toEqual([]);
    expect(unknownPhaseKeys(42)).toEqual([]);
    expect(unknownPhaseKeys('x')).toEqual([]);
    expect(unknownPhaseKeys({ name: 'g' })).toEqual([]);
    expect(unknownPhaseKeys({ name: 'g', phases: 'not-an-array' })).toEqual([]);
    expect(unknownPhaseKeys({ name: 'g', phases: [null, 'x'] })).toEqual([]);
  });

  it('uses the fallback phase id when id is absent or not a string', () => {
    const parsed = {
      name: 'g',
      phases: [
        { type: 'main', jumps: [] },
        { id: 7, type: 'main', eval: [] },
      ],
    };
    expect(unknownPhaseKeys(parsed)).toEqual([
      { phaseId: '<unknown>', keys: ['jumps'] },
      { phaseId: '<unknown>', keys: ['eval'] },
    ]);
  });
});
