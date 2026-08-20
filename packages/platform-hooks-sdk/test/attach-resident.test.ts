/**
 * Resident capability (sdk-hooks-capabilities) — the only resident
 * channel: `resident.use(config)` self-wires onto the default
 * `before_agent_start` canonical hook (explicit hook target overrides),
 * dual-face delivery (OMP fresh merge partial / opencode in-place
 * mutation), additive registration, unwire detach, unknown-hook loud
 * failure (MiddlewareHookError), fail-open. Pure — no I/O.
 *
 * @module
 */

import { describe, expect, it } from 'vitest';
import {
  MiddlewareHookError,
  createCapabilities,
  createHooks,
  type DeliveryContextService,
  type HookEvent,
  type Middleware,
  type ResidentPrompt,
} from '../src/index.js';
import { dispatchSync, spyDelivery } from './helpers/dispatch.js';

const content: readonly ResidentPrompt[] = [
  { id: 'pcl', title: 'PCL', text: 'status / progress / history' },
  { id: 'scenarios', title: 'Tool Discipline', text: 'find / read / write / verify / run' },
  { id: 'jcm', title: 'jcm-tools', text: 'resident guidance for the tool set' },
];

/** Run the composed before_agent_start chain with the given ctx + payload (config captured at use() time). */
function runBeforeAgentStart(
  chain: readonly Middleware[],
  ctx: DeliveryContextService,
  payload: { systemPrompt?: readonly string[]; system?: readonly string[]; [key: string]: unknown },
): unknown {
  return dispatchSync(chain, { name: 'before_agent_start', payload } as unknown as HookEvent, ctx);
}

