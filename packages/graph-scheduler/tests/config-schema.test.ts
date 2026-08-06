/**
 * Zod schema tests for config.json — agentRegistry removed.
 *
 * Config no longer accepts an agentRegistry field; dispatch handler is the
 * constant atom-phase-handler. The field is declared unknown and rejected
 * loudly with a rename hint — legacy configs fail instead of stripping (never emitted by setup).
 */
import { describe, expect, it } from 'vitest';

import { ConfigFileSchema } from '../src/schemas/index.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function baseConfig(overrides?: Record<string, unknown>) {
  return { ...overrides };
}

// ── Valid entries ────────────────────────────────────────────────────────────

describe('config: valid shapes', () => {
  it('accepts minimal config', () => {
    const result = ConfigFileSchema.safeParse(baseConfig());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.agentRegistry).toBeUndefined();
    }
  });

  it('accepts dbPath/taskflowDir/registryPaths/skillsDir', () => {
    const config = baseConfig({
      dbPath: '.graph-scheduler/data/graph-scheduler.db',
      taskflowDir: '.graph-scheduler/graphs',
      registryPaths: ['.graph-scheduler/graphs/registry.json'],
      skillsDir: 'packages/graph-workflow/skills',
    });

    const result = ConfigFileSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dbPath).toBe('.graph-scheduler/data/graph-scheduler.db');
      expect(result.data.skillsDir).toBe('packages/graph-workflow/skills');
    }
  });

  it('accepts project-level context array — default layer of the global channel', () => {
    const config = baseConfig({
      context: ['./CONTEXT.md', 'skill:atom-graph-spec'],
    });

    const result = ConfigFileSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.context).toEqual(['./CONTEXT.md', 'skill:atom-graph-spec']);
    }
  });

  it('rejects bare-name project context entry — explicit prefix/glob required', () => {
    const config = baseConfig({
      context: ['atom-graph-spec'],
    });

    const result = ConfigFileSchema.safeParse(config);
    expect(result.success).toBe(false);
    const messages = result.error!.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    expect(messages).toContain('atom-graph-spec');
    expect(messages).toContain('bare name');
  });

  it('accepts prefixed project context — node: and skill: entries legal', () => {
    const config = baseConfig({
      context: ['node:requirement/arch-review', 'skill:atom-graph-spec'],
    });

    const result = ConfigFileSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('rejects legacy channels key — loud rename hint, no silent strip', () => {
    const config = baseConfig({
      channels: ['./CONTEXT.md'],
    });

    const result = ConfigFileSchema.safeParse(config);
    expect(result.success).toBe(false);
    const messages = result.error!.issues.map((i) => i.message).join('\n');
    expect(messages).toContain('channels');
    expect(messages).toContain('context');
  });

  it('rejects legacy agentRegistry field — loud error, no silent strip', () => {
    const config = baseConfig({
      agentRegistry: [{ type: 'main', skill: 'atom-phase-handler' }],
    });

    const result = ConfigFileSchema.safeParse(config);
    expect(result.success).toBe(false);
    const messages = result.error!.issues.map((i) => i.message).join('\n');
    expect(messages).toContain('agentRegistry');
    expect(messages).toContain('removed');
  });
});

// ── Invalid entries ──────────────────────────────────────────────────────────

describe('config: invalid shapes', () => {
  it('rejects non-string dbPath', () => {
    const config = baseConfig({ dbPath: 42 });
    const result = ConfigFileSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('rejects empty dbPath', () => {
    const config = baseConfig({ dbPath: '' });
    const result = ConfigFileSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('rejects empty registryPaths array element', () => {
    const config = baseConfig({ registryPaths: [''] });
    const result = ConfigFileSchema.safeParse(config);
    expect(result.success).toBe(false);
  });
});
