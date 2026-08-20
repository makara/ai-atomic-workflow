/**
 * Resident block machinery pins (SDK side) — the R1 correctness set
 * rendering/application mechanics over consumer-provided prompt
 * entries. The shipped content (PCL vocabulary + activate guidance)
 * stays consumer-side and is pinned by the consumer package's
 * resident-content-pin test; this suite pins the MACHINERY with a
 * fixture prompt set (SDK keeps zero dependency on consumer content).
 */
import { describe, expect, it } from 'vitest';
import {
  RESIDENT_HEADING,
  RESIDENT_MARKER,
  applyResidentBlock,
  applyResidentToSystem,
  renderResidentBlock,
  stripResidentLines,
  type ResidentPrompt,
} from '../src/core/resident.js';

const PROMPTS: readonly ResidentPrompt[] = [
  { id: 'pcl', title: 'PCL', text: 'fixture pcl vocabulary' },
  { id: 'activate', title: 'Activate', text: 'fixture activate guidance' },
];

const BLOCK = renderResidentBlock(PROMPTS);

describe('renderResidentBlock', () => {
  it('renders the block with marker-prefixed entries in order', () => {
    expect(BLOCK).toContain(RESIDENT_HEADING);
    expect(BLOCK).toContain(`${RESIDENT_MARKER} PCL: fixture pcl vocabulary`);
    expect(BLOCK).toContain(`${RESIDENT_MARKER} Activate: fixture activate guidance`);
  });

  it('renders deterministically', () => {
    expect(renderResidentBlock(PROMPTS)).toBe(BLOCK);
  });
});

describe('applyResidentBlock / applyResidentToSystem', () => {
  it('appends the fresh block to the system-prompt array', () => {
    const out = applyResidentBlock(['base prompt'], BLOCK);
    expect(out).toEqual(['base prompt', BLOCK]);
  });

  it('dedups — byte-equal block present → undefined', () => {
    expect(applyResidentBlock([BLOCK], BLOCK)).toBeUndefined();
    expect(applyResidentToSystem([BLOCK], PROMPTS)).toBeUndefined();
  });

  it('self-heals a stale resident block in an entry', () => {
    const stale = `${'## Resident Prompts\n[resident] PCL: old'}`;
    const out = applyResidentBlock([stale], BLOCK);
    expect(out?.[0]).not.toContain('[resident]');
    expect(out?.[1]).toBe(BLOCK);
  });

  it('never mutates the input', () => {
    const input = Object.freeze(['base']);
    applyResidentBlock(input, BLOCK);
    expect(input[0]).toBe('base');
  });
});

describe('stripResidentLines', () => {
  it('strips marker-prefixed lines and the heading tail', () => {
    const text = `keep me\n${RESIDENT_HEADING}\n${RESIDENT_MARKER} PCL: x`;
    expect(stripResidentLines(text)).toBe('keep me');
  });
});
