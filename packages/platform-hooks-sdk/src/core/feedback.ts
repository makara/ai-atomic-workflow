/**
 * Unified output/feedback interface (prompt-consistency-metrics, card 5) —
 * one canonical emission path for informational output and feedback,
 * built on the DeliveryContext channels (ADR 0193 delivery translation).
 *
 * Consumers (modules, agent-side report surfaces) deliver operator
 * notifications, settlement lines, and hint-compliance evidence rows
 * through this interface instead of reaching delivery handles directly
 * or keeping module-private parallel delivery paths. The interface is
 * additive over the existing DeliveryContext channels — adapters are
 * unchanged; fail-open is preserved (a throwing delivery never throws
 * into the platform loop).
 *
 * Channel mapping:
 * - `notify` — operator-visible line (DeliveryContext.notify);
 * - `mark` — persistent record (DeliveryContext.appendEntry, channel
 *   `feedback`);
 * - `compliance` — operator-visible line AND a persistent compliance
 *   record (appendEntry channel `feedback`, kind `compliance`).
 *
 * @module
 */

import type { DeliveryContextService } from './types.js';

/** One canonical output/feedback line — the unified emission shape. */
export interface FeedbackLine {
  /** Line kind — operator notification, persistent mark, or compliance/measurement evidence. */
  readonly kind: 'notify' | 'mark' | 'compliance';
  /** Line text — the operator-visible content. */
  readonly text: string;
  /** Structured payload — optional; compliance rows carry rule/observed/evidence facts here. */
  readonly payload?: Readonly<Record<string, unknown>>;
}

/** The unified output/feedback interface — the single emission path consumers use. */
export interface FeedbackChannel {
  /** Emit one feedback line through the unified interface. Never throws (fail-open). */
  emit(line: FeedbackLine): void;
}

/**
 * Build the unified feedback channel over a DeliveryContext service.
 * Every emission routes through the canonical channels; a throwing
 * delivery degrades to a no-op (fail-open, zero-deny).
 */
export function createFeedbackChannel(delivery: DeliveryContextService): FeedbackChannel {
  return {
    emit(line) {
      const record = line.payload === undefined ? { text: line.text } : { text: line.text, ...line.payload };
      try {
        if (line.kind === 'mark') {
          delivery.appendEntry('feedback', record);
          return;
        }
        delivery.notify(line.text);
        if (line.kind === 'compliance') {
          delivery.appendEntry('feedback', { kind: 'compliance', ...record });
        }
      } catch {
        // fail-open — a delivery failure never throws into the platform loop
      }
    },
  };
}
