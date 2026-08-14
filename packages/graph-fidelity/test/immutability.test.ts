/**
 * F6 — adapter immutability contract.
 *
 * The platform seam semantics (G-probe: the `context` event rewrites the
 * outgoing request array while the stored session messages stay untouched)
 * require every adapter transform to be non-mutating. Deep-frozen fixtures
 * prove it: a mutation attempt throws in strict mode, so a frozen input
 * passing through means the transform is pure. (Echo-only chain — the R2
 * fidelity/compress stages were disconnected, ADR 0175.)
 */
import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent';
import type { PluginInput } from '@opencode-ai/plugin';
import { describe, expect, it } from 'vitest';
import ompExtension, { type OmpAgentMessage, type OmpObservabilityApi } from '../src/adapters/omp.js';
import opencodeModule, { type OpencodeMessage } from '../src/adapters/opencode.js';
import { applyFidelityChain } from '../src/core/chain.js';
import type { EchoMessage } from '../src/core/types.js';

const RUN = '9e392f79f3c049069ae36fe22021a5ee';
const frame = (nodeId: string) =>
  `## Run Frame\nRun ${RUN} · node ${nodeId} · type main · task: t\ndeclared operations [read] · out of scope: write`;

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
    Object.freeze(value);
  }
  return value;
}

/** Echo-chain fixture — frame-anchored messages with a tool-result candidate. */
function chainFixture(): EchoMessage[] {
  return [
    { role: 'user', text: 'boom: no such file', toolResultIds: ['c1'] },
    { role: 'user', text: 'fine', toolResultIds: ['c2'] },
    { role: 'user', text: frame('n1') },
    { role: 'assistant', text: 'producer output' },
    { role: 'user', text: 'span result', isToolResult: true, toolResultIds: ['c3'] },
    { role: 'user', text: frame('n2') },
    { role: 'assistant', text: 'intermediate' },
    { role: 'user', text: frame('n3') },
  ];
}

describe('F6 · single chain immutability (frozen EchoMessage)', () => {
  it('echo chain passes deep-frozen input untouched', () => {
    const input = deepFreeze(chainFixture());
    const out = applyFidelityChain(input, {
      echo: '▣ [seam] node n3',
    });
    expect(out).toBeDefined();
    expect(input[0]?.text).toBe('boom: no such file');
    expect(input[4]?.text).toBe('span result');
    // The echo lands on the LAST user-like message only.
    expect(out?.[7]?.text).toContain('▣ [seam] node n3');
  });

  it('chain returns undefined for a no-op pass (never a spurious array)', () => {
    const input = deepFreeze([{ role: 'user', text: 'plain' }] as EchoMessage[]);
    expect(applyFidelityChain(input)).toBeUndefined();
  });
});

describe('F6 · OMP adapter immutability (frozen seam input)', () => {
  function ompSeam() {
    const handlers = new Map<string, (event: never) => unknown>();
    const api = {
      on: (event: string, handler: (event: never) => unknown) => {
        handlers.set(event, handler);
      },
      appendEntry: () => undefined,
    } as unknown as OmpObservabilityApi;
    ompExtension(api as unknown as ExtensionAPI);
    return {
      run(messages: OmpAgentMessage[]): unknown {
        return handlers.get('context')?.({ type: 'context', messages } as never);
      },
    };
  }

  it('context seam does not mutate frozen input (echo pass)', () => {
    const seam = ompSeam();
    const input = deepFreeze([
      { role: 'user', content: frame('n1') },
      { role: 'user', content: 'probe body' },
    ] as OmpAgentMessage[]);
    seam.run(input);
    expect(String(input[0]?.content)).toContain('Run 9e392f79');
  });

  it('context seam does not mutate frozen input with a null content block (failure path)', () => {
    const seam = ompSeam();
    const input = deepFreeze([
      { role: 'user', content: frame('n2') },
      { role: 'assistant', content: [null] },
    ] as unknown as OmpAgentMessage[]);
    expect(() => seam.run(input)).not.toThrow(); // graceful degrade — never a mutation throw
  });
});

describe('F6 · opencode adapter immutability (frozen seam input)', () => {
  it('transform hook does not mutate frozen input (write-back targets the platform copy)', async () => {
    const plugin = (await opencodeModule.server({} as PluginInput)) as unknown as {
      'experimental.chat.messages.transform': (i: unknown, o: { messages: OpencodeMessage[] }) => Promise<void>;
    };
    const frozen = deepFreeze([
      { role: 'user', parts: [{ type: 'text', text: frame('n4') }] },
      { role: 'user', parts: [{ type: 'text', text: 'probe body' }] },
    ] as OpencodeMessage[]);
    // The platform supplies the outgoing array (a copy of the session
    // messages); the frozen originals must stay untouched.
    const output = { messages: [...frozen] };
    await plugin['experimental.chat.messages.transform']({}, output);
    expect(frozen[1]?.parts?.[0]?.text).toBe('probe body');
  });
});
