/**
 * Bind registry (sdk-hooks-capabilities) — produce the platform-shaped
 * registration a consumer wires into its own platform entry point. The
 * SDK never registers into a platform itself. The registry binds each
 * adapter to the COMPOSED per-canonical-hook middleware chains —
 * consumers register middleware via `hooks.<hook>.use(...)` or through
 * capability objects (`createCapabilities(hooks)`); unknown hooks fail
 * loudly at `use` time (MiddlewareHookError), so the bind path needs no
 * key validation.
 *
 * The former `bind(adapter, handlers)` handler-set registry is replaced
 * by this chain registry; the `layers` parameter was removed
 * (sdk-hooks-capabilities — capability configuration is captured at
 * bind time, never a per-dispatch Layer).
 *
 * R-SDK2 (ADR 0199): bind returns a Schema-tagged discriminated union
 * `{ tag, value }` — the consumer receives a precisely typed platform
 * registration with zero casts and zero `unknown` narrowing.
 */

import { Schema } from 'effect';
import { chainsOf, type Hooks } from './middleware.js';
import type { Adapter } from './types.js';
/** Bind-result platform tags — Schema-backed literal union. */
export const BIND_TAG_SCHEMA = Schema.Union(Schema.Literal('omp'), Schema.Literal('opencode'));
export type BindTag = Schema.Schema.Type<typeof BIND_TAG_SCHEMA>;

/** Schema-tagged bind result — one member per platform, precisely typed. */
export type BindResult<P extends BindTag, V> = { tag: P; value: V };

/**
 * Bind the composed middleware chains to a platform adapter; returns the
 * Schema-tagged discriminated union `{ tag, value }` — `tag` is the
 * adapter's platform literal, `value` is the platform-shaped
 * registration (OMP factory / opencode plugin shape). No `unknown`, no
 * casts.
 */
export function bind<P extends BindTag, V>(adapter: Adapter<P, V>, hooks: Hooks): BindResult<P, V> {
  return { tag: adapter.platform, value: adapter.bind(chainsOf(hooks)) };
}
