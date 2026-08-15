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
import { WorkflowSchema } from '../src/schemas/workflow.js';

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
    expect(e2e.path).toBe('e2e-minimal.yaml');
  });

  it('built-in e2e-minimal.yaml is valid YAML with expected phases', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const pkgRoot = join(__dirname, '..');
    const graphPath = join(pkgRoot, 'graphs', 'e2e-minimal.yaml');
    const raw = readFileSync(graphPath, 'utf-8');
    const graph = parseYaml(raw);
    expect(graph.name).toBe('e2e-minimal');
    expect(graph.phases).toHaveLength(2);
    expect(graph.phases[0].type).toBe('main');
    const approval = graph.phases[1];
    expect(approval.type).toBe('approval');
    // route-first redesign — run completes by natural drain after the approval;
    // no end node, no written routing actions (default card = Accept + free input + AI options)
    expect(approval.task).toBeTruthy();
    expect(approval.routing).toBeUndefined();
  });

  it('built-in graph-generate.yaml is valid YAML with 7 phases — concrete maker graph', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const pkgRoot = join(__dirname, '..');
    const graphPath = join(pkgRoot, 'graphs', 'graph-generate.yaml');
    const raw = readFileSync(graphPath, 'utf-8');
    const graph = parseYaml(raw);
    expect(graph.name).toBe('graph-generate');
    expect(graph.phases).toHaveLength(7);
    // Concrete maker journey phase sequence (spec-first, no skeleton)
    const phaseIds = graph.phases.map((p: { id: string }) => p.id);
    expect(phaseIds).toEqual(['entry', 'spec', 'spec-accept', 'implement', 'review', 'gate', 'accept']);
    // no flow composition — the maker graph is self-contained
    expect(graph.phases.some((p: { type: string }) => p.type === 'flow')).toBe(false);
    // entry is the entry node with the shared scope-interview skill
    const entryPhase = graph.phases.find((p: { id: string }) => p.id === 'entry');
    expect(entryPhase.skill).toBe('atom-scope-interview');
    // implement output contract — three-path bundle (graph + registry + doc)
    const implementPhase = graph.phases.find((p: { id: string }) => p.id === 'implement');
    expect(String(implementPhase.task)).toMatch(/artifact_path/);
    expect(String(implementPhase.task)).toMatch(/registry_path/);
    expect(String(implementPhase.task)).toMatch(/doc_path/);
    // gate carries bounded rework jumps (route-first: no branches/default)
    const gatePhase = graph.phases.find((p: { id: string }) => p.id === 'gate');
    expect(gatePhase.eval, 'gate eval').toBeUndefined();
    expect(Array.isArray(gatePhase.jumps), 'gate jumps').toBe(true);
    expect(gatePhase.jumps.length).toBeGreaterThanOrEqual(1);
    expect(gatePhase.default, 'gate default').toBeUndefined();
    const jumpText = gatePhase.jumps.map((j: { when: string }) => j.when).join(' ');
    expect(jumpText).toContain('overall: fail');
    expect(jumpText).toContain('retryCount < 2');
    expect(jumpText).not.toContain('DEBT');
    // two approval layers only — spec-accept + final accept, both pure cards
    const approvals = graph.phases.filter((p: { type: string }) => p.type === 'approval');
    expect(approvals.map((p: { id: string }) => p.id)).toEqual(['spec-accept', 'accept']);
    for (const a of approvals) {
      expect(a.routing).toBeUndefined();
      expect(a.branches).toBeUndefined();
      expect(a.eval).toBeUndefined();
    }
  });

  it('deleted artifact-workflow/skill-workflow files are gone — no thin compositions', () => {
    const { existsSync } = require('node:fs');
    const { join } = require('node:path');
    const pkgRoot = join(__dirname, '..');
    expect(existsSync(join(pkgRoot, 'graphs', 'artifact-workflow.yaml'))).toBe(false);
    expect(existsSync(join(pkgRoot, 'graphs', 'skill-workflow.yaml'))).toBe(false);
  });

  it('built-in graph-generate passes WorkflowSchema + PhaseSchema validation', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const pkgRoot = join(__dirname, '..');
    const graphPath = join(pkgRoot, 'graphs', 'graph-generate.yaml');
    const raw = readFileSync(graphPath, 'utf-8');
    const graph = parseYaml(raw);
    const result = WorkflowSchema.safeParse(graph);
    expect(result.success, `graph-generate WorkflowSchema`).toBe(true);
    for (const phase of graph.phases) {
      const phaseResult = PhaseSchema.safeParse(phase);
      expect(phaseResult.success, `graph-generate/${String(phase.id)} PhaseSchema`).toBe(true);
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
      agentRegistry: [{ type: 'main', skill: 'atom-phase-handler', operations: [] }],
    });
    expect(result.success).toBe(false);
    const messages = result.error!.issues.map((i) => i.message).join('\n');
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
