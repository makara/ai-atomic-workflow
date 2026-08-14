/**
 * Single-line echo — display minimalism law 1 (one line per call)
 * renderer, R1 identity surface. ONE `▣ [seam]` line per LLM call:
 *
 *   ▣ [seam] node <id> · N/M
 *
 * - glyph anchor: `▣` visual anchor (DCP vocabulary) + `[seam]` machine
 *   grep anchor (dedup/self-heal keys on `[seam]`);
 * - identity pointer: node id only — the frame clause is NEVER copied
 *   (the frame block already sits in the same message);
 * - progress segment: `N/M` when the frame carries it (node index /
 *   total, handler-extended frame) — the "where am I" signal.
 *
 * The R2 benefit graphic (value-ratio bar + dual compact numbers) is
 * suspended — it moved to `graph-fidelity-context/src/context-management/echo-benefit.ts` as
 * redesign reference (ADR 0175). Budget bar, mode, and status flags are
 * NOT rendered.
 *
 * Pure: no platform imports, no state. Adapters render + feed.
 *
 * @module
 */

/** Identity-only echo input — the frame-derived signals only. */
export interface EchoLineInput {
  readonly nodeId: string;
  /** Progress segment `N/M` — from the frame (absent -> omitted). */
  readonly progress?: string;
}

/**
 * Render the single discipline echo line (identity + progress). `nodeId`
 * is the identity pointer (anchored frame node); `progress` carries the
 * frame's `N/M` segment when present. No benefit graphic, no budget,
 * no mode, no status-flag segments (R1-only surface).
 */
export function renderIdentityEcho({ nodeId, progress }: EchoLineInput): string {
  const segments: string[] = [`node ${nodeId}`];
  if (progress !== undefined && progress.length > 0) segments.push(progress);
  return `▣ [seam] ${segments.join(' · ')}`;
}
