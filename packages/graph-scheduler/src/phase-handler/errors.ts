/**
 * PhaseHandler errors — runtime error classes for handler dispatch.
 *
 * Extracted from types.ts.
 * types.ts holds only interface/type declarations.
 *
 * @module
 */

/** Base error for phase handler operations. */
export class PhaseHandlerError extends Error {
  constructor(
    message: string,
    public readonly phaseType: string,
  ) {
    super(message);
    this.name = 'PhaseHandlerError';
  }
}

/** Thrown when dispatch encounters an unknown phase type. */
export class UnknownPhaseTypeError extends PhaseHandlerError {
  constructor(phaseType: string, registeredTypes: readonly string[]) {
    const registered = registeredTypes.join(', ');
    super(`Unknown phase type '${phaseType}'. Registered types: ${registered || '(none)'}`, phaseType);
    this.name = 'UnknownPhaseTypeError';
  }
}
