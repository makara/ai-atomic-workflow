/**
 * Tests for graph-definition.ts — file loading, schema validation, and
 * schema-probe resolution.
 *
 * Graph identity is schema-determined: any YAML passing WorkflowSchema
 * validation is a graph — file suffix is not part of identity. The probe
 * resolves by declared `name` (fast path `<name>.yaml`/`<name>.yml`, then
 * declared-name scan). Version policy: semver accepted, major mismatch →
 * loud GraphDefinitionError.
 */

import { Effect, Exit, Layer } from 'effect';
import { describe, expect, it } from 'vitest';
import { FileSystem, FileSystemError } from '../src/filesystem.js';
import { resolveArgs } from '../src/flow-flatten.js';
import { loadGraph } from '../src/graph-definition.js';
import type { GraphDefinitionError } from '../src/types.js';

// ── Test helpers ─────────────────────────────────────────────────────────────

/** Valid workflow YAML content using YAML-native block scalar syntax for task fields. */
function validWorkflowYaml(name = 'test-graph'): string {
  return `name: ${name}
description: A test graph
phases:
  - id: p1
    type: main
    task: |
      Run step one.
    operations: []
`;
}

/** Create a mock FileSystem layer with a map of filename → content. */
function mockFileSystemLayer(files: Record<string, string>): Layer.Layer<FileSystem, never, never> {
  return Layer.succeed(FileSystem, {
    readFile: (path: string) => {
      const content = files[path];
      if (content !== undefined) return Effect.succeed(content);
      return Effect.fail(new FileSystemError(path, `File not found or unreadable: ${path}`));
    },
    resolvePath: (filePath: string) => (filePath in files ? filePath : null),
    listYamlFiles: () => Object.keys(files),
    resolveSchemaUri: (uri: string, _filePath: string) => (uri in files ? uri : null),
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('loadGraph — schema-probe resolution', () => {
  it('loads a valid workflow YAML file (no suffix convention)', async () => {
    const filename = 'test-graph.yaml';
    const exit = await Effect.runPromiseExit(
      loadGraph('test-graph').pipe(Effect.provide(mockFileSystemLayer({ [filename]: validWorkflowYaml() }))),
    );
    expect(exit._tag).toBe('Success');
    if (exit._tag === 'Success') {
      expect(exit.value.name).toBe('test-graph');
    }
  });

  it('resolves a .yml extension on the fast path', async () => {
    const filename = 'test-graph.yml';
    const exit = await Effect.runPromiseExit(
      loadGraph('test-graph').pipe(Effect.provide(mockFileSystemLayer({ [filename]: validWorkflowYaml() }))),
    );
    expect(exit._tag).toBe('Success');
  });

  it('loads a graph by declared name regardless of filename (schema identity)', async () => {
    // Filename says nothing; the declared `name` is the identity.
    const filename = 'arbitrary-file-name.yaml';
    const exit = await Effect.runPromiseExit(
      loadGraph('test-graph').pipe(
        Effect.provide(mockFileSystemLayer({ [filename]: validWorkflowYaml('test-graph') })),
      ),
    );
    expect(exit._tag).toBe('Success');
  });

  it('returns failure for invalid YAML on the fast path', async () => {
    const filename = 'bad.yaml';
    const exit = await Effect.runPromiseExit(
      loadGraph('bad').pipe(Effect.provide(mockFileSystemLayer({ [filename]: 'key: [unclosed' }))),
    );
    expect(exit._tag).toBe('Failure');
    if (exit._tag === 'Failure') {
      const err = (exit.cause as { _tag: string; error: GraphDefinitionError }).error;
      expect(err._tag).toBe('GraphDefinitionError');
      expect(err.message).toContain('Invalid YAML');
    }
  });

  it('returns failure for schema validation failure on the fast path', async () => {
    const filename = 'no-phases.yaml';
    const invalidYaml = JSON.stringify({ name: 'no-phases', phases: 'not-an-array' });
    const exit = await Effect.runPromiseExit(
      loadGraph('no-phases').pipe(Effect.provide(mockFileSystemLayer({ [filename]: invalidYaml }))),
    );
    expect(exit._tag).toBe('Failure');
    if (exit._tag === 'Failure') {
      const err = (exit.cause as { _tag: string; error: GraphDefinitionError }).error;
      expect(err._tag).toBe('GraphDefinitionError');
      expect(err.message).toContain('Schema validation failed');
    }
  });

  it('rejects name-mismatch on the fast path — declared name is the identity', async () => {
    const filename = 'test-graph.yaml';
    const exit = await Effect.runPromiseExit(
      loadGraph('test-graph').pipe(
        Effect.provide(mockFileSystemLayer({ [filename]: validWorkflowYaml('other-name') })),
      ),
    );
    expect(exit._tag).toBe('Failure');
    if (exit._tag === 'Failure') {
      const err = (exit.cause as { _tag: string; error: GraphDefinitionError }).error;
      expect(err._tag).toBe('GraphDefinitionError');
      expect(err.message).toContain("declares name 'other-name'");
    }
  });

  it('returns failure when no candidate declares the name (not found — ENOENT semantics)', async () => {
    const filename = 'other.yaml';
    const exit = await Effect.runPromiseExit(
      loadGraph('test-graph').pipe(Effect.provide(mockFileSystemLayer({ [filename]: validWorkflowYaml('other') }))),
    );
    expect(exit._tag).toBe('Failure');
    if (exit._tag === 'Failure') {
      const err = (exit.cause as { _tag: string; error: FileSystemError }).error;
      expect(err._tag).toBe('FileSystemError');
      expect(err.message).toContain('not found');
    }
  });

  it('skips schema-invalid candidates in the declared-name scan', async () => {
    const files = {
      'bad.yaml': 'key: [unclosed',
      'good.yaml': validWorkflowYaml('test-graph'),
    };
    const exit = await Effect.runPromiseExit(loadGraph('test-graph').pipe(Effect.provide(mockFileSystemLayer(files))));
    expect(exit._tag).toBe('Success');
  });
});

describe('loadGraph — version policy', () => {
  it('loads a graph with a matching semver version', async () => {
    const filename = 'test-graph.yaml';
    const yaml = validWorkflowYaml() + 'version: 1.2.3\n';
    const exit = await Effect.runPromiseExit(
      loadGraph('test-graph').pipe(Effect.provide(mockFileSystemLayer({ [filename]: yaml }))),
    );
    expect(exit._tag).toBe('Success');
    if (exit._tag === 'Success') {
      expect(exit.value.version).toBe('1.2.3');
    }
  });

  it('rejects a major-version mismatch with a loud error', async () => {
    const filename = 'test-graph.yaml';
    const yaml = validWorkflowYaml() + 'version: 2.0.0\n';
    const exit = await Effect.runPromiseExit(
      loadGraph('test-graph').pipe(Effect.provide(mockFileSystemLayer({ [filename]: yaml }))),
    );
    expect(exit._tag).toBe('Failure');
    if (exit._tag === 'Failure') {
      const err = (exit.cause as { _tag: string; error: GraphDefinitionError }).error;
      expect(err._tag).toBe('GraphDefinitionError');
      expect(err.message).toContain('major 2');
      expect(err.message).toContain('refusing to load');
    }
  });

  it('rejects a non-semver version at schema validation', async () => {
    const filename = 'test-graph.yaml';
    const yaml = validWorkflowYaml() + 'version: not-semver\n';
    const exit = await Effect.runPromiseExit(
      loadGraph('test-graph').pipe(Effect.provide(mockFileSystemLayer({ [filename]: yaml }))),
    );
    expect(exit._tag).toBe('Failure');
    if (exit._tag === 'Failure') {
      const err = (exit.cause as { _tag: string; error: GraphDefinitionError }).error;
      expect(err.message).toContain('Schema validation failed');
    }
  });

  it('rejects a malformed $schema reference loudly', async () => {
    const filename = 'test-graph.yaml';
    const yaml = validWorkflowYaml() + '$schema: "bad uri with spaces"\n';
    const exit = await Effect.runPromiseExit(
      loadGraph('test-graph').pipe(Effect.provide(mockFileSystemLayer({ [filename]: yaml }))),
    );
    expect(exit._tag).toBe('Failure');
    if (exit._tag === 'Failure') {
      const err = (exit.cause as { _tag: string; error: GraphDefinitionError }).error;
      expect(err.message).toContain('malformed');
    }
  });
});

describe('loadGraph — $schema resolution', () => {
  it('loads when the declared $schema resolves to a schema document', async () => {
    const filename = 'test-graph.yaml';
    const yaml = validWorkflowYaml() + '$schema: workflow.schema.json\n';
    const exit = await Effect.runPromiseExit(
      loadGraph('test-graph').pipe(
        Effect.provide(mockFileSystemLayer({ [filename]: yaml, 'workflow.schema.json': '{}' })),
      ),
    );
    expect(exit._tag).toBe('Success');
  });

  it('rejects a dangling $schema declaration loudly, naming the URI', async () => {
    const filename = 'test-graph.yaml';
    const yaml = validWorkflowYaml() + '$schema: missing.schema.json\n';
    const exit = await Effect.runPromiseExit(
      loadGraph('test-graph').pipe(Effect.provide(mockFileSystemLayer({ [filename]: yaml }))),
    );
    expect(exit._tag).toBe('Failure');
    if (exit._tag === 'Failure') {
      const err = (exit.cause as { _tag: string; error: GraphDefinitionError }).error;
      expect(err._tag).toBe('GraphDefinitionError');
      expect(err.message).toContain('missing.schema.json');
      expect(err.message).toContain('resolves to no schema document');
    }
  });
});

describe('resolveArgs — {args.X} interpolation', () => {
  it('interpolates args into templates', () => {
    expect(resolveArgs('hello {args.name}', { name: 'world' })).toBe('hello world');
  });
});
