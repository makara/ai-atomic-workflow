import { describe, expect, it } from 'vitest';

import {
  ChannelError,
  applyWrite,
  applyWrites,
  foldWrites,
  initialState,
  type ChannelSpec,
  type ChannelWrite,
} from '../../src/internal.js';

/** The channel set the write-class matrix prescribes for one run. */
const CHANNELS: readonly ChannelSpec[] = [
  { name: 'binding', source: 'input', reducer: 'replace' },
  { name: 'revision', source: 'node', reducer: 'replace' },
  { name: 'issued', source: 'node', reducer: 'merge' },
  { name: 'settlements', source: 'node', reducer: 'merge' },
  { name: 'executed', source: 'node', reducer: 'append' },
  { name: 'seen', source: 'node', reducer: 'append' },
  { name: 'attempts', source: 'node', reducer: 'merge' },
  { name: 'artifacts', source: 'node', reducer: 'append' },
  { name: 'currentTask', source: 'node', reducer: 'replace' },
  { name: 'lastCondition', source: 'node', reducer: 'replace' },
  { name: 'resultNote', source: 'node', reducer: 'replace' },
  { name: 'terminal', source: 'node', reducer: 'replace' },
  { name: 'lifecycle', source: 'node', reducer: 'append' },
];

const CHAIN: readonly ChannelWrite[] = [
  { binding: { name: 'sample', hash: 'h1' } },
  { revision: 1 },
  { issued: { 'sample/a': 1 } },
  { settlements: { 'sample/a': 'done' }, executed: 'sample/a', seen: 'sample/a', currentTask: 'sample/b' },
  { attempts: { 'sample/a': 2 } },
  { terminal: { outcome: 'completed' } },
];

describe('channel application', () => {
  it('starts every channel at its default with version zero', () => {
    const state = initialState(CHANNELS);
    expect(state.binding).toEqual({ value: null, version: 0 });
    expect(state.executed).toEqual({ value: [], version: 0 });
    expect(state.terminal).toEqual({ value: null, version: 0 });
    expect(Object.entries(state)).toHaveLength(Object.entries(CHANNELS).length);
  });

  it('folds one write into one channel and advances only that version', () => {
    const once = applyWrite(CHANNELS, initialState(CHANNELS), 'binding', { name: 'sample' });
    expect(once.binding).toEqual({ value: { name: 'sample' }, version: 1 });
    expect(once.terminal).toEqual({ value: null, version: 0 });
    const twice = applyWrite(CHANNELS, once, 'binding', { name: 'sample' });
    expect(twice.binding.version).toBe(2);
  });

  it('folds a write map and leaves the channels it omits untouched', () => {
    const before = initialState(CHANNELS);
    const after = applyWrites(CHANNELS, before, { binding: { name: 'sample' }, executed: 'sample/a' });
    expect(after.executed).toEqual({ value: ['sample/a'], version: 1 });
    expect(after.seen).toEqual(before.seen);
  });

  it('refuses a write that names an undeclared channel', () => {
    expect(() => applyWrite(CHANNELS, initialState(CHANNELS), 'absent', 1)).toThrowError(ChannelError);
    expect(() => applyWrite(CHANNELS, initialState(CHANNELS), 'absent', 1)).toThrowError(/no channel is declared/);
  });
});

describe('the fold over a chain', () => {
  it('lands on the same state whichever way the chain is split', () => {
    const whole = foldWrites(CHANNELS, CHAIN);
    const prefix = foldWrites(CHANNELS, CHAIN.slice(0, 2));
    const continued = CHAIN.slice(2).reduce((state, writes) => applyWrites(CHANNELS, state, writes), prefix);

    expect(continued).toEqual(whole);
    expect(prefix).toEqual(foldWrites(CHANNELS, CHAIN.slice(0, 2)));
    expect(prefix.binding).toEqual({ value: { name: 'sample', hash: 'h1' }, version: 1 });
    expect(prefix.terminal).toEqual({ value: null, version: 0 });
  });

  it('keeps an earlier state readable after a later one is reached', () => {
    const prefix = foldWrites(CHANNELS, CHAIN.slice(0, 3));
    const snapshot = structuredClone(prefix);
    foldWrites(CHANNELS, CHAIN);

    expect(prefix).toEqual(snapshot);
    expect(prefix.terminal.value).toBeNull();
    expect(prefix.executed.value).toEqual([]);
  });

  it('folds every writable class of the matrix as declared', () => {
    const state = foldWrites(CHANNELS, [
      ...CHAIN,
      { lifecycle: { operation: 'note' } },
      { artifacts: 'art-1', lastCondition: 'ok', resultNote: 'res-1' },
    ]);

    expect(state.binding.value).toEqual({ name: 'sample', hash: 'h1' });
    expect(state.revision.value).toBe(1);
    expect(state.issued.value).toEqual({ 'sample/a': 1 });
    expect(state.settlements.value).toEqual({ 'sample/a': 'done' });
    expect(state.executed.value).toEqual(['sample/a']);
    expect(state.seen.value).toEqual(['sample/a']);
    expect(state.attempts.value).toEqual({ 'sample/a': 2 });
    expect(state.artifacts.value).toEqual(['art-1']);
    expect(state.currentTask.value).toBe('sample/b');
    expect(state.lastCondition.value).toBe('ok');
    expect(state.resultNote.value).toBe('res-1');
    expect(state.terminal.value).toEqual({ outcome: 'completed' });
    expect(state.lifecycle.value).toEqual([{ operation: 'note' }]);
  });
});

/** The channel names a plain object resolves through its prototype rather than holding. */
const HOST_NAMED: readonly ChannelSpec[] = [
  { name: '__proto__', source: 'node', reducer: 'merge' },
  { name: 'constructor', source: 'node', reducer: 'replace' },
];

/**
 * A state is an ordinary object keyed by declared channel names, so the very prototype
 * accessors the fold guards against reach it: a channel must land as an own entry whatever
 * its name resolves to, or the state loses it and every later read answers the prototype.
 */
describe('channel states over prototype-resolved names', () => {
  it('starts a prototype-resolved channel at its default without touching the prototype', () => {
    const state = initialState(HOST_NAMED);

    expect(Object.getOwnPropertyNames(state).sort()).toEqual(['__proto__', 'constructor']);
    expect(Object.getPrototypeOf(state)).toBe(Object.prototype);
    expect(state['__proto__']).toEqual({ value: {}, version: 0 });
    expect(state['constructor']).toEqual({ value: null, version: 0 });
  });

  it('folds a write into a prototype-resolved channel and leaves the rest alone', () => {
    const state = applyWrite(HOST_NAMED, initialState(HOST_NAMED), '__proto__', { a: 1 });

    expect(Object.getOwnPropertyNames(state).sort()).toEqual(['__proto__', 'constructor']);
    expect(Object.getPrototypeOf(state)).toBe(Object.prototype);
    expect(state['__proto__']).toEqual({ value: { a: 1 }, version: 1 });
    expect(state['constructor']).toEqual({ value: null, version: 0 });
  });
});
