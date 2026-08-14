/**
 * PROBE E — R4 fidelity: dual-face existence (native tier).
 * opencode face (graph-fidelity) = presence assertions;
 * OMP face (npm pi-coding-agent) = NATIVE TIER assertions: the `context`
 * seam (per-call message rewrite), `compaction.supersedeReads` (default-on),
 * and `dropUseless` — per signal-distribution seam map. The
 * former "OMP face absent / platform capability boundary" assertion is
 * REMOVED (it was a false negative: it searched for the repo's own plugin
 * symbol names instead of platform seams). Deleted symbols
 * (`buildFidelityPlan`, `SUPERSEDED_MARKER` — dedup machinery, ADR 0170)
 * are asserted ABSENT: no stale pin may reference them.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { assertion, recordIo, verifyOutput, type ProbeAssertion } from './io';

const assertions: ProbeAssertion[] = [];

const here = fileURLToPath(new URL('.', import.meta.url));
const platformRoot = path.resolve(here, '../../../node_modules/@oh-my-pi/pi-coding-agent');

const cfTransform = path.resolve(here, '../../graph-fidelity-context/src/context-management/transform.ts');
const cfReduce = path.resolve(here, '../../graph-fidelity-context/src/context-management/reduce.ts');
const cfMarkers = path.resolve(here, '../../graph-fidelity-context/src/context-management/markers.ts');
const ompRunner = path.join(platformRoot, 'src/extensibility/extensions/runner.ts');
const ompSettings = path.join(platformRoot, 'src/config/settings-schema.ts');
const ompMaintenance = path.join(platformRoot, 'src/session/session-maintenance.ts');

const cfSrc = fs.existsSync(cfTransform) ? fs.readFileSync(cfTransform, 'utf8') : '';
const reduceSrc = fs.existsSync(cfReduce) ? fs.readFileSync(cfReduce, 'utf8') : '';
const markersSrc = fs.existsSync(cfMarkers) ? fs.readFileSync(cfMarkers, 'utf8') : '';
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
        fidelityCandidates: cfSrc.includes('fidelityCandidates'),
        errorMarker: cfSrc.includes('ERROR_MARKER'),
        markerText: markersSrc.includes('[input removed due to failed tool call]'),
        buildFidelityPlanAbsent: !cfSrc.includes('buildFidelityPlan'),
        supersededMarkerAbsent: !cfSrc.includes('SUPERSEDED_MARKER'),
      },
      ompNativeTier: {
        contextSeam: runnerSrc.includes('emitContext'),
        supersedeReads: settingsSrc.includes('supersedeReads'),
        dropUseless: settingsSrc.includes('dropUseless'),
        staleResultPass: maintenanceSrc.includes('pruneStaleToolResults'),
      },
      nativeTier:
        'R4 on the OMP face = platform native tier (context seam + supersedeReads default-on + dropUseless) per signal-distribution seam map; graph-side consumed elision is NOT shipped (ADR 0170) — errored-result reduction + class-driven compression are the shipped graph-side fidelity',
    },
    assertions,
  );
  verifyOutput('e-r4-fidelity', assertions);
});

describe('PROBE E — R4 fidelity: dual-face existence (native tier)', () => {
  it('R4 · opencode face present (graph-fidelity): fidelity primitives complete', () => {
    const checks = [
      ['fidelityCandidates', cfSrc.includes('fidelityCandidates')],
      ['ERROR_MARKER import', cfSrc.includes('ERROR_MARKER')],
      ['marker text at markers.ts', markersSrc.includes('[input removed due to failed tool call]')],
      ['buildFidelityPlan ABSENT (deleted, ADR 0170)', !cfSrc.includes('buildFidelityPlan')],
      ['SUPERSEDED_MARKER ABSENT (deleted, ADR 0170)', !cfSrc.includes('SUPERSEDED_MARKER')],
    ] as const;
    for (const [name, present] of checks) {
      assertions.push(assertion(`opencode face: ${name}`, present, name.includes('reduce') ? cfReduce : cfTransform));
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
      ['supersedeReads default-on', /"compaction\.supersedeReads"[\s\S]{0,120}?default:\s*true/.test(settingsSrc)],
      ['dropUseless', settingsSrc.includes('dropUseless')],
      ['per-turn stale-result pass', maintenanceSrc.includes('pruneStaleToolResults')],
    ] as const;
    for (const [name, present] of checks) {
      assertions.push(assertion(`OMP native tier: ${name}`, present, ompSettings));
      expect(present, `OMP native tier: ${name}`).toBe(true);
    }
  });
});
