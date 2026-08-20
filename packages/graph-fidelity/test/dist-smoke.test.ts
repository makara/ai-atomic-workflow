import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
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
 * carry no remaining @modelcontextprotocol bare specifier. Since the
 * R1 chain moved into the SDK (ADR 0195), the bundles inline the chain
 * via the SDK dependency — no shared lifecycle module exists.
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
      // The deployment contract is a FOLDER copy — the bundles are
      // self-contained (R1 chain inlined via the SDK, ADR 0195), so each
      // entry file ships alone.
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

  it('bundles carry no shared ./lifecycle.js reference (chain inlined — ADR 0195)', () => {
    for (const entry of ENTRIES) {
      const source = readFileSync(join(distDir, entry.file), 'utf8');
      expect(source).not.toMatch(/from['"]\.\/lifecycle\.js['"]/);
    }
  });

  it('no shared lifecycle dist artifacts remain (interfaces d.ts + runtime bundle)', () => {
    for (const file of [
      'lifecycle.js',
      'interfaces/lifecycle.d.ts',
      'interfaces/interfaces/signal-lifecycle.d.ts',
      // sdk-surface-convergence: the ./interfaces export is removed —
      // the ToolDeny contract is SDK-owned; no interfaces declaration
      // tree is emitted.
      'interfaces/interfaces/tool-deny.d.ts',
    ]) {
      expect(existsSync(join(distDir, file))).toBe(false);
    }
  });

  it('no interfaces declaration tree remains (ToolDeny is SDK-owned, sdk-surface-convergence)', () => {
    expect(existsSync(join(distDir, 'interfaces'))).toBe(false);
  });

  it('base OMP adapter renders the echo from the inlined chain (bundle-level wiring, ADR 0195)', () => {
    // Load the real bundle under PLAIN NODE (the platform runtime — the
    // vitest vite-node pipeline would transform the external files and
    // break module identity): the adapter bundle resolves standalone,
    // exactly the deployed composition.
    const bare = mkdtempSync(join(tmpdir(), 'fid-dist-'));
    copyFileSync(join(distDir, 'omp.js'), join(bare, 'omp.js'));
    const script = `
      import('./omp.js').then(async (omp) => {
        const pi = { on: (n, h) => { pi[n] = h; } };
        omp.default(pi);
        const result = await pi['context']({
          type: 'context',
          messages: [
            { role: 'user', content: 'start' },
            { role: 'assistant', content: '## Run Frame\\nRun abc · node a/b · 1/2 · type main · task: t' },
            { role: 'user', content: 'scope 确认' },
          ],
        });
        process.stdout.write(JSON.stringify(result));
      }).catch((e) => { console.error('ERR', e); process.exit(1); });
    `;
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: bare,
      encoding: 'utf8',
    });
    expect(out).toContain('▣ [seam] node a/b · 1/2');
  });
});
