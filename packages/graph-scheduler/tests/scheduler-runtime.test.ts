/**
 * Tests for scheduler-runtime.ts — built-in asset + config validation.
 *
 * Verifies built-in YAML assets + config schema alignment:
 *   - ConfigFileSchema Zod validation
 *   - createRuntime graceful fallback on invalid agentRegistry
 */
import { Effect } from 'effect';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { ConfigFileSchema, createMemoryRuntime, createRuntime } from '../src/scheduler-runtime.js';
import { PhaseSchema } from '../src/schemas/phase.js';
import { TaskflowSchema } from '../src/schemas/taskflow.js';

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
    const approval = graph.phases[1];
    expect(approval.type).toBe('approval');
    // Complete approval pattern — task-as-topic + routing with explicit targets
    expect(approval.task).toBeTruthy();
    expect(approval.routing).toBeDefined();
    expect(Array.isArray(approval.routing.actions)).toBe(true);
    expect(approval.routing.actions.length).toBeGreaterThanOrEqual(1);
    for (const action of approval.routing.actions) {
      if (action.action !== 'continue') {
        expect(action.target).toBeTruthy();
      }
    }
  });

  it('built-in skill-delete.taskflow.yaml is valid YAML with 7 phases', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const pkgRoot = join(__dirname, '..');
    const graphPath = join(pkgRoot, 'graphs', 'skill-delete.taskflow.yaml');
    const raw = readFileSync(graphPath, 'utf-8');
    const graph = parseYaml(raw);
    expect(graph.name).toBe('skill-delete');
    expect(graph.phases).toHaveLength(7);
    // Verify all 7 phase IDs
    const phaseIds = graph.phases.map((p: { id: string }) => p.id);
    expect(phaseIds).toContain('skill-select');
    expect(phaseIds).toContain('impact-analysis');
    expect(phaseIds).toContain('delete-confirm');
    expect(phaseIds).toContain('skill-delete-execute');
    expect(phaseIds).toContain('delete-review');
    expect(phaseIds).toContain('delete-gate');
    expect(phaseIds).toContain('delete-accept');
    // Verify phase types
    const phasesByType: Record<string, string> = {};
    for (const p of graph.phases) phasesByType[p.id] = p.type;
    expect(phasesByType['skill-select']).toBe('main');
    expect(phasesByType['impact-analysis']).toBe('main');
    expect(phasesByType['delete-confirm']).toBe('main');
    expect(phasesByType['skill-delete-execute']).toBe('main');
    expect(phasesByType['delete-review']).toBe('main');
    expect(phasesByType['delete-gate']).toBe('gate');
    expect(phasesByType['delete-accept']).toBe('approval');
    // Verify dependsOn chain — entry node has empty dependsOn
    const entryPhase = graph.phases.find((p: { id: string }) => p.id === 'skill-select');
    expect(entryPhase.dependsOn).toEqual([]);
    // Verify gate has bounded auto-rework eval (no DEBT condition)
    const gatePhase = graph.phases.find((p: { id: string }) => p.id === 'delete-gate');
    expect(gatePhase.eval).toBeDefined();
    expect(Array.isArray(gatePhase.eval)).toBe(true);
    expect(gatePhase.eval.length).toBeGreaterThanOrEqual(1);
    const evalText = gatePhase.eval.map((e: { when: string }) => e.when).join(' ');
    expect(evalText).toContain('overall: fail');
    expect(evalText).toContain('retryAttempt < 2');
    expect(evalText).not.toContain('DEBT');
    // Verify accept is pure human card — no eval, 3-route routing
    const approvalPhase = graph.phases.find((p: { id: string }) => p.id === 'delete-accept');
    expect(approvalPhase.eval).toBeUndefined();
    expect(approvalPhase.dependsOn).toEqual(['delete-gate']);
    expect(approvalPhase.routing).toBeDefined();
    expect(approvalPhase.routing.actions).toHaveLength(3);
  });

  it('built-in skill-delete.taskflow.yaml passes TaskflowSchema validation', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const pkgRoot = join(__dirname, '..');
    const graphPath = join(pkgRoot, 'graphs', 'skill-delete.taskflow.yaml');
    const raw = readFileSync(graphPath, 'utf-8');
    const graph = parseYaml(raw);
    const result = TaskflowSchema.safeParse(graph);
    expect(result.success).toBe(true);
  });

  it('built-in skill-delete.taskflow.yaml phases each pass PhaseSchema', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const pkgRoot = join(__dirname, '..');
    const graphPath = join(pkgRoot, 'graphs', 'skill-delete.taskflow.yaml');
    const raw = readFileSync(graphPath, 'utf-8');
    const graph = parseYaml(raw);
    for (const phase of graph.phases) {
      const result = PhaseSchema.safeParse(phase);
      expect(result.success).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Config schema validation (Zod unit tests)
// ---------------------------------------------------------------------------

describe('ConfigFileSchema', () => {
  it('accepts empty config (all fields optional)', () => {
    const result = ConfigFileSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects dbPath that is not a string', () => {
    const result = ConfigFileSchema.safeParse({ dbPath: 123 });
    expect(result.success).toBe(false);
  });

  it('rejects registryPaths that is not an array', () => {
    const result = ConfigFileSchema.safeParse({ registryPaths: 'not-an-array' });
    expect(result.success).toBe(false);
  });

  it('rejects legacy agentRegistry field — loud error', () => {
    const result = ConfigFileSchema.safeParse({
      dbPath: ':memory:',
      taskflowDir: 'graphs',
      agentRegistry: [{ type: 'main', skill: 'atom-phase-handler' }],
    });
    expect(result.success).toBe(false);
    const messages = result.error.issues.map((i) => i.message).join('\n');
    expect(messages).toContain('agentRegistry');
    expect(messages).toContain('removed');
  });
});

// ---------------------------------------------------------------------------
// createRuntime without agentRegistry (field removed)
// ---------------------------------------------------------------------------

describe('createRuntime (no agentRegistry)', () => {
  it('creates runtime with default config', async () => {
    const program = Effect.gen(function* () {
      const rt = yield* createMemoryRuntime('test-graphs');
      return rt;
    });

    const runtime = await Effect.runPromise(program);
    expect(runtime).toBeDefined();
    expect(runtime.dispose).toBeDefined();
    await runtime.dispose();
  });
});

// ---------------------------------------------------------------------------
// dbPath parent-directory creation + relative-path resolution (portability)
// ---------------------------------------------------------------------------

describe('createRuntime dbPath portability', () => {
  it('creates missing parent directories for dbPath when absent', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'gs-dbpath-'));
    const dbPath = join(tmp, 'nested', 'data', 'test.db');
    const rt = await Effect.runPromise(createRuntime({ dbPath, taskflowDir: 'test-graphs' }));
    expect(existsSync(dbPath)).toBe(true);
    await rt.dispose();
    rmSync(tmp, { recursive: true, force: true });
  });

  it('db open failure reports actionable error with GS_DB_PATH hint', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'gs-dbfail-'));
    const blocker = join(tmp, 'blocker');
    writeFileSync(blocker, 'file in the way');
    const dbPath = join(blocker, 'data', 'test.db');
    try {
      await Effect.runPromise(createRuntime({ dbPath, taskflowDir: 'test-graphs' }));
      expect.unreachable();
    } catch (err) {
      const msg = String(
        err && typeof err === 'object' && 'message' in err ? (err as { message: string }).message : err,
      );
      expect(msg).toContain('Failed to open database');
      expect(msg).toContain(dbPath);
      expect(msg).toContain('GS_DB_PATH');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('resolves relative dbPath from config.json against project root (cwd)', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'gs-config-'));
    const prevCwd = process.cwd();
    try {
      process.chdir(tmp);
      mkdirSync(join(tmp, '.graph-scheduler'), { recursive: true });
      writeFileSync(
        join(tmp, '.graph-scheduler', 'config.json'),
        JSON.stringify({ dbPath: '.graph-scheduler/data/graph-scheduler.db' }),
      );
      const rt = await Effect.runPromise(createRuntime());
      expect(existsSync(join(tmp, '.graph-scheduler', 'data', 'graph-scheduler.db'))).toBe(true);
      await rt.dispose();
    } finally {
      process.chdir(prevCwd);
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('environment variable overrides config.json dbPath', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'gs-priority-'));
    const prevCwd = process.cwd();
    const prevEnv = process.env['GS_DB_PATH'];
    try {
      process.chdir(tmp);
      mkdirSync(join(tmp, '.graph-scheduler'), { recursive: true });
      writeFileSync(
        join(tmp, '.graph-scheduler', 'config.json'),
        JSON.stringify({ dbPath: '.graph-scheduler/data/config.db' }),
      );
      const envDb = join(tmp, 'env.db');
      process.env['GS_DB_PATH'] = envDb;
      const rt = await Effect.runPromise(createRuntime());
      expect(existsSync(envDb)).toBe(true);
      expect(existsSync(join(tmp, '.graph-scheduler', 'data', 'config.db'))).toBe(false);
      await rt.dispose();
    } finally {
      if (prevEnv === undefined) delete process.env['GS_DB_PATH'];
      else process.env['GS_DB_PATH'] = prevEnv;
      process.chdir(prevCwd);
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('resolves relative env dbPath against project root (cwd)', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'gs-envrel-'));
    const prevCwd = process.cwd();
    const prevEnv = process.env['GS_DB_PATH'];
    try {
      process.chdir(tmp);
      process.env['GS_DB_PATH'] = 'data/gs.db';
      const rt = await Effect.runPromise(createRuntime());
      expect(existsSync(join(tmp, 'data', 'gs.db'))).toBe(true);
      await rt.dispose();
    } finally {
      if (prevEnv === undefined) delete process.env['GS_DB_PATH'];
      else process.env['GS_DB_PATH'] = prevEnv;
      process.chdir(prevCwd);
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('resolves relative override dbPath against project root (cwd)', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'gs-ovrel-'));
    const prevCwd = process.cwd();
    try {
      process.chdir(tmp);
      const rt = await Effect.runPromise(createRuntime({ dbPath: 'data/ov.db', taskflowDir: 'test-graphs' }));
      expect(existsSync(join(tmp, 'data', 'ov.db'))).toBe(true);
      await rt.dispose();
    } finally {
      process.chdir(prevCwd);
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
