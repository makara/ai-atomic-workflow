/**
 * opencode hints face pins — `tool.execute.after` carries the hint
 * attachment: the post-execution result hook appends user-level routing
 * guidance to the result output BEFORE it reaches the LLM (platform
 * contract: the hook mutates the output object in place, `{title,
 * output, metadata}`). Append-only (original result output preserved),
 * fail-open (odd shapes untouched, never throws into the platform
 * loop).
 *
 * Seam-under-test: the factory's returned hooks (mock PluginInput).
 *
 * @module
 */

import { describe, expect, it } from 'vitest';
import pluginModule from '../src/adapter-opencode.js';
import { SCENARIO_HINT_BLOCKS } from '../src/hints.js';

/** Scenario id → block convenience lookup over the single-source array. */
const blockById = Object.fromEntries(SCENARIO_HINT_BLOCKS.map((block) => [block.id, block])) as Record<
  string,
  (typeof SCENARIO_HINT_BLOCKS)[number]
>;

/** Mock plugin input — the narrow surface the factory reads. */
const mockInput = { directory: '/tmp', client: { tool: { ids: async () => [] } } } as never;

type AfterHook = (input: never, output: { title: string; output: string; metadata: unknown }) => Promise<void>;

async function hooks() {
  const plugin = pluginModule.server;
  return (await plugin(mockInput, {})) as { 'tool.execute.after'?: AfterHook };
}

