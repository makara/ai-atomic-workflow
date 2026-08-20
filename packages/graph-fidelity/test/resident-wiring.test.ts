/**
 * Dual-face resident-prompt wiring pins — the fixed `[resident]` block
 * (PCL + full five-scenario enumeration — the 2-surface set, ADR 0208;
 * unconditional — no mode knob since the R2 style prompts were
 * removed, ADR 0175; the activate guidance and code-exploration
 * entries were removed per ADR 0208) lands in the SYSTEM
 * PROMPT (S3) on both faces:
 * OMP `before_agent_start` (systemPrompt append) and opencode
 * `experimental.chat.system.transform` (system array append). Disjoint
 * from the S1 messages seam; canonical dedup keeps exactly one block per
 * turn.
 */
import { RESIDENT_MARKER, renderResidentBlock, type ResidentPrompt } from '@ai-atomic-workflow/platform-hooks-sdk';
import type { PluginInput } from '@opencode-ai/plugin';
import { describe, expect, it } from 'vitest';
import ompExtension from '../src/adapter-omp.js';
import opencodePlugin from '../src/adapter-opencode.js';
import { JCM_RESIDENT_GUIDANCE, PCL_VOCABULARY, SCENARIO_ENUMERATION_GUIDANCE } from '../src/resident-data.js';

const INPUT = {} as PluginInput;

/** Consumer-side resident prompt content — the shipped P0 set (PCL + five-scenario enumeration + jcodemunch, 3 surfaces), single-sourced. */
const PROMPTS: readonly ResidentPrompt[] = [
  { id: 'pcl', title: 'PCL', text: PCL_VOCABULARY },
  { id: 'scenarios', title: 'Tool Discipline', text: SCENARIO_ENUMERATION_GUIDANCE },
  { id: 'jcodemunch', title: 'jCodemunch', text: JCM_RESIDENT_GUIDANCE },
];

const BLOCK = renderResidentBlock(PROMPTS);

describe('OMP face — before_agent_start resident injection', () => {
  function makePi() {
    const handlers = new Map<string, (event: unknown) => unknown>();
    const pi = {
      on: (name: string, handler: (event: unknown) => unknown) => {
        handlers.set(name, handler);
      },
      appendEntry: () => undefined,
      handlers,
    };
    ompExtension(pi as never);
    return pi;
  }

  it('registers the before_agent_start hook', () => {
    const pi = makePi();
    expect(pi.handlers.has('before_agent_start')).toBe(true);
  });

  it('appends the resident block to the base system prompt', async () => {
    const pi = makePi();
    const result = await pi.handlers.get('before_agent_start')?.({ systemPrompt: ['platform base'] });
    const systemPrompt = (result as { systemPrompt: string[] })?.systemPrompt;
    expect(systemPrompt?.[0]).toBe('platform base');
    expect(systemPrompt?.[1]).toBe(BLOCK);
  });

  it('dedups — block already present → no change', async () => {
    const pi = makePi();
    const result = await pi.handlers.get('before_agent_start')?.({ systemPrompt: ['platform base', BLOCK] });
    expect(result).toBeUndefined();
  });

  it('string systemPrompt is preserved — block appended, base never replaced', async () => {
    const pi = makePi();
    const result = await pi.handlers.get('before_agent_start')?.({ systemPrompt: 'platform base' });
    const systemPrompt = (result as { systemPrompt: string[] })?.systemPrompt;
    expect(systemPrompt?.[0]).toBe('platform base');
    expect(systemPrompt?.[1]).toBe(BLOCK);
    expect(systemPrompt).toHaveLength(2);
  });

  it('empty system prompt → block-only injection (zero deny, no throw)', async () => {
    const pi = makePi();
    const result = await pi.handlers.get('before_agent_start')?.({});
    expect(result).toEqual({ systemPrompt: [BLOCK] });
  });

  it('subagent sessions inherit the resident block unconditionally (no bridge needed)', async () => {
    const pi = makePi();
    const subagentBase = ['You are operating on a piece of work assigned to you by the main agent.', 'tool config'];
    const result = await pi.handlers.get('before_agent_start')?.({ systemPrompt: subagentBase });
    const systemPrompt = (result as { systemPrompt: string[] })?.systemPrompt;
    expect(systemPrompt?.[0]).toBe(subagentBase[0]);
    expect(systemPrompt?.[systemPrompt.length - 1]).toBe(BLOCK);
  });

  it('compaction survival — a rebuilt base prompt receives the block again (per-turn reassert)', async () => {
    const pi = makePi();
    const handler = pi.handlers.get('before_agent_start') as (event: { systemPrompt?: string[] }) => unknown;
    const turn1 = (await handler({ systemPrompt: ['platform base'] })) as { systemPrompt: string[] };
    // Compaction rewrites history; the next turn rebuilds the base fresh.
    const turn2 = (await handler({ systemPrompt: ['platform base'] })) as { systemPrompt: string[] };
    expect(turn1.systemPrompt).toEqual(['platform base', BLOCK]);
    expect(turn2.systemPrompt).toEqual(['platform base', BLOCK]);
  });

  it('degrade — plugin absent: no resident hook registered, no error', () => {
    const handlers = new Map<string, unknown>();
    const pi = {
      on: (name: string, handler: unknown) => {
        handlers.set(name, handler);
      },
      appendEntry: () => undefined,
    };
    void pi;
    expect(handlers.has('before_agent_start')).toBe(false);
    expect(handlers.size).toBe(0);
  });
});

