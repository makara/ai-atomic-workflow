/**
 * HLT operation classes — the scheduler-side closed set.
 *
 * Pins the constant against the authoritative registry document
 * (atom-kernel HLT-REGISTRY.md — sibling of the §High-Level Tool Registry
 * section in SKILL.md) so the schema validation surface cannot drift from
 * the contract layer.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HLT_OPERATION_CLASSES, isHltOperationClass } from '../../src/hlt-classes.js';

describe('HLT_OPERATION_CLASSES — closed set', () => {
  it('matches the §High-Level Tool Registry entries in atom-kernel (no drift)', () => {
    // Registry entries live in the HLT-REGISTRY.md sibling (atom-kernel SKILL.md
    // holds the §High-Level Tool Registry section + pointer, entries split out).
    const skill = readFileSync(
      resolve(__dirname, '../../../graph-workflow/skills/atom-kernel/HLT-REGISTRY.md'),
      'utf-8',
    );
    const registry = skill.slice(skill.indexOf('## Registry Entries'));
    for (const cls of HLT_OPERATION_CLASSES) {
      expect(registry).toContain(`### Entry: ${cls}`);
    }
  });

  it('isHltOperationClass answers membership', () => {
    expect(isHltOperationClass('locate')).toBe(true);
    expect(isHltOperationClass('teleport')).toBe(false);
  });
});
