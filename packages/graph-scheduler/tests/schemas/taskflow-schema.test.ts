/**
 * Unit tests for TaskflowSchema — zod schema for .taskflow.yaml graph definition.
 *
 * TDD red phase: TaskflowSchema does not exist yet. These tests define the expected
 * API contract. Phase 3 implementation should make all tests pass.
 */
import { describe, expect, it } from 'vitest';
import { TaskflowSchema, type Taskflow } from '../../src/schemas/taskflow.js';

// ---------------------------------------------------------------------------
// Happy path — complete valid .taskflow.yaml structure
// ---------------------------------------------------------------------------

describe('TaskflowSchema — happy path', () => {
  it('parses a complete taskflow with all optional fields', () => {
    const raw = {
      name: 'my-workflow',
      version: 1,
      phases: [
        {
          id: 'phase-1',
          type: 'agent',
          agent: 'default',
          task: 'Execute task A',
          context: ['file1.txt', 'file2.txt'],
          skill: 'custom-skill',
        },
        {
          id: 'phase-2',
          type: 'approval',
          task: 'Decide',
          dependsOn: ['phase-1'],
        },
      ],
    };

    const result = TaskflowSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('my-workflow');
      expect(result.data.phases).toHaveLength(2);
      expect(result.data.phases[0].id).toBe('phase-1');
    }
  });

  it('parses a minimal taskflow — phases only', () => {
    const raw = {
      phases: [{ id: 'p1', type: 'main', task: 'run' }],
    };

    const result = TaskflowSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBeUndefined();
      expect(result.data.phases).toHaveLength(1);
    }
  });

  it('parses taskflow with no optional phase fields', () => {
    const raw = {
      phases: [
        { id: 'p1', type: 'main' },
        { id: 'p2', type: 'agent' },
      ],
    };

    const result = TaskflowSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phases).toHaveLength(2);
    }
  });
});

// ---------------------------------------------------------------------------
// Invalid input — structural errors
// ---------------------------------------------------------------------------

describe('TaskflowSchema — invalid input', () => {
  it('rejects missing phases field', () => {
    const result = TaskflowSchema.safeParse({ name: 'test' });
    expect(result.success).toBe(false);
  });

  it('rejects phases that is not an array', () => {
    const result = TaskflowSchema.safeParse({ phases: 'not-an-array' });
    expect(result.success).toBe(false);
  });

  it('rejects phases that is null', () => {
    const result = TaskflowSchema.safeParse({ phases: null });
    expect(result.success).toBe(false);
  });

  it('rejects non-object input', () => {
    expect(TaskflowSchema.safeParse(null).success).toBe(false);
    expect(TaskflowSchema.safeParse(undefined).success).toBe(false);
    expect(TaskflowSchema.safeParse('string').success).toBe(false);
    expect(TaskflowSchema.safeParse(42).success).toBe(false);
    expect(TaskflowSchema.safeParse([]).success).toBe(false);
  });

  it('rejects phase without id', () => {
    const result = TaskflowSchema.safeParse({
      phases: [{ type: 'main' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects phase id that is not a string', () => {
    const result = TaskflowSchema.safeParse({
      phases: [{ id: 123, type: 'main' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects name that is not a string', () => {
    const result = TaskflowSchema.safeParse({
      name: 123,
      phases: [{ id: 'p1', type: 'main' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects version that is not a number', () => {
    const result = TaskflowSchema.safeParse({
      version: true,
      phases: [{ id: 'p1', type: 'main' }],
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Boundary conditions
// ---------------------------------------------------------------------------

describe('TaskflowSchema — boundary', () => {
  it('accepts version as string (lenient — z.union)', () => {
    const raw = {
      version: '1.0',
      phases: [{ id: 'p1', type: 'main', task: 'run' }],
    };
    expect(TaskflowSchema.safeParse(raw).success).toBe(true);
  });

  it('accepts version as number', () => {
    const raw = {
      version: 1,
      phases: [{ id: 'p1', type: 'main', task: 'run' }],
    };
    expect(TaskflowSchema.safeParse(raw).success).toBe(true);
  });

  it('accepts empty name string', () => {
    const raw = {
      name: '',
      phases: [{ id: 'p1', type: 'main', task: 'run' }],
    };
    expect(TaskflowSchema.safeParse(raw).success).toBe(true);
  });

  it('accepts empty phases array', () => {
    const raw = { phases: [] };
    expect(TaskflowSchema.safeParse(raw).success).toBe(true);
  });

  it('passes through unknown top-level fields', () => {
    const raw = {
      phases: [{ id: 'p1', type: 'main', task: 'run' }],
      extraField: 'should be allowed',
    };
    const result = TaskflowSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });
});
