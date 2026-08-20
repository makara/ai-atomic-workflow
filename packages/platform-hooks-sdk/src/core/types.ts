/**
 * Unified hook contract types — the SDK's single contract surface.
 * Zero platform imports: platform contract types appear in adapter
 * files only (never in published declarations).
 *
 * sdk-hooks-middleware: hook handling is expressed as Effect middleware
 * transformers (core/middleware.ts) composed through per-hook `use`
 * chains — the former handler-set contract and dual-face dispatch API
 * are replaced by the single-face middleware chain. The delivery
 * contract (Effect success type) and canonical error type remain.
 */

import type { Schema } from 'effect';
import { Context, type Layer } from 'effect';
import type { CanonicalEvent } from './events.js';
import type { HookChains, Middleware } from './middleware.js';
import { CANONICAL_PAYLOAD_SCHEMAS, type CanonicalError } from './schemas.js';

export type {
  CanonicalBeforeAgentStart,
  CanonicalChatMessage,
  CanonicalContextPayload,
  CanonicalCredentialDisabled,
  CanonicalError,
  CanonicalEventStream,
  CanonicalLifecycleEvent,
  CanonicalSessionBeforeCompact,
  CanonicalToolApprovalRequested,
  CanonicalToolCall,
  CanonicalToolResult,
  CanonicalUsagePayload,
  CanonicalUserInput,
} from './schemas.js';

/** Canonical payload type of a canonical event — Schema-inferred (R-SDK2 single source). */
export type CanonicalPayloadOf<K extends CanonicalEvent> = {
  [N in CanonicalEvent]: Schema.Schema.Type<(typeof CANONICAL_PAYLOAD_SCHEMAS)[N]>;
}[K];

/**
 * Canonical event object delivered to the chain. `payload` is typed per
 * canonical event (discriminated by `name`) — middleware access the
 * event through the CanonicalEvent service with zero casts.
 */
export interface HookEvent<K extends CanonicalEvent = CanonicalEvent> {
  name: K;
  payload: CanonicalPayloadOf<K>;
}

/**
 * Unified delivery context — provided to middleware as a Context.Service
 * through the effect environment (Layer-composed, per the composed
 * services contract). Every delivery channel is platform-translated by
 * the active adapter; consumers never touch platform handles.
 */
export class DeliveryContext extends Context.Tag('DeliveryContext')<
  DeliveryContext,
  {
    /** operator-visible feedback — OMP ctx.ui.notify (appendEntry transcript degradation when ctx.ui is absent) / opencode toast with transcript fallback */
    notify(text: string): void;
    /** persistent mark — OMP api.appendEntry / opencode declared-absent (no-op) */
    appendEntry(channel: string, payload: unknown): void;
    /**
     * Output-surface mutation. `target` = 'output' (the current event's
     * mutation output — opencode) or an explicit object. Array values are
     * written IN PLACE (splice): opencode rebuilds requests from the
     * original references and silently discards reassigned surfaces
     * (law L4). OMP: no-op — the return value is the surface.
     */
    mutate(target: 'output' | Record<string, unknown>, key: string, value: unknown): void;
  }
>() {}

/** The delivery service shape. */
export type DeliveryContextService = Context.Tag.Service<typeof DeliveryContext>;

/**
 * opencode per-server-call options (sdk-surface-convergence) — the
 * deny provider (embedding seam, ADR 0177) and the PCL mark debug
 * callback. Provided to bound middleware through the effect
 * environment by the opencode adapter (bind-time capture + per-server
 * call override); consumers hold no module-level mutable slot.
 */
export interface OpencodeAdapterOptions {
  readonly onPclDetected?: (record: { readonly text: string; readonly matched: string }) => void;
  readonly deny?: ToolDeny;
}

/**
 * opencode options service — the per-server-call options carrier in the
 * middleware environment. Absent → middleware fail open (no deny, no
 * PCL mark callback).
 */
export class OpencodeOptionsService extends Context.Tag('OpencodeOptions')<
  OpencodeOptionsService,
  OpencodeAdapterOptions | undefined
>() {}

// ── ToolDeny contract (ADR 0177; SDK-owned since sdk-surface-convergence) ──

/** Project environment snapshot — assembled by the deny provider (built-in assembly removed). */
export interface DenySnapshot {
  readonly projectRoot: string;
  readonly readOnly: boolean;
  /** `ignore_all_files_in_gitignore` — when true, `gitignorePatterns` gate writes. */
  readonly ignoreGitignore: boolean;
  /** `ignored_paths` — gitignore-style globs (same minimal subset as `gitignorePatterns`). */
  readonly ignoredPaths: readonly string[];
  /** `excluded_tools` — tools the registered engine does NOT serve; their writes stay uncovered. */
  readonly excludedTools: ReadonlySet<string>;
  /** gitignore rules (minimal glob subset); consulted only when `ignoreGitignore` is true. */
  readonly gitignorePatterns: readonly string[];
  /** registered engine configured + available at startup. */
  readonly engaged: boolean;
}

/** A platform write-tool invocation being evaluated. */
export interface WriteInvocation {
  readonly toolName: string;
  readonly path?: string;
  /** The target's REAL path (symlinks resolved); absent stays fail-open (providers own resolution). */
  readonly realPath?: string;
  readonly args: Readonly<Record<string, unknown>>;
}

/** Interception decision — `reason` is returned to the LLM when denied. */
export interface InterceptResult {
  readonly deny: boolean;
  readonly reason?: string;
}

/** The normative deny contract — determination + interception. */
export interface ToolDeny {
  readonly engaged: boolean;
  /** Can the registered write engine cover this write? */
  determine(input: WriteInvocation): boolean;
  /** deny only when engaged && write tool && determine() === true */
  intercept(input: WriteInvocation): InterceptResult;
}

/**
 * Chain success value — the delivery contract. The adapter translates
 * it per face (OMP: canonical partial merge keys; opencode: output-
 * surface value for the event's outKey); `void` = side-effect only.
 * Covers every real delivery shape: partial records, output arrays,
 * and primitive surface values (opencode outKey writes).
 */
export type HandlerResult = void | string | number | boolean | Record<string, unknown> | readonly unknown[];

/** Middleware — Effect transformer (single home: core/middleware.ts). */
export type { Middleware };

/**
 * Platform adapter contract — one translation table per platform.
 * `bind(chains)` receives the composed per-canonical-hook middleware
 * chains and produces the platform-shaped registration the consumer
 * wires into its own platform entry point. Capability configuration is
 * captured at bind time by the capability objects — no config Layer
 * exists on the bind path (sdk-hooks-capabilities). The platform tag is
 * a Schema literal (Schema-tagged discriminated union on the bind
 * result).
 */
export interface Adapter<P extends string, V> {
  /** platform identifier tag — 'omp' | 'opencode' */
  platform: P;
  bind(chains: HookChains): V;
}
