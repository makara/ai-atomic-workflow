/**
 * Zod schema tests for config.json — agentRegistry (aligned with AgentRegistryEntrySchema).
 *
 * ADR 0028 removed strategy field. Schema now: { type, skill, agent? }.
 */
import { describe, expect, it } from 'vitest';

import { ConfigFileSchema } from '../src/schema/config-schema.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function baseConfig(overrides?: Record<string, unknown>) {
  return { ...overrides };
}

// ── Valid entries ────────────────────────────────────────────────────────────

describe('agentRegistry: valid entries', () => {
  it('accepts entry with type+skill only (no agent)', () => {
    const config = baseConfig({
      agentRegistry: [{ type: 'agent', skill: 'atom-phase-agent' }],
    });

    const result = ConfigFileSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.agentRegistry).toHaveLength(1);
      expect(result.data.agentRegistry![0].type).toBe('agent');
      expect(result.data.agentRegistry![0].skill).toBe('atom-phase-agent');
    }
  });

  it('accepts entry with type+skill+agent', () => {
    const config = baseConfig({
      agentRegistry: [{ type: 'review', skill: 'atom-review', agent: 'reviewer' }],
    });

    const result = ConfigFileSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.agentRegistry).toHaveLength(1);
      const entry = result.data.agentRegistry![0];
      expect(entry.type).toBe('review');
      expect(entry.skill).toBe('atom-review');
      expect(entry.agent).toBe('reviewer');
    }
  });

  it('accepts multiple entries', () => {
    const config = baseConfig({
      agentRegistry: [
        { type: 'agent', skill: 'atom-phase-agent' },
        { type: 'approval', skill: 'atom-phase-approval' },
        { type: 'review', skill: 'atom-review', agent: 'reviewer' },
      ],
    });

    const result = ConfigFileSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.agentRegistry).toHaveLength(3);
    }
  });

  it('accepts empty array', () => {
    const config = baseConfig({ agentRegistry: [] });

    const result = ConfigFileSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.agentRegistry).toHaveLength(0);
    }
  });

  it('accepts missing agentRegistry field (optional)', () => {
    const config = baseConfig();

    const result = ConfigFileSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.agentRegistry).toBeUndefined();
    }
  });
});

// ── Invalid entries ──────────────────────────────────────────────────────────

describe('agentRegistry: invalid entries', () => {
  it('rejects entry with empty type string', () => {
    const config = baseConfig({
      agentRegistry: [{ type: '', skill: 'atom-phase-agent' }],
    });

    const result = ConfigFileSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('rejects entry with empty skill string', () => {
    const config = baseConfig({
      agentRegistry: [{ type: 'agent', skill: '' }],
    });

    const result = ConfigFileSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('rejects entry with missing type', () => {
    const config = baseConfig({
      agentRegistry: [{ skill: 'atom-phase-agent' }],
    });

    const result = ConfigFileSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('rejects entry with missing skill', () => {
    const config = baseConfig({
      agentRegistry: [{ type: 'agent' }],
    });

    const result = ConfigFileSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('rejects non-array agentRegistry', () => {
    const config = baseConfig({
      agentRegistry: { type: 'agent', skill: 'x' },
    });

    const result = ConfigFileSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('rejects entry with agent that is not string', () => {
    const config = baseConfig({
      agentRegistry: [{ type: 'agent', skill: 'x', agent: 123 }],
    });

    const result = ConfigFileSchema.safeParse(config);
    expect(result.success).toBe(false);
  });
});
