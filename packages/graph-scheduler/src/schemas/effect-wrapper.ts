import { Effect } from 'effect';
import { z } from 'zod/v4';

/**
 * Error type returned when zod schema validation fails.
 *
 * Extends Error for stack trace support; uses _tag discriminant for
 * Effect-TS error channel pattern matching.
 */
export class ValidationError extends Error {
  readonly _tag = 'ValidationError' as const;

  constructor(
    message: string,
    readonly issues: z.ZodIssue[],
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Parse unknown data against a zod schema, returning an Effect.
 *
 * On success: Effect.succeed(data) with the inferred type T.
 * On failure: Effect.fail(ValidationError) with all validation issues.
 */
export function parseWithEffect<T>(schema: z.ZodType<T>, data: unknown): Effect.Effect<T, ValidationError> {
  const result = z.safeParse(schema, data);

  if (result.success) {
    return Effect.succeed(result.data);
  }

  return Effect.fail(new ValidationError(result.error.message, result.error.issues));
}
