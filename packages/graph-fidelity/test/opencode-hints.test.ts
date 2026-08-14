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
import pluginModule from '../src/adapters/opencode.js';

/** Mock plugin input — the narrow surface the factory reads. */
const mockInput = { directory: '/tmp', client: { tool: { ids: async () => [] } } } as never;

type AfterHook = (input: never, output: { title: string; output: string; metadata: unknown }) => Promise<void>;

async function hooks() {
  const plugin = pluginModule.server;
  return (await plugin(mockInput, {})) as { 'tool.execute.after'?: AfterHook };
}

describe('opencode hints — tool.execute.after attachment', () => {
  it('content-read result carries the serena hint; original output preserved', async () => {
    const after = (await hooks())['tool.execute.after'];
    expect(after).toBeDefined();
    const output = { title: 'read', output: 'ORIGINAL', metadata: {} };
    await after!({ tool: 'read', sessionID: 's1', callID: 'c1', args: { path: 'a.ts' } } as never, output);
    expect(output.output).toContain('ORIGINAL');
    expect(output.output).toContain('serena');
  });

  it('edit result carries the serena hint', async () => {
    const after = (await hooks())['tool.execute.after']!;
    const output = { title: 'edit', output: 'EDITED', metadata: {} };
    await after({ tool: 'edit', sessionID: 's1', callID: 'c1', args: { filePath: 'a.ts' } } as never, output);
    expect(output.output).toContain('serena');
  });

  it('locate result carries the jcodemunch hint', async () => {
    const after = (await hooks())['tool.execute.after']!;
    const output = { title: 'glob', output: 'FILES', metadata: {} };
    await after({ tool: 'glob', sessionID: 's1', callID: 'c1', args: {} } as never, output);
    expect(output.output).toContain('jcodemunch');
  });

  it('bash locate command result carries the jcodemunch hint', async () => {
    const after = (await hooks())['tool.execute.after']!;
    const output = { title: 'bash', output: 'OUT', metadata: {} };
    await after(
      { tool: 'bash', sessionID: 's1', callID: 'c1', args: { command: 'find . -name "*.ts"' } } as never,
      output,
    );
    expect(output.output).toContain('jcodemunch');
  });

  it('non-classified tool result stays untouched', async () => {
    const after = (await hooks())['tool.execute.after']!;
    const output = { title: 'task', output: 'R', metadata: {} };
    await after({ tool: 'task', sessionID: 's1', callID: 'c1', args: {} } as never, output);
    expect(output.output).toBe('R');
  });

  it('odd inputs never throw and never mutate', async () => {
    const after = (await hooks())['tool.execute.after']!;
    const output = { title: '', output: '', metadata: {} };
    await expect(after(undefined as never, output)).resolves.toBeUndefined();
    await expect(after({ tool: 42 } as never, output)).resolves.toBeUndefined();
    expect(output.output).toBe('');
  });

  it('content-embedded error output stays untouched', async () => {
    const after = (await hooks())['tool.execute.after']!;
    const output = { title: 'read', output: 'Command exited with code 2', metadata: {} };
    await after({ tool: 'read', sessionID: 's1', callID: 'c1', args: { path: 'a.ts' } } as never, output);
    expect(output.output).toBe('Command exited with code 2');
  });

  it('stdout-first exit-line shape stays untouched (bash failure)', async () => {
    const after = (await hooks())['tool.execute.after']!;
    const body = 'ls: /definitely-not-exist: No such file or directory\n\nCommand exited with code 1';
    const output = { title: 'bash', output: body, metadata: {} };
    await after(
      { tool: 'bash', sessionID: 's1', callID: 'c1', args: { command: 'ls /definitely-not-exist' } } as never,
      output,
    );
    expect(output.output).toBe(body);
  });

  it('non-string output fails open and never throws', async () => {
    const after = (await hooks())['tool.execute.after']!;
    // The SDK contract types `output` as string; odd/missing shapes are
    // platform-edge cases the hook must survive — widen locally, cast at
    // the boundary (same pattern as the `as never` input above).
    const output: { title: string; output?: string; metadata: unknown } = { title: 'read', metadata: {} };
    await expect(
      after({ tool: 'read', sessionID: 's1', callID: 'c1', args: { path: 'a.ts' } } as never, output as never),
    ).resolves.toBeUndefined();
    // Fail-open: attachment proceeds per the hint class — the hint text
    // lands in the output (no throw, no silent drop via the catch).
    expect(output.output).toContain('serena');
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
      } as never,
      output,
    );
    expect(output.output).toBe('OK');
  });

  it('rtk-prefixed bash locate result carries the jcodemunch hint', async () => {
    const after = (await hooks())['tool.execute.after']!;
    const output = { title: 'bash', output: 'OUT', metadata: {} };
    await after({ tool: 'bash', sessionID: 's1', callID: 'c1', args: { command: 'rtk ls src' } } as never, output);
    expect(output.output).toContain('jcodemunch');
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
      } as never,
      output,
    );
    expect(output.output).toBe('EDITED');
  });
});
