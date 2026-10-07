import { describe, expect, it } from 'vitest';

import {
  REDUCERS,
  REDUCER_EMPTY,
  ReducerError,
  initialState,
  reduce,
  sameValue,
  serialize,
  type ChannelSpec,
  type Json,
} from '../../src/internal.js';

/** A parsed value, as a host hands one in: every key lands as an own data property, `__proto__` included. */
function parsed(text: string): Json {
  const value: unknown = JSON.parse(text);
  return value as Json;
}

/**
 * The fold is re-run over the whole chain on every re-entry, so each reducer is
 * asserted on the properties it must hold — idempotence and immutability as each
 * applies — rather than on one worked example.
 */
describe('reducer folds', () => {
  it('keeps the last write and stays idempotent under a repeated write', () => {
    expect(reduce('replace', 'first', 'second')).toBe('second');
    expect(reduce('replace', reduce('replace', 'first', 'second'), 'second')).toBe('second');
  });

  it('unions the write into the list, keeping every value once in write order', () => {
    const once = reduce('append', [], 'a');
    expect(once).toEqual(['a']);
    expect(reduce('append', once, 'a')).toEqual(['a']);
    expect(reduce('append', once, { id: 1 })).toEqual(['a', { id: 1 }]);
    expect(reduce('append', ['a', { id: 1 }], { id: 1 })).toEqual(['a', { id: 1 }]);
    expect(reduce('append', ['a'], ['b', 'a', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('merges records with the write taking precedence and stays idempotent', () => {
    const merged = reduce('merge', { a: 1, b: 2 }, { b: 3 });
    expect(merged).toEqual({ a: 1, b: 3 });
    expect(reduce('merge', merged, { b: 3 })).toEqual(merged);
  });

  it('keeps every nested key while merging a record write layer by layer', () => {
    const held = { 'sample/a': { first: 1, second: 2 } };
    const once = reduce('merge', held, { 'sample/a': { second: 3, third: 4 } });
    expect(once).toEqual({ 'sample/a': { first: 1, second: 3, third: 4 } });
    expect(reduce('merge', once, { other: true })).toEqual({
      'sample/a': { first: 1, second: 3, third: 4 },
      other: true,
    });
    expect(held).toEqual({ 'sample/a': { first: 1, second: 2 } });
  });
});

describe('reducer faults, uniqueness, and purity', () => {
  it('refuses a write that does not fit the channel', () => {
    expect(() => reduce('append', 'held', 'write')).toThrowError(ReducerError);
    expect(() => reduce('append', 'held', 'write')).toThrowError(/list-valued/);
    expect(() => reduce('merge', [], { a: 1 })).toThrowError(/record-valued/);
    expect(() => reduce('merge', { a: 1 }, 'text')).toThrowError(/record-valued/);
  });

  it('refuses an id outside the reducer set', () => {
    expect(() => reduce('append-all' as 'append', [], 'a')).toThrowError(/no fold is declared/);
    expect(Object.entries(REDUCERS)).toHaveLength(3);
  });

  it('decides uniqueness by shape rather than by reference', () => {
    expect(sameValue({ a: [1, { b: null }] }, { a: [1, { b: null }] })).toBe(true);
    expect(sameValue({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameValue([1, 2], [1, 2, 3])).toBe(false);
    expect(sameValue(null, null)).toBe(true);
  });

  it('never touches the values it folds', () => {
    const held = { a: 1, nested: { x: 1 } };
    const write = { nested: { y: 2 } };
    const list = ['a'];
    reduce('merge', held, write);
    reduce('append', list, 'b');
    expect(held).toEqual({ a: 1, nested: { x: 1 } });
    expect(write).toEqual({ nested: { y: 2 } });
    expect(list).toEqual(['a']);
  });
});

/**
 * A parsed value carries its keys as own data properties, but `__proto__` is an accessor on
 * `Object.prototype`: an unguarded index reads the prototype, and an unguarded assignment runs
 * the setter and replaces the container's prototype, so the key the write carried never lands.
 * The canonical bytes are what a replay compares, so a lost key is a broken replay.
 */
describe('the own-property discipline over host names', () => {
  it('keeps a `__proto__` key instead of replacing the prototype', () => {
    const merged = reduce('merge', {}, parsed('{"__proto__":{"polluted":true}}'));

    expect(Object.getOwnPropertyNames(merged)).toEqual(['__proto__']);
    expect(Object.getPrototypeOf(merged)).toBe(Object.prototype);
    expect(serialize(merged)).toBe('{"__proto__":{"polluted":true}}');
  });

  it('keeps a nested `__proto__` key the held record does not carry', () => {
    const merged = reduce('merge', parsed('{"a":{}}'), parsed('{"a":{"__proto__":{"y":2}}}'));

    expect(serialize(merged)).toBe('{"a":{"__proto__":{"y":2}}}');
  });

  it('folds a `__proto__` record layer by layer when both sides carry it', () => {
    const write = parsed('{"a":{"__proto__":{"y":2}}}');
    const once = reduce('merge', parsed('{"a":{"__proto__":{"x":1}}}'), write);

    expect(serialize(once)).toBe('{"a":{"__proto__":{"x":1,"y":2}}}');
    expect(serialize(reduce('merge', once, write))).toBe(serialize(once));
  });

  it('holds the control keys as plain data keys', () => {
    const merged = reduce('merge', {}, parsed('{"constructor":1,"prototype":2}'));

    expect(Object.getOwnPropertyNames(merged).sort()).toEqual(['constructor', 'prototype']);
    expect(Object.getPrototypeOf(merged)).toBe(Object.prototype);
    expect(serialize(merged)).toBe('{"constructor":1,"prototype":2}');
  });

  it('compares records by the keys they carry, never by the ones they inherit', () => {
    expect(sameValue(parsed('{"__proto__":{}}'), { x: 1 })).toBe(false);
    expect(sameValue({ x: 1 }, parsed('{"__proto__":{}}'))).toBe(false);
    expect(sameValue(parsed('{"__proto__":{"x":1}}'), parsed('{"__proto__":{"x":1}}'))).toBe(true);
  });
});

/**
 * An untouched channel starts on its family's empty value, and no two channels may share one:
 * a value two channels hold is a value one of them can change under the other's feet. The
 * module-level empties the fold falls back to stay frozen for the same reason.
 */
describe('the empty each channel starts from', () => {
  it('gives every channel its own empty, so a value held by one is never held by another', () => {
    const channels: readonly ChannelSpec[] = [
      { name: 'executed', source: 'node', reducer: 'append' },
      { name: 'artifacts', source: 'node', reducer: 'append' },
      { name: 'settlements', source: 'node', reducer: 'merge' },
      { name: 'attempts', source: 'node', reducer: 'merge' },
    ];
    const state = initialState(channels);

    expect(state.executed.value).toEqual([]);
    expect(state.executed.value).not.toBe(state.artifacts.value);
    expect(state.settlements.value).toEqual({});
    expect(state.settlements.value).not.toBe(state.attempts.value);
  });

  it('keeps the module empties frozen, so no fold can write through the shared identity', () => {
    expect(Object.isFrozen(REDUCER_EMPTY)).toBe(true);
    expect(Object.isFrozen(REDUCER_EMPTY.append)).toBe(true);
    expect(Object.isFrozen(REDUCER_EMPTY.merge)).toBe(true);
  });
});
