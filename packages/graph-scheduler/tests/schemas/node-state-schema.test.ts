/**
 * Unit tests for NodeStateSchema — zod schema for per-node execution state snapshot.
 *
 * TDD red phase: NodeStateSchema does not exist yet. These tests define the expected
 * API contract. Phase 3 implementation should make all tests pass.
 */
import { describe, expect, it } from 'vitest';
import { NodeStateSchema, type NodeState } from '../../src/schemas/node-state.js';

// ---------------------------------------------------------------------------
// Happy path — valid status values
// ---------------------------------------------------------------------------

describe('NodeStateSchema — happy path', () => {
  it('parses pending status', () => {
    const raw = { runId: 'run-1', status: 'pending', retryCount: 0 };
    const result = NodeStateSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('pending');
    }
  });

  it('parses active status', () => {
    const raw = {
      runId: 'run-1',
      status: 'active',
      retryCount: 1,
      startedAt: '2026-07-26T00:00:00.000Z',
    };
    const result = NodeStateSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('active');
      expect(result.data.startedAt).toBeDefined();
    }
  });

  it('parses done status', () => {
    const raw = {
      runId: 'run-1',
      status: 'done',
      retryCount: 0,
      completedAt: '2026-07-26T00:05:00.000Z',
      durationMs: 5000,
    };
    const result = NodeStateSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('done');
    }
  });

  it('parses blocked status', () => {
    const raw = {
      runId: 'run-1',
      retryCount: 3,
      status: 'blocked',
    };
    const result = NodeStateSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('blocked');
    }
  });

  it('parses skipped status', () => {
    const raw = { runId: 'run-1', status: 'skipped', retryCount: 0 };
    const result = NodeStateSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('skipped');
    }
  });
});

// ---------------------------------------------------------------------------
// Invalid input
// ---------------------------------------------------------------------------

describe('NodeStateSchema — invalid input', () => {
  it('rejects invalid status value', () => {
    const raw = { runId: 'run-1', status: 'unknown', retryCount: 0 };
    const result = NodeStateSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects status that is not a string', () => {
    const raw = { runId: 'run-1', status: 99, retryCount: 0 };
    const result = NodeStateSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects missing runId', () => {
    const raw = { status: 'pending', retryCount: 0 };
    const result = NodeStateSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects runId that is not a string', () => {
    const raw = { runId: null, status: 'pending', retryCount: 0 };
    const result = NodeStateSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects missing retryCount', () => {
    const raw = { runId: 'run-1', status: 'pending' };
    const result = NodeStateSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects retryCount that is not a number', () => {
    const raw = { runId: 'run-1', status: 'pending', retryCount: 'zero' };
    const result = NodeStateSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects non-object input', () => {
    expect(NodeStateSchema.safeParse('hello').success).toBe(false);
    expect(NodeStateSchema.safeParse(123).success).toBe(false);
    expect(NodeStateSchema.safeParse(null).success).toBe(false);
    expect(NodeStateSchema.safeParse(undefined).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Boundary conditions
// ---------------------------------------------------------------------------

describe('NodeStateSchema — boundary', () => {
  it('allows absent optional fields', () => {
    const raw = { runId: 'run-1', status: 'done', retryCount: 0 };
    const result = NodeStateSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.completedAt).toBeUndefined();
      expect(result.data.durationMs).toBeUndefined();
      expect(result.data.startedAt).toBeUndefined();
    }
  });

  it('allows zero retryCount', () => {
    const raw = { runId: 'run-1', status: 'pending', retryCount: 0 };
    const result = NodeStateSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.retryCount).toBe(0);
    }
  });

  it('allows negative retryCount (no range validation by default)', () => {
    const raw = { runId: 'run-1', status: 'pending', retryCount: -1 };
    const result = NodeStateSchema.safeParse(raw);
    // z.number() allows negative values by default
    expect(result.success).toBe(true);
  });

  it('allows durationMs as zero', () => {
    const raw = {
      runId: 'run-1',
      status: 'done',
      retryCount: 0,
      durationMs: 0,
    };
    const result = NodeStateSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.durationMs).toBe(0);
    }
  });
});
