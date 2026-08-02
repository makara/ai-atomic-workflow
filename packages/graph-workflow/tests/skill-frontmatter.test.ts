/**
 * Frontmatter validity — every SKILL.md under skills/ must parse as YAML
 * with the same parser the skill installer uses (eemeli yaml). An unquoted
 * plain scalar containing ": " (e.g. description ending with
 * "Trigger phrases: ...") breaks parsing and makes the installer skip the
 * skill entirely. Regression: setup-atomic-workflow was skipped on install
 * for exactly this reason.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';

function skillDirs(): string[] {
  const skillsRoot = resolve(__dirname, '../skills');
  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => resolve(skillsRoot, e.name));
}

describe('SKILL.md frontmatter — installer-compatible YAML', () => {
  const dirs = skillDirs();

  it('discovers skill directories', () => {
    expect(dirs.length).toBeGreaterThan(0);
  });

  for (const dir of dirs) {
    const name = dir.split('/').pop() as string;
    it(`${name}/SKILL.md frontmatter parses clean`, () => {
      const src = readFileSync(resolve(dir, 'SKILL.md'), 'utf-8');
      const match = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      expect(match, `${name}/SKILL.md missing frontmatter block`).not.toBeNull();
      const doc = YAML.parseDocument(match![1]);
      const messages = doc.errors.map((e) => e.message.split('\n')[0]);
      expect(messages).toEqual([]);
    });
  }
});
