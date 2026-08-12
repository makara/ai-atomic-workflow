/**
 * PROBE D — R5 authority: user-text reclassification (C3→C1) + steering
 * priority envelope + S2 verbatim pass-through.
 * Keyed R5 · axis-1 C1/C3 · axis-3 S1/S2.
 */
import { containsUltrathink, ULTRATHINK_NOTICE } from '@oh-my-pi/pi-coding-agent/modes/ultrathink';
import { wrapSteeringForModel } from '@oh-my-pi/pi-coding-agent/session/messages';
import { afterAll, describe, expect, it } from 'bun:test';
import { assertion, recordIo, verifyOutput, type ProbeAssertion } from './io';

const assertions: ProbeAssertion[] = [];

afterAll(() => {
  recordIo(
    'd-reclassification',
    { magicKeyword: 'ultrathink', steerInput: { role: 'user', steering: true, content: 'probe steer text' } },
    {
      reclassified: true,
      enveloped: true,
      verbatim: true,
      envelopeTag: '<system-notice> (npm 17.2.12)',
      deviation: 'envelope tag drift vs reference tree 17.1.x (different tag, same supersedes semantics)',
    },
    assertions,
  );
  verifyOutput('d-reclassification', assertions);
});

describe('PROBE D — R5 authority: reclassification law + priority envelope', () => {
  it('R5 · C3→C1 reclassification: prose hits magic keyword; code spans/fenced/XML excluded', () => {
    const prose = containsUltrathink('please ultrathink this design');
    const inlineCode = containsUltrathink('use `ultrathink` in docs');
    const fenced = containsUltrathink('```\nultrathink\n```');
    const xml = containsUltrathink('<system>ultrathink</system>');
    assertions.push(assertion('prose reclassified', prose, `containsUltrathink("please ultrathink…") = ${prose}`));
    assertions.push(
      assertion(
        'inline code span not reclassified',
        !inlineCode,
        `containsUltrathink("use \`ultrathink\` in docs") = ${inlineCode}`,
      ),
    );
    assertions.push(assertion('fenced block not reclassified', !fenced, `containsUltrathink(fenced) = ${fenced}`));
    assertions.push(assertion('xml section not reclassified', !xml, `containsUltrathink(<system>…) = ${xml}`));
    expect(prose).toBe(true);
    expect(inlineCode).toBe(false);
    expect(fenced).toBe(false);
    expect(xml).toBe(false);
    assertions.push(
      assertion(
        'notice content non-empty (S1 hidden notice)',
        ULTRATHINK_NOTICE.length > 0,
        `${ULTRATHINK_NOTICE.length} chars`,
      ),
    );
    expect(ULTRATHINK_NOTICE.length).toBeGreaterThan(0);
  });

  it('R5 · C1 priority envelope: steer message wrapped with supersedes claim (npm 17.2.12 tag = <system-notice>)', () => {
    const out = wrapSteeringForModel([{ role: 'user', steering: true, content: 'probe steer text' }]);
    const content = String(out[0].content);
    const enveloped =
      content.includes('<system-notice>') && /supersedes/i.test(content) && content.includes('probe steer text');
    assertions.push(assertion('steer enveloped with priority claim', enveloped, 'tag=<system-notice> (npm 17.2.12)'));
    expect(content).toContain('<system-notice>');
    expect(content).toMatch(/supersedes/i);
    expect(content).toContain('probe steer text');
  });

  it('R5 · C3 fidelity: non-steering user messages pass through verbatim (S2)', () => {
    const out = wrapSteeringForModel([{ role: 'user', content: 'plain user input' }]);
    const verbatim = out[0].content === 'plain user input';
    assertions.push(assertion('verbatim S2 pass-through', verbatim, String(out[0].content)));
    expect(out[0].content).toBe('plain user input');
  });
});
