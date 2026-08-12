/**
 * PROBE A — R1 selection / R2 placement (C4/S3): buildSystemPrompt input→output
 * section placement. Keyed need × axis × slot: R1 · axis-3 S3 · input entry;
 * R2 · axis-3 S3 · section slot.
 */
import { buildSystemPrompt } from '@oh-my-pi/pi-coding-agent/system-prompt';
import { afterAll, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { assertion, recordIo, verifyOutput, type ProbeAssertion } from './io';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-a-'));
const ctxFile = { path: path.join(tempDir, 'AGENTS.md'), content: 'PROBE-DISCIPLINE-LINE', depth: 0 };
const rulebook = [
  {
    name: 'probe-book-rule',
    description: 'probe rulebook description',
    path: '/tmp/probe-book.md',
    globs: ['**/*.ts'],
  },
];
const alwaysApply = [
  {
    name: 'probe-always-rule',
    content: 'probe-always-content MUST follow',
    path: '/tmp/probe-always.md',
  },
];
const skills = [
  {
    name: 'probe-skill',
    path: '/tmp/probe-skill.md',
    content: '# probe skill',
    level: 'project' as const,
    _source: { provider: 'probe', providerName: 'probe', path: '/tmp/probe-skill.md', level: 'project' as const },
  },
];
const toolNames = ['read', 'bash', 'edit', 'write'];

const assertions: ProbeAssertion[] = [];

afterAll(() => {
  recordIo(
    'a-section-placement',
    { ctxFile, rulebook, alwaysApply, skills: skills.map((s) => s.name), toolNames },
    { renderedBlocks: 2, sections: ['skills', 'generic-rules', 'domain-rules', 'repo-rules', 'Tool Inventory'] },
    assertions,
  );
  verifyOutput('a-section-placement', assertions);
});

describe('PROBE A — R1 selection + R2 placement (C4/S3)', () => {
  it('R1 · axis-3 S3 · all declared inputs enter the prompt', async () => {
    const { systemPrompt } = await buildSystemPrompt({
      cwd: tempDir,
      contextFiles: [ctxFile],
      rules: rulebook,
      alwaysApplyRules: alwaysApply,
      skills,
      toolNames,
      personality: 'none',
      includeWorkspaceTree: false,
    });
    const rendered = systemPrompt.join('\n\n');
    for (const [name, needle, found] of [
      ['context file enters prompt', 'PROBE-DISCIPLINE-LINE', rendered.includes('PROBE-DISCIPLINE-LINE')],
      [
        'rulebook description enters prompt',
        'probe rulebook description',
        rendered.includes('probe rulebook description'),
      ],
      [
        'always-apply content enters prompt',
        'probe-always-content MUST follow',
        rendered.includes('probe-always-content MUST follow'),
      ],
      ['skill enters prompt', 'probe-skill', rendered.includes('probe-skill')],
    ] as const) {
      assertions.push(assertion(name, found, `needle: ${needle}`));
      expect(found, name).toBe(true);
    }
  });

  it('R2 · axis-3 S3 · each input lands in its standard slot', async () => {
    const { systemPrompt } = await buildSystemPrompt({
      cwd: tempDir,
      contextFiles: [ctxFile],
      rules: rulebook,
      alwaysApplyRules: alwaysApply,
      skills,
      toolNames,
      personality: 'none',
      includeWorkspaceTree: false,
    });
    const rendered = systemPrompt.join('\n\n');
    const checks = [
      [
        'always-apply → <generic-rules>',
        /<generic-rules>[\s\S]*probe-always-content[\s\S]*<\/generic-rules>/.test(rendered),
      ],
      [
        'rulebook → <domain-rules>',
        /<domain-rules>[\s\S]*probe rulebook description[\s\S]*<\/domain-rules>/.test(rendered),
      ],
      ['skills → <skills>', /<skills>[\s\S]*probe-skill[\s\S]*<\/skills>/.test(rendered)],
      ['context file → <repo-rules>', /<repo-rules>[\s\S]*PROBE-DISCIPLINE-LINE[\s\S]*<\/repo-rules>/.test(rendered)],
      ['tools → Tool Inventory', /# Tool Inventory[\s\S]*`read`/.test(rendered)],
    ] as const;
    for (const [name, pass] of checks) {
      assertions.push(assertion(name, pass, 'section-tag regex'));
      expect(pass, name).toBe(true);
    }
  });

  it('R5 · axis-1 C2 · negative: no run frame in platform output (frame = agent-side assembly)', async () => {
    const { systemPrompt } = await buildSystemPrompt({
      cwd: tempDir,
      contextFiles: [],
      rules: [],
      alwaysApplyRules: [],
      skills: [],
      toolNames,
      personality: 'none',
    });
    const rendered = systemPrompt.join('\n\n');
    const noFrame = !rendered.includes('User input during this node') && !rendered.includes('declared operations');
    assertions.push(assertion('no run frame in platform output', noFrame, 'frame is handler-assembled (agent-side)'));
    expect(noFrame).toBe(true);
  });
});
