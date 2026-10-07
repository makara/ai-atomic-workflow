import { describe, expect, it } from 'vitest';

import * as publicFace from '../../src/index.js';
import * as internalFace from '../../src/internal.js';

/** The machinery names: the mechanism the public face must not carry. */
const MACHINERY = [
  'settle',
  'plan',
  'run',
  'start',
  'runNode',
  'createCheckpointSaver',
  'stateOf',
  'serialize',
  'reduce',
  'sameValue',
  'initialState',
  'applyWrite',
  'applyWrites',
  'foldWrites',
  'mechanicalKey',
  'readsOf',
  'REDUCERS',
  'REDUCER_EMPTY',
  'RuntimeError',
  'SaverError',
  'ChannelError',
  'ReducerError',
];

/** The public face's own names: the entry, the build face, the refusals, the memory savers. */
const CONTRACT = [
  'createRuntime',
  'emptyStatus',
  'statusOf',
  'runtimeContainer',
  'runtimeRegistrations',
  'StateGraph',
  'Annotation',
  'Command',
  'START',
  'END',
  'IR_VERSION',
  'validateGraph',
  'interrupt',
  'Suspended',
  'GraphBuildError',
  'createMemoryLog',
  'createMemorySaver',
  'REFUSALS',
  'REFUSAL_CODES',
  'refuse',
];

/**
 * The two faces are the deliverable: the root carries the entry, the contract types,
 * the build face, the refusal codes, and the in-memory implementations — and none of the
 * machinery; the machinery rides `./internal` for same-repo consumers and in-package tests.
 */
describe('the two export faces', () => {
  it('exports the constants with their frozen values', () => {
    expect(publicFace.IR_VERSION).toBe('1');
    expect(publicFace.START).toBe('__start__');
    expect(publicFace.END).toBe('__end__');
  });

  it('carries the contract names on the root face', () => {
    for (const name of CONTRACT) {
      expect(typeof (publicFace as Record<string, unknown>)[name], name).not.toBe('undefined');
    }
    expect(typeof publicFace.Annotation.Root).toBe('function');
    expect(typeof publicFace.validateGraph).toBe('function');
    expect(new publicFace.GraphBuildError('unknown-node', 'edge target names unknown node').code).toBe('unknown-node');
    expect(() => publicFace.interrupt('node', { ask: true })).toThrowError(publicFace.Suspended);
    expect(publicFace.REFUSAL_CODES).toHaveLength(12);
  });

  it('publishes the module port table with its seven rows', () => {
    expect(Object.keys(publicFace.PORTS).sort()).toEqual([
      'checkpointer',
      'context',
      'graphs',
      'judge',
      'logger',
      'store',
      'writer',
    ]);
    expect(publicFace.PORTS['checkpointer']?.required).toBe(true);
    expect(publicFace.PORTS['context']?.required).toBe(true);
    expect(publicFace.PORTS['graphs']?.required).toBe(true);
    expect(publicFace.PORTS['judge']?.required).toBe(false);
    expect(publicFace.PORTS['logger']?.required).toBe(false);
    expect(publicFace.PORTS['checkpointer']?.fallback).toBe('refuse infra');
    expect(publicFace.PORTS['logger']?.fallback).toBe('silence');
  });
});

describe('the machinery face', () => {
  it('carries none of the machinery on the root face', () => {
    for (const name of MACHINERY) {
      expect(name in publicFace, name).toBe(false);
    }
  });

  it('carries the machinery on the internal face', () => {
    for (const name of MACHINERY) {
      expect(typeof (internalFace as Record<string, unknown>)[name], name).not.toBe('undefined');
    }
    expect(Object.entries(internalFace.REDUCERS)).toHaveLength(3);
    expect(new internalFace.RuntimeError('no-route', 'no entry').code).toBe('no-route');
    expect(new internalFace.SaverError('duplicate-checkpoint', 'already exists').code).toBe('duplicate-checkpoint');
    expect(new internalFace.ChannelError('unknown-channel', 'no channel is declared').code).toBe('unknown-channel');
    expect(new internalFace.ReducerError('not-a-list', 'a list-valued channel holds null').code).toBe('not-a-list');
  });

  it('keeps the internal face inside the two declared faces', () => {
    const root = new Set(Object.keys(publicFace));
    for (const name of Object.keys(internalFace)) {
      expect(root.has(name) || MACHINERY.includes(name), name).toBe(true);
    }
    for (const name of MACHINERY) {
      expect(name in internalFace, name).toBe(true);
    }
  });
});
