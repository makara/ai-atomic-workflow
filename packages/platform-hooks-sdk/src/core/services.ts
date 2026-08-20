/**
 * Delivery services (sdk-hooks-capabilities) — the per-dispatch
 * DeliveryContext remains a service provided by the adapter; built-in
 * capability configuration is NO LONGER an Effect service (captured at
 * bind time as plain objects by the capability objects — `hints.use()`
 * / `resident.use()` / `lifecycle.echo()`). The former HintsConfig /
 * ResidentConfig Tags and their default Layers were deleted.
 *
 * Pure — no platform imports, no cross-module state.
 *
 * @module
 */

import type { DeliveryContextService } from './types.js';

/** Fail-open default delivery — direct dispatch without a platform adapter. */
export const NOOP_DELIVERY: DeliveryContextService = {
  notify: () => undefined,
  appendEntry: () => undefined,
  mutate: () => undefined,
};
