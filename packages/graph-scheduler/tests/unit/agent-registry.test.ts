/**
 * Unit tests for agent-registry.ts — loadBuiltinRegistry, mergeAgentRegistry,
 * resolveAgent, resolveEntry.
 *
 * Follows ADR 0028 with three-layer override design and 3-entry builtin:
 *   builtin JSON (main, agent, approval) < project config < phase.skill
 */
import { describe, expect, it } from 'vitest';

import {
  loadBuiltinRegistry,
  mergeAgentRegistry,
  resolveAgent,
  resolveEntry,
  type AgentRegistryEntry,
} from '../../src/lib/agent-registry.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEntry(type: string, skill: string, agent?: string): AgentRegistryEntry {
  return agent ? { type, skill, agent } : { type, skill };
}

// ══════════════════════════════════════════════════════════════════════════════
// loadBuiltinRegistry — JSON file loading (replaces BUILTIN_AGENT_REGISTRY const)
// ══════════════════════════════════════════════════════════════════════════════

describe('loadBuiltinRegistry', () => {
  it('loads builtin JSON from graphs/agent-registry.json', () => {
    const builtin = loadBuiltinRegistry();
    expect(builtin).toBeDefined();
    expect(builtin.length).toBeGreaterThanOrEqual(0);
  });

  it('has exactly 3 entries: main, agent, approval', () => {
    const builtin = loadBuiltinRegistry();
    expect(builtin).toHaveLength(3);
    const types = builtin.map((e) => e.type);
    expect(types).toContain('main');
    expect(types).toContain('agent');
    expect(types).toContain('approval');
  });

  it('main entry maps to atom-phase-handler', () => {
    const builtin = loadBuiltinRegistry();
    const mainEntry = builtin.find((e) => e.type === 'main');
    expect(mainEntry).toBeDefined();
    expect(mainEntry!.skill).toBe('atom-phase-handler');
    expect(mainEntry!.agent).toBeUndefined();
  });

  it('agent entry maps to atom-phase-agent with agent: task', () => {
    const builtin = loadBuiltinRegistry();
    const agentEntry = builtin.find((e) => e.type === 'agent');
    expect(agentEntry).toBeDefined();
    expect(agentEntry!.skill).toBe('atom-phase-agent');
    expect(agentEntry!.agent).toBe('task');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// mergeAgentRegistry
// ══════════════════════════════════════════════════════════════════════════════

describe('mergeAgentRegistry', () => {
  it('returns builtin defaults when no project config (3 entries)', () => {
    const builtin = loadBuiltinRegistry();
    const merged = mergeAgentRegistry(builtin);

    expect(merged.size).toBe(3);
    expect(merged.get('main')!.skill).toBe('atom-phase-handler');
    expect(merged.get('agent')!.skill).toBe('atom-phase-agent');
    expect(merged.get('agent')!.agent).toBe('task');
    expect(merged.get('approval')!.skill).toBe('atom-phase-handler');
  });

  it('project adds custom type beyond 3 builtins', () => {
    const builtin = loadBuiltinRegistry();
    const project: AgentRegistryEntry[] = [makeEntry('custom', 'custom-skill', 'scout')];

    const merged = mergeAgentRegistry(builtin, project);

    expect(merged.size).toBe(4);
    expect(merged.get('custom')!.skill).toBe('custom-skill');
    expect(merged.get('custom')!.agent).toBe('scout');
    // builtins still present
    expect(merged.get('main')!.skill).toBe('atom-phase-handler');
    expect(merged.get('agent')!.skill).toBe('atom-phase-agent');
    expect(merged.get('approval')!.skill).toBe('atom-phase-handler');
  });

  it('project overrides agent type builtin', () => {
    const builtin = loadBuiltinRegistry();
    const project: AgentRegistryEntry[] = [makeEntry('agent', 'my-custom-agent', 'scout')];

    const merged = mergeAgentRegistry(builtin, project);

    expect(merged.size).toBe(3); // agent overridden, not added
    expect(merged.get('agent')!.skill).toBe('my-custom-agent');
    expect(merged.get('agent')!.agent).toBe('scout');
    expect(merged.get('main')!.skill).toBe('atom-phase-handler');
    expect(merged.get('approval')!.skill).toBe('atom-phase-handler');
  });

  it('project override replaces builtin for same type', () => {
    const builtin = loadBuiltinRegistry();
    const project: AgentRegistryEntry[] = [makeEntry('approval', 'my-custom-approval')];

    const merged = mergeAgentRegistry(builtin, project);

    expect(merged.size).toBe(3); // approval overridden, main + agent still present
    expect(merged.get('approval')!.skill).toBe('my-custom-approval');
    expect(merged.get('main')!.skill).toBe('atom-phase-handler');
    expect(merged.get('agent')!.skill).toBe('atom-phase-agent');
  });

  it('empty project array returns only builtins', () => {
    const builtin = loadBuiltinRegistry();
    const merged = mergeAgentRegistry(builtin, []);

    expect(merged.size).toBe(3);
    expect(merged.get('main')).toBeDefined();
    expect(merged.get('agent')).toBeDefined();
    expect(merged.get('approval')).toBeDefined();
  });

  it('returns empty map when builtin is empty', () => {
    const merged = mergeAgentRegistry([]);

    expect(merged.size).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// resolveAgent
// ══════════════════════════════════════════════════════════════════════════════

describe('resolveAgent', () => {
  const mapping = mergeAgentRegistry(loadBuiltinRegistry());

  it('returns skill path for known type', () => {
    const skill = resolveAgent('approval', mapping);
    expect(skill).toBe('atom-phase-handler');
  });

  it('returns null for unknown type', () => {
    const skill = resolveAgent('nonexistent', mapping);
    expect(skill).toBeNull();
  });

  it('returns agent skill from builtin (now in 3-entry builtin)', () => {
    const skill = resolveAgent('agent', mapping);
    expect(skill).toBe('atom-phase-agent');
  });

  it('returns main skill from builtin', () => {
    const skill = resolveAgent('main', mapping);
    expect(skill).toBe('atom-phase-handler');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// resolveEntry
// ══════════════════════════════════════════════════════════════════════════════

describe('resolveEntry', () => {
  const mapping = mergeAgentRegistry(loadBuiltinRegistry());

  it('returns full entry for known type', () => {
    const entry = resolveEntry('approval', mapping);
    expect(entry).not.toBeNull();
    expect(entry!.type).toBe('approval');
    expect(entry!.skill).toBe('atom-phase-handler');
  });

  it('returns null for unknown type', () => {
    const entry = resolveEntry('nonexistent', mapping);
    expect(entry).toBeNull();
  });

  it('returns agent entry from builtin (now in 3-entry builtin)', () => {
    const entry = resolveEntry('agent', mapping);
    expect(entry).not.toBeNull();
    expect(entry!.type).toBe('agent');
    expect(entry!.skill).toBe('atom-phase-agent');
    expect(entry!.agent).toBe('task');
  });

  it('returns entry with agent field', () => {
    const customMap = mergeAgentRegistry(loadBuiltinRegistry(), [
      { type: 'custom', skill: 'custom-skill', agent: 'task' },
    ]);
    const entry = resolveEntry('custom', customMap);
    expect(entry).not.toBeNull();
    expect(entry!.agent).toBe('task');
  });
});
