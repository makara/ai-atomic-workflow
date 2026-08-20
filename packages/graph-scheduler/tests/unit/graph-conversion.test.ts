/**
 * Load-time phase validation (syntax v2) — WorkflowSchema is the single
 * validation surface.
 *
 * The former toWorkflowGraph conversion (FSM graph shape) was deleted with
 * the self-built FSM; v2 compiles the schema-validated Workflow directly
 * into the embedded LangGraph runtime. These tests pin the surviving
 * load-time contracts:
 * - valid main phase → validates
 * - agent/custom phase types → loud schema rejection (enum {main} only)
 * - empty task main phase → valid (task is optional at load; operations is
 *   the mandatory field on plain main phases)
 * - multiple phases → all validated; dependsOn preserved
 * - empty phases array → valid output
 * - declared name is the identity — passes through to the graph
 */
import { describe, expect, it } from 'vitest';
import { WorkflowSchema } from '../../src/schemas/workflow.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid main phase. */
function mainPhase(id: string, task: string, overrides?: Record<string, unknown>) {
  return { id, type: 'main', task, ...overrides, operations: [] };
}

/** Parse a Workflow-shaped object; returns the parse result. */
function parse(tf: unknown): ReturnType<typeof WorkflowSchema.safeParse> {
  return WorkflowSchema.safeParse(tf);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('load-time phase validation (WorkflowSchema)', () => {
  // ── 1. Valid main phase ──────────────────────────────────────────

  it('validates a valid main phase', () => {
    const tf = { name: 'simple', phases: [mainPhase('a1', 'do something', { skill: 'atom-scope-interview' })] };
    const result = parse(tf);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('simple');
      expect(result.data.phases).toHaveLength(1);
      expect(result.data.phases[0].id).toBe('a1');
      expect(result.data.phases[0].type).toBe('main');
      expect(result.data.phases[0].task).toBe('do something');
    }
  });

  it('rejects removed agent type at load — no silent fallback', () => {
    const agentTf = { name: 'agent-graph', phases: [{ id: 'a1', type: 'agent', task: 'do something' }] };
    const result = parse(agentTf);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('\n');
      // the enum is {main} only — agent is rejected loudly at the type field
      expect(messages).toContain('expected "main"');
      expect(result.error.issues[0]?.path.join('.')).toBe('phases.0.type');
    }
  });

  // ── 2. Task optional at load — operations is the mandatory field ─

  it('accepts a main phase with empty task — task is optional at load (v2)', () => {
    const tf = { name: 'empty-task', phases: [mainPhase('a1', '')] };
    const result = parse(tf);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phases[0].task).toBe('');
    }
  });

  it('accepts a main phase with no task field at all — task optional at load', () => {
    const tf = { name: 'no-task', phases: [{ id: 'a1', type: 'main', operations: [] }] };
    const result = parse(tf);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phases[0].task).toBeUndefined();
    }
  });

  it('rejects a plain main phase without operations — mandatory on all main phases', () => {
    const tf = { name: 'no-ops', phases: [{ id: 'a1', type: 'main', task: 'x' }] };
    const result = parse(tf);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('operations'))).toBe(true);
    }
  });

  // ── 3. Unknown phase type → loud rejection with the registered list ──

  it('rejects phase with unregistered type — no silent pass-through', () => {
    const phase = { id: 'custom-1', type: 'custom-nosuch', task: 'whatever' };
    const tf = { name: 'unknown-type', phases: [phase] };
    const result = parse(tf);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('expected "main"'))).toBe(true);
    }
  });

  // ── 4. Multiple phases — all validated ───────────────────────────

  it('validates all phases in a multi-phase graph', () => {
    const tf = {
      name: 'multi',
      phases: [
        mainPhase('a1', 'step one', { skill: 'atom-scope-interview' }),
        mainPhase('a2', 'step two', { dependsOn: ['a1'], skill: 'atom-scope-interview' }),
        mainPhase('a3', 'step three', { dependsOn: ['a2'], skill: 'atom-scope-interview' }),
      ],
    };
    const result = parse(tf);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phases).toHaveLength(3);
      expect(result.data.phases[1].dependsOn).toEqual(['a1']);
      expect(result.data.phases[2].dependsOn).toEqual(['a2']);
    }
  });

  // ── 5. Empty phases array → valid output ─────────────────────────

  it('returns valid output for empty phases array', () => {
    const tf = { name: 'empty', phases: [] };
    const result = parse(tf);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('empty');
      expect(result.data.phases).toHaveLength(0);
    }
  });

  // ── 6. dependsOn preserved in output ─────────────────────────────

  it('preserves dependsOn field', () => {
    const tf = {
      name: 'deps',
      phases: [
        mainPhase('a1', 'first', { skill: 'atom-scope-interview' }),
        mainPhase('a2', 'second', { dependsOn: ['a1'], skill: 'atom-scope-interview' }),
      ],
    };
    const result = parse(tf);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phases[0].dependsOn).toBeUndefined();
      expect(result.data.phases[1].dependsOn).toEqual(['a1']);
    }
  });

  // ── 7. Declared name is the identity — passes through to the graph ──

  it('passes the declared name through to the graph', () => {
    const tf = { name: 'declared-name', phases: [mainPhase('a1', 'task', { skill: 'atom-scope-interview' })] };
    const result = parse(tf);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('declared-name');
    }
  });

  // ── 8. Removed composition — use rejected as an unknown key ──────

  it('rejects a main phase declaring use — subgraph composition deleted', () => {
    const tf = {
      name: 'composed',
      phases: [{ id: 'child', type: 'main', use: 'child-graph', dependsOn: [] }],
    };
    const result = parse(tf);
    expect(result.success).toBe(false);
    if (!result.success) {
      // strict unknown-key rejection — the error names the removed key
      expect(result.error.issues.some((i) => i.message.includes('use'))).toBe(true);
    }
  });

  it('rejects a phase declaring use alongside channels — use is the unknown key', () => {
    const tf = {
      name: 'bad-composed',
      phases: [{ id: 'child', type: 'main', use: 'child-graph', dependsOn: [], channels: ['node:x'] }],
    };
    const result = parse(tf);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('use'))).toBe(true);
    }
  });
});

