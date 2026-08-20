/**
 * Unit tests for WorkflowSchema — zod schema for workflow YAML graph definition.
 *
 * The schema is the identity gate: `name` is required, `$schema` (URI
 * reference) and `version` (semver) are optional self-description headers,
 * top-level `channels` stays rejected (renamed to `context`).
 */
import { describe, expect, it } from 'vitest';
import { PhaseSchema } from '../../src/schemas/phase.js';
import { WorkflowSchema, type Workflow } from '../../src/schemas/workflow.js';

// ---------------------------------------------------------------------------
// Inventory entry shape — { id, type, goal, constraints? }; legacy skill key stripped, legacy description key rejected
// ---------------------------------------------------------------------------

describe('WorkflowSchema — inventory entry shape', () => {
  const base = {
    name: 'inv-schema',
    phases: [{ id: 'p1', type: 'main', task: 'run', dependsOn: [], operations: [] }],
  };

  it('parses entries as { id, type, goal, constraints? }', () => {
    const result = WorkflowSchema.safeParse({
      ...base,
      inventory: [{ id: 'p1', type: 'main', goal: 'Runs the step', constraints: ['does not skip verification'] }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.inventory).toEqual([
        { id: 'p1', type: 'main', goal: 'Runs the step', constraints: ['does not skip verification'] },
      ]);
    }
  });

  it('parses an entry without constraints', () => {
    const result = WorkflowSchema.safeParse({
      ...base,
      inventory: [{ id: 'p1', type: 'main', goal: 'Runs the step' }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.inventory).toEqual([{ id: 'p1', type: 'main', goal: 'Runs the step' }]);
    }
  });

  it('strips a legacy skill key silently at parse — no rejection, no residual field', () => {
    const result = WorkflowSchema.safeParse({
      ...base,
      inventory: [{ id: 'p1', type: 'main', goal: 'Runs the step', skill: 'sk-other' }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.inventory).toEqual([{ id: 'p1', type: 'main', goal: 'Runs the step' }]);
    }
  });

  it('rejects a stale entry carrying the former description key', () => {
    const result = WorkflowSchema.safeParse({
      ...base,
      inventory: [{ id: 'p1', type: 'main', description: 'Runs the step' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a hybrid entry carrying both goal and the former description key', () => {
    const result = WorkflowSchema.safeParse({
      ...base,
      inventory: [{ id: 'p1', type: 'main', goal: 'Runs the step', description: 'Runs the step' }],
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Happy path — complete valid workflow YAML structure
// ---------------------------------------------------------------------------

describe('WorkflowSchema — happy path', () => {
  it('parses a complete workflow with all optional fields', () => {
    const raw = {
      name: 'my-workflow',

      phases: [
        {
          id: 'phase-1',
          type: 'main',
          task: 'Execute task A',
          channels: ['file1.txt', 'file2.txt'],
          skill: 'custom-skill',

          operations: [],
        },
        {
          id: 'phase-2',
          type: 'main',
          task: 'Decide',
          dependsOn: ['phase-1'],
          operations: [],
        },
      ],
    };

    const result = WorkflowSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('my-workflow');
      expect(result.data.phases).toHaveLength(2);
      expect(result.data.phases[0].id).toBe('phase-1');
    }
  });

  it('parses a minimal workflow — name + phases only', () => {
    const raw = {
      name: 'minimal',
      phases: [{ id: 'p1', type: 'main', task: 'run', operations: [] }],
    };

    const result = WorkflowSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('minimal');
      expect(result.data.phases).toHaveLength(1);
    }
  });

  it('parses workflow with no optional phase fields', () => {
    const raw = {
      name: 'no-optional-phase-fields',
      phases: [
        { id: 'p1', type: 'main', operations: [] },
        { id: 'p2', type: 'main', operations: [] },
      ],
    };

    const result = WorkflowSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phases).toHaveLength(2);
    }
  });

  it('accepts $schema as a URI reference', () => {
    const raw = {
      name: 'self-describing',
      $schema: 'workflow.schema.json',
      phases: [{ id: 'p1', type: 'main', task: 'run', operations: [] }],
    };

    const result = WorkflowSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.$schema).toBe('workflow.schema.json');
    }
  });

  it('accepts version as a semver string', () => {
    const raw = {
      name: 'versioned',
      version: '1.0.0',
      phases: [{ id: 'p1', type: 'main', task: 'run', operations: [] }],
    };

    const result = WorkflowSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe('1.0.0');
    }
  });

  it('accepts $schema + version together (self-describing header)', () => {
    const raw = {
      name: 'full-header',
      $schema: 'workflow.schema.json',
      version: '1.0.0',
      phases: [{ id: 'p1', type: 'main', task: 'run', operations: [] }],
    };

    expect(WorkflowSchema.safeParse(raw).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Invalid input — structural errors
// ---------------------------------------------------------------------------

describe('WorkflowSchema — invalid input', () => {
  it('rejects missing name — identity is required', () => {
    const result = WorkflowSchema.safeParse({
      phases: [{ id: 'p1', type: 'main', operations: [] }],
    });
    expect(result.success).toBe(false);
    const issue = result.error!.issues.find((i) => i.path.join('.') === 'name');
    expect(issue).toBeDefined();
  });

  it('rejects missing phases field', () => {
    const result = WorkflowSchema.safeParse({ name: 'test' });
    expect(result.success).toBe(false);
  });

  it('rejects phases that is not an array', () => {
    const result = WorkflowSchema.safeParse({ name: 'test', phases: 'not-an-array' });
    expect(result.success).toBe(false);
  });

  it('rejects phases that is null', () => {
    const result = WorkflowSchema.safeParse({ name: 'test', phases: null });
    expect(result.success).toBe(false);
  });

  it('rejects non-object input', () => {
    expect(WorkflowSchema.safeParse(null).success).toBe(false);
    expect(WorkflowSchema.safeParse(undefined).success).toBe(false);
    expect(WorkflowSchema.safeParse('string').success).toBe(false);
    expect(WorkflowSchema.safeParse(42).success).toBe(false);
    expect(WorkflowSchema.safeParse([]).success).toBe(false);
  });

  it('rejects phase without id', () => {
    const result = WorkflowSchema.safeParse({
      name: 'test',
      phases: [{ type: 'main', operations: [] }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects phase id that is not a string', () => {
    const result = WorkflowSchema.safeParse({
      name: 'test',
      phases: [{ id: 123, type: 'main', operations: [] }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects name that is not a string', () => {
    const result = WorkflowSchema.safeParse({
      name: 123,
      phases: [{ id: 'p1', type: 'main', operations: [] }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects version that is not a string', () => {
    const result = WorkflowSchema.safeParse({
      name: 'test',
      version: true,
      phases: [{ id: 'p1', type: 'main', operations: [] }],
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Boundary conditions
// ---------------------------------------------------------------------------

describe('WorkflowSchema — boundary', () => {
  it('rejects non-semver version string — format error, not dead-field rejection', () => {
    const raw = {
      name: 'g',
      version: 'not-semver',
      phases: [{ id: 'p1', type: 'main', task: 'run', operations: [] }],
    };
    const result = WorkflowSchema.safeParse(raw);
    expect(result.success).toBe(false);
    const issue = result.error!.issues.find((i) => i.path.join('.') === 'version');
    expect(issue).toBeDefined();
    expect(issue!.message).toContain('semver');
  });

  it('rejects partial semver version (major only)', () => {
    const raw = {
      name: 'g',
      version: '1',
      phases: [{ id: 'p1', type: 'main', task: 'run', operations: [] }],
    };
    expect(WorkflowSchema.safeParse(raw).success).toBe(false);
  });

  it('rejects version as number — type error', () => {
    const raw = {
      name: 'g',
      version: 1,
      phases: [{ id: 'p1', type: 'main', task: 'run', operations: [] }],
    };
    expect(WorkflowSchema.safeParse(raw).success).toBe(false);
  });

  it('rejects empty name string — a document without a valid name does not load', () => {
    const raw = {
      name: '',
      phases: [{ id: 'p1', type: 'main', task: 'run', operations: [] }],
    };
    const result = WorkflowSchema.safeParse(raw);
    expect(result.success).toBe(false);
    const issue = result.error!.issues.find((i) => i.path.join('.') === 'name');
    expect(issue).toBeDefined();
  });

  it('accepts empty phases array', () => {
    const raw = { name: 'g', phases: [] };
    expect(WorkflowSchema.safeParse(raw).success).toBe(true);
  });

  it('rejects empty $schema string', () => {
    const raw = {
      name: 'g',
      $schema: '',
      phases: [{ id: 'p1', type: 'main', task: 'run', operations: [] }],
    };
    expect(WorkflowSchema.safeParse(raw).success).toBe(false);
  });

  it('passes through unknown top-level fields', () => {
    const raw = {
      name: 'g',
      phases: [{ id: 'p1', type: 'main', task: 'run', operations: [] }],
      extraField: 'should be allowed',
    };
    const result = WorkflowSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Subgraph composition deleted — use is an unknown key; flow type still rejected
// ---------------------------------------------------------------------------

describe('WorkflowSchema — subgraph composition deleted (use → template: router)', () => {
  it('rejects flow type — closed enum is main only', () => {
    const raw = {
      phase: {
        id: 'skill-ops',
        type: 'flow',
        dependsOn: [],
      },
    };
    const result = PhaseSchema.safeParse(raw.phase);
    expect(result.success).toBe(false);
  });

  it('rejects use on a main phase — subgraph composition deleted (graph-subgraph-route-unify)', () => {
    const raw = {
      phase: {
        id: 'skill-ops',
        type: 'main',
        use: 'skill-delete',
        dependsOn: [],
        operations: [],
      },
    };
    const result = PhaseSchema.safeParse(raw.phase);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('\n');
      expect(messages).toContain('use');
    }
  });

  it('rejects legacy def on main — strict unknown-key rejection', () => {
    const raw = {
      phase: {
        id: 'inline-ops',
        type: 'main',
        def: {
          phases: [{ id: 'nested', type: 'main', dependsOn: [], task: 'do work', operations: [] }],
        },
        dependsOn: [],
      },
    };
    const result = PhaseSchema.safeParse(raw.phase);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('\n');
      expect(messages).toContain('def');
    }
  });

  it('rejects flow phase — flow type no longer exists', () => {
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

  it('accepts a complete workflow with multiple plain main phases (no with/def/use)', () => {
    const raw = {
      name: 'orchestrated-workflow',

      phases: [
        { id: 'plan', type: 'main', dependsOn: [], task: 'plan work', operations: [] },
        { id: 'skill-ops', type: 'main', dependsOn: ['plan'], task: 'run skill-delete', operations: [] },
        { id: 'doc-ops', type: 'main', dependsOn: ['plan'], task: 'run doc-sync', operations: [] },
        { id: 'review', type: 'main', skill: 'code-review', dependsOn: ['skill-ops', 'doc-ops'], operations: [] },
        { id: 'approve', type: 'main', dependsOn: ['review'], operations: [] },
      ],
    };
    const result = WorkflowSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });

  it('accepts top-level context — graph-level ambient scope (global channel)', () => {
    const raw = {
      name: 'with-graph-context',
      context: ['skill:atom-graph-spec', './CONTEXT.md', 'node:requirement/arch-review'],
      phases: [{ id: 'p1', type: 'main', task: 'run', operations: [] }],
    };
    const result = WorkflowSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.context).toEqual(['skill:atom-graph-spec', './CONTEXT.md', 'node:requirement/arch-review']);
    }
  });

  it('rejects legacy top-level channels key — loud rename hint, no silent strip', () => {
    const raw = {
      name: 'g',
      channels: ['skill:atom-graph-spec'],
      phases: [{ id: 'p1', type: 'main', task: 'run', operations: [] }],
    };
    const result = WorkflowSchema.safeParse(raw);
    expect(result.success).toBe(false);
    const messages = result.error!.issues.map((i) => i.message).join('\n');
    expect(messages).toContain('context');
  });

  it('rejects non-array top-level context', () => {
    const raw = {
      name: 'g',
      context: 'skill:atom-graph-spec',
      phases: [{ id: 'p1', type: 'main', task: 'run', operations: [] }],
    };
    const result = WorkflowSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Top-level constraints field — { constraints?: string[] }
// ---------------------------------------------------------------------------

describe('WorkflowSchema — top-level constraints field', () => {
  const base = {
    name: 'g',
    phases: [{ id: 'p1', type: 'main', task: 'run', dependsOn: [], operations: [] }],
  };

  it('parses top-level constraints as an ordered string array', () => {
    const result = WorkflowSchema.safeParse({
      ...base,
      constraints: ['reports in Chinese', 'no git write operations'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.constraints).toEqual(['reports in Chinese', 'no git write operations']);
    }
  });

  it('absent field stays undefined — empty set, no error', () => {
    const result = WorkflowSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.constraints).toBeUndefined();
    }
  });

  it('rejects non-array constraints', () => {
    const result = WorkflowSchema.safeParse({ ...base, constraints: 'reports in Chinese' });
    expect(result.success).toBe(false);
  });

  it('rejects non-string constraint entries', () => {
    const result = WorkflowSchema.safeParse({ ...base, constraints: ['ok', 42] });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Top-level interaction field — { interaction?: 'none' | 'enabled' }
// ---------------------------------------------------------------------------

describe('WorkflowSchema — top-level interaction field', () => {
  const base = {
    name: 'g',
    phases: [{ id: 'p1', type: 'main', task: 'run', dependsOn: [], operations: [] }],
  };

  it('absent field stays undefined — effective default enabled, no error', () => {
    const result = WorkflowSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.interaction).toBeUndefined();
    }
  });

  it('parses explicit interaction: none', () => {
    const result = WorkflowSchema.safeParse({ ...base, interaction: 'none' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.interaction).toBe('none');
    }
  });

  it('parses explicit interaction: enabled', () => {
    const result = WorkflowSchema.safeParse({ ...base, interaction: 'enabled' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.interaction).toBe('enabled');
    }
  });

  it('rejects values outside the enum', () => {
    const result = WorkflowSchema.safeParse({ ...base, interaction: 'sometimes' });
    expect(result.success).toBe(false);
  });

  it('rejects non-string interaction values', () => {
    const result = WorkflowSchema.safeParse({ ...base, interaction: 42 });
    expect(result.success).toBe(false);
  });
});
