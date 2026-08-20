import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CORE_DIR = join(import.meta.dirname, '..', 'src', 'core');

// Core purity scan — zero platform imports in core (spec: Zero platform imports in core).
describe('core purity', () => {
  it('no core file imports any platform package', () => {
    const files = readdirSync(CORE_DIR).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(join(CORE_DIR, f), 'utf8');
      // import statements only — comments may name platform packages as evidence
      const importMatches = src.match(/from\s+['"]@(oh-my-pi|opencode-ai)|require\(['"]@(oh-my-pi|opencode-ai)/g);
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      expect(importMatches ?? [], `platform import in core/${f}`).toEqual([]);
    }
  });
});
