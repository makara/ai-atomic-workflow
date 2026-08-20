/**
 * Capability objects (sdk-hooks-capabilities) — the consumer-facing
 * assembly surface over the chain registry. `createCapabilities(hooks)`
 * returns the three built-in capability objects:
 *
 * - `lifecycle.echo(config?)` — the R1 echo chain, default `context` seam
 * - `hints.use(fn)` — scenario hints, default `tool_result` seam
 * - `resident.use(config)` — resident prompts, default `before_agent_start` seam
 *
 * Each capability self-wires its middleware onto its default canonical
 * hook (explicit hook target overrides; unknown hook → loud
 * MiddlewareHookError) and returns an unwire handle. Configuration is
 * captured at bind time as plain objects — no config Services, no
 * per-dispatch Layers (the former `layers` bind parameter is deleted).
 * `hooks.<hook>.use(mw)` remains the low-level escape hatch for custom
 * middleware (unchanged).
 *
 * Method names never repeat the capability name (user decision, adopt
 * round 2): `hints.use()` not `hints.hint()`, `resident.use()` not
 * `resident.resident()`.
 *
 * Pure — no platform imports, no cross-module state.
 *
 * @module
 */

import { createLifecycle, type LifecycleCapability } from './lifecycle.js';
import type { Hooks } from './middleware.js';
import { createResident, type ResidentCapability } from './resident.js';
import { createHints, type HintsCapability } from './scenarios.js';

/** The three built-in capability objects over one hooks surface. */
export interface Capabilities {
  /** R1 signal chain — `echo(config?, hook?)`. */
  readonly lifecycle: LifecycleCapability;
  /** Scenario-keyed hints — `use(fn, hook?)` (display-decision middleware). */
  readonly hints: HintsCapability;
  /** Resident prompts — `use(config, hook?)`. */
  readonly resident: ResidentCapability;
}

/** Create the built-in capability objects over a hooks surface. */
export function createCapabilities(hooks: Hooks): Capabilities {
  return {
    lifecycle: createLifecycle(hooks),
    hints: createHints(hooks),
    resident: createResident(hooks),
  };
}
