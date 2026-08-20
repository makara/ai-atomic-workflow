/**
 * Single chain composition — the one place the R1 discipline transform
 * runs: the echo. Both platform faces execute the identical composition;
 * adapters only normalize to EchoMessage, pass the rendered echo line
 * through the hooks, and denormalize the result.
 *
 * R2 (fidelity errored-result reduction + working-face compression) is
 * not part of this chain: the context-management module
 * (@ai-atomic-workflow/graph-fidelity-context) delivers its landing
 * transform via the platform-hooks-sdk contract (ADR 0192); core stays
 * echo-only.
 *
 * Change detection is single-source: the chain returns `undefined` when
 * the echo stage changed no message (adapters forward the transcript
 * unchanged); a new array otherwise. Never mutates the input.
 *
 * Echo stage semantics: the discipline line the adapter rendered
 * (identity pointer + progress) appended to the most recent user-like
 * message — canonical dedup + in-place refresh in the discipline core.
 *
 * Pure: no platform imports, no I/O.
 *
 * @module
 */

import type { EchoMessage } from './chain-types.js';
import { applyDisciplineEcho } from './discipline.js';

/** Adapter-derived signals — the only face-specific inputs to the chain. */
export interface FidelityChainHooks {
  /** Rendered discipline echo line — appended by the echo stage (absent → no echo). */
  readonly echo?: string;
}

/**
 * Run the R1 discipline chain once — echo over a normalized transcript.
 *
 * @param messages — normalized transcript (EchoMessage shape).
 * @param hooks — adapter-derived signals (rendered echo line).
 * @returns a new array when the echo stage changed a message, undefined
 *          otherwise (the unchanged-passthrough contract).
 */
export function applyFidelityChain(
  messages: readonly EchoMessage[],
  hooks?: FidelityChainHooks,
): EchoMessage[] | undefined {
  if (hooks?.echo === undefined || hooks.echo.length === 0) return undefined;
  return applyDisciplineEcho(messages, hooks.echo);
}
