/**
 * Adapter platform-type contract — the seam between the module and the real
 * platform contracts is compile-time checked: the OMP default export must
 * satisfy `ExtensionFactory` (`@oh-my-pi/pi-coding-agent`), the opencode
 * default export must satisfy `{ server: Plugin }` (`@opencode-ai/plugin`),
 * and the adapters must import the real platform type packages (no
 * duck-typed stand-in interfaces).
 *
 * The module-level `const` assignments below are the compile-time assertions:
 * if a factory drifts from its platform shape, typecheck fails here.
 */
import type { ExtensionFactory } from '@oh-my-pi/pi-coding-agent';
import type { Plugin } from '@opencode-ai/plugin';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import ompExtension from '../src/adapters/omp.js';
import opencodePlugin from '../src/adapters/opencode.js';

// Compile-time shape assertions (type level).
const ompFactory: ExtensionFactory = ompExtension;
const opencodeServer: { server: Plugin } = { server: opencodePlugin };

describe('adapter platform-type contract', () => {
  it('OMP default export satisfies ExtensionFactory', () => {
    expect(typeof ompFactory).toBe('function');
  });

  it('opencode default export satisfies { server: Plugin }', () => {
    expect(typeof opencodeServer.server).toBe('function');
  });

  it('adapters import real platform types — no duck-typed seam', () => {
    const dir = resolve(fileURLToPath(new URL('..', import.meta.url)), 'src/adapters');
    const omp = readFileSync(resolve(dir, 'omp.ts'), 'utf8');
    const opencode = readFileSync(resolve(dir, 'opencode.ts'), 'utf8');
    expect(omp).toContain('@oh-my-pi/pi-coding-agent');
    expect(opencode).toContain('@opencode-ai/plugin');
    // The duck-typed seam disease = an adapter-local interface standing in
    // for the PLATFORM API (method-bearing). Payload-view interfaces are
    // data-only (no method members) and legitimate.
    expect(omp).not.toMatch(/interface\s+\w+\s*\{[^}]*\(/s);
    expect(opencode).not.toMatch(/interface\s+\w+\s*\{[^}]*\(/s);
  });
});
