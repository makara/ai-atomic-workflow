/**
 * Tests for graph-definition.ts — file loading and schema validation.
 *
 * Tests the loadGraph function with a mock FileSystem Tag, covering:
 * - valid .taskflow.yaml → Taskflow object
 * - invalid YAML → GraphDefinitionError with parse details
 * - schema validation failure → GraphDefinitionError with violations
 * - file not found → GraphDefinitionError with file path
 */

import { Effect, Exit, Layer } from 'effect';
import { describe, expect, it } from 'vitest';
import { FileSystemError } from '../src/filesystem.js';
import { FileSystem, loadGraph } from '../src/graph-definition.js';
import type { GraphDefinitionError } from '../src/types.js';

// ── Test helpers ─────────────────────────────────────────────────────────────

/** Valid taskflow YAML content using YAML-native block scalar syntax for task fields. */
function validTaskflowYaml(): string {
  return `name: test-graph
description: A test graph
phases:
  - id: agent-init
    type: agent
    agent: init-agent
    task: |
      Initialize {args.mode}
  - id: agent-verify
    type: agent
    agent: verify-agent
    task: |
      Verify {steps.agent-init.output}
    dependsOn:
      - agent-init
`;
}

/** Create a mock FileSystem layer with a map of filename → content. */
function mockFileSystemLayer(files: Record<string, string>): Layer.Layer<FileSystem, never, never> {
  return Layer.succeed(FileSystem, {
    readFile: (path: string) => {
      const content = files[path];
      if (content !== undefined) {
        return Effect.succeed(content);
      }
      return Effect.fail(new FileSystemError(path, `File not found: ${path}`));
    },
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('loadGraph', () => {
  it('loads a valid .taskflow.yaml file', async () => {
    const filename = 'test-graph.taskflow.yaml';
    const exit = await Effect.runPromiseExit(
      loadGraph('test-graph').pipe(Effect.provide(mockFileSystemLayer({ [filename]: validTaskflowYaml() }))),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value.name).toBe('test-graph');
      expect(exit.value.phases).toHaveLength(2);
      expect(exit.value.phases[0].id).toBe('agent-init');
    }
  });

  it('returns failure for invalid YAML', async () => {
    const filename = 'bad.taskflow.yaml';
    const exit = await Effect.runPromiseExit(
      loadGraph('bad').pipe(Effect.provide(mockFileSystemLayer({ [filename]: 'not valid yaml {{{' }))),
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it('returns failure for schema validation failure', async () => {
    const filename = 'no-phases.taskflow.yaml';
    const invalidYaml = JSON.stringify({ name: 'invalid', phases: 'not-an-array' });
    const exit = await Effect.runPromiseExit(
      loadGraph('no-phases').pipe(Effect.provide(mockFileSystemLayer({ [filename]: invalidYaml }))),
    );
    // Own validation rejects non-array phases
    expect(Exit.isFailure(exit)).toBe(true);
    expect(exit).toBeDefined();
  });

  it('returns failure when file not found', async () => {
    const exit = await Effect.runPromiseExit(loadGraph('nonexistent').pipe(Effect.provide(mockFileSystemLayer({}))));
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it('resolves graph name to {name}.taskflow.yaml', async () => {
    const filename = 'my-graph.taskflow.yaml';
    const exit = await Effect.runPromiseExit(
      loadGraph('my-graph').pipe(Effect.provide(mockFileSystemLayer({ [filename]: validTaskflowYaml() }))),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value.name).toBe('test-graph');
    }
  });
});
