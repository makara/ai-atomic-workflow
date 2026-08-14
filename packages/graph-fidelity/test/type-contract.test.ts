/**
 * Adapter platform-type contract — the seam between the module and the real
 * platform contracts is compile-time checked: the OMP default export must
 * satisfy `ExtensionFactory` (`@oh-my-pi/pi-coding-agent`), the opencode
 * default export must satisfy `{ server: Plugin }` (`@opencode-ai/plugin`).
 *
 * The module-level `const` assignments below are the compile-time assertions:
 * if a factory drifts from its platform shape, typecheck fails here.
 */
import type { ExtensionFactory } from '@oh-my-pi/pi-coding-agent';
import type { Plugin } from '@opencode-ai/plugin';
import { describe, expect, it } from 'vitest';
import ompExtension from '../src/adapters/omp.js';
import opencodePlugin from '../src/adapters/opencode.js';

// Compile-time shape assertions (type level).
const ompFactory: ExtensionFactory = ompExtension;
const opencodeServer: { server: Plugin } = opencodePlugin;

describe('adapter platform-type contract', () => {
  it('OMP default export satisfies ExtensionFactory', () => {
    expect(typeof ompFactory).toBe('function');
  });

  it('opencode default export satisfies { server: Plugin }', () => {
    expect(typeof opencodeServer.server).toBe('function');
  });
});
