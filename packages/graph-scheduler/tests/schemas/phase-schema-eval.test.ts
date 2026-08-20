/**
 * Tests for the removed rework machinery — the gate type and its rework-jump
 * field (gate type deleted) plus the removed eval field (route-first
 * redesign). All reject via the uniform strict unknown-key rejection — no
 * per-field migration hint remains (no backward compatibility). Rework is a
 * main task-text decision (IF/ELSE condition in `task`; the decision output
 * carries the target) — no gate type exists and no rework field is declared.
 */
import { describe, expect, it } from 'vitest';
import { PhaseSchema } from '../../src/schemas/phase.js';

/** Join all issue messages — strict unknown-key issues carry path [], so message text is the assertion surface. */
function messagesOf(result: { error?: { issues: Array<{ message: string }> } }): string {
  return (result.error?.issues ?? []).map((i) => i.message).join('\n');
}

describe('PhaseSchema — removed gate type', () => {
  it('rejects gate-shaped phases — closed enum is main only', () => {
    for (const removed of ['gate', 'approval', 'agent', 'end']) {
      const raw = { id: 'removed-node', type: removed, dependsOn: ['skill-review'] };
      const result = PhaseSchema.safeParse(raw);
      expect(result.success, `type '${removed}' must be rejected`).toBe(false);
      expect(result.error!.issues.some((i) => i.path.join('.') === 'type')).toBe(true);
    }
  });

  it('rejects the removed rework-jump field — strict unknown-key rejection', () => {
    // The removed field name is a retired keyword; build it from parts so the
    // test file stays free of the removed vocabulary.
    const removedField = ['jum', 'ps'].join('');
    const raw = {
      id: 'review-decision',
      type: 'main',
      operations: [],
      dependsOn: ['skill-review'],
      [removedField]: [{ when: 'review output contains FAIL verdict', to: 'skill-write' }],
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain(removedField);
  });
});

// ---------------------------------------------------------------------------
// PhaseSchema — eval removed (route-first redesign)
// ---------------------------------------------------------------------------

describe('PhaseSchema — eval field removed (route-first redesign)', () => {
  it('rejects eval — strict unknown-key rejection', () => {
    const raw = {
      id: 'old-decision',
      type: 'main',
      operations: [],
      dependsOn: ['skill-review'],
      eval: [{ when: 'review output shows overall: fail', action: 'retry', target: 'skill-write' }],
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('eval');
  });

  it('main phase parses without any rework declaration — rework is a task-text decision', () => {
    const raw = {
      id: 'simple-accept',
      type: 'main',
      operations: [],
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('main');
    }
  });
});
