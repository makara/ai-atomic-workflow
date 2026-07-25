/**
 * Tests for parseWithEffect — Effect-TS integration wrapper for zod schema validation.
 *
 * TDD red phase: parseWithEffect and ValidationError do not exist yet.
 * Imports will fail until Phase 3 implementation provides the module.
 *
 * Covers spec §FR3 + §TR2:
 * - Happy path: valid data → Effect.succeed with parsed output
 * - Failure: invalid data → Effect.fail with ValidationError
 * - ValidationError structure: _tag, message, issues fields
 * - Effect.gen integration: yield* + error propagation
 */
import { Cause, Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
// eslint-disable-next-line import/no-unresolved -- TDD red: module not created yet
import { parseWithEffect, ValidationError } from '../../src/schemas/effect-wrapper.js';
// eslint-disable-next-line import/no-unresolved -- TDD red: zod/v4 not installed yet
import { z } from 'zod/v4';

// ── Test schemas ────────────────────────────────────────────────────────────────

const TestSchema = z.object({
  name: z.string(),
  age: z.number().int().positive(),
});

const NestedSchema = z.object({
  user: z.object({
    email: z.string().email(),
  }),
  tags: z.array(z.string()),
});

// ── Helpers ─────────────────────────────────────────────────────────────────────

/** Extract the first failure error from an Exit. Throws if the exit is Success. */
function extractFailureError<E>(exit: Exit.Exit<unknown, E>): E {
  if (Exit.isFailure(exit)) {
    const opt = Cause.failureOption(exit.cause);
    if (opt._tag === 'Some') {
      return opt.value;
    }
    throw new Error('Exit.Failure has no failure cause');
  }
  throw new Error('Expected Exit.Failure');
}

// ── Happy path ──────────────────────────────────────────────────────────────────

describe('parseWithEffect — happy path', () => {
  it('returns Effect.succeed for valid data', () => {
    const result = Effect.runSync(parseWithEffect(TestSchema, { name: 'Alice', age: 30 }));

    expect(result).toEqual({ name: 'Alice', age: 30 });
  });

  it('handles nested objects correctly', () => {
    const result = Effect.runSync(
      parseWithEffect(NestedSchema, {
        user: { email: 'alice@example.com' },
        tags: ['admin', 'active'],
      }),
    );

    expect(result).toEqual({
      user: { email: 'alice@example.com' },
      tags: ['admin', 'active'],
    });
  });

  it('strips unknown keys by default (zod behavior)', () => {
    const result = Effect.runSync(parseWithEffect(TestSchema, { name: 'Bob', age: 25, extra: 'should be stripped' }));

    expect(result).toEqual({ name: 'Bob', age: 25 });
    expect((result as Record<string, unknown>).extra).toBeUndefined();
  });
});

// ── Error path ──────────────────────────────────────────────────────────────────

describe('parseWithEffect — error path', () => {
  it('returns Effect.fail for invalid data (wrong type)', () => {
    const effect = parseWithEffect(TestSchema, { name: 123, age: 30 });

    const exit = Effect.runSyncExit(effect);
    expect(Exit.isFailure(exit)).toBe(true);

    const error = extractFailureError(exit);
    expect(error).toBeInstanceOf(ValidationError);
  });

  it('returns ValidationError with message field', () => {
    const effect = parseWithEffect(TestSchema, { name: 'Carl', age: -5 });

    const exit = Effect.runSyncExit(effect);
    const error = extractFailureError(exit);
    expect(error.message).toBeTypeOf('string');
    expect(error.message.length).toBeGreaterThan(0);
  });

  it('returns ValidationError with issues array containing path and message', () => {
    const effect = parseWithEffect(TestSchema, { name: 999, age: 'not-a-number' });

    const exit = Effect.runSyncExit(effect);
    const error = extractFailureError(exit);
    expect(Array.isArray(error.issues)).toBe(true);
    expect(error.issues.length).toBeGreaterThan(0);

    for (const issue of error.issues) {
      expect(issue).toHaveProperty('path');
      expect(issue).toHaveProperty('message');
      expect(issue.message).toBeTypeOf('string');
    }
  });

  it('includes path information for nested field errors', () => {
    const effect = parseWithEffect(NestedSchema, {
      user: { email: 'not-an-email' },
      tags: [1, 'valid'],
    });

    const exit = Effect.runSyncExit(effect);
    const error = extractFailureError(exit);

    // At least one issue should have a path indicating 'user.email' or 'tags'
    const paths = error.issues.map((i) => i.path);
    const hasNestedPath = paths.some(
      (p) => (Array.isArray(p) && p.includes('user')) || (Array.isArray(p) && p.includes('tags')),
    );
    expect(hasNestedPath).toBe(true);
  });

  it('produces distinct ValidationError instances per call', () => {
    const e1 = Effect.runSyncExit(parseWithEffect(TestSchema, { name: 1, age: 30 }));
    const e2 = Effect.runSyncExit(parseWithEffect(TestSchema, { name: 'D', age: 'x' }));

    const err1 = extractFailureError(e1);
    const err2 = extractFailureError(e2);

    // Different errors should have different messages or issues
    const same = err1.message === err2.message && JSON.stringify(err1.issues) === JSON.stringify(err2.issues);
    expect(same).toBe(false);
  });
});

// ── ValidationError structure ───────────────────────────────────────────────────

describe('ValidationError structure', () => {
  it('has _tag field equal to "ValidationError"', () => {
    const effect = parseWithEffect(TestSchema, { name: true, age: 30 });

    const exit = Effect.runSyncExit(effect);
    const error = extractFailureError(exit);

    expect(error._tag).toBe('ValidationError');
  });

  it('has message field (string, non-empty)', () => {
    const effect = parseWithEffect(TestSchema, { name: 'Eve', age: 'abc' });

    const exit = Effect.runSyncExit(effect);
    const error = extractFailureError(exit);

    expect(error.message).toBeTypeOf('string');
    expect(error.message.length).toBeGreaterThan(0);
  });

  it('has issues field (array of objects with path and message)', () => {
    const effect = parseWithEffect(TestSchema, { name: null, age: 30 });

    const exit = Effect.runSyncExit(effect);
    const error = extractFailureError(exit);

    expect(Array.isArray(error.issues)).toBe(true);
    expect(error.issues.length).toBeGreaterThan(0);

    const firstIssue = error.issues[0];
    expect(firstIssue).toHaveProperty('path');
    expect(firstIssue).toHaveProperty('message');
    expect(firstIssue.message).toBeTypeOf('string');
  });

  it('is an instance of Error (for stack trace support)', () => {
    const effect = parseWithEffect(TestSchema, { name: 'Frank', age: 'nope' });

    const exit = Effect.runSyncExit(effect);
    const error = extractFailureError(exit);

    expect(error).toBeInstanceOf(Error);
  });
});

// ── Effect.gen integration ──────────────────────────────────────────────────────

describe('parseWithEffect — Effect.gen integration', () => {
  it('success path: yield* returns parsed data', () => {
    const program = Effect.gen(function* () {
      const data = yield* parseWithEffect(TestSchema, { name: 'Grace', age: 28 });
      return data.name.toUpperCase();
    });

    const result = Effect.runSync(program);
    expect(result).toBe('GRACE');
  });

  it('failure path: yield* propagates ValidationError', () => {
    const program = Effect.gen(function* () {
      const data = yield* parseWithEffect(TestSchema, { name: 'Hank', age: 'bad' });
      return data.name;
    });

    const exit = Effect.runSyncExit(program);
    const error = extractFailureError(exit);
    expect(error).toBeInstanceOf(ValidationError);
  });

  it('success path does not reach catchAll block', () => {
    const program = Effect.gen(function* () {
      const data = yield* parseWithEffect(TestSchema, { name: 'Ivy', age: 35 });
      return data.age;
    }).pipe(Effect.catchAll(() => Effect.succeed(-1)));

    const result = Effect.runSync(program);
    expect(result).toBe(35);
  });

  it('failure path can be caught and recovered', () => {
    const program = Effect.gen(function* () {
      const data = yield* parseWithEffect(TestSchema, { name: 'Jack', age: 'invalid' });
      return data.age;
    }).pipe(
      Effect.catchAll((err) => {
        expect(err._tag).toBe('ValidationError');
        expect(err.message.length).toBeGreaterThan(0);
        return Effect.succeed(-1);
      }),
    );

    const result = Effect.runSync(program);
    expect(result).toBe(-1);
  });

  it('chained validation: two sequential parseWithEffect calls, both succeed', () => {
    const program = Effect.gen(function* () {
      const user = yield* parseWithEffect(TestSchema, { name: 'Kate', age: 22 });
      const nested = yield* parseWithEffect(NestedSchema, {
        user: { email: `${user.name.toLowerCase()}@example.com` },
        tags: ['verified'],
      });
      return nested.user.email;
    });

    const result = Effect.runSync(program);
    expect(result).toBe('kate@example.com');
  });

  it('chained validation: first failure short-circuits second parse', () => {
    const program = Effect.gen(function* () {
      yield* parseWithEffect(TestSchema, { name: 'Leo', age: 'nope' });
      // If this line runs, test fails — first parse should have errored
      yield* parseWithEffect(NestedSchema, {
        user: { email: 'should-not@reach.here' },
        tags: [],
      });
      return 'unreachable';
    });

    const exit = Effect.runSyncExit(program);
    const error = extractFailureError(exit);
    expect(error).toBeInstanceOf(ValidationError);
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────────────

describe('parseWithEffect — edge cases', () => {
  it('rejects undefined input', () => {
    const effect = parseWithEffect(TestSchema, undefined);
    const exit = Effect.runSyncExit(effect);
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it('rejects null input', () => {
    const effect = parseWithEffect(TestSchema, null);
    const exit = Effect.runSyncExit(effect);
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it('rejects empty object when required fields are missing', () => {
    const effect = parseWithEffect(TestSchema, {});
    const exit = Effect.runSyncExit(effect);
    const error = extractFailureError(exit);
    // Should report multiple missing fields
    expect(error.issues.length).toBeGreaterThanOrEqual(1);
  });

  it('accepts extra fields beyond schema (zod default strip)', () => {
    const result = Effect.runSync(
      parseWithEffect(TestSchema, {
        name: 'Max',
        age: 40,
        extraField: 'ignored',
        another: true,
      }),
    );

    expect(result).toEqual({ name: 'Max', age: 40 });
  });
});
