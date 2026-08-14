/**
 * Interface-layer contract tests — the Schema contracts are the shape
 * source of the SignalLifecycle / DisplayFeedback interface surface
 * (ADR 0176 Q2): payloads crossing the interface validate against the
 * contracts. The schemas are never on the runtime echo path — this test
 * suite is their only consumer surface.
 *
 * @module
 */

import { Schema as S } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  AuditRecordContract,
  CONTRACT_SCHEMAS,
  EchoMessageContract,
  FrameRefContract,
  HintResultContract,
  PclMarkContract,
} from '../../src/interfaces/contracts.js';

describe('interface data contracts (Schema)', () => {
  it('echoMessage contract validates a canonical crossing payload', () => {
    const payload = { role: 'user', text: '## Run Frame\nRun abc · node n1' };
    expect(S.decodeUnknownSync(EchoMessageContract)(payload)).toEqual(payload);
    // Extra fields are tolerated (structural subset contract).
    expect(
      S.decodeUnknownSync(EchoMessageContract)({ ...payload, isToolResult: true, toolResultIds: ['t1'] }),
    ).toMatchObject({ isToolResult: true, toolResultIds: ['t1'] });
  });

  it('frameRef contract carries the progress segment optionally', () => {
    const withProgress = { index: 3, runId: 'abc', nodeId: 'n1', progress: '1/3' };
    expect(S.decodeUnknownSync(FrameRefContract)(withProgress)).toEqual(withProgress);
    const legacy = { index: 3, runId: 'abc', nodeId: 'n1' };
    expect(S.decodeUnknownSync(FrameRefContract)(legacy).progress).toBeUndefined();
  });

  it('pclMark contract validates the observability audit payload', () => {
    expect(S.decodeUnknownSync(PclMarkContract)({ text: 'status', matched: 'status' })).toEqual({
      text: 'status',
      matched: 'status',
    });
  });

  it('auditRecord contract validates type + payload records', () => {
    const record = { type: 'graph-fidelity.pcl', payload: { text: 'status', matched: 'status' } };
    expect(S.decodeUnknownSync(AuditRecordContract)(record)).toEqual(record);
  });

  it('hintResult contract validates the hints crossing payload', () => {
    expect(S.decodeUnknownSync(HintResultContract)({ kind: 'serena', text: 'next time use serena' })).toEqual({
      kind: 'serena',
      text: 'next time use serena',
    });
    expect(S.decodeUnknownSync(HintResultContract)({ kind: 'jcodemunch', text: 'x' }).kind).toBe('jcodemunch');
  });

  it('contract registry exposes every contract (single validation surface)', () => {
    expect(Object.keys(CONTRACT_SCHEMAS)).toEqual(['echoMessage', 'frameRef', 'pclMark', 'auditRecord', 'hintResult']);
  });
});
