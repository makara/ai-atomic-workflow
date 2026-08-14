import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { HLT_CORE_REQUIREMENT } from '../src/core/resident.js';

const SKILL_PATH = fileURLToPath(new URL('../../graph-workflow/skills/atom-kernel/SKILL.md', import.meta.url));
const REGISTRY_PATH = fileURLToPath(
  new URL('../../graph-workflow/skills/atom-kernel/HLT-REGISTRY.md', import.meta.url),
);

/** Cross-package pin — skips when the source tree is absent (frame-contract guard). */
const skillPresent = existsSync(SKILL_PATH);
const registryPresent = existsSync(REGISTRY_PATH);

/** Extract the first fenced text block after the Core Requirement marker. */
function coreRequirementBox(file: string): string {
  const start = file.indexOf('Core Requirement');
  const fence = file.slice(start).match(/```text\n([\s\S]*?)\n```/);
  if (!fence?.[1]) throw new Error('Core Requirement fenced box not found');
  return fence[1];
}

describe.skipIf(!skillPresent)('HLT core requirement single source', () => {
  it('resident copy is byte-equal to the atom-kernel hot-surface box', () => {
    expect(coreRequirementBox(readFileSync(SKILL_PATH, 'utf8'))).toBe(HLT_CORE_REQUIREMENT);
  });

  it.skipIf(!registryPresent)('HLT-REGISTRY.md box is byte-equal to the hot-surface box', () => {
    const skill = coreRequirementBox(readFileSync(SKILL_PATH, 'utf8'));
    expect(coreRequirementBox(readFileSync(REGISTRY_PATH, 'utf8'))).toBe(skill);
  });
});
