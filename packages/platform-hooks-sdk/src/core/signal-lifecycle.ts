/**
 * Signal-chain payload types + usage extraction (sdk-hooks-capabilities)
 * — the R1 chain phases (assembly → echo → restore) now live behind the
 * `lifecycle` capability (core/lifecycle.ts); the former
 * `createSignalLifecycle` facade and its AssemblyInput/RestoreInput/
 * SignalLifecycle contract were deleted (clean cutover — the capability
 * consumes the canonical event + the adapter-provided FaceShapeService;
 * consumers never touch platform shapes).
 *
 * Frame selection is the single role-order parameterization (ADR 0176
 * F2): `frameRoles`/`roleOf` declare the preferred (user-like) role set
 * — latest preferred-role frame wins, all-roles fallback; omitted ->
 * all-roles latest. Platform differences are parameters, not divergent
 * implementations.
 *
 * @module
 */

import { isRecord } from './shape-ops.js';

/** Observation phase — token usage facts observed on message completion. */
export interface UsageFacts {
  readonly input?: number;
  readonly output?: number;
  readonly cacheRead?: number;
  readonly cacheWrite?: number;
  readonly totalTokens?: number;
}

/** Numeric-only usage extraction — flat numeric fields only (SDK single source). */
function pickUsageNumbers(source: Record<string, unknown>): UsageFacts {
  const facts: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    totalTokens?: number;
  } = {};
  for (const key of ['input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens'] as const) {
    const value = source[key];
    if (typeof value === 'number') facts[key] = value;
  }
  return facts;
}

function hasUsageNumbers(facts: UsageFacts): boolean {
  return (
    facts.input !== undefined ||
    facts.output !== undefined ||
    facts.cacheRead !== undefined ||
    facts.cacheWrite !== undefined ||
    facts.totalTokens !== undefined
  );
}

/**
 * Usage-facts extraction (R-SDK5, ADR 0199) — SDK single source for
 * consumer usage extraction; consumer-local extractors are removed.
 * Handles the canonical usage payload (`{ usage: flat numeric fields }`,
 * message_end / message_update) and the canonical event-stream payload
 * (`{ properties: { info: { tokens: { input, output, cache: {read, write} } } } }`,
 * opencode message.updated). Returns `undefined` when no reportable
 * usage is present.
 */
export function parseUsageFacts(payload: unknown): UsageFacts | undefined {
  if (!isRecord(payload)) return undefined;
  const usage = isRecord(payload.usage) ? payload.usage : undefined;
  if (usage !== undefined) {
    const facts = pickUsageNumbers(usage);
    return hasUsageNumbers(facts) ? facts : undefined;
  }
  const props = isRecord(payload.properties) ? payload.properties : undefined;
  const info = isRecord(props?.info) ? props.info : undefined;
  const tokens = isRecord(info?.tokens) ? info.tokens : undefined;
  if (tokens === undefined) return undefined;
  const flat: Record<string, unknown> = {};
  if (typeof tokens.input === 'number') flat.input = tokens.input;
  if (typeof tokens.output === 'number') flat.output = tokens.output;
  const cache = isRecord(tokens.cache) ? tokens.cache : undefined;
  if (typeof cache?.read === 'number') flat.cacheRead = cache.read;
  if (typeof cache?.write === 'number') flat.cacheWrite = cache.write;
  const facts = pickUsageNumbers(flat);
  return hasUsageNumbers(facts) ? facts : undefined;
}
