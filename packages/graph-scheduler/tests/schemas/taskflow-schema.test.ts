/**
 * Unit tests for TaskflowSchema — zod schema for .taskflow.yaml graph definition.
 *
 * TDD red phase: TaskflowSchema does not exist yet. These tests define the expected
 * API contract. Phase 3 implementation should make all tests pass.
 */
import { describe, expect, it } from 'vitest';
import { PhaseSchema } from '../../src/schemas/phase.js';
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
          type: 'main',
          agent: ['default'],
          task: 'Execute task A',
          channels: ['file1.txt', 'file2.txt'],
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
        { id: 'p2', type: 'main' },
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

// ---------------------------------------------------------------------------
// Flow type phases
// ---------------------------------------------------------------------------

describe('TaskflowSchema — flow type phases', () => {
  it('accepts flow phase with use field', () => {
    const raw = {
      phase: {
        id: 'skill-ops',
        type: 'flow',
        use: 'skill-delete',
        dependsOn: [],
      },
    };
    const result = PhaseSchema.safeParse(raw.phase);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.use).toBe('skill-delete');
    }
  });

  it('rejects flow phase with def inline — def removed, use mandatory', () => {
    const raw = {
      phase: {
        id: 'inline-ops',
        type: 'flow',
        def: {
          phases: [{ id: 'nested', type: 'main', dependsOn: [], task: 'do work' }],
        },
        dependsOn: [],
      },
    };
    const result = PhaseSchema.safeParse(raw.phase);
    expect(result.success).toBe(false);
  });

  it('rejects flow phase with neither use nor def', () => {
    const raw = {
      phase: {
        id: 'bad-flow',
        type: 'flow',
        dependsOn: [],
      },
    };
    const result = PhaseSchema.safeParse(raw.phase);
    expect(result.success).toBe(false);
  });

  it('accepts complete flow taskflow with multiple flow phases (no with/def)', () => {
    const raw = {
      name: 'orchestrated-workflow',
      version: 1,
      phases: [
        { id: 'plan', type: 'main', dependsOn: [], task: 'plan work' },
        { id: 'skill-ops', type: 'flow', use: 'skill-delete', dependsOn: ['plan'] },
        { id: 'doc-ops', type: 'flow', use: 'doc-update', dependsOn: ['plan'] },
        { id: 'review', type: 'main', skill: 'code-review', dependsOn: ['skill-ops', 'doc-ops'] },
        { id: 'approve', type: 'approval', dependsOn: ['review'] },
      ],
    };
    const result = TaskflowSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });
});
