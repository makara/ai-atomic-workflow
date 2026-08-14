/**
 * SignalLifecycle interface tests — the interface is the test surface
 * (codebase-design): the single implementation is exercised through the
 * contract for both platform faces' frame-selection contracts (OMP
 * all-roles, opencode user-like-first — role-order parameterization,
 * ADR 0176 F2).
 *
 * @module
 */

import { describe, expect, it } from 'vitest';
import { OMP_SHAPE, ompMessageText, type OmpAgentMessage } from '../../src/adapters/omp.js';
import { OPENCODE_SHAPE, opencodeMessageText, type OpencodeMessage } from '../../src/adapters/opencode.js';
import { createSignalLifecycle } from '../../src/interfaces/signal-lifecycle.js';

const FRAME = '## Run Frame\nRun abc · node n1 · 1/3';

function ompMessage(role: string, text: string): OmpAgentMessage {
  return { role, content: text };
}

function opencodeMessage(role: string, text: string): OpencodeMessage {
  return { role, parts: [{ type: 'text', text }] };
}

describe('SignalLifecycle — assembly', () => {
  it('normalizes OMP platform messages to the echo contract', () => {
    const lifecycle = createSignalLifecycle();
    const messages = [ompMessage('user', FRAME), ompMessage('assistant', 'work')];
    const echoMessages = lifecycle.assembly({ messages, shape: OMP_SHAPE });
    expect(echoMessages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(echoMessages.map((m) => m.text)).toEqual([FRAME, 'work']);
  });

  it('normalizes opencode platform messages (info.role first)', () => {
    const lifecycle = createSignalLifecycle();
    const messages = [
      opencodeMessage('user', FRAME),
      { info: { role: 'assistant' }, parts: [{ type: 'text', text: 'work' }] },
    ];
    const echoMessages = lifecycle.assembly({ messages, shape: OPENCODE_SHAPE });
    expect(echoMessages.map((m) => m.role)).toEqual(['user', 'assistant']);
  });
});

describe('SignalLifecycle — echo', () => {
  it('appends the identity echo to the latest user-like message (changed)', () => {
    const lifecycle = createSignalLifecycle();
    const echoMessages = [
      { role: 'user', text: FRAME },
      { role: 'assistant', text: 'work' },
    ];
    const out = lifecycle.echo({ messages: echoMessages, frameTexts: [FRAME, 'work'] });
    expect(out.changed).toBe(true);
    const appended = out.messages[0]?.text ?? '';
    expect(appended).toContain('▣ [seam] node n1 · 1/3');
  });

  it('is a no-op without an anchored frame (changed false, passthrough)', () => {
    const lifecycle = createSignalLifecycle();
    const echoMessages = [{ role: 'user', text: 'no frame here' }];
    const out = lifecycle.echo({ messages: echoMessages, frameTexts: ['no frame here'] });
    expect(out.changed).toBe(false);
    expect(out.messages).toEqual(echoMessages);
  });

  it('dedups the canonical line (second call changed false)', () => {
    const lifecycle = createSignalLifecycle();
    const echoMessages = [{ role: 'user', text: FRAME }];
    const first = lifecycle.echo({ messages: echoMessages, frameTexts: [FRAME] });
    expect(first.changed).toBe(true);
    const second = lifecycle.echo({ messages: first.messages, frameTexts: [FRAME] });
    expect(second.changed).toBe(false);
  });

  it('role ordering selects the user-like frame (opencode contract) over the all-roles latest', () => {
    const lifecycle = createSignalLifecycle();
    // Latest frame belongs to assistant; an earlier frame belongs to user.
    const echoMessages = [
      { role: 'user', text: '## Run Frame\nRun a · node earlier' },
      { role: 'assistant', text: '## Run Frame\nRun b · node later' },
    ];
    const userLike = lifecycle.echo({
      messages: echoMessages,
      frameTexts: echoMessages.map((m) => m.text ?? ''),
      frameRoles: { roles: new Set(['user']), roleOf: ['user', 'assistant'] },
    });
    expect(userLike.messages[0]?.text).toContain('node earlier');
    // All-roles (OMP contract) — latest frame wins regardless of role.
    const allRoles = lifecycle.echo({ messages: echoMessages, frameTexts: echoMessages.map((m) => m.text ?? '') });
    expect(allRoles.messages[1]?.text).toContain('node later');
  });
});

describe('SignalLifecycle — restore', () => {
  it('round-trips a changed transcript back to platform shapes (OMP)', () => {
    const lifecycle = createSignalLifecycle();
    const platform = [ompMessage('user', FRAME), ompMessage('assistant', 'work')];
    const echoMessages = lifecycle.assembly({ messages: platform, shape: OMP_SHAPE });
    const out = lifecycle.echo({ messages: echoMessages, frameTexts: platform.map((m) => ompMessageText(m) ?? '') });
    const restored = lifecycle.restore({ messages: platform, echoMessages, result: out.messages, shape: OMP_SHAPE });
    expect(restored[0]?.content).toContain('▣ [seam] node n1 · 1/3');
    expect(restored[1]?.content).toBe('work');
  });

  it('round-trips a changed transcript back to platform shapes (opencode)', () => {
    const lifecycle = createSignalLifecycle();
    const platform = [opencodeMessage('user', FRAME), opencodeMessage('assistant', 'work')];
    const echoMessages = lifecycle.assembly({ messages: platform, shape: OPENCODE_SHAPE });
    const out = lifecycle.echo({
      messages: echoMessages,
      frameTexts: platform.map((m) => opencodeMessageText(m) ?? ''),
      frameRoles: { roles: new Set(['user']), roleOf: ['user', 'assistant'] },
    });
    expect(out.changed).toBe(true);
    const restored = lifecycle.restore({
      messages: platform,
      echoMessages,
      result: out.messages,
      shape: OPENCODE_SHAPE,
    });
    const joined = (restored[0]?.parts ?? []).map((p) => p.text ?? '').join('\n');
    expect(joined).toContain('▣ [seam] node n1 · 1/3');
  });
});

describe('SignalLifecycle — injection', () => {
  it('appends the resident block once (changed true, then false)', () => {
    const lifecycle = createSignalLifecycle();
    const first = lifecycle.injection({ systemPrompts: ['base'] });
    expect(first.changed).toBe(true);
    expect(first.systemPrompts.join('\n')).toContain('## Resident Prompts');
    const second = lifecycle.injection({ systemPrompts: first.systemPrompts });
    expect(second.changed).toBe(false);
  });
});

describe('SignalLifecycle — reserved phases', () => {
  it('leaves landing/settlement/observation unbound on the base implementation', () => {
    const lifecycle = createSignalLifecycle();
    expect(lifecycle.landing).toBeUndefined();
    expect(lifecycle.settlement).toBeUndefined();
    expect(lifecycle.observation).toBeUndefined();
  });
});
