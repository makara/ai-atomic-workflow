import { describe, expect, it } from 'vitest';

import { REFUSAL_CODES, REFUSALS, refuse, serialize } from '../../src/internal.js';

describe('the twelve-row refuse table', () => {
  it('carries exactly the twelve frozen codes', () => {
    expect(REFUSAL_CODES).toEqual([
      'BAD_CALL',
      'CAPABILITY_MISSING',
      'GRAPH_UNREADABLE',
      'STRUCTURE_DRIFT',
      'NO_OUTSTANDING_TASK',
      'KEY_UNDECLARED',
      'KEY_UNMATCHED',
      'SETTLEMENT_UNANCHORED',
      'TASK_AMBIGUOUS',
      'CHECKPOINT_UNKNOWN',
      'infra',
      'input-missing',
    ]);
  });

  it.each(REFUSAL_CODES)('names the meaning and next step of %s', (code) => {
    expect(REFUSALS[code].meaning).not.toBe('');
    expect(REFUSALS[code].next).not.toBe('');
  });

  it('is one entry per code', () => {
    expect(Object.keys(REFUSALS)).toHaveLength(12);
  });
});

describe('the payload shape', () => {
  it('keeps the key-bearing codes with their candidates', () => {
    const declared = refuse('KEY_UNDECLARED', "'x' not declared", ['done', 'failed']);
    expect(declared).toEqual({ code: 'KEY_UNDECLARED', note: "'x' not declared", keys: ['done', 'failed'] });
    const unmatched = refuse('KEY_UNMATCHED', "'x' matches no route", ['done', 'failed']);
    expect(unmatched).toEqual({ code: 'KEY_UNMATCHED', note: "'x' matches no route", keys: ['done', 'failed'] });
    const dropped = refuse('infra', 'engine-side condition', ['done', 'failed']);
    expect('keys' in dropped).toBe(false);
  });

  it('reaches the code a read face refuses on and the one a router refuses on', () => {
    const missing = refuse('CAPABILITY_MISSING', "the runtime carries no 'checkpointer'");
    expect(missing).toEqual({ code: 'CAPABILITY_MISSING', note: "the runtime carries no 'checkpointer'" });
    expect('keys' in missing).toBe(false);
    const unmatched = refuse('KEY_UNMATCHED', 'no route carries the key');
    expect(unmatched).toEqual({ code: 'KEY_UNMATCHED', note: 'no route carries the key' });
    expect('keys' in unmatched).toBe(false);
  });
  it('keeps take-period refusals two-field', () => {
    const missing = refuse('input-missing', "graph input omits 'binding'");
    expect(missing).toEqual({ code: 'input-missing', note: "graph input omits 'binding'" });
    expect('keys' in missing).toBe(false);
  });

  it('keeps the other codes two-field', () => {
    const row = refuse('infra', 'checkpointer');
    expect(row).toEqual({ code: 'infra', note: 'checkpointer' });
    expect('keys' in row).toBe(false);
  });

  it('is stable: the same input yields the same bytes', () => {
    const first = refuse('KEY_UNDECLARED', 'note', ['a', 'b']);
    const second = refuse('KEY_UNDECLARED', 'note', ['a', 'b']);
    expect(serialize(first)).toBe(serialize(second));
  });
});
