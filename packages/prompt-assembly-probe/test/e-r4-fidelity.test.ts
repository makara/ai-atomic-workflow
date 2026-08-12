/**
 * PROBE E — R4 fidelity: dual-face existence (native tier).
 * opencode face (graph-fidelity) = presence assertions;
 * OMP face (npm pi-coding-agent) = NATIVE TIER assertions: the `context`
 * seam (per-call message rewrite), `compaction.supersedeReads` (default-on),
 * and `dropUseless` — per signal-distribution seam map. The
 * former "OMP face absent / platform capability boundary" assertion is
 * REMOVED (it was a false negative: it searched for the repo's own plugin
 * symbol names instead of platform seams).
 */
import { afterAll, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { assertion, recordIo, verifyOutput, type ProbeAssertion } from './io';

const assertions: ProbeAssertion[] = [];

const cfTransform = path.resolve(import.meta.dir, '../../graph-fidelity/src/core/transform.ts');
const ompRunner = path.resolve(
  import.meta.dir,
  '../node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/extensions/runner.ts',
);
const ompSettings = path.resolve(
  import.meta.dir,
  '../node_modules/@oh-my-pi/pi-coding-agent/src/config/settings-schema.ts',
);
const ompMaintenance = path.resolve(
  import.meta.dir,
  '../node_modules/@oh-my-pi/pi-coding-agent/src/session/session-maintenance.ts',
);

const cfSrc = fs.existsSync(cfTransform) ? fs.readFileSync(cfTransform, 'utf8') : '';
const runnerSrc = fs.readFileSync(ompRunner, 'utf8');
const settingsSrc = fs.readFileSync(ompSettings, 'utf8');
const maintenanceSrc = fs.readFileSync(ompMaintenance, 'utf8');

afterAll(() => {
  recordIo(
    'e-r4-fidelity',
    {
      opencodeFace: cfTransform,
      ompFace: [
        'src/extensibility/extensions/runner.ts (context seam)',
        'src/config/settings-schema.ts (supersedeReads / dropUseless)',
        'src/session/session-maintenance.ts (per-turn stale-result pass)',
      ],
    },
    {
      opencode: {
        buildFidelityPlan: cfSrc.includes('buildFidelityPlan'),
        applySessionFidelity: cfSrc.includes('applySessionFidelity'),
        errorMarker: cfSrc.includes('ERROR_MARKER'),
        markerText: cfSrc.includes('[input removed due to failed tool call]'),
      },
      ompNativeTier: {
        contextSeam: runnerSrc.includes('emitContext'),
        supersedeReads: settingsSrc.includes('supersedeReads'),
        dropUseless: settingsSrc.includes('dropUseless'),
        staleResultPass: maintenanceSrc.includes('pruneStaleToolResults'),
      },
      nativeTier:
        'R4 on the OMP face = platform native tier (context seam + supersedeReads default-on + dropUseless) per signal-distribution seam map; graph-side consumed elision is a graph-fidelity optional seam',
    },
    assertions,
  );
  verifyOutput('e-r4-fidelity', assertions);
});

describe('PROBE E — R4 fidelity: dual-face existence (native tier)', () => {
  it('R4 · opencode face present (graph-fidelity): fidelity primitives complete', () => {
    const checks = [
      ['buildFidelityPlan', cfSrc.includes('buildFidelityPlan')],
      ['applySessionFidelity', cfSrc.includes('applySessionFidelity')],
      ['ERROR_MARKER', cfSrc.includes('ERROR_MARKER')],
      ['marker text', cfSrc.includes('[input removed due to failed tool call]')],
    ] as const;
    for (const [name, present] of checks) {
      assertions.push(assertion(`opencode face: ${name}`, present, cfTransform));
      expect(present, `opencode face: ${name}`).toBe(true);
    }
  });

  it('R4 · OMP native tier: context seam present (per-call message rewrite)', () => {
    const present = runnerSrc.includes('emitContext');
    assertions.push(assertion('OMP native tier: context seam (emitContext)', present, ompRunner));
    expect(present).toBe(true);
  });

  it('R4 · OMP native tier: supersedeReads + dropUseless settings present', () => {
    const checks = [
      ['supersedeReads', settingsSrc.includes('supersedeReads')],
      ['dropUseless', settingsSrc.includes('dropUseless')],
      ['per-turn stale-result pass', maintenanceSrc.includes('pruneStaleToolResults')],
    ] as const;
    for (const [name, present] of checks) {
      assertions.push(assertion(`OMP native tier: ${name}`, present, ompSettings));
      expect(present, `OMP native tier: ${name}`).toBe(true);
    }
  });
});
