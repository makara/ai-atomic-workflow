/**
 * Tests for types.ts — compile-time type validation for DTO shapes and internal types.
 * Runtime assertions check field presence on sample objects.
 */
import { describe, expect, it } from 'vitest';
import type {
  ConfigError,
  GraphDefinitionError,
  InvalidStateError,
  NodeState,
  NotFoundError,
  PersistenceError,
  Phase,
  SchedulerError,
} from '../src/types.js';

// Internal types
describe('Internal type shapes', () => {
  it('NodeState with all fields', () => {
    const ns: NodeState = {
      runId: 'run-1',
      status: 'done',
      retryCount: 0,
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:00:01.000Z',
    };
    expect(ns.status).toBe('done');
    expect(ns.retryCount).toBe(0);
    expect(ns.completedAt).toBe('2026-01-01T00:00:01.000Z');
  });

  it('NodeState minimal — only required fields', () => {
    const ns: NodeState = {
      runId: 'run-1',
      status: 'pending',
      retryCount: 0,
    };
    expect(ns.status).toBe('pending');
  });

  it('Phase shape for topology use', () => {
    const p: Phase = {
      id: 'agent-a',
      type: 'main',
      dependsOn: ['phase-0'],
      mode: 'exclusive',

      operations: [],
    };
    expect(p.id).toBe('agent-a');
    expect(p.type).toBe('main');
    expect(p.dependsOn).toEqual(['phase-0']);
  });

  it('Phase retry field is removed — unknown surface, never typed (loud rejection)', () => {
    const p: Phase = {
      id: 'gate-1',
      type: 'main',
      mode: 'exclusive',

      operations: [],
    };
    // retry is declared unknown for schema-level loud rejection — accessing it
    // as a config object must go through the unknown escape hatch
    expect((p as unknown as { retry?: unknown }).retry).toBeUndefined();
    expect((p as unknown as { retry?: { max: number } }).retry).toBeUndefined();
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
