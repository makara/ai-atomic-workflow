/**
 * OMP hints face pins — the registered post-execution `tool_result` hook
 * carries the hint attachment: each successful tool execution gets the
 * user-level guidance appended as an extra text block BEFORE the result
 * reaches the LLM. Append-only (original content preserved), once per
 * execution (event-level — zero state, no re-attachment on replay),
 * fail-open (odd shapes pass through unchanged; nothing throws into the
 * platform loop). Error results attach nothing.
 *
 * Canonical payload (ADR 0193): the SDK normalizes the platform event to
 * `{ toolName, content, isError }` with invocation args riding the
 * canonical payload on both faces (round-2 review fix) — classification
 * reads args where present, so the bash CLI first-token class fires on
 * this face too (see the bash CLI locate test below).
 *
 * @module
 */

import { describe, expect, it } from 'vitest';
import ompExtension from '../src/adapter-omp.js';
import { SCENARIO_HINT_BLOCKS } from '../src/hints.js';

/** Scenario id → block convenience lookup over the single-source array. */
const blockById = Object.fromEntries(SCENARIO_HINT_BLOCKS.map((block) => [block.id, block])) as Record<
  string,
  (typeof SCENARIO_HINT_BLOCKS)[number]
>;

/** Platform-faithful tool_result event (structural subset). */
interface ToolResultEventShape {
  type: 'tool_result';
  toolName: string;
  toolCallId: string;
  input: Record<string, unknown>;
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
  /** Canonical error verdict — platform isError folds in at adapter normalization. */
  errorShaped?: boolean;
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
async function runToolResult(
  handlers: Map<string, (event: never) => unknown>,
  event: ToolResultEventShape,
): Promise<Array<{ type: string; text?: string }> | undefined> {
  const handler = handlers.get('tool_result');
  if (handler === undefined) throw new Error('tool_result handler not registered');
  const out = (await handler(event as never)) as { content?: Array<{ type: string; text?: string }> } | undefined;
  return out?.content;
}

function textOf(content: Array<{ type: string; text?: string }>): string {
  return content.map((b) => b.text ?? '').join('\n');
}

describe('OMP hints — tool_result hook attachment (platform-evidenced shape)', () => {
  it('write result carries the rendered write scenario hint as an appended text block; original preserved', async () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    const content = await runToolResult(handlers, resultEvent('write', { path: 'src/a.ts' }));
    expect(content).toBeDefined();
    // original + one write scenario block (single block per scenario)
    expect(content?.length).toBe(2);
    expect(content?.[0]).toEqual({ type: 'text', text: 'ORIGINAL' });
    const text = textOf(content!);
    expect(text).toContain('replace_content {relative_path: "src/foo.ts"');
    expect(text).toContain('register_edit {repo: "owner/name", file_paths: ["src/foo.ts"]}');
    expect(text).toContain('DO NOT use write/edit');
  });

  it('dual-form serena write results are compliant — no hint attaches (hint-tool-context)', async () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    for (const toolName of ['serena_replace_content', 'mcp__serena_replace_content']) {
      const content = await runToolResult(handlers, resultEvent(toolName, { filePath: 'src/a.ts' }));
      expect(content).toBeUndefined();
    }
  });

  it('native write result carries the rendered write scenario hint', async () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    const content = await runToolResult(handlers, resultEvent('edit', { path: 'src/a.ts' }));
    expect(content).toBeDefined();
    const text = textOf(content!);
    expect(text).toContain('replace_content {relative_path: "src/foo.ts"');
    expect(text).toContain('register_edit {repo: "owner/name", file_paths: ["src/foo.ts"]}');
  });

  it('content-read result carries the rendered read hint (DO-NOT read-surface form)', async () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    const content = await runToolResult(handlers, resultEvent('read', { path: 'src/a.ts' }));
    expect(content).toBeDefined();
    const text = textOf(content!);
    expect(text).toContain('get_file_outline {repo: "owner/name", file_path: "src/app.py"}');
    expect(text).toContain('DO NOT use read');
  });

  it('locate result carries the rendered find hint (DO-NOT locate form)', async () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    const content = await runToolResult(handlers, resultEvent('glob', { pattern: '**/*.ts' }));
    expect(content).toBeDefined();
    const text = textOf(content!);
    expect(text).toContain('search_text {repo: "owner/name", query: "TODO|FIXME"');
    expect(text).toContain('DO NOT use grep/glob');
  });

  it('bash CLI locate commands attach the hint on OMP — invocation args ride the canonical payload', async () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    // The canonical tool_result payload carries the invocation args on
    // both faces (ADR 0193 round-2 review fix); the CLI-locate class
    // fires from the first command token.
    expect(await runToolResult(handlers, resultEvent('bash', { command: 'find . -name "*.ts"' }))).toBeDefined();
  });

  it('non-classified tool result passes through unchanged', async () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    expect(await runToolResult(handlers, resultEvent('task', { task: 'x' }))).toBeUndefined();
  });

  it('failed execution (isError) attaches nothing — verdict folds at normalization', async () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    // Platform shape: the OMP event carries isError; the adapter folds it
    // into the canonical errorShaped verdict — the single-verdict guard
    // covers both (no separate isError check at the attachment site).
    const event: ToolResultEventShape = {
      type: 'tool_result',
      toolName: 'read',
      toolCallId: 'c1',
      input: { path: 'a.ts' },
      content: [{ type: 'text', text: 'ERROR' }],
      isError: true,
    };
    expect(await runToolResult(handlers, event)).toBeUndefined();
  });

  it('content-embedded error results attach nothing', async () => {
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
    expect(await runToolResult(handlers, event)).toBeUndefined();
  });

  it('stdout-first exit-line results attach nothing (bash failure)', async () => {
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
    expect(await runToolResult(handlers, event)).toBeUndefined();
  });

  it('xd:// proxy route results skip on OMP — args restored, the internal-URI skip fires', async () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    // The internal-URI skip reads args.path/filePath; the canonical
    // tool_result payload carries the invocation args on BOTH faces
    // (ADR 0193 round-2 review fix), so xd:// routes are protected here.
    expect(
      await runToolResult(handlers, resultEvent('write', { path: 'xd://mcp__graph_scheduler_graph_advance' })),
    ).toBeUndefined();
    expect(await runToolResult(handlers, resultEvent('read', { path: 'xd://mcp__serena_read_file' }))).toBeUndefined();
  });

  it('rtk-wrapped locate commands attach the hint on OMP (wrapper strip fires)', async () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    // firstTokenOf strips the rtk/proxy wrapper — the effective command
    // token drives the CLI-locate class (same behavior as opencode).
    expect(await runToolResult(handlers, resultEvent('bash', { command: 'rtk ls src' }))).toBeDefined();
  });

  it('odd shapes (non-array content) never throw and pass through', async () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    const handler = handlers.get('tool_result');
    expect(handler).toBeDefined();
    const odd = { type: 'tool_result', toolName: 'read', toolCallId: 'c1', input: {} } as never;
    expect(() => handler?.(odd)).not.toThrow();
  });

  it('attachment is per-execution and stateless — replaying an event yields the same single append', async () => {
    const { api, handlers } = stubApi();
    ompExtension(api);
    const event = resultEvent('read', { path: 'a.ts' });
    const first = await runToolResult(handlers, event);
    const second = await runToolResult(handlers, event);
    expect(first?.length).toBe(2);
    expect(second).toEqual(first);
  });
});
