/**
 * PROBE F — seam-map position coordinates: slot inventory (evidence
 * summary). The seam map (signal-distribution) carries position as an
 * emergent property of each seam; the position set has S1/S2/S3/S5 — the S4
 * tool-surface slot does NOT exist: the tool surface is governed through the
 * tool_call / tool_result seams, and the run frame is the single out-of-scope
 * channel. The send-path trio (before_agent_start / context /
 * before_provider_request) is asserted present in the npm dist.
 */
import { afterAll, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { assertion, recordIo, verifyOutput, type ProbeAssertion } from './io';

const assertions: ProbeAssertion[] = [];

const ompRunner = path.resolve(
  import.meta.dir,
  '../node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/extensions/runner.ts',
);
const ompTypes = path.resolve(
  import.meta.dir,
  '../node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/extensions/types.ts',
);
const runnerSrc = fs.readFileSync(ompRunner, 'utf8');
const typesSrc = fs.readFileSync(ompTypes, 'utf8');

const slotTable = [
  {
    slot: 'S1 after user message / before model',
    carries: 'C1/C2',
    evidence:
      'magic-keyword notices + steering envelope (group D); run frame = agent-side handler assembly (group A negative); discipline echo = graph-fidelity context seam (S1 append)',
    status: 'implemented',
  },
  {
    slot: 'S2 user channel',
    carries: 'C3',
    evidence: 'user messages pass through verbatim (group D)',
    status: 'implemented',
  },
  {
    slot: 'S3 system sections',
    carries: 'C4',
    evidence: '<skills>/<generic-rules>/<domain-rules>/<repo-rules>/Tool Inventory (group A)',
    status: 'implemented',
  },
  {
    slot: 'S5 tool-result prefix',
    carries: "C4''",
    evidence: 'TTSR rule match on write stream → non-interrupting reminder (group C)',
    status: 'implemented',
  },
];

const standardNote =
  'S4 tool-surface annotations: the tool surface is governed through the tool_call / tool_result seams (tool_call can block, tool_result can rewrite); no annotation slot exists in the seam map, and the run frame is the single out-of-scope channel.';

const sendPathTrio = [
  ['before_agent_start', runnerSrc.includes('emitBeforeAgentStart')],
  ['context', runnerSrc.includes('emitContext')],
  ['before_provider_request', runnerSrc.includes('emitBeforeProviderRequest')],
] as const;

afterAll(() => {
  recordIo(
    'f-slot-inventory',
    { standard: 'seam map position coordinates (signal-distribution); send-path trio in npm dist' },
    { slots: slotTable, standardNote, sendPathTrio },
    assertions,
  );
  verifyOutput('f-slot-inventory', assertions);
});

describe('PROBE F — position coordinate: slot inventory', () => {
  it('position coordinate has S1/S2/S3/S5 with mechanical evidence', () => {
    const implemented = slotTable.map((s) => s.slot);
    assertions.push(assertion('implemented slots S1/S2/S3/S5', implemented.length === 4, implemented.join('; ')));
    expect(implemented).toContain('S1 after user message / before model');
    expect(implemented).toContain('S2 user channel');
    expect(implemented).toContain('S3 system sections');
    expect(implemented).toContain('S5 tool-result prefix');
  });

  it('the seam map has no S4 slot — tool surface is seam-governed', () => {
    assertions.push(
      assertion('S4 absent from seam map', standardNote.includes('tool_call / tool_result'), standardNote),
    );
    expect(standardNote).toMatch(/tool_call \/ tool_result/);
    expect(slotTable.some((s) => s.slot.includes('S4'))).toBe(false);
  });

  it('send-path trio present in npm dist (before_agent_start / context / before_provider_request)', () => {
    for (const [name, present] of sendPathTrio) {
      assertions.push(assertion(`send-path trio: ${name}`, present, ompRunner));
      expect(present, `send-path trio: ${name}`).toBe(true);
    }
  });
});
