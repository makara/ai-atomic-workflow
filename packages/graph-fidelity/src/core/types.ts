/**
 * Core data contract — the crossing seam between the platform adapters and
 * the pure core. Plain serializable data only; no platform imports, no
 * classes. Adapters normalize platform payloads into these shapes; core
 * functions operate on them and return them.
 *
 * @module
 */

/** Message shape the discipline core operates on (duck-typed across platforms). */
export interface EchoMessage {
  role?: string;
  text?: string;
}

/** Extracted frame facts: node id + the discipline clause. */
export interface FrameClause {
  nodeId: string;
  clause: string;
}

/** Tool-call record extracted from an assistant part. */
export interface ToolCallRecord {
  /** Platform tool-call id — links the assistant call to its result part. */
  readonly id: string;
  readonly name: string;
  readonly signature: string;
}

/** Observability facts accumulated from platform lifecycle events. */
export interface ObservabilityFacts {
  requests: number;
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  compactions: number;
  ttsrTriggers: number;
  toolExecutions: number;
}

/** Persistent accumulator — injectable for tests. */
export interface Accumulator {
  read(): ObservabilityFacts;
  record(partial: Partial<ObservabilityFacts>): void;
}
