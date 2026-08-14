import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Wording sweep — the zero-deny clarification (ADR 0177 D5) must hold
 * across the whole skill/registry estate, not just the pinned bullet.
 *
 * The clarified wording is: "Registered tool capability is never
 * restricted (deny covers redundant platform paths only)" — a registered
 * write engine is never denied. The OLD phrasing ("Tool capability is
 * never restricted (zero deny)" / "zero denial, the agent's tool
 * capability is never restricted") contradicts the deny capability and
 * must not survive anywhere in `packages/graph-workflow/`.
 *
 * SkipIf-guarded: when the target tree is absent (fresh partial clone),
 * the sweep skips with a documented reason — matching the cross-package
 * pin suite convention.
 */

const packagesRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

/** The old-phrase spellings this change retired (ADR 0177 D5). */
const OLD_PHRASES: readonly string[] = [
  'Tool capability is never restricted (zero deny)',
  "zero denial, the agent's tool capability is never restricted",
];

/** Recursively collect `.md`/`.ts` sources under a root (bounded depth). */
function collectSources(dir: string, depth = 0): string[] {
  if (depth > 5) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = resolve(dir, name);
    if (name === 'node_modules' || name === '.git') continue;
    if (statSync(full).isDirectory()) {
      out.push(...collectSources(full, depth + 1));
    } else if (/\.(md|ts)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe('wording sweep — old zero-deny phrasing absent', () => {
  const treePresent = existsSync(resolve(packagesRoot, 'graph-workflow'));

  it.skipIf(!treePresent)('no old-phrase match anywhere in packages/graph-workflow', () => {
    const sources = collectSources(resolve(packagesRoot, 'graph-workflow'));
    expect(sources.length).toBeGreaterThan(0);
    const hits: Array<{ file: string; line: number; text: string }> = [];
    for (const file of sources) {
      const lines = readFileSync(file, 'utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        for (const phrase of OLD_PHRASES) {
          if (line.includes(phrase)) {
            hits.push({ file, line: i + 1, text: line.trim() });
          }
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
