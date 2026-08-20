/**
 * Lifecycle capability (sdk-hooks-capabilities) — the R1 signal chain as
 * an SDK built-in: `lifecycle.echo(config?)` self-wires the echo
 * middleware (assembly → echo → restore as ONE pass) onto the default
 * `context` canonical hook (the echo seam per the signal-distribution
 * seam map; explicit hook target overrides; unknown hook → loud
 * MiddlewareHookError). Method name never repeats the capability name
 * (user decision: `lifecycle.echo()`).
 *
 * Card-3 closure: consumers NEVER pass platform shape descriptors. The
 * per-dispatch platform face shape comes from the `FaceShapeService`,
 * provided by the ADAPTER (the only platform-knowledge holder) before
 * the chain runs; absent face context → pass-through (fail-open). The
 * former `createSignalLifecycle` facade and the consumer-side
 * `lifecycle.assembly/echo/restore` threading were deleted.
 *
 * Face discrimination is payload-shape driven (single home — the SDK
 * capability): OMP context messages carry `content` (all-roles latest
 * frame over the text-only anchor surface, canonical partial
 * `{ messages }`); opencode transform messages carry `parts` (user-like
 * roles first, all-roles fallback; in-place `ctx.mutate` write-back,
 * law L4). Whole-hook fail-open on malformed elements; failure
 * diagnostics via the config `onError` hook (one process-log line, the
 * consumer's job — zero-deny).
 *
 * Pure — no platform imports, no cross-module state.
 *
 * @module
 */

import { Effect } from 'effect';
import type { EchoMessage } from './chain-types.js';
import { applyFidelityChain } from './chain.js';
import { renderIdentityEcho } from './echo-line.js';
import type { CanonicalEvent } from './events.js';
import { FaceShapeService } from './face-shape.js';
import { CanonicalEventService, type Hooks, type Middleware, wireCapability } from './middleware.js';
import { joinPartial } from './resident.js';
import { latestFrame, USER_LIKE_ROLES } from './runframe.js';
import { isRecord } from './shape-ops.js';
import { denormalizeMessages, normalizeToEchoMessages } from './shapes.js';
import { DeliveryContext } from './types.js';

/** Lifecycle capability configuration — captured at bind time (plain object). */
export interface LifecycleConfig {
  /** Failure diagnostics — one process-log line on the failure path only (zero-deny). */
  readonly onError?: (error: unknown) => void;
}

/** The lifecycle capability — `echo(config?, hook?)` self-wires the echo middleware to a canonical hook. */
export interface LifecycleCapability {
  /**
   * Wire the echo middleware onto a canonical hook. Defaults to
   * `context` (the echo seam per the seam map); an explicit hook target
   * (single or array of canonical names) overrides. Unknown hook →
   * loud MiddlewareHookError. Returns an unwire handle.
   */
  echo(config?: LifecycleConfig, hook?: CanonicalEvent | readonly CanonicalEvent[]): () => void;
}

/**
 * The echo phase — render + apply the discipline echo line over the
 * anchored latest frame (pure; the phase formerly exposed as
 * `createSignalLifecycle().echo`).
 */
function renderEchoPass(
  messages: readonly EchoMessage[],
  frameTexts: readonly string[],
  frameRoles?: { roles: ReadonlySet<string>; roleOf: readonly (string | undefined)[] },
): { messages: readonly EchoMessage[]; changed: boolean } {
  const frame = latestFrame(
    frameTexts,
    frameRoles === undefined ? undefined : { roles: frameRoles.roles, roleOf: frameRoles.roleOf },
  );
  const line =
    frame === undefined
      ? undefined
      : renderIdentityEcho({
          nodeId: frame.nodeId,
          ...(frame.progress === undefined ? {} : { progress: frame.progress }),
        });
  const result = line === undefined ? undefined : applyFidelityChain(messages, { echo: line });
  return result === undefined ? { messages, changed: false } : { messages: result, changed: true };
}

/**
 * Echo middleware factory — the dual-face context echo as ONE pass on
 * the shared `context` hook (moved from graph-fidelity; card-3 closure:
 * the face shape comes from the adapter-provided FaceShapeService).
 */
function createEchoMiddleware(config: LifecycleConfig): Middleware {
  return (self) =>
    Effect.gen(function* () {
      const event = yield* CanonicalEventService;
      const ctx = yield* DeliveryContext;
      const shapeOpt = yield* Effect.serviceOption(FaceShapeService);
      if (shapeOpt._tag === 'None') return yield* self; // no face context — pass through (fail-open)
      const shape = shapeOpt.value;
      // The canonical `messages` slot — guard-only (the union payload
      // round-trips through unknown so the record predicate narrows).
      const payload = event.payload as unknown;
      const messages = isRecord(payload) && Array.isArray(payload.messages) ? payload.messages : undefined;
      if (messages === undefined || messages.length === 0) return yield* self;
      try {
        if (messages.some((m) => isRecord(m) && 'content' in m)) {
          // ── OMP echo path — all-roles latest frame over the TEXT-ONLY
          // anchor surface (OMP messages carry `content`).
          const echoMessages = normalizeToEchoMessages(messages, shape);
          const out = renderEchoPass(
            echoMessages,
            messages.map((m) => shape.text(m) ?? ''),
          );
          if (!out.changed) return yield* self;
          const resultMessages = denormalizeMessages(messages, echoMessages, out.messages, shape);
          return yield* self.pipe(Effect.map((result) => joinPartial(result, { messages: resultMessages })));
        }
        // ── opencode echo path — user-like roles first, all-roles
        // fallback; the whole-hook fail-open guard (every element must be
        // a record — a malformed element aborts untouched).
        const platform = messages.every((m) => isRecord(m)) ? messages : undefined;
        if (platform === undefined || platform.length === 0) return yield* self;
        const echoMessages = normalizeToEchoMessages(platform, shape);
        const out = renderEchoPass(
          echoMessages,
          platform.map((m) => shape.text(m) ?? ''),
          {
            roles: USER_LIKE_ROLES,
            roleOf: echoMessages.map((m) => m.role),
          },
        );
        if (!out.changed) return yield* self;
        // Model-boundary seam: restore returns the consumer message model;
        // the canonical payload slot is platform-neutral unknown[] — the
        // write-back round-trip re-joins the consumer model IN PLACE.
        const restored = denormalizeMessages(platform, echoMessages, out.messages, shape);
        ctx.mutate('output', 'messages', restored);
        return yield* self;
      } catch (err) {
        // Failure diagnostics — the transform chain must never break a
        // request (zero-deny); one process-log line on the failure path
        // only; nothing is injected into LLM context.
        config.onError?.(err);
        return yield* self;
      }
    });
}

/** Create the lifecycle capability over a hooks surface (via createCapabilities). */
export function createLifecycle(hooks: Hooks): LifecycleCapability {
  return {
    echo(config = {}, hook = 'context') {
      return wireCapability(hooks, hook, createEchoMiddleware(config));
    },
  };
}
