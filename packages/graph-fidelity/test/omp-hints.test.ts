/**
 * OMP hints face pins — the registered post-execution `tool_result` hook
 * carries the hint attachment: each successful tool execution gets the
 * user-level guidance appended as an extra text block BEFORE the result
 * reaches the LLM. Append-only (original content preserved), once per
 * execution (event-level — zero state, no re-attachment on replay),
 * fail-open (odd shapes pass through unchanged; nothing throws into the
 * platform loop). Error results attach nothing.
 *
 * Platform-evidenced event shape (hooks.md:152-156; agent-loop.ts:
 * 2118-2122): `{ type: 'tool_result', toolName, toolCallId, input,
 * content: (Text|Image)[], isError }` — the call identity rides on the
 * EVENT, not on message blocks (the OMP message model stores results as
 * top-level `role: "toolResult"` messages).
 *
 * @module
 */

import { describe, expect, it } from 'vitest';
import ompExtension from '../src/adapters/omp.js';

/** Platform-faithful tool_result event (structural subset). */
interface ToolResultEventShape {
  type: 'tool_result';
  toolName: string;
  toolCallId: string;
  input: Record<string, unknown>;
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

/** Stub platform api — the narrow ExtensionAPI surface the factory uses. */
function stubApi() {
  const handlers = new Map<string, (event: never) => unknown>();
  const api = {
    on: (event: string, handler: (event: never) => unknown) => {
      handlers.set(event, handler);
    },
    appendEntry: () => undefined,
  } as never;
  return { api, handlers };
}

/** A successful tool_result event (platform shape). */
function resultEvent(toolName: string, input: Record<string, unknown>, text = 'ORIGINAL'): ToolResultEventShape {
  return { type: 'tool_result', toolName, toolCallId: 'c1', input, content: [{ type: 'text', text }], isError: false };
}

/** Run the registered tool_result handler; returns the content override (undefined = pass through). */
function runToolResult(
  handlers: Map<string, (event: never) => unknown>,
  event: ToolResultEventShape,
): Array<{ type: string; text?: string }> | undefined {
  const handler = handlers.get('tool_result');
  if (handler === undefined) throw new Error('tool_result handler not registered');
  const out = handler(event as never) as { content?: Array<{ type: string; text?: string }> } | undefined;
  return out?.content;
}

function textOf(content: Array<{ type: string; text?: string }>): string {
  return content.map((b) => b.text ?? '').join('\n');
}

describe('OMP hints — tool_result hook attachment (platform-evidenced shape)', () => {
  it('write result carries the serena hint as an appended text block; original preserved', () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    const content = runToolResult(handlers, resultEvent('write', { path: 'src/a.ts' }));
    expect(content).toBeDefined();
    expect(content?.length).toBe(2);
    expect(content?.[0]).toEqual({ type: 'text', text: 'ORIGINAL' });
    expect(textOf(content!)).toContain('serena');
  });

  it('content-read result carries the serena hint', () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    const content = runToolResult(handlers, resultEvent('read', { path: 'src/a.ts' }));
    expect(content).toBeDefined();
    expect(textOf(content!)).toContain('serena');
  });

  it('locate result carries the jcodemunch hint', () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    const content = runToolResult(handlers, resultEvent('glob', { pattern: '**/*.ts' }));
    expect(content).toBeDefined();
    expect(textOf(content!)).toContain('jcodemunch');
  });

  it('bash locate command result carries the jcodemunch hint', () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    const content = runToolResult(handlers, resultEvent('bash', { command: 'find . -name "*.ts"' }));
    expect(content).toBeDefined();
    expect(textOf(content!)).toContain('jcodemunch');
  });

  it('non-classified tool result passes through unchanged', () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    expect(runToolResult(handlers, resultEvent('task', { task: 'x' }))).toBeUndefined();
  });

  it('failed execution (isError) attaches nothing', () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    const event: ToolResultEventShape = {
      type: 'tool_result',
      toolName: 'read',
      toolCallId: 'c1',
      input: { path: 'a.ts' },
      content: [{ type: 'text', text: 'ERROR' }],
      isError: true,
    };
    expect(runToolResult(handlers, event)).toBeUndefined();
  });

  it('content-embedded error results attach nothing', () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    const event: ToolResultEventShape = {
      type: 'tool_result',
      toolName: 'read',
      toolCallId: 'c1',
      input: { path: 'a.ts' },
      content: [{ type: 'text', text: 'Invalid args for xd://mcp__serena_search_for_pattern: Validation failed' }],
      isError: false,
    };
    expect(runToolResult(handlers, event)).toBeUndefined();
  });

  it('stdout-first exit-line results attach nothing (bash failure)', () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    const event: ToolResultEventShape = {
      type: 'tool_result',
      toolName: 'bash',
      toolCallId: 'c1',
      input: { command: 'ls /definitely-not-exist' },
      content: [
        {
          type: 'text',
          text: 'ls: /definitely-not-exist: No such file or directory\n\nCommand exited with code 1',
        },
      ],
      isError: false,
    };
    expect(runToolResult(handlers, event)).toBeUndefined();
  });

  it('xd:// proxy route results attach nothing', () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    expect(
      runToolResult(handlers, resultEvent('write', { path: 'xd://mcp__graph_scheduler_graph_advance' })),
    ).toBeUndefined();
    expect(runToolResult(handlers, resultEvent('read', { path: 'xd://mcp__serena_read_file' }))).toBeUndefined();
  });

  it('rtk-prefixed bash locate results carry the jcodemunch hint', () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    const content = runToolResult(handlers, resultEvent('bash', { command: 'rtk ls src' }));
    expect(content).toBeDefined();
    expect(textOf(content!)).toContain('jcodemunch');
  });

  it('odd shapes (non-array content) never throw and pass through', () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    const handler = handlers.get('tool_result');
    expect(handler).toBeDefined();
    const odd = { type: 'tool_result', toolName: 'read', toolCallId: 'c1', input: {} } as never;
    expect(() => handler?.(odd)).not.toThrow();
  });

  it('attachment is per-execution and stateless — replaying an event yields the same single append', () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    const event = resultEvent('read', { path: 'a.ts' });
    const first = runToolResult(handlers, event);
    const second = runToolResult(handlers, event);
    expect(first?.length).toBe(2);
    expect(second).toEqual(first);
  });
});
