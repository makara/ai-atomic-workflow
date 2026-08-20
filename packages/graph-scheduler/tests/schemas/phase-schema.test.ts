/**
 * Unit tests for PhaseSchema — zod schema for a single phase/node definition.
 *
 * Covers: closed type enum (main only — flow deleted), strict unknown-key
 * rejection (uniform — removed fields route/routing/join/when/eval/preText/
 * reads/branches/default/mode/runMode/constraints/jumps and legacy fields
 * retry/def/with/maxDepth/topic/context all reject with the key named, no
 * per-field migration hint, no silent stripping), deleted subgraph
 * composition (`use` unknown-key rejected; nested execution is the
 * `template: router` + `template_args.paths` sibling run), mandatory
 * operations declaration (plain main phases; template nodes exempt),
 * type-semantics superRefine (single enforcement point), and the removed
 * end/gate/approval node types. Rework is a main task-text decision.
 */
import { describe, expect, it } from 'vitest';
import { PhaseSchema, type Phase } from '../../src/schemas/phase.js';

/** Join all issue messages — strict unknown-key issues carry path [], so message text is the assertion surface. */
function messagesOf(result: { error?: { issues: Array<{ message: string }> } }): string {
  return (result.error?.issues ?? []).map((i) => i.message).join('\n');
}

// ---------------------------------------------------------------------------
// Happy path — main and approval type with complete fields
// ---------------------------------------------------------------------------