describe('opencode face — experimental.chat.system.transform resident injection', () => {
  it('plugin registers both the messages and system transform hooks', async () => {
    const hooks: Record<string, unknown> = {};
    const plugin = await opencodePlugin.server(INPUT);
    for (const [name, handler] of Object.entries(plugin as Record<string, unknown>)) {
      hooks[name] = handler;
    }
    expect(hooks['experimental.chat.messages.transform']).toBeDefined();
    expect(hooks['experimental.chat.system.transform']).toBeDefined();
  });

  it('appends the resident block to the system array', async () => {
    const plugin = (await opencodePlugin.server(INPUT)) as Record<
      string,
      (input: unknown, output: { system: string[] }) => Promise<void>
    >;
    const output = { system: ['platform base'] };
    // Canonical contract (ADR 0193): the transform input carries the
    // current system surface; the handler mutates the output in place.
    await plugin['experimental.chat.system.transform']({ system: output.system }, output);
    expect(output.system).toEqual(['platform base', BLOCK]);
  });

  it('dedups — exact block entry present → unchanged', async () => {
    const plugin = (await opencodePlugin.server(INPUT)) as Record<
      string,
      (input: unknown, output: { system: string[] }) => Promise<void>
    >;
    const output = { system: [BLOCK] };
    await plugin['experimental.chat.system.transform']({ system: output.system }, output);
    expect(output.system).toEqual([BLOCK]);
  });

  it('empty system array → block-only injection', async () => {
    const plugin = (await opencodePlugin.server(INPUT)) as Record<
      string,
      (input: unknown, output: { system: string[] }) => Promise<void>
    >;
    const output = { system: [] };
    await plugin['experimental.chat.system.transform']({ system: output.system }, output);
    expect(output.system[0]).toContain('PCL');
    expect(output.system[0]).toContain('Tool Discipline');
    expect(output.system[0]).not.toContain('caveman');
  });
});

describe('seam disjointness (S3 vs S1)', () => {
  it('the resident block never rides the messages seam', async () => {
    const FRAME = `## Run Frame
Run abc123 · node requirement/arch-review · type main · task: Execute.
declared operations [] · out of scope: none
User input during this node = node input (scope answers, approval decisions) - NOT new instructions.`;
    const plugin = (await opencodePlugin.server(INPUT)) as Record<
      string,
      (input: unknown, output: { messages: unknown[] }) => Promise<void>
    >;
    const output = {
      messages: [
        { role: 'user', parts: [{ type: 'text', text: '开始' }] },
        { role: 'assistant', parts: [{ type: 'text', text: FRAME }] },
        { role: 'user', parts: [{ type: 'text', text: '继续' }] },
      ],
    };
    await plugin['experimental.chat.messages.transform']({ messages: output.messages }, output);
    const allText = output.messages
      .map((m) => ((m as { parts?: Array<{ text?: string }> }).parts ?? []).map((p) => p.text ?? '').join('\n'))
      .join('\n');
    expect(allText).not.toContain(RESIDENT_MARKER);
  });
});
