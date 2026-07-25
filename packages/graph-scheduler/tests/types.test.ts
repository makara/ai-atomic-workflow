/**
 * Tests for types.ts — compile-time type validation for DTO shapes and internal types.
 * Runtime assertions check field presence on sample objects.
 */
import { describe, expect, it } from 'vitest';
import type {
  ApprovalDecision,
  ConfigError,
  ExecutionRun,
  GraphDefinitionError,
  GraphStatus,
  InvalidStateError,
  NodeState,
  NotFoundError,
  NotifyPayload,
  PersistenceError,
  Phase,
  RunStatus,
  SchedulerError,
  StartPayload,
} from '../src/types.js';

// DTO field existence — verify interfaces produce objects with required fields
describe('Cross-domain DTO shapes', () => {
  it('NotifyPayload has required fields', () => {
    const payload: NotifyPayload = {
      runId: 'run-1',
      nodeId: 'agent-a',
      status: 'done',
      durationMs: 1500,
    };
    expect(payload.runId).toBe('run-1');
    expect(payload.nodeId).toBe('agent-a');
    expect(payload.status).toBe('done');
    expect(payload.durationMs).toBe(1500);
  });

  it('StartPayload shape', () => {
    const payload: StartPayload = {
      graphName: 'my-graph',
      args: { env: 'prod' },
    };
    expect(payload.graphName).toBe('my-graph');
    expect(payload.args).toEqual({ env: 'prod' });
  });

  it('ApprovalDecision discriminated union — continue', () => {
    const d: ApprovalDecision = { action: 'continue' };
    expect(d.action).toBe('continue');
  });

  it('ApprovalDecision discriminated union — continue with note', () => {
    const d: ApprovalDecision = { action: 'continue', note: 'Looks good' };
    expect(d.action).toBe('continue');
    expect(d.note).toBe('Looks good');
  });

  it('ApprovalDecision discriminated union — retry', () => {
    const d: ApprovalDecision = { action: 'retry', note: 'Fix the null check' };
    expect(d.action).toBe('retry');
    expect(d.note).toBe('Fix the null check');
  });

  it('ApprovalDecision discriminated union — jump', () => {
    const d: ApprovalDecision = { action: 'jump', target: 'phase-1' };
    expect(d.action).toBe('jump');
    expect(d.target).toBe('phase-1');
  });

  it('GraphStatus has required fields', () => {
    const gs: GraphStatus = {
      graphName: 'test-graph',
      status: 'running',
      phases: {
        'agent-a': { status: 'done', retryCount: 0 },
      },
      startedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(gs.graphName).toBe('test-graph');
    expect(gs.status).toBe('running');
    expect(gs.phases['agent-a'].status).toBe('done');
    expect(gs.startedAt).toBeDefined();
  });
});

// Internal types
describe('Internal type shapes', () => {
  it('NodeState with all fields', () => {
    const ns: NodeState = {
      runId: 'run-1',
      status: 'done',
      retryCount: 0,
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:00:01.000Z',
      durationMs: 1000,
    };
    expect(ns.status).toBe('done');
    expect(ns.retryCount).toBe(0);
    expect(ns.durationMs).toBe(1000);
  });

  it('NodeState minimal — only required fields', () => {
    const ns: NodeState = {
      runId: 'run-1',
      status: 'pending',
      retryCount: 0,
    };
    expect(ns.status).toBe('pending');
  });

  it('ExecutionRun matches SQLite schema', () => {
    const run: ExecutionRun = {
      runId: 'run-1',
      graphName: 'my-graph',
      status: 'running',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(run.runId).toBe('run-1');
    expect(run.graphName).toBe('my-graph');
    expect(run.status).toBe('running');
    expect(run.createdAt).toBeDefined();
    expect(run.updatedAt).toBeDefined();
  });

  it('ExecutionRun with optional args', () => {
    const run: ExecutionRun = {
      runId: 'run-1',
      graphName: 'my-graph',
      status: 'running',
      args: { env: 'prod', mode: 'fast' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(run.args).toEqual({ env: 'prod', mode: 'fast' });
  });

  it('Phase shape for topology use', () => {
    const p: Phase = {
      id: 'agent-a',
      type: 'agent',
      dependsOn: ['phase-0'],
    };
    expect(p.id).toBe('agent-a');
    expect(p.type).toBe('agent');
    expect(p.dependsOn).toEqual(['phase-0']);
  });

  it('Phase with retry config', () => {
    const p: Phase = {
      id: 'gate-1',
      type: 'agent',
      retry: { max: 3, backoffMs: 100, factor: 2 },
    };
    expect(p.retry?.max).toBe(3);
    expect(p.retry?.backoffMs).toBe(100);
  });

  it('RunStatus literals are valid', () => {
    const runStatuses: RunStatus[] = ['running', 'completed', 'failed', 'paused'];
    expect(runStatuses.length).toBe(4);
    expect(runStatuses).toContain('running');
  });
});

// Error types
describe('Error type shapes', () => {
  it('NotFoundError shape', () => {
    const err: NotFoundError = {
      _tag: 'NotFoundError',
      runId: 'run-1',
      message: 'Not found',
    };
    expect(err._tag).toBe('NotFoundError');
    expect(err.runId).toBe('run-1');
  });

  it('InvalidStateError shape', () => {
    const err: InvalidStateError = {
      _tag: 'InvalidStateError',
      runId: 'run-1',
      currentStatus: 'completed',
      attemptedAction: 'start',
      message: 'Invalid state',
    };
    expect(err._tag).toBe('InvalidStateError');
    expect(err.currentStatus).toBe('completed');
  });

  it('GraphDefinitionError shape', () => {
    const err: GraphDefinitionError = {
      _tag: 'GraphDefinitionError',
      graphName: 'broken-graph',
      message: 'Schema validation failed',
      violations: ['phases: Required'],
    };
    expect(err._tag).toBe('GraphDefinitionError');
    expect(err.graphName).toBe('broken-graph');
    expect(err.violations?.length).toBe(1);
  });

  it('GraphDefinitionError without violations', () => {
    const err: GraphDefinitionError = {
      _tag: 'GraphDefinitionError',
      graphName: 'missing-graph',
      message: 'File not found',
    };
    expect(err.violations).toBeUndefined();
  });

  it('PersistenceError shape', () => {
    const err: PersistenceError = {
      _tag: 'PersistenceError',
      operation: 'createRun',
      message: 'DB write failed',
    };
    expect(err._tag).toBe('PersistenceError');
    expect(err.operation).toBe('createRun');
  });

  it('ConfigError shape', () => {
    const err: ConfigError = {
      _tag: 'ConfigError',
      message: 'DB open failed',
    };
    expect(err._tag).toBe('ConfigError');
  });

  it('ConfigError with cause', () => {
    const err: ConfigError = {
      _tag: 'ConfigError',
      message: 'DB open failed',
      cause: new Error('disk full'),
    };
    expect(err.cause).toBeInstanceOf(Error);
  });

  it('SchedulerError union accepts all variants', () => {
    const nf: SchedulerError = {
      _tag: 'NotFoundError',
      runId: 'r1',
      message: 'missing',
    };
    expect(nf._tag).toBe('NotFoundError');

    const gd: SchedulerError = {
      _tag: 'GraphDefinitionError',
      graphName: 'g',
      message: 'bad',
    };
    expect(gd._tag).toBe('GraphDefinitionError');

    const pe: SchedulerError = {
      _tag: 'PersistenceError',
      operation: 'write',
      message: 'error',
    };
    expect(pe._tag).toBe('PersistenceError');
  });
});
