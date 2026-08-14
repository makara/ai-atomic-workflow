import { existsSync, readFileSync } from 'node:fs';
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

/** The opencode bundle's default export contract (shape assertion only). */
interface OpencodeBundleModule {
  default: { server: (input: unknown) => unknown };
}

describe('graph-fidelity deploy mirror', () => {
  it('package declares the OMP manifest entry (installed-plugin discovery)', () => {
    expect(pkg.omp?.extensions).toContain('./dist/omp.js');
  });

  it('package declares the opencode ./server entry (npm entry convention)', () => {
    expect(pkg.exports?.['./server']).toBe('./dist/opencode.js');
  });

  it('opencode.json plugin registration points at the dist bundle', async () => {
    // opencode.json is an untracked environment fact in this repo — a fresh
    // clone may lack it; skip (never fail the suite) when absent.
    const configPath = resolve(repoRoot, 'opencode.json');
    if (!existsSync(configPath)) {
      return; // untracked config — documented skip
    }
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as { plugin?: string[] };
    const entry = config.plugin?.find((p) => typeof p === 'string' && p.includes('graph-fidelity'));
    expect(entry).toBeDefined();
    expect(entry).toContain('/dist/opencode.js');
    // Dynamic import: exercises the bundle-loading boundary (runtime-selected
    // path from config) — the shape assertion pins the platform contract.
    const mod = (await import(resolve(repoRoot, entry as string))) as OpencodeBundleModule;
    expect(typeof mod.default.server).toBe('function');
  });

  it('marketplace catalog declares the graph-fidelity plugin entry with a package-domain description', () => {
    const entry = marketplace.plugins?.find((p) => p.name === 'graph-fidelity');
    expect(entry).toBeDefined();
    expect(entry?.source).toBe('./packages/graph-fidelity');
    expect(entry?.description?.trim().length).toBeGreaterThan(0);
  });
});
