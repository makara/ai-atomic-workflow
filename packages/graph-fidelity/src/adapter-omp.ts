/**
 * OMP platform entry (`dist/omp.js`) — the graph-fidelity module bound
 * to the OMP platform through the SDK (`bind(ompAdapter, hooks)`):
 * the SDK owns every platform hook registration and the OMP→canonical
 * translation (payload = the hook event data, per the real platform
 * contract). Zero direct platform hook calls and zero platform imports
 * live here — the module's canonical middleware treat the SDK payload
 * opaquely.
 *
 * Pure bind shell (FR3 structural criterion, ADR 0199 round-2 note):
 * factory call + bind + platform-entry shape export — no handler
 * definitions, no singleton assembly. Business middleware live in
 * `createFidelityModule()` (`./index.js`).
 *
 * @module
 */

import { bind } from '@ai-atomic-workflow/platform-hooks-sdk';
import { ompAdapter } from '@ai-atomic-workflow/platform-hooks-sdk/adapters';
import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent';
import { createFidelityModule } from './index.js';

/** Module-local singleton — one per bundle instance. */
const module = createFidelityModule();

/** The SDK-assembled factory — `(pi: ExtensionAPI) => void` (platform registration path). Capability configuration is captured at bind time by the capability objects. */
const factory = bind(ompAdapter, module.hooks).value;

/** Extension factory — the platform's native extension shape (no options: R1 needs none). */
export default function ompExtension(pi: ExtensionAPI): void {
  // Platform registration — the SDK ompAdapter owns the canonical →
  // snake_case translation, payload normalization, and delivery
  // translation (notify/appendEntry from the DeliveryContext).
  factory(pi);
}