describe('template field validation (graph-router-template)', () => {
  it('accepts a router template node with dependsOn + template_args.paths', () => {
    const tf = {
      name: 'router-graph',
      phases: [
        { id: 'up', type: 'main', task: 'up', operations: [] },
        { id: 'pick', type: 'main', template: 'router', template_args: { paths: ['a', 'b'] }, dependsOn: ['up'] },
      ],
    };
    const result = parse(tf);
    expect(result.success).toBe(true);
  });

  it('rejects a startup template node with non-empty dependsOn (entry only)', () => {
    const tf = {
      name: 'bad-startup',
      phases: [{ id: 'boot', type: 'main', template: 'startup', dependsOn: ['other'] }],
    };
    const result = parse(tf);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('startup template phase must be a graph entry'))).toBe(
        true,
      );
    }
  });

  it('rejects template_args without template: router', () => {
    const tf = {
      name: 'bad-args',
      phases: [{ id: 'p', type: 'main', template_args: { paths: ['a'] }, operations: [] }],
    };
    const result = parse(tf);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes("'template_args' requires 'template: router'"))).toBe(
        true,
      );
    }
  });

  it('rejects a router template node without template_args', () => {
    const tf = {
      name: 'bad-router',
      phases: [{ id: 'p', type: 'main', template: 'router' }],
    };
    const result = parse(tf);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes("must declare 'template_args.paths'"))).toBe(true);
    }
  });

  it('rejects empty paths (min 1)', () => {
    const tf = {
      name: 'empty-paths',
      phases: [{ id: 'p', type: 'main', template: 'router', template_args: { paths: [] } }],
    };
    const result = parse(tf);
    expect(result.success).toBe(false);
  });

  it('rejects template + use and template + task conflicts for both template types', () => {
    const useConflict = {
      name: 'use-conflict',
      phases: [{ id: 'p', type: 'main', template: 'router', template_args: { paths: ['a'] }, use: 'child' }],
    };
    const taskConflict = {
      name: 'task-conflict',
      phases: [{ id: 'p', type: 'main', template: 'startup', task: 'custom' }],
    };
    const u = parse(useConflict);
    const t = parse(taskConflict);
    // `use` is a removed field — the strict schema rejects it as an unknown
    // key (no per-field conflict hint survives); assert success:false only.
    expect(u.success).toBe(false);
    expect(t.success).toBe(false);
    if (!t.success) {
      expect(t.error.issues.some((i) => i.message.includes("must not declare 'task'"))).toBe(true);
    }
  });
});