describe('resident capability', () => {
  it('self-wires the default before_agent_start seam and applies the block (OMP systemPrompt face)', () => {
    const hooks = createHooks();
    const { resident } = createCapabilities(hooks);
    resident.use({ content });
    expect(hooks.before_agent_start.chain).toHaveLength(1);
    const { ctx } = spyDelivery();
    const result = runBeforeAgentStart(hooks.before_agent_start.chain, ctx, {
      systemPrompt: ['existing'],
    });
    expect(result !== null && typeof result === 'object' && 'systemPrompt' in result).toBe(true);
    const applied = (result as { systemPrompt: string[] }).systemPrompt;
    expect(applied[0]).toBe('existing');
    expect(applied[1]).toContain('## Resident Prompts');
    expect(applied[1]).toContain('[resident] PCL: status / progress / history');
    expect(applied[1]).toContain('[resident] jcm-tools: resident guidance');
  });

  it('applies the block via in-place mutation on the opencode system face', () => {
    const hooks = createHooks();
    const { resident } = createCapabilities(hooks);
    resident.use({ content });
    const { ctx, mutate } = spyDelivery();
    runBeforeAgentStart(hooks.before_agent_start.chain, ctx, { system: ['existing'] });
    expect(mutate).toHaveBeenCalledTimes(1);
    const [target, key, value] = mutate.mock.calls[0]!;
    expect(target).toBe('output');
    expect(key).toBe('system');
    expect(value[0]).toBe('existing');
    expect(value[1]).toContain('[resident] PCL:');
  });

  it('registers on any canonical hook (explicit hook target override)', () => {
    const hooks = createHooks();
    const { resident } = createCapabilities(hooks);
    resident.use({ content }, 'context');
    resident.use({ content }, 'user_input');
    expect(hooks.context.chain).toHaveLength(1);
    expect(hooks.user_input.chain).toHaveLength(1);
    // behavior on a non-default hook: the OMP systemPrompt face still applies
    const { ctx } = spyDelivery();
    const result = dispatchSync(
      hooks.context.chain,
      { name: 'context', payload: { systemPrompt: ['base'] } } as unknown as HookEvent,
      ctx,
    );
    const applied = (result as { systemPrompt: string[] }).systemPrompt;
    expect(applied[0]).toBe('base');
    expect(applied[1]).toContain('[resident] PCL:');
  });

  it('unknown hook fails loudly with a named error', () => {
    const hooks = createHooks();
    const { resident } = createCapabilities(hooks);
    const bogus = 'not-a-hook' as never;
    expect(() => resident.use({ content }, bogus)).toThrow(MiddlewareHookError);
    expect(() => resident.use({ content }, bogus)).toThrow(/Unknown canonical event: not-a-hook/);
  });

  it('repeated registration concatenates handler chains (additive, no shadowing)', () => {
    const hooks = createHooks();
    const { resident } = createCapabilities(hooks);
    resident.use({ content });
    resident.use({ content });
    expect(hooks.before_agent_start.chain).toHaveLength(2);
    const { ctx, mutate } = spyDelivery();
    runBeforeAgentStart(hooks.before_agent_start.chain, ctx, { system: ['base'] });
    // Both registrations run — each middleware applies the fresh block to
    // the base (opencode face mutates the output surface; the chain result
    // is void).
    expect(mutate).toHaveBeenCalledTimes(2);
    for (const call of mutate.mock.calls) {
      const value = call[2] as string[];
      expect(value[0]).toBe('base');
      expect(value.filter((s) => s.includes('[resident]'))).toHaveLength(1);
    }
  });

  it('unwire detaches the wiring', () => {
    const hooks = createHooks();
    const { resident } = createCapabilities(hooks);
    const unwire = resident.use({ content });
    unwire();
    expect(hooks.before_agent_start.chain).toHaveLength(0);
    const { ctx, mutate } = spyDelivery();
    const result = runBeforeAgentStart(hooks.before_agent_start.chain, ctx, { system: ['base'] });
    expect(result).toBeUndefined();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('dedup applies the block exactly once across repeated builds (self-heal)', () => {
    const hooks = createHooks();
    const { resident } = createCapabilities(hooks);
    resident.use({ content });
    const { ctx } = spyDelivery();
    const first = runBeforeAgentStart(hooks.before_agent_start.chain, ctx, {
      systemPrompt: ['base'],
    });
    const applied = (first as { systemPrompt: string[] }).systemPrompt;
    // Second build with the byte-equal block → dedup: no change, no delivery.
    const second = runBeforeAgentStart(hooks.before_agent_start.chain, ctx, { systemPrompt: applied });
    expect(second).toBeUndefined();
    expect(applied.filter((s) => s.includes('[resident]'))).toHaveLength(1);
  });

  it('odd payload shapes fail open (no throw, no delivery)', () => {
    const hooks = createHooks();
    const { resident } = createCapabilities(hooks);
    resident.use({ content });
    const { ctx, mutate } = spyDelivery();
    // A payload with neither system nor systemPrompt is treated as an
    // empty OMP system prompt — block-only injection, never a throw.
    expect(() => runBeforeAgentStart(hooks.before_agent_start.chain, ctx, { unrelated: true })).not.toThrow();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('a throwing delivery never throws into the dispatch (fail-open)', () => {
    const hooks = createHooks();
    const { resident } = createCapabilities(hooks);
    resident.use({ content });
    const ctx = {
      notify: () => undefined,
      appendEntry: () => undefined,
      mutate: () => {
        throw new Error('delivery exploded');
      },
    } as unknown as DeliveryContextService;
    expect(() => runBeforeAgentStart(hooks.before_agent_start.chain, ctx, { system: ['base'] })).not.toThrow();
  });

  it('emits a notify FeedbackLine by default on successful attachment', () => {
    const hooks = createHooks();
    const { resident } = createCapabilities(hooks);
    resident.use({ content });
    const { ctx, notify } = spyDelivery();
    runBeforeAgentStart(hooks.before_agent_start.chain, ctx, { systemPrompt: ['base'] });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('## Resident Prompts'));
  });

  it('feedback: false disables emission while the block still attaches', () => {
    const hooks = createHooks();
    const { resident } = createCapabilities(hooks);
    resident.use({ content, feedback: false });
    const { ctx, notify } = spyDelivery();
    const result = runBeforeAgentStart(hooks.before_agent_start.chain, ctx, {
      systemPrompt: ['base'],
    });
    expect(notify).not.toHaveBeenCalled();
    expect(result !== null && typeof result === 'object' && 'systemPrompt' in result).toBe(true);
  });

  it('dedup attachment emits no feedback (no change → no line)', () => {
    const hooks = createHooks();
    const { resident } = createCapabilities(hooks);
    resident.use({ content });
    const { ctx, notify } = spyDelivery();
    const first = runBeforeAgentStart(hooks.before_agent_start.chain, ctx, {
      systemPrompt: ['base'],
    });
    const applied = (first as { systemPrompt: string[] }).systemPrompt;
    notify.mockClear();
    runBeforeAgentStart(hooks.before_agent_start.chain, ctx, { systemPrompt: applied });
    expect(notify).not.toHaveBeenCalled();
  });
});
