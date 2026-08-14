/**
 * Core data contract — the crossing seam between the platform adapters and
 * the pure core. Plain serializable data only; no platform imports, no
 * classes. Adapters normalize platform payloads into these shapes; core
 * functions operate on them and return them.
 *
 * R2 (cost economy) runtime plumbing was removed during the R2/R1
 * decoupling (ADR 0175): the reference tree under
 * `graph-fidelity-context/src/context-management/` vendors its own protection/observability
 * types where it needs them; shared core types stay importable from the
 * reference tree (import direction: runtime → core → reference only).
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

/** Tool-call record extracted from an assistant part. */
export interface ToolCallRecord {
  readonly id: string;
  readonly name: string;
}

/** Observability facts accumulated from platform lifecycle events — consumed by the suspended R2 reference (kept for the redesign). */
export interface ObservabilityFacts {
  requests: number;
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  compactions: number;
  ttsrTriggers: number;
  toolExecutions: number;
}

/** Persistent accumulator — injectable for tests (suspended R2 reference). */
export interface Accumulator {
  read(): ObservabilityFacts;
  record(partial: Partial<ObservabilityFacts>): void;
}
