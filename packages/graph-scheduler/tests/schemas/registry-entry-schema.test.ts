/**
 * Unit tests for RegistryEntrySchema — zod schema for a single graph registry entry.
 *
 * TDD red phase: RegistryEntrySchema does not exist yet. These tests define the
 * expected API contract. Phase 3 implementation should make all tests pass.
 */
import { describe, expect, it } from 'vitest';
import { RegistryEntrySchema, type RegistryEntry } from '../../src/schemas/registry-entry.js';

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('RegistryEntrySchema — happy path', () => {
  it('parses entry with name + path + description', () => {
    const raw = {
      name: 'my-workflow',
      path: './graphs/my-workflow.yaml',
      description: 'A sample workflow for testing',
    };

    const result = RegistryEntrySchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('my-workflow');
      expect(result.data.path).toBe('./graphs/my-workflow.yaml');
      expect(result.data.description).toBe('A sample workflow for testing');
    }
  });

  it('parses entry without description', () => {
    const raw = {
      name: 'simple-graph',
      path: '/absolute/path/to/graph.yaml',
    };

    const result = RegistryEntrySchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('simple-graph');
      expect(result.data.path).toBe('/absolute/path/to/graph.yaml');
      expect(result.data.description).toBeUndefined();
    }
  });

  it('parses entry with relative path', () => {
    const raw = {
      name: 'nested-workflow',
      path: './nested/workflow.yaml',
      description: 'Nested directory workflow',
    };

    const result = RegistryEntrySchema.safeParse(raw);
    expect(result.success).toBe(true);
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

  it('rejects description that is not a string', () => {
    const result = RegistryEntrySchema.safeParse({
      name: 'test',
      path: './graph.yaml',
      description: 42,
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

  it('accepts empty description string', () => {
    const result = RegistryEntrySchema.safeParse({
      name: 'test',
      path: './graph.yaml',
      description: '',
    });
    expect(result.success).toBe(true);
  });
});
