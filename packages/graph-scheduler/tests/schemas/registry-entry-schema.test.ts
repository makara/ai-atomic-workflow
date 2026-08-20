/**
 * Unit tests for RegistryEntrySchema — zod schema for a single graph registry entry.
 *
 * The registry is a pure index: entries are exactly `{ name, path }`. The
 * schema is strict — the removed metadata fields (`description`, `tags`) and
 * any other unknown keys are rejected, not stripped.
 */
import { describe, expect, it } from 'vitest';
import { RegistryEntrySchema } from '../../src/schemas/registry-entry.js';

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('RegistryEntrySchema — happy path', () => {
  it('parses entry with name + path', () => {
    const raw = {
      name: 'my-workflow',
      path: './graphs/my-workflow.yaml',
    };

    const result = RegistryEntrySchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('my-workflow');
      expect(result.data.path).toBe('./graphs/my-workflow.yaml');
    }
  });

  it('parses entry with an absolute path', () => {
    const raw = {
      name: 'simple-graph',
      path: '/absolute/path/to/graph.yaml',
    };

    const result = RegistryEntrySchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('simple-graph');
      expect(result.data.path).toBe('/absolute/path/to/graph.yaml');
    }
  });

  it('parses entry with relative path', () => {
    const raw = {
      name: 'nested-workflow',
      path: './nested/workflow.yaml',
    };

    const result = RegistryEntrySchema.safeParse(raw);
    expect(result.success).toBe(true);
  });

  it('parsed data carries exactly the two index fields', () => {
    const result = RegistryEntrySchema.safeParse({ name: 'a', path: 'a.yaml' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Object.keys(result.data).sort()).toEqual(['name', 'path']);
    }
  });
});

// ---------------------------------------------------------------------------
// Invalid input
// ---------------------------------------------------------------------------

describe('RegistryEntrySchema — invalid input', () => {
  it('rejects missing name', () => {
    const result = RegistryEntrySchema.safeParse({ path: './graph.yaml' });
    expect(result.success).toBe(false);
  });

  it('rejects missing path', () => {
    const result = RegistryEntrySchema.safeParse({ name: 'test' });
    expect(result.success).toBe(false);
  });

  it('rejects name that is not a string', () => {
    const result = RegistryEntrySchema.safeParse({ name: 123, path: './graph.yaml' });
    expect(result.success).toBe(false);
  });

  it('rejects path that is not a string', () => {
    const result = RegistryEntrySchema.safeParse({ name: 'test', path: 456 });
    expect(result.success).toBe(false);
  });

  it('rejects non-object input', () => {
    const result = RegistryEntrySchema.safeParse('not-an-object');
    expect(result.success).toBe(false);
  });

  it('rejects description — the registry is a pure index (metadata moved to the graph definition)', () => {
    const result = RegistryEntrySchema.safeParse({
      name: 'test',
      path: './graph.yaml',
      description: 'A sample workflow for testing',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('\n');
      expect(messages).toContain('description');
    }
  });

  it('rejects tags — the category axis is deleted', () => {
    const result = RegistryEntrySchema.safeParse({
      name: 'test',
      path: './graph.yaml',
      tags: ['maker'],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('\n');
      expect(messages).toContain('tags');
    }
  });

  it('rejects any other unknown key (strict schema)', () => {
    const result = RegistryEntrySchema.safeParse({
      name: 'test',
      path: './graph.yaml',
      version: '1.0.0',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Boundary conditions
// ---------------------------------------------------------------------------

describe('RegistryEntrySchema — boundary', () => {
  it('accepts empty string path', () => {
    const result = RegistryEntrySchema.safeParse({ name: 'test', path: '' });
    expect(result.success).toBe(true);
  });
});
