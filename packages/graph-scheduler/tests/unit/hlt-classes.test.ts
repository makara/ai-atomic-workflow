import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HLT_OPERATION_CLASSES, isHltOperationClass } from '../../src/hlt-classes.js';

function registrySection(): string {
  // Static prose — the §Operation Obligations table in the atom-kernel
  // HLT-REGISTRY.md sibling (no generated markers; hand-maintained).
  const skill = readFileSync(resolve(__dirname, '../../../graph-workflow/skills/atom-kernel/HLT-REGISTRY.md'), 'utf-8');
  const start = skill.indexOf('## Operation Obligations');
  const rest = skill.slice(start);
  const end = rest.indexOf('\n## ', 1);
  return end === -1 ? rest : rest.slice(0, end);
}

describe('HLT_OPERATION_CLASSES — closed set', () => {
  it('matches the §Operation Obligations rows in atom-kernel (no drift)', () => {
    const registry = registrySection();
    for (const cls of HLT_OPERATION_CLASSES) {
      expect(registry).toContain(`|${cls}|`);
    }
  });

  it('isHltOperationClass answers membership', () => {
    expect(isHltOperationClass('locate')).toBe(true);
    expect(isHltOperationClass('teleport')).toBe(false);
  });
});
