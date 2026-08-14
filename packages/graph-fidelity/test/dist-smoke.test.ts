import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Distribution-contract smoke seam.
 *
 * The OMP installer copies the package folder verbatim and delivers NO
 * dependencies, so the extension entries must be self-contained build
 * artifacts: they must import from a directory with zero node_modules in
 * their resolution chain, keep the platform default-export shapes, and
 * carry no remaining @modelcontextprotocol bare specifier.
 */

/** Platform default-export contracts — shape assertions only. */
interface OmpBundleModule {
  default: (api: unknown) => unknown;
}
interface OpencodeBundleModule {
  default: { server: (input: unknown) => unknown };
}

const distDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '../dist');

type BundleModule = OmpBundleModule | OpencodeBundleModule;

const ENTRIES: Array<{ file: string; check: (m: BundleModule) => boolean }> = [
  {
    file: 'omp.js',
    check: (m) => typeof (m as OmpBundleModule).default === 'function',
  },
  {
    file: 'opencode.js',
    check: (m) => typeof (m as OpencodeBundleModule).default.server === 'function',
  },
];

describe('graph-fidelity dist bundles (distribution contract)', () => {
  for (const entry of ENTRIES) {
    it(`${entry.file} imports from a bare directory (no node_modules)`, async () => {
      // Dynamic import: intentionally exercises the module-loading boundary —
      // the specifier is a runtime-selected path in the OS temp dir, whose
      // ancestor chain (/tmp → /) contains no node_modules (static import
      // would resolve through this package's own node_modules instead).
      const bare = mkdtempSync(join(tmpdir(), 'fid-dist-'));
      copyFileSync(join(distDir, entry.file), join(bare, entry.file));
      const mod = (await import(pathToFileURL(join(bare, entry.file)).href)) as OmpBundleModule | OpencodeBundleModule;
      expect(entry.check(mod)).toBe(true);
    });
  }

  it('bundles carry no @modelcontextprotocol bare specifier', () => {
    for (const entry of ENTRIES) {
      const source = readFileSync(join(distDir, entry.file), 'utf8');
      expect(source).not.toMatch(/from['"]@modelcontextprotocol/);
    }
  });
});
