/**
 * Single chain suite over EchoMessage — the ONE chain-composition test
 * (mirrored per-face chain cases are deleted): echo-only composition
 * (fidelity + compress stages were disconnected with the R2/R1
 * decoupling — ADR 0175), unchanged passthrough (undefined), canonical
 * dedup, and self-heal. The reference reduction machinery keeps its own
 * pins under test/context-management.
 */
import { describe, expect, it } from 'vitest';
import type { EchoMessage } from '../src/core/chain-types.js';
import { applyFidelityChain } from '../src/core/chain.js';
import { SEAM_MARKER } from '../src/core/discipline.js';

const RUN = '2fc43e1e-d9b8-4da1-a911-f4f0c793214b';
const frame = (nodeId: string): string =>
  `## Run Frame\nRun ${RUN} · node ${nodeId} · type main · task: t\ndeclared operations [read] · out of scope: write`;

describe('applyFidelityChain — echo stage', () => {
  it('appends the echo line to the last user-like message', () => {
    const messages: EchoMessage[] = [
      { role: 'user', text: frame('requirement/arch-review') },
      { role: 'assistant', text: 'call plan' },
      { role: 'user', text: frame('adopt/adopt-accept') },
    ];
    const out = applyFidelityChain(messages, { echo: '▣ [seam] node adopt/adopt-accept' });
    expect(out).toBeDefined();
    expect(out?.[0]?.text).toBe(frame('requirement/arch-review'));
    expect(out?.[2]?.text).toContain(SEAM_MARKER);
    expect(out?.[2]?.text).toContain('node adopt/adopt-accept');
  });

  it('renders identity + progress when the echo line carries N/M', () => {
    const messages: EchoMessage[] = [{ role: 'user', text: frame('requirement/scope-entry') }];
    const out = applyFidelityChain(messages, { echo: '▣ [seam] node requirement/scope-entry · 3/25' });
    expect(out?.[0]?.text).toContain('▣ [seam] node requirement/scope-entry · 3/25');
    expect(out?.[0]?.text).not.toContain('│');
  });

  it('echo stage dedup — canonical line already present → unchanged', () => {
    const messages: EchoMessage[] = [{ role: 'user', text: `${frame('a')}\n▣ [seam] node a` }];
    expect(applyFidelityChain(messages, { echo: '▣ [seam] node a' })).toBeUndefined();
  });

  it('self-heal — a stale seam line is stripped and replaced in place', () => {
    const messages: EchoMessage[] = [
      { role: 'user', text: `${frame('a')}\n[seam] node stale declares [] — corrupted` },
    ];
    const out = applyFidelityChain(messages, { echo: '▣ [seam] node a' });
    expect(out).toBeDefined();
    const text = out?.[0]?.text ?? '';
    expect(text.match(/\[seam\] node /g)).toHaveLength(1);
    expect(text).toContain('▣ [seam] node a');
    expect(text).not.toContain('stale');
  });

  it('no echo line → undefined (adapters forward unchanged)', () => {
    const messages: EchoMessage[] = [{ role: 'user', text: 'plain chat' }];
    expect(applyFidelityChain(messages)).toBeUndefined();
    expect(applyFidelityChain(messages, { echo: '' })).toBeUndefined();
  });

  it('no frame + echo → nothing appended when no user-like message exists', () => {
    const messages: EchoMessage[] = [{ role: 'assistant', text: 'work' }];
    expect(applyFidelityChain(messages, { echo: '▣ [seam] node a' })).toBeUndefined();
  });

  it('never mutates the input', () => {
    const messages: EchoMessage[] = [
      { role: 'user', text: 'boom: no such file', toolResultIds: ['c1'] },
      { role: 'user', text: frame('n2') },
    ];
    const frozen = Object.freeze(messages.map((m) => Object.freeze({ ...m })));
    applyFidelityChain(frozen, { echo: '▣ [seam] node n2' });
    expect(frozen[0]?.text).toBe('boom: no such file');
    expect(frozen[1]?.text).toBe(frame('n2'));
  });
});
