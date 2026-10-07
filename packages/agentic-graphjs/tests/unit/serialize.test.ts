import { describe, expect, it } from 'vitest';

import { serialize } from '../../src/internal.js';

/**
 * The replay assertions compare bytes, so what matters is which properties of a
 * value the bytes depend on: the shapes and the scalars, never the order a
 * record happened to be written in.
 */
describe('the canonical bytes of a value', () => {
  it('answers the same bytes for the same value read twice', () => {
    const value = { executed: ['a', 'b'], settled: { k: 1 }, empty: null };
    expect(serialize(value)).toBe(serialize(value));
  });

  it('ignores the order a record lists its keys in', () => {
    const first = { a: 1, b: [1, 2], c: { d: true, e: null } };
    const second = { c: { e: null, d: true }, b: [1, 2], a: 1 };
    expect(serialize(first)).toBe(serialize(second));
  });

  it('keeps the index order of a list', () => {
    expect(serialize([1, 2])).toBe('[1,2]');
    expect(serialize([2, 1])).not.toBe(serialize([1, 2]));
  });

  it('writes scalars without padding and escapes a string as json does', () => {
    expect(serialize(null)).toBe('null');
    expect(serialize(true)).toBe('true');
    expect(serialize(false)).toBe('false');
    expect(serialize(1)).toBe('1');
    expect(serialize(1.5)).toBe('1.5');
    expect(serialize('a "b"\n')).toBe('"a \\"b\\"\\n"');
    expect(serialize({})).toBe('{}');
    expect(serialize([])).toBe('[]');
  });
});

describe('the canonical shape', () => {
  it('emits keys in ascending order at every depth and no whitespace anywhere', () => {
    const bytes = serialize({ b: [1, { d: 1, c: 2 }], a: { z: null, y: [] } });
    expect(bytes).toBe('{"a":{"y":[],"z":null},"b":[1,{"c":2,"d":1}]}');
    expect(bytes).not.toMatch(/\s/);
  });

  it('binds one checkpoint to one string, whichever way its records were listed', () => {
    const checkpoint = {
      v: 1,
      id: 'cp-1',
      ts: '2026-09-30T00:00:01Z',
      channel_values: { executed: ['a'], settlements: { k: 'v' } },
      channel_versions: { executed: 2 },
      versions_seen: { executed: { 'n-1': 1, 'n-2': 2 } },
    };
    const listed = {
      versions_seen: { executed: { 'n-2': 2, 'n-1': 1 } },
      channel_versions: { executed: 2 },
      channel_values: { settlements: { k: 'v' }, executed: ['a'] },
      ts: '2026-09-30T00:00:01Z',
      id: 'cp-1',
      v: 1,
    };
    const bytes = serialize(checkpoint);

    expect(serialize(checkpoint)).toBe(bytes);
    expect(serialize(listed)).toBe(bytes);
    expect(serialize([checkpoint, listed])).toBe(`[${bytes},${bytes}]`);
  });
});

describe('the numeric face', () => {
  it('refuses a number json has no form for instead of writing a token no parser reads back', () => {
    expect(() => serialize(NaN)).toThrowError(/no JSON form/);
    expect(() => serialize(Infinity)).toThrowError(/no JSON form/);
    expect(() => serialize(-Infinity)).toThrowError(/no JSON form/);
    expect(() => serialize({ depth: NaN })).toThrowError(/no JSON form/);
  });

  it('writes the byte json keeps for a negative zero', () => {
    expect(serialize(-0)).toBe('0');
    expect(serialize({ n: -0 })).toBe('{"n":0}');
  });
});
