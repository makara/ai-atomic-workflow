/**
 * Resident block pins — the R1 correctness set only: PCL vocabulary +
 * HLT core requirement, unconditional (no style prompts, no mode knob —
 * the R2 style entries were removed with the R2/R1 decoupling, ADR 0175).
 */
import { describe, expect, it } from 'vitest';
import {
  RESIDENT_MARKER,
  applyResidentBlock,
  applyResidentToSystem,
  renderResidentBlock,
  selectResidentPrompts,
  stripResidentLines,
} from '../src/core/resident.js';

const BLOCK = renderResidentBlock();

describe('renderResidentBlock', () => {
  it('renders the block with marker-prefixed PCL + HLT entries only', () => {
    expect(BLOCK).toContain(`${RESIDENT_MARKER} PCL:`);
    expect(BLOCK).toContain(`${RESIDENT_MARKER} HLT:`);
    expect(BLOCK).toContain('Verify after every write (verify-after-write)');
    expect(BLOCK).toContain(
      'Registered tool capability is never restricted (deny covers redundant platform paths only)',
    );
  });

  it('carries no style entries (caveman/rtk/ponytail removed)', () => {
    expect(BLOCK).not.toContain('caveman');
    expect(BLOCK).not.toContain('rtk');
    expect(BLOCK).not.toContain('ponytail');
    expect(BLOCK).not.toContain('Intensity (');
  });

  it('renders deterministically', () => {
    expect(renderResidentBlock()).toBe(BLOCK);
  });
});

describe('selectResidentPrompts', () => {
  it('returns exactly the unconditional correctness set (PCL + HLT)', () => {
    expect(selectResidentPrompts().map((p) => p.id)).toEqual(['pcl', 'hlt']);
  });
});

describe('applyResidentBlock', () => {
  const system = (): string[] => ['platform system prompt'];

  it('appends the block as the last entry', () => {
    const out = applyResidentBlock(system(), BLOCK);
    expect(out).toEqual([...system(), BLOCK]);
  });

  it('skips when the exact block entry is already present (canonical-dedup)', () => {
    expect(applyResidentBlock([...system(), BLOCK], BLOCK)).toBeUndefined();
  });

  it('strips stale resident lines and refreshes in place (self-heal)', () => {
    const stale = `${system()[0]}\n${RESIDENT_MARKER} caveman: stale`;
    const out = applyResidentBlock([stale], BLOCK);
    const joined = out?.join('\n') ?? '';
    expect(joined).not.toContain('stale');
    expect(out?.[out.length - 1]).toBe(BLOCK);
  });

  it('returns undefined for an empty block', () => {
    expect(applyResidentBlock(system(), '')).toBeUndefined();
  });

  it('never mutates the input array', () => {
    const input = system();
    applyResidentBlock(input, BLOCK);
    expect(input).toEqual(system());
  });
});

describe('stripResidentLines', () => {
  it('removes the resident block region (heading + marker lines through end), keeping leading content', () => {
    expect(
      stripResidentLines(
        `a\nb\n## Resident Prompts\n${RESIDENT_MARKER} caveman: x\ncontinuation\n${RESIDENT_MARKER} rtk: y`,
      ),
    ).toBe('a\nb');
  });

  it('returns the text unchanged when no resident content exists', () => {
    expect(stripResidentLines('a\nb')).toBe('a\nb');
  });
});

describe('applyResidentToSystem', () => {
  it('renders + applies in one call (adapter seam helper)', () => {
    const out = applyResidentToSystem(['platform base']);
    expect(out?.[out.length - 1]).toBe(BLOCK);
  });

  it('per-turn reassert — a fresh base receives the block again (compaction survival)', () => {
    // The platform rebuilds the base system prompt per top-level turn;
    // each rebuild is a fresh array, so the block is re-applied — never
    // lost by compaction, never accumulated within one array.
    const turn1 = applyResidentToSystem(['platform base']);
    const turn2 = applyResidentToSystem(['platform base']);
    expect(turn1?.[1]).toBe(BLOCK);
    expect(turn2?.[1]).toBe(BLOCK);
    expect(turn1).toEqual(turn2);
  });

  it('block carries PCL + HLT unconditionally', () => {
    const out = applyResidentToSystem(['platform base']);
    expect(out?.[1]).toContain('PCL');
    expect(out?.[1]).toContain('HLT');
    expect(out?.[1]).not.toContain('caveman');
  });
});