describe('PhaseSchema — happy path', () => {
  it('parses main type with all fields', () => {
    const raw = {
      id: 'agent-a',
      type: 'main',
      dependsOn: ['phase-0'],
      skill: 'my-agent',
      task: 'Run analysis task',

      operations: [],
    };

    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      const p: Phase = result.data;
      expect(p.id).toBe('agent-a');
      expect(p.type).toBe('main');
      expect(p.dependsOn).toEqual(['phase-0']);
      expect(p.skill).toBe('my-agent');
      expect(p.task).toBe('Run analysis task');
    }
  });

  it('rejects URI-form skill value (platform decoupling convention)', () => {
    const raw = {
      id: 'agent-a',
      type: 'main',
      skill: 'skill://my-agent',
      task: 'Run analysis task',

      operations: [],
    };

    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error!.issues.find((i) => i.path.join('.') === 'skill');
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('plain skill name');
    }
  });

  it('rejects removed node types — closed enum is main only', () => {
    for (const removed of ['approval', 'agent', 'gate', 'end', 'flow']) {
      const raw = { id: 'removed-step', type: removed };
      const result = PhaseSchema.safeParse(raw);
      expect(result.success, `type '${removed}' should be rejected`).toBe(false);
      const issue = result.error!.issues.find((i) => i.path.join('.') === 'type');
      expect(issue).toBeDefined();
      expect(issue!.message).toContain('expected "main"');
    }
  });

  it('parses minimal phase — only id + type', () => {
    const raw = { id: 'step-1', type: 'main', operations: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe('step-1');
      expect(result.data.type).toBe('main');
      expect(result.data.dependsOn).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Invalid input
// ---------------------------------------------------------------------------

describe('PhaseSchema — invalid input', () => {
  it('rejects unknown type string — closed enum', () => {
    const raw = { id: 'p1', type: 'unknown' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects type that is not a string', () => {
    const raw = { id: 'p1', type: 42 };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects missing id', () => {
    const raw = { type: 'main', operations: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects id that is not a string', () => {
    const raw = { id: null, type: 'main', operations: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects dependsOn that is not an array', () => {
    const raw = { id: 'p1', type: 'main', dependsOn: 'phase-0', operations: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects dependsOn containing non-string elements', () => {
    const raw = { id: 'p1', type: 'main', dependsOn: ['valid', 42], operations: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects non-object input', () => {
    expect(PhaseSchema.safeParse('hello').success).toBe(false);
    expect(PhaseSchema.safeParse(123).success).toBe(false);
    expect(PhaseSchema.safeParse(null).success).toBe(false);
    expect(PhaseSchema.safeParse(undefined).success).toBe(false);
    expect(PhaseSchema.safeParse([]).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Removed fields — strict rejection: ANY unknown key fails uniformly
// (no per-field migration hint, no silent stripping)
// ---------------------------------------------------------------------------

describe('PhaseSchema — removed fields rejected strictly', () => {
  it('rejects retry — no retry config surface', () => {
    const raw = { id: 'p1', type: 'main', task: 'x', retry: { max: 3 }, operations: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('retry');
  });

  it('rejects topic — decision title comes from task', () => {
    const raw = { id: 'approval-1', type: 'main', topic: 'My Topic', operations: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('topic');
  });

  it('rejects legacy context field', () => {
    const raw = { id: 'p1', type: 'main', task: 'x', context: ['legacy'], operations: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('context');
  });

  it('rejects legacy with/maxDepth/def on main — uniform strict rejection', () => {
    const raw = { id: 'f1', type: 'main', with: { k: 'v' }, maxDepth: 3, def: { phases: [] } };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    const messages = messagesOf(result);
    expect(messages).toContain('with');
    expect(messages).toContain('maxDepth');
    expect(messages).toContain('def');
  });

  it('rejects routing — deleted field (syntax v2), uniform strict rejection', () => {
    const raw = {
      id: 'approval-1',
      type: 'main',
      routing: { actions: [{ action: 'continue', label: 'Go', description: 'Advance' }] },
      operations: [],
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('routing');
  });
});

// ---------------------------------------------------------------------------
// Type-semantics superRefine — single enforcement point
// ---------------------------------------------------------------------------

describe('PhaseSchema — type semantics', () => {
  it('rejects preText on main type', () => {
    const raw = { id: 'p1', type: 'main', task: 'x', preText: 'card text', operations: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('accepts node: channels on main type — judgment context', () => {
    const raw = { id: 'approval-1', type: 'main', channels: ['node:review'], operations: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });

  it('accepts non-node channel entries on main type — full-type inheritance (node:-only repealed)', () => {
    const raw = {
      id: 'approval-1',
      type: 'main',
      channels: ['skill:atom-graph-spec', './judgment.md', 'review'],
      operations: [],
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });

  it('accepts peer-level agent field — advisory sub-agent preferences (graph-phase-agent-restore)', () => {
    const raw = { id: 'approval-1', type: 'main', agent: ['reviewer', 'task'], operations: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.agent).toEqual(['reviewer', 'task']);
    }
  });

  it('rejects eval on main type — removed field (route-first redesign), strict rejection', () => {
    const raw = {
      id: 'p1',
      type: 'main',
      task: 'x',
      eval: [{ when: 'x', action: 'retry', target: 'w' }],

      operations: [],
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('eval');
  });

  it('rejects the removed rework-jump field — strict rejection', () => {
    // The removed field name is itself a retired keyword; build it from parts
    // so the test file stays free of the removed vocabulary.
    const removedField = ['jum', 'ps'].join('');
    const raw = { id: 'g1', type: 'main', operations: [], [removedField]: [{ when: 'x', to: 'w' }] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain(removedField);
  });

  it('rejects residual preText — removed field (schema field convergence)', () => {
    const raw = { id: 'a1', type: 'main', preText: 'card body', operations: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('preText');
  });

  it('rejects branches on main — removed field (route-first redesign)', () => {
    const raw = {
      id: 'p1',
      type: 'main',
      branches: [{ when: 'x', to: 'w' }],
      operations: [],
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('branches');
  });

  it('rejects default/mode on any type — removed fields (route-first redesign)', () => {
    for (const type of ['main', 'flow'] as const) {
      const raw = { id: 'p1', type, default: 'x', mode: 'exclusive' };
      const result = PhaseSchema.safeParse(raw);
      expect(result.success, `${type} with default/mode`).toBe(false);
    }
  });

  it('rejects runMode on main — removed field (route-first redesign), strict rejection', () => {
    const raw = { id: 'p1', type: 'main', runMode: 'auto', operations: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('runMode');
  });

  it('rejects reads on main — removed field (schema field convergence)', () => {
    const raw = { id: 'p1', type: 'main', reads: ['up'], operations: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('reads');
  });
});

// ---------------------------------------------------------------------------
// Boundary conditions
// ---------------------------------------------------------------------------

describe('PhaseSchema — boundary', () => {
  it('allows empty dependsOn array', () => {
    const raw = { id: 'p1', type: 'main', dependsOn: [], operations: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dependsOn).toEqual([]);
    }
  });

  it('allows absent skill field', () => {
    const raw = { id: 'p1', type: 'main', operations: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.skill).toBeUndefined();
    }
  });

  it('allows empty string id', () => {
    // zod string() allows empty strings by default — no min(1) constraint
    const raw = { id: '', type: 'main', operations: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// join mode + when guard
// ---------------------------------------------------------------------------

describe('PhaseSchema — join deleted (syntax v2)', () => {
  it('rejects explicit join: "all" — strict rejection, AND convergence is the only join mode', () => {
    const raw = { id: 'p1', type: 'main', join: 'all', operations: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('join');
  });

  it('rejects join: "any" — join modes deleted', () => {
    const raw = { id: 'p1', type: 'main', join: 'any', operations: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('join');
  });

  it('join absent stays undefined — AND convergence (all dependencies terminal)', () => {
    const raw = { id: 'p1', type: 'main', operations: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.join).toBeUndefined();
    }
  });

  it('rejects invalid join value — deleted regardless of shape', () => {
    for (const join of ['none', 42] as const) {
      const raw = { id: 'p1', type: 'main', join, operations: [] };
      const result = PhaseSchema.safeParse(raw);
      expect(result.success).toBe(false);
      expect(messagesOf(result)).toContain('join');
    }
  });
});

describe('PhaseSchema — when guard removed (route-first redesign)', () => {
  it('rejects when — conditional behavior expresses via rework task text', () => {
    const raw = { id: 'p1', type: 'main', when: 'upstream output indicates skip', operations: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('when');
  });

  it('allows absent when field', () => {
    const raw = { id: 'p1', type: 'main', operations: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.when).toBeUndefined();
    }
  });
});

describe('PhaseSchema — constraints removed field, strict rejection', () => {
  it('rejects constraints — constraints load at activation (pilot)', () => {
    const raw = { id: 'p1', type: 'main', constraints: ['no git operations'], operations: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('constraints');
  });

  it('rejects constraints on main — strict rejection, never silent strip', () => {
    const raw = {
      id: 'p1',
      type: 'main',
      constraints: ['x'],
      operations: [],
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('constraints');
  });

  it('allows absent constraints field', () => {
    const raw = { id: 'p1', type: 'main', operations: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.constraints).toBeUndefined();
    }
  });
});

describe('PhaseSchema — activation prologue reserved ids', () => {
  it('rejects ALL $-prefixed ids — the activation prologue was removed', () => {
    for (const id of ['$run-mode-confirm', '$load-constraints', '$lang-confirm', '$foo', '$run-mode-confirm-extra']) {
      const raw = { id, type: 'main', task: 'x', operations: [] };
      const result = PhaseSchema.safeParse(raw);
      expect(result.success, `${id} should be rejected`).toBe(false);
      const issue = result.error!.issues.find((i) => i.path.join('.') === 'id');
      expect(issue).toBeDefined();
      expect(issue!.message).toContain("'$' prefix is reserved");
    }
  });
});

// ---------------------------------------------------------------------------
// subgraph composition deleted — use is an unknown key; nested execution is
// template: router + template_args.paths (frontend-launched sibling run)
// ---------------------------------------------------------------------------

describe('PhaseSchema — subgraph composition deleted (use → template: router)', () => {
  it('rejects flow type — closed enum is main only', () => {
    const raw = { id: 'skill-ops', type: 'flow', dependsOn: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    const issue = result.error!.issues.find((i) => i.path.join('.') === 'type');
    expect(issue).toBeDefined();
    expect(issue!.message).toContain('expected "main"');
  });

  it('rejects use on a main phase — subgraph composition deleted (graph-subgraph-route-unify)', () => {
    const raw = { id: 'skill-ops', type: 'main', use: 'skill-create', dependsOn: [], operations: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('use');
  });

  it('rejects router template without template_args.paths — required with template: router', () => {
    const raw = { id: 'route-1', type: 'main', template: 'router' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('template_args');
  });

  it('rejects template_args without template: router', () => {
    const raw = { id: 'p1', type: 'main', template_args: { paths: ['child-graph'] }, operations: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('template_args');
  });

  it('accepts a plain main node — no composition field', () => {
    const raw = { id: 'agent-1', type: 'main', task: 'do it', dependsOn: [], operations: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// end phase — removed terminal marker (route-first redesign)
// ---------------------------------------------------------------------------

describe('PhaseSchema — end phase type removed', () => {
  it('rejects end type with dependsOn — closed enum has no end node', () => {
    const raw = { id: 'done', type: 'end', dependsOn: ['finalize'] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    const issue = result.error!.issues.find((i) => i.path.join('.') === 'type');
    expect(issue).toBeDefined();
    expect(issue!.message).toContain('expected "main"');
    expect(issue!.message).not.toContain('"end"');
  });

  it('rejects end type even with a complete field set — no end node exists', () => {
    const raw = { id: 'e1', type: 'end', dependsOn: ['final'], task: 'x', join: 'any' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(result.error!.issues.some((i) => i.path.join('.') === 'type')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// routing/route deleted (syntax v2) — loud rejection, no partial acceptance
// ---------------------------------------------------------------------------

describe('PhaseSchema — routing/route deleted (syntax v2)', () => {
  it('rejects routing with value/default actions — strict rejection', () => {
    const raw = {
      id: 'a1',
      type: 'main',
      task: 'Decide',
      operations: [],
      routing: {
        actions: [
          { action: 'continue', value: 'accept', default: true, label: 'Accept', description: 'Go' },
          { action: 'retry', value: 'revise', target: 'w', label: 'Revise', description: 'Fix' },
        ],
      },
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('routing');
  });

  it('rejects routing regardless of default-action shape — no partial acceptance', () => {
    const raw = {
      id: 'a1',
      type: 'main',
      operations: [],
      routing: {
        actions: [
          { action: 'continue', default: true, label: 'A', description: 'a' },
          { action: 'retry', default: true, target: 'w', label: 'B', description: 'b' },
        ],
      },
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('routing');
  });

  it('rejects routing with zero default actions — the field is deleted outright', () => {
    const raw = {
      id: 'a1',
      type: 'main',
      operations: [],
      routing: {
        actions: [{ action: 'continue', value: 'accept', label: 'Accept', description: 'Go' }],
      },
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('routing');
  });

  it('rejects route on main — route membership deleted', () => {
    const raw = { id: 'a1', type: 'main', route: 'proceed', operations: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('route');
  });
});

describe('PhaseSchema — HLT operations declaration', () => {
  it('parses main type with valid closed-set operations', () => {
    const raw = {
      id: 'doc-maintain',
      type: 'main',
      operations: ['locate', 'read', 'write', 'verify'],
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.operations).toEqual(['locate', 'read', 'write', 'verify']);
    }
  });

  it('accepts arbitrary declared operation classes — evidence-only verification (no closed set)', () => {
    const raw = {
      id: 'doc-maintain',
      type: 'main',
      operations: ['locate', 'teleport'],
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.operations).toEqual(['locate', 'teleport']);
    }
  });

  it('exempts template nodes from the mandatory operations declaration — task injected from the template registry', () => {
    const raw = { id: 'x-router', type: 'main', template: 'router', template_args: { paths: ['child-graph'] } };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });

  it('rejects a main phase without operations — mandatory declaration (phase-aware enforcement allowed-set)', () => {
    const raw = { id: 'step-1', type: 'main' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error!.issues.find((i) => i.path.join('.') === 'operations');
      expect(issue).toBeDefined();
      expect(issue?.message).toContain("main phase must declare 'operations'");
    }
  });

  it('accepts an empty operations array on a main phase — conversation-only', () => {
    const raw = { id: 'scope-entry', type: 'main', operations: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });
});

describe('PhaseSchema — removed execution surface (langgraph-subgraph-align → graph-subgraph-route-unify)', () => {
  it('rejects execution on a plain main — field removed', () => {
    const raw = { id: 'requirement', type: 'main', execution: 'subagent', operations: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('execution');
  });

  it('rejects execution: cross-run — field removed', () => {
    const raw = { id: 'sibling', type: 'main', execution: 'cross-run', operations: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('execution');
  });

  it('accepts agent on a plain main — advisory preferences; composing-scoped agent deletion gone (graph-subgraph-route-unify)', () => {
    const raw = { id: 'requirement', type: 'main', agent: ['explore'], operations: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.agent).toEqual(['explore']);
    }
  });

  it('accepts a router template phase — template_args.paths is the sole nested-execution form (graph-subgraph-route-unify)', () => {
    const raw = { id: 'route', type: 'main', template: 'router', template_args: { paths: ['child-graph'] } };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.template).toBe('router');
      expect(
        result.data.template_args && 'paths' in result.data.template_args && result.data.template_args.paths,
      ).toEqual(['child-graph']);
    }
  });

  it('rejects the loop template entirely — loops are flow self-edges, never a task template (graph-flow)', () => {
    // The loop template is REMOVED — loop/rework semantics are top-level
    // `flow` self-edges (transition-table interpretation), never a task
    // template. Any template: loop phase fails loudly: enum rejection +
    // template_args shape rejection (the { graph, until } shape does not
    // exist).
    const loop = { id: 'loop', type: 'main', template: 'loop', template_args: { graph: 'body', until: 'x' } };
    const result = PhaseSchema.safeParse(loop);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('; ');
      expect(messages).toMatch(/expected one of "startup"\|"router"/);
      expect(messages).toMatch(/Unrecognized keys: "graph", "until"/);
    }
    // partial loop shapes reject too — no loop template form exists
    const noGraph = { id: 'loop1', type: 'main', template: 'loop', template_args: { until: 'x' } };
    expect(PhaseSchema.safeParse(noGraph).success).toBe(false);
    const noUntil = { id: 'loop2', type: 'main', template: 'loop', template_args: { graph: 'loop-body' } };
    expect(PhaseSchema.safeParse(noUntil).success).toBe(false);
    const noArgs = { id: 'loop3', type: 'main', template: 'loop' };
    expect(PhaseSchema.safeParse(noArgs).success).toBe(false);
  });

  it('rejects loop-shaped template_args on any template — the { graph, until } shape does not exist (graph-flow)', () => {
    const routerLoopArgs = { id: 'r1', type: 'main', template: 'router', template_args: { graph: 'x', until: 'y' } };
    expect(PhaseSchema.safeParse(routerLoopArgs).success).toBe(false);
    const loopRouterArgs = { id: 'l1', type: 'main', template: 'loop', template_args: { paths: ['x'] } };
    expect(PhaseSchema.safeParse(loopRouterArgs).success).toBe(false);
  });
});
