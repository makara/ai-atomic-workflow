import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'packages/graph-fidelity/package.json'), 'utf8')) as {
  exports?: Record<string, string>;
  omp?: { extensions?: string[] };
};
const marketplace = JSON.parse(readFileSync(resolve(repoRoot, '.claude-plugin/marketplace.json'), 'utf8')) as {
  plugins?: Array<{ name: string; source?: string; description?: string }>;
};

describe('graph-fidelity deploy mirror', () => {
  it('package declares the OMP manifest entry (installed-plugin discovery)', () => {
    expect(pkg.omp?.extensions).toContain('./src/adapters/omp.ts');
  });

  it('package declares the opencode ./server entry (npm entry convention)', () => {
    expect(pkg.exports?.['./server']).toBe('./src/adapters/opencode.ts');
  });

  it('opencode.json plugin registration points at an existing file', () => {
    const config = JSON.parse(readFileSync(resolve(repoRoot, 'opencode.json'), 'utf8')) as { plugin?: string[] };
    const entry = config.plugin?.[0];
    expect(entry).toBeDefined();
    const target = resolve(repoRoot, entry as string);
    expect(readFileSync(target, 'utf8')).toContain('server: Plugin');
  });

  it('marketplace catalog declares the graph-fidelity plugin entry with a package-domain description', () => {
    const entry = marketplace.plugins?.find((p) => p.name === 'graph-fidelity');
    expect(entry).toBeDefined();
    expect(entry?.source).toBe('./packages/graph-fidelity');
    expect(entry?.description?.trim().length).toBeGreaterThan(0);
  });
});
