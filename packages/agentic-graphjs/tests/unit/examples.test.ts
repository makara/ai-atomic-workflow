import { describe, expect, it } from 'vitest';

import { run as runAwilix } from '../../examples/awilix-e2e.js';
import { drive, run as runMemory } from '../../examples/memory-e2e.js';
import { run as runReadFace } from '../../examples/read-face-e2e.js';
import { type Runtime } from '../../src/internal.js';

describe('the two examples', () => {
  it('the functional and Awilix routes transcribe the same run', async () => {
    const [byMemory, byAwilix] = await Promise.all([runMemory(), runAwilix()]);
    expect(byAwilix).toEqual(byMemory);
    expect(byMemory).toEqual([
      'issue plan#0 (plan)',
      'settle plan#0 -> settled',
      'issue settle#0 (settle)',
      'settle settle#0 -> settled',
      'final unserved',
    ]);
  });
});

/**
 * The drive's two exits that never reached the happy path: the turn bound, so a chain that keeps
 * issuing cannot loop the example forever, and the refusal, so a rejected take is transcribed
 * instead of answered as a silent end.
 */
describe("the drive's bound and the refusal it meets", () => {
  it('stops a chain that keeps issuing and says the bound was reached', async () => {
    const stuck = {
      take: async () => ({ kind: 'issued', tasks: [{ id: 'a#0', node: 'a', attempt: 1, key: 'done' }] }),
      report: async () => ({ kind: 'settled' }),
    } as unknown as Runtime;

    const lines = await drive(stuck);

    expect(lines).toHaveLength(64 * 2 + 1);
    expect(lines[0]).toBe('issue a#0 (a)');
    expect(lines[1]).toBe('settle a#0 -> settled');
    expect(lines.at(-1)).toBe('final capped at 64');
  });

  it('transcribes the refusal a take meets instead of looping on it', async () => {
    const refused = {
      take: async () => ({ kind: 'rejected', refusal: { code: 'GRAPH_UNREADABLE', note: 'no such graph' } }),
      report: async () => ({ kind: 'settled' }),
    } as unknown as Runtime;

    expect(await drive(refused)).toEqual(['final rejected (GRAPH_UNREADABLE: no such graph)']);
  });
});

describe('the read-face route', () => {
  it('reads the driven chain back: binding, chain, folded state, and window', async () => {
    const lines = await runReadFace();

    expect(lines.slice(0, 5)).toEqual(await runMemory());
    expect(lines.slice(5)).toEqual([
      'boundGraph -> e2e',
      'history -> 2 checkpoints (2, 1)',
      'getState -> 0 next ()',
      'status -> 2 settlements, 2 steps',
    ]);
  });
});
