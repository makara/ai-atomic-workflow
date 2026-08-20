/**
 * opencode platform entry (`dist/opencode.js`) — the graph-fidelity
 * module bound to the opencode platform through the SDK
 * (`bind(opencodeAdapter, hooks)`): the SDK produces the plugin
 * server whose hooks surface carries the canonical translations
 * (tool.execute.after landing, message.updated usage via the SDK-bound
 * `event` hook, experimental.chat.messages.transform transcript
 * fallback). The server wrapper returns the SDK-bound hooks as-is
 * (ADR 0193 round-2): no event shadowing and no display configuration
 * — the opencode adapter owns every delivery translation (toast /
 * in-place transcript queue) and the event-stream usage seam.
 *
 * Pure bind shell (FR3 structural criterion, ADR 0199 round-2 note;
 * sdk-surface-convergence completion): factory call + bind +
 * platform-entry shape export — no handler definitions, no singleton
 * assembly, NO option-shape guard. Per-server-call options (deny / PCL
 * mark channel, ADR 0177/0196) are validated by the SDK opencode
 * adapter at bind time and provided to the bound middleware through the
 * effect environment; this shell passes the opaque platform options
 * straight to the SDK-bound server.
 *
 * @module
 */

import { bind } from '@ai-atomic-workflow/platform-hooks-sdk';
import { opencodeAdapter } from '@ai-atomic-workflow/platform-hooks-sdk/adapters';
import { createFidelityModule } from './index.js';

/** The plugin id — file plugins REQUIRE the module id (loader resolvePluginId contract). */
export const id = 'graph-fidelity';

/** Module-local singleton — one per bundle instance. */
const module = createFidelityModule();

/** The SDK-assembled plugin shape — bound ONCE at module level (ADR 0196 module singleton, same as the omp face). Capability configuration is captured at bind time by the capability objects. */
const plugin = bind(opencodeAdapter, module.hooks).value;

/**
 * The plugin server — declared with the platform-type-free widened
 * signature (the load contract is the runtime shape; the SDK's hook
 * records satisfy the platform Hooks contract structurally). No cast of
 * the SDK bind value — mirror of the context package entry (ADR 0199).
 * The opaque per-server-call options record is passed through to the
 * SDK-bound server, which owns shape validation (sdk-surface-
 * convergence; the former module-level options slot is gone).
 */
const server: (input: unknown, options?: unknown) => Promise<Record<string, unknown>> = async (input, options) =>
  plugin.server(input, options);

/**
 * The loadable plugin module — the opencode file-plugin loader reads
 * v1 plugins from `mod.default` only. Named exports above are
 * informational; the default export is the load contract.
 */
export default { id, server };
