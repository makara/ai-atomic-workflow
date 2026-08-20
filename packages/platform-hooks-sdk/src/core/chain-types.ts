/**
 * Core data contract — the crossing seam between the platform adapters and
 * the pure core. Plain serializable data only; no platform imports, no
 * classes. Adapters normalize platform payloads into these shapes; core
 * functions operate on them and return them.
 *
 * R2 (cost economy) runtime plumbing lives in the context-management
 * module (@ai-atomic-workflow/graph-fidelity-context), which docks
 * through the platform-hooks-sdk contract (ADR 0192) — its types are
 * module-local, never imported from this core.
 *
 * @module
 */

/** Message shape the discipline core operates on (duck-typed across platforms). */
export interface EchoMessage {
  role?: string;
  text?: string;
  /** Tool-result user message (OMP shape) — not a genuine user input. */
  isToolResult?: boolean;
  /** Tool-result ids carried by this message (any role — OMP user blocks / opencode tool parts). */
  toolResultIds?: readonly string[];
}
