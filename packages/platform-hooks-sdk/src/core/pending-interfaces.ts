/**
 * Pending interfaces — defined, deliberately NOT implemented (ADR 0196).
 * Every hook without a cross-platform substitute (or with a claimed
 * substitute face) keeps a named, typed interface with an absence reason
 * and a future substitution path. Zero runtime implementation, zero
 * adapter rows, zero barrel handler exports — assertions pin this.
 *
 * The list derives from the catalog; the payload type for every pending
 * interface is the structural `PendingPayloads` map (machine-checkable).
 */

import { pendingInterfacesOf } from './catalog.js';

export interface PendingInterfaceEntry {
  /** Interface name (snake_case, per naming rules). */
  name: string;
  /** Platform hooks behind this interface. */
  hooks: readonly string[];
  /** Absence reason — why no cross-platform substitute exists. */
  reason: string;
  /** Future substitution path. */
  futurePath: string;
}

/** Pending interfaces — 37 entries, derived from CATALOG (ADR 0196). */
export const PENDING_INTERFACES: readonly PendingInterfaceEntry[] = pendingInterfacesOf();

/** Structural payload type for every pending interface (defined, unimplemented). */
export type PendingPayloads = Record<(typeof PENDING_INTERFACES)[number]['name'], Record<string, unknown>>;