describe('opencode hints — tool.execute.after attachment', () => {
  it('content-read result carries the jcodemunch hint; original output preserved', async () => {
    const after = (await hooks())['tool.execute.after'];
    expect(after).toBeDefined();
    const output = { title: 'read', output: 'ORIGINAL', metadata: {} };
    // Canonical contract (ADR 0193): the input carries the output surface
    // (`{ tool, args, output: { title, output, metadata } }`) — canonical
    // `content` = the output string; the handler mutates the hook output.
    await after!(
      {
        tool: 'read',
        sessionID: 's1',
        callID: 'c1',
        args: { path: 'a.ts' },
        output: { title: 'read', output: 'ORIGINAL', metadata: {} },
      } as never,
      output,
    );
    expect(output.output).toContain('ORIGINAL');
    expect(output.output).toContain(
      'Hint: DO NOT use read; use 1) get_file_outline {repo: "owner/name", file_path: "src/app.py"}',
    );
    expect(output.output).toContain(
      'get_symbol_source {repo: "owner/name", symbol_id: "src/app.py::parse_config#function"}',
    );
  });

  it('edit result carries the serena hint (DO-NOT form)', async () => {
    const after = (await hooks())['tool.execute.after']!;
    const output = { title: 'edit', output: 'EDITED', metadata: {} };
    await after(
      {
        tool: 'edit',
        sessionID: 's1',
        callID: 'c1',
        args: { filePath: 'a.ts' },
        output: { title: 'edit', output: 'EDITED', metadata: {} },
      } as never,
      output,
    );
    expect(output.output).toContain(
      'Hint: DO NOT use write/edit; use 1) get_blast_radius {repo: "owner/name", symbol: "parse_config", depth: 1}',
    );
    expect(output.output).toContain('register_edit {repo: "owner/name", file_paths: ["src/foo.ts"]}');
  });

  it('dual-form serena write results are compliant — output untouched (hint-tool-context)', async () => {
    const after = (await hooks())['tool.execute.after']!;
    for (const toolName of ['serena_replace_content', 'mcp__serena_replace_content']) {
      const output = { title: toolName, output: 'REPLACED', metadata: {} };
      await after(
        {
          tool: toolName,
          sessionID: 's1',
          callID: 'c1',
          args: { filePath: 'a.ts' },
          output: { title: toolName, output: 'REPLACED', metadata: {} },
        } as never,
        output,
      );
      expect(output.output).toBe('REPLACED');
    }
  });

  it('native write result carries the write scenario hint', async () => {
    const after = (await hooks())['tool.execute.after']!;
    const output = { title: 'edit', output: 'EDITED', metadata: {} };
    await after(
      {
        tool: 'edit',
        sessionID: 's1',
        callID: 'c1',
        args: { filePath: 'a.ts' },
        output: { title: 'edit', output: 'EDITED', metadata: {} },
      } as never,
      output,
    );
    expect(output.output).toContain(
      'Hint: DO NOT use write/edit; use 1) get_blast_radius {repo: "owner/name", symbol: "parse_config", depth: 1}',
    );
    expect(output.output).toContain('register_edit {repo: "owner/name", file_paths: ["src/foo.ts"]}');
  });

  it('locate result carries the jcodemunch hint (DO-NOT form)', async () => {
    const after = (await hooks())['tool.execute.after']!;
    const output = { title: 'glob', output: 'FILES', metadata: {} };
    await after(
      {
        tool: 'glob',
        sessionID: 's1',
        callID: 'c1',
        args: {},
        output: { title: 'glob', output: 'FILES', metadata: {} },
      } as never,
      output,
    );
    expect(output.output).toContain(
      'Hint: DO NOT use grep/glob; use 1) search_text {repo: "owner/name", query: "TODO|FIXME"',
    );
    expect(output.output).toContain('search_symbols {repo: "owner/name", query: "parse config", kind: "function"}');
  });

  it('bash locate command result carries the jcodemunch hint (names the locate command)', async () => {
    const after = (await hooks())['tool.execute.after']!;
    const output = { title: 'bash', output: 'OUT', metadata: {} };
    await after(
      {
        tool: 'bash',
        sessionID: 's1',
        callID: 'c1',
        args: { command: 'find . -name "*.ts"' },
        output: { title: 'bash', output: 'OUT', metadata: {} },
      } as never,
      output,
    );
    expect(output.output).toContain(
      'Hint: DO NOT use grep/glob; use 1) search_text {repo: "owner/name", query: "TODO|FIXME"',
    );
    expect(output.output).toContain('search_symbols {repo: "owner/name", query: "parse config", kind: "function"}');
  });

  it('non-classified tool result stays untouched', async () => {
    const after = (await hooks())['tool.execute.after']!;
    const output = { title: 'task', output: 'R', metadata: {} };
    await after(
      {
        tool: 'task',
        sessionID: 's1',
        callID: 'c1',
        args: {},
        output: { title: 'task', output: 'R', metadata: {} },
      } as never,
      output,
    );
    expect(output.output).toBe('R');
  });

  it('odd inputs fail loudly with the named decode error and never mutate (R-SDK2)', async () => {
    const after = (await hooks())['tool.execute.after']!;
    const output = { title: '', output: '', metadata: {} };
    // The adapter-boundary Schema decode is the single validation point —
    // malformed platform payloads throw the named CanonicalError (loud,
    // never a silent drop, ADR 0199); the output surface stays untouched.
    await expect(after(undefined as never, output)).rejects.toThrow(/Canonical payload decode failed/);
    await expect(after({ tool: 42 } as never, output)).rejects.toThrow(/Canonical payload decode failed/);
    expect(output.output).toBe('');
  });

  it('content-embedded error output stays untouched', async () => {
    const after = (await hooks())['tool.execute.after']!;
    const output = { title: 'read', output: 'Command exited with code 2', metadata: {} };
    await after(
      {
        tool: 'read',
        sessionID: 's1',
        callID: 'c1',
        args: { path: 'a.ts' },
        output: { title: 'read', output: 'Command exited with code 2', metadata: {} },
      } as never,
      output,
    );
    expect(output.output).toBe('Command exited with code 2');
  });

  it('stdout-first exit-line shape stays untouched (bash failure)', async () => {
    const after = (await hooks())['tool.execute.after']!;
    const body = 'ls: /definitely-not-exist: No such file or directory\n\nCommand exited with code 1';
    const output = { title: 'bash', output: body, metadata: {} };
    await after(
      {
        tool: 'bash',
        sessionID: 's1',
        callID: 'c1',
        args: { command: 'ls /definitely-not-exist' },
        output: { title: 'bash', output: body, metadata: {} },
      } as never,
      output,
    );
    expect(output.output).toBe(body);
  });

  it('non-string content fails open and never throws', async () => {
    const after = (await hooks())['tool.execute.after']!;
    // Canonical `content` = input.output.output; an odd/missing shape is a
    // platform-edge case the hook must survive — fail open WITHOUT
    // clobbering the (unknown) original output.
    const output: { title: string; output?: string; metadata: unknown } = { title: 'read', metadata: {} };
    await expect(
      after(
        { tool: 'read', sessionID: 's1', callID: 'c1', args: { path: 'a.ts' }, output: { output: 42 } } as never,
        output as never,
      ),
    ).resolves.toBeUndefined();
    expect(output.output).toBeUndefined();
  });

  it('xd:// proxy route results stay untouched', async () => {
    const after = (await hooks())['tool.execute.after']!;
    const output = { title: 'write', output: 'OK', metadata: {} };
    await after(
      {
        tool: 'write',
        sessionID: 's1',
        callID: 'c1',
        args: { path: 'xd://mcp__graph_scheduler_graph_advance' },
        output: { title: 'write', output: 'OK', metadata: {} },
      } as never,
      output,
    );
    expect(output.output).toBe('OK');
  });

  it('rtk-prefixed bash locate result carries the jcodemunch hint (names the locate command)', async () => {
    const after = (await hooks())['tool.execute.after']!;
    const output = { title: 'bash', output: 'OUT', metadata: {} };
    await after(
      {
        tool: 'bash',
        sessionID: 's1',
        callID: 'c1',
        args: { command: 'rtk ls src' },
        output: { title: 'bash', output: 'OUT', metadata: {} },
      } as never,
      output,
    );
    expect(output.output).toContain(
      'Hint: DO NOT use grep/glob; use 1) search_text {repo: "owner/name", query: "TODO|FIXME"',
    );
    expect(output.output).toContain('search_symbols {repo: "owner/name", query: "parse config", kind: "function"}');
  });

  it('edit filePath internal-URI route stays untouched', async () => {
    const after = (await hooks())['tool.execute.after']!;
    const output = { title: 'edit', output: 'EDITED', metadata: {} };
    await after(
      {
        tool: 'edit',
        sessionID: 's1',
        callID: 'c1',
        args: { filePath: 'skill://my-skill/SKILL.md' },
        output: { title: 'edit', output: 'EDITED', metadata: {} },
      } as never,
      output,
    );
    expect(output.output).toBe('EDITED');
  });
});
