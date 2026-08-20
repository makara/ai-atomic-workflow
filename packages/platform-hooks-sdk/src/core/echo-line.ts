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
 * Budget bar, mode, and status flags are NOT rendered (display
 * minimalism — pruned line). The value-ratio benefit graphic is NOT
 * rendered here (user ruling, round 17) — it lives on the context
 * module's settlement line; the echo spec pins identity + progress
 * only. The shared render helpers (renderCompact / renderBenefitSegment
 * / prefixClassOf) moved to the platform-hooks-sdk `./utils` subpath
 * (round 18, change graph-fidelity-context-r18-fixes) — single source,
 * no parity copies.
 *
 * Pure: no platform imports, no state. Adapters render + feed.
 *
 * @module
 */

/** Identity-only echo input — the frame-derived signals. */
export interface EchoLineInput {
  readonly nodeId: string;
  /** Progress segment `N/M` — from the frame (absent -> omitted). */
  readonly progress?: string;
}

/**
 * Render the single discipline echo line (identity + progress).
 * `nodeId` is the identity pointer (anchored frame node); `progress`
 * carries the frame's `N/M` segment when present. The value-ratio
 * benefit graphic is NOT rendered here (user ruling, round 17 — it
 * lives on the context module's settlement line; the echo spec pins
 * identity + progress only). No budget, no mode, no status-flag
 * segments.
 */
export function renderIdentityEcho({ nodeId, progress }: EchoLineInput): string {
  const segments: string[] = [`node ${nodeId}`];
  if (progress !== undefined && progress.length > 0) segments.push(progress);
  return `▣ [seam] ${segments.join(' · ')}`;
}
