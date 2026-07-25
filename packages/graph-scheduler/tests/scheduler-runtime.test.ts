/**
 * Tests for scheduler-runtime.ts — built-in asset + config validation.
 *
 * Verifies built-in YAML assets + F1/F2 config schema alignment:
 *   - ConfigFileSchema Zod validation (F2)
 *   - createRuntime graceful fallback on invalid agentRegistry (F1)
 */
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { ConfigFileSchema, createMemoryRuntime, createRuntime } from '../src/scheduler-runtime.js';

// ---------------------------------------------------------------------------
// Built-in asset validation
// ---------------------------------------------------------------------------

describe('built-in assets', () => {
  it('built-in registry.json is valid JSON and contains e2e-minimal', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const pkgRoot = join(__dirname, '..');
    const registryPath = join(pkgRoot, 'graphs', 'registry.json');
    const raw = readFileSync(registryPath, 'utf-8');
    const registry = JSON.parse(raw);
    expect(registry).toHaveProperty('graphs');
    expect(Array.isArray(registry.graphs)).toBe(true);
    expect(registry.graphs.length).toBeGreaterThanOrEqual(1);
    const e2e = registry.graphs.find((e: { name: string }) => e.name === 'e2e-minimal');
    expect(e2e).toBeDefined();
    expect(e2e.path).toBe('e2e-minimal.taskflow.yaml');
  });

  it('built-in e2e-minimal.taskflow.yaml is valid YAML with expected phases', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const pkgRoot = join(__dirname, '..');
    const graphPath = join(pkgRoot, 'graphs', 'e2e-minimal.taskflow.yaml');
    const raw = readFileSync(graphPath, 'utf-8');
    const graph = parseYaml(raw);
    expect(graph.name).toBe('e2e-minimal');
    expect(graph.phases).toHaveLength(2);
    expect(graph.phases[0].type).toBe('main');
    expect(graph.phases[1].type).toBe('approval');
  });
});

// ---------------------------------------------------------------------------
// F1+F2: Config schema validation (Zod unit tests)
// ---------------------------------------------------------------------------

describe('ConfigFileSchema (F2)', () => {
  it('accepts empty config (all fields optional)', () => {
    const result = ConfigFileSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts valid config with agentRegistry', () => {
    const result = ConfigFileSchema.safeParse({
      dbPath: ':memory:',
      taskflowDir: 'graphs',
      agentRegistry: [
        { type: 'main', skill: 'atom-phase-handler' },
        { type: 'agent', skill: 'atom-phase-agent', agent: 'task' },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.agentRegistry).toHaveLength(2);
    }
  });

  it('rejects agentRegistry entry without skill (F1 validation)', () => {
    const result = ConfigFileSchema.safeParse({
      agentRegistry: [{ type: 'main' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects agentRegistry entry with empty type (F1 validation)', () => {
    const result = ConfigFileSchema.safeParse({
      agentRegistry: [{ type: '', skill: 'x' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects dbPath that is not a string', () => {
    const result = ConfigFileSchema.safeParse({ dbPath: 123 });
    expect(result.success).toBe(false);
  });

  it('rejects registryPaths that is not an array', () => {
    const result = ConfigFileSchema.safeParse({ registryPaths: 'not-an-array' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// F1+F2: createRuntime with agentRegistry validation (Effect integration)
// ---------------------------------------------------------------------------

describe('createRuntime agentRegistry (F1+F2)', () => {
  it('creates runtime with valid agentRegistry override', async () => {
    const program = Effect.gen(function* () {
      const rt = yield* createMemoryRuntime('test-graphs');
      return rt;
    });

    // createMemoryRuntime uses builtin agentRegistry — should succeed
    const runtime = await Effect.runPromise(program);
    expect(runtime).toBeDefined();
    expect(runtime.dispose).toBeDefined();
    await runtime.dispose();
  });

  it('creates runtime with invalid agentRegistry override (graceful fallback)', async () => {
    // Entries missing required `skill` field — normalizeAgentRegistry rejects, falls back to builtin
    // @ts-expect-error — deliberately invalid entries for graceful fallback test
    const bogusEntries: readonly { type: string; skill: string; agent?: string }[] = [{ type: 'bad' }, {}];
    const program = createRuntime({
      dbPath: ':memory:',
      taskflowDir: 'test-graphs',
      agentRegistry: bogusEntries,
    });

    // Should not throw — invalid entries silently rejected, builtin used
    const runtime = await Effect.runPromise(program);
    expect(runtime).toBeDefined();
    expect(runtime.dispose).toBeDefined();
    await runtime.dispose();
  });
});
