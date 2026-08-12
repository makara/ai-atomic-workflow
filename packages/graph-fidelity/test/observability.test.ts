import { describe, expect, it, vi } from 'vitest';
import { wireObservability, type OmpObservabilityApi } from '../src/adapters/omp.js';
import { createAccumulator } from '../src/core/facts.js';

function stubApi() {
  const handlers = new Map<string, (event: never) => unknown>();
  const entries: Array<{ type: string; data?: unknown }> = [];
  // Test-scaffold exemption: ExtensionAPI.on carries 40+ typed event
  // overloads — a full stub is impractical; the cast is confined to the
  // test seam and the wiring surface is a real Pick of the platform type.
  const api = {
    on: (event: string, handler: (event: never) => unknown) => {
      handlers.set(event, handler);
    },
    appendEntry: (customType: string, data?: unknown) => {
      entries.push({ type: customType, data });
    },
  } as unknown as OmpObservabilityApi;
  return { api, handlers, entries };
}

describe('observability accumulation', () => {
  it('accumulates usage facts from message_end', () => {
    const { api, handlers } = stubApi();
    const accumulator = wireObservability(api);
    const handler = handlers.get('message_end');
    expect(handler).toBeTypeOf('function');
    (handler as (e: never) => unknown)({
      message: { usage: { input: 100, cacheRead: 50, cacheWrite: 20 } },
    } as never);
    (handler as (e: never) => unknown)({
      message: { usage: { input: 200, cacheRead: 0, cacheWrite: 30 } },
    } as never);
    expect(accumulator.read()).toEqual({
      requests: 2,
      inputTokens: 300,
      cacheReadTokens: 50,
      cacheWriteTokens: 50,
      compactions: 0,
      ttsrTriggers: 0,
      toolExecutions: 0,
    });
  });

  it('counts compaction ends and ttsr triggers', () => {
    const { api, handlers } = stubApi();
    const accumulator = wireObservability(api);
    (handlers.get('auto_compaction_end') as (e: never) => unknown)({} as never);
    (handlers.get('auto_compaction_end') as (e: never) => unknown)({} as never);
    (handlers.get('ttsr_triggered') as (e: never) => unknown)({} as never);
    expect(accumulator.read().compactions).toBe(2);
    expect(accumulator.read().ttsrTriggers).toBe(1);
  });

  it('counts tool executions from tool_execution_start', () => {
    const { api, handlers } = stubApi();
    const accumulator = wireObservability(api);
    const handler = handlers.get('tool_execution_start');
    expect(handler).toBeTypeOf('function');
    (handler as (e: never) => unknown)({ toolName: 'bash' } as never);
    (handler as (e: never) => unknown)({ toolName: 'read' } as never);
    expect(accumulator.read().toolExecutions).toBe(2);
  });

  it('persists facts via appendEntry without touching LLM context', () => {
    const { api, handlers, entries } = stubApi();
    wireObservability(api);
    (handlers.get('message_end') as (e: never) => unknown)({
      message: { usage: { input: 10 } },
    } as never);
    expect(entries.length).toBe(1);
    expect(entries[0].type).toBe('graph-fidelity.observability');
    expect((entries[0].data as { requests: number }).requests).toBe(1);
  });

  it('starts empty and merges partial records', () => {
    const accumulator = createAccumulator();
    expect(accumulator.read()).toEqual({
      requests: 0,
      inputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      compactions: 0,
      ttsrTriggers: 0,
      toolExecutions: 0,
    });
    accumulator.record({ requests: 1 });
    accumulator.record({ compactions: 2 });
    expect(accumulator.read().requests).toBe(1);
    expect(accumulator.read().compactions).toBe(2);
  });

  it('does not inject any message content', () => {
    const { api, handlers } = stubApi();
    const appendSpy = vi.spyOn(api, 'appendEntry');
    wireObservability(api);
    (handlers.get('ttsr_triggered') as (e: never) => unknown)({} as never);
    // appendEntry is the only context-visible surface exercised — events
    // never produce message content through wireObservability.
    expect(appendSpy).toHaveBeenCalledTimes(1);
  });
});
