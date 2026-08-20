/**
 * graph-fidelity module — the canonical middleware chains for SDK bind().
 *
 * Module shape mirrors @ai-atomic-workflow/graph-fidelity-context
 * (`createFidelityModule` + per-platform bind shells): all business
 * middleware and module singletons live HERE in one factory; the
 * platform adapter files (`src/adapter-omp.ts` / `src/adapter-opencode.ts`)
 * are pure bind shells (factory call + `bind` + platform-entry shape
 * export). FR3 structural criterion (ADR 0199 round-2 note): adapter
 * files define no handlers and hold no singleton assembly.
 *
 * sdk-hooks-capabilities: the module wires a single `createHooks()`
 * surface — the built-in capabilities (`resident.use(...)` on
 * `before_agent_start`, `hints.use(...)` on `tool_result`,
 * `lifecycle.echo(...)` on `context` — the echo chain is SDK-owned,
 * card-3 closed) plus the business middleware (PCL mark/detect, deny
 * gate) — and returns the `{ hooks }` surface both platform entries
 * bind (`bind(ompAdapter / opencodeAdapter, hooks)`). Configuration is
 * captured at bind time by the capability objects (no `layers`, no
 * config Services).
 *
 * @module
 */

import {
  CanonicalEventService,
  createCapabilities,
  createHooks,
  DeliveryContext,
  isRecord,
  joinTextChunks,
  OpencodeOptionsService,
  type CanonicalChatMessage,
  type CanonicalToolApprovalRequested,
  type CanonicalUserInput,
  type Hooks,
  type Middleware,
} from '@ai-atomic-workflow/platform-hooks-sdk';
import { Effect } from 'effect';

import { reportFailure } from './diagnostics.js';
import { detectPcl } from './pcl.js';
import { JCM_RESIDENT_GUIDANCE, PCL_VOCABULARY, SCENARIO_ENUMERATION_GUIDANCE } from './resident-data.js';

import { hintDisplay } from './hints.js';

/**
 * The fidelity module — the wired middleware chains for SDK bind().
 *
 * The R1 chain facade and the scenario hints interface + session
 * boundary are module-local singletons (ADR 0192/0195: singleton
 * ownership module-local). Per-server-call options (deny / PCL mark
 * channel) are SDK-owned: the opencode adapter validates and provides
 * them through the `OpencodeOptionsService` effect-environment tag
 * (sdk-surface-convergence) — no module-level mutable slot exists.
 *
 * One hooks surface (unlike the former two handler sets): both platform
 * entries bind the SAME `hooks` — the OMP face and the opencode face
 * register the same canonical chains; face-specific behavior is
 * payload-shape discriminated inside the shared middleware (the SDK's
 * established pattern — `resident` key-presence, `hints`
 * content-shape). The OMP face owns `user_input` (appendEntry mark
 * channel) and opencode owns `chat_message` / `tool_approval_requested`
 * (closure middleware — no appendEntry, deny gate) plus the shared
 * context/tool_result/before_agent_start seams.
 */
interface FidelityModule {
  /** Wired hooks surface — bind(ompAdapter/opencodeAdapter, hooks). */
  readonly hooks: Hooks;
}

/** Resident prompt entries — the P0 set (single source: src/resident-data.ts). */
const RESIDENT_CONTENT = [
  { id: 'pcl', title: 'PCL', text: PCL_VOCABULARY },
  { id: 'scenarios', title: 'Tool Discipline', text: SCENARIO_ENUMERATION_GUIDANCE },
  { id: 'jcodemunch', title: 'jCodemunch', text: JCM_RESIDENT_GUIDANCE },
];

/**
 * PCL input marking middleware — the OMP `user_input` seam (opencode
 * has no user_input hook — `chat_message` is the interface-level
 * alternative). Mechanical vocabulary detection, mark-only (never
 * routes, never rewrites text). The mark channel is `ctx.appendEntry` —
 * the SDK DeliveryContext translates it to api.appendEntry (ADR 0193).
 */
const pclMarkMiddleware: Middleware = (self) =>
  Effect.gen(function* () {
    const event = yield* CanonicalEventService;
    const ctx = yield* DeliveryContext;
    try {
      const payload = event.payload as CanonicalUserInput;
      if (payload.text.length === 0) return yield* self;
      const matched = detectPcl(payload.text);
      if (matched === undefined) return yield* self;
      ctx.appendEntry('graph-fidelity.pcl', { text: payload.text, matched });
      return yield* self;
    } catch (err) {
      reportFailure('input PCL mark', err);
      return yield* self;
    }
  });

/**
 * PCL detection middleware — the opencode `chat_message` input-seam
 * analog (fires when a NEW user message is received, BEFORE image
 * normalization / transform / LLM call). Mark-only: no routing, no
 * handled semantics, the message parts are never touched; the record
 * surfaces through the `onPclDetected` debug callback (per-server-call
 * options slot — opencode has no appendEntry, declared absence; the
 * mark channel is the closure-bound callback only, ADR 0195).
 */
const pclDetectMiddleware: Middleware = (self) =>
  Effect.gen(function* () {
    const event = yield* CanonicalEventService;
    const options = yield* OpencodeOptionsService;
    try {
      const payload = event.payload as CanonicalChatMessage;
      const message = isRecord(payload.message) ? payload.message : undefined;
      const text = Array.isArray(message?.parts) ? (joinTextChunks(message.parts) ?? '') : '';
      if (text.length === 0) return yield* self;
      const matched = detectPcl(text);
      if (matched === undefined) return yield* self;
      options?.onPclDetected?.({ text, matched });
      return yield* self;
    } catch (err) {
      // Failure diagnostics — the detection hook must never break the
      // message path (zero-deny); one process-log line on the failure
      // path only.
      reportFailure('chat.message', err);
      return yield* self;
    }
  });

/**
 * Deny gate middleware (ADR 0177) — the one non-text surface. Both
 * platform faces register the shared chain: the platform raises
 * `permission.ask` (opencode) / `tool_approval_requested` (OMP) only
 * when its permission flow asks (a non-raising flow is fail-open by
 * platform design — acceptable). The gate honors a deny provider
 * supplied via `options.deny` (opencode-only seam): the permission
 * type passes as the invocation's toolName and the provider decides.
 * The output shape exposes only `status`; the deny reason surfaces
 * through the platform's deny flow. Fail-open: no provider / provider
 * passthrough / throw → output untouched; never throws into the
 * platform loop. On the OMP face `ctx.mutate` is a no-op (return-style
 * surface) — the gate delivers status only through the opencode
 * in-place mutation.
 */
const denyGateMiddleware: Middleware = (self) =>
  Effect.gen(function* () {
    const event = yield* CanonicalEventService;
    const ctx = yield* DeliveryContext;
    const options = yield* OpencodeOptionsService;
    try {
      if (options?.deny === undefined) return yield* self;
      const permission = event.payload as CanonicalToolApprovalRequested;
      if (typeof permission.type !== 'string') return yield* self; // no tool name — fail-open
      // Target path — the canonical `pattern` is the path string when
      // single (string) or an array of paths (first element).
      const pattern = permission.pattern;
      const path =
        typeof pattern === 'string' ? pattern : Array.isArray(pattern) && pattern.length > 0 ? pattern[0] : undefined;
      const result = options.deny.intercept({
        toolName: permission.type,
        path,
        args: {},
      });
      if (result.deny) {
        // In-place deny decision via the delivery (status-only output).
        ctx.mutate('output', 'status', 'deny');
      }
      return yield* self;
    } catch (err) {
      // Failure diagnostics — the permission hook must never break the
      // platform permission flow (zero-deny); one process-log line on
      // the failure path only; output untouched.
      reportFailure('permission.ask', err);
      return yield* self;
    }
  });

/**
 * Create the fidelity module — one module-local hooks surface with the
 * canonical middleware chains for both platform faces. Delivery is
 * adapter-owned: the SDK DeliveryContext translates every channel
 * (notify / appendEntry / mutate — OMP return-style, opencode
 * mutation-style in place, law L4). The platform entries bind `hooks`
 * directly through the SDK adapters (`bind(ompAdapter / opencodeAdapter,
 * hooks)` — capability configuration is captured at bind time). Each call
 * yields an isolated module (mirror of `createContextModule`).
 */
export function createFidelityModule(): FidelityModule {
  const hooks = createHooks();
  const { lifecycle, hints, resident } = createCapabilities(hooks);

  // Resident wiring — the `resident` capability (only resident channel,
  // sdk-hooks-capabilities); content constants pass as `{ id, title,
  // text }` entries captured at bind time (single source,
  // src/resident-data.ts).
  resident.use({ content: RESIDENT_CONTENT });

  // Scenario-hint wiring — the `hints` capability (classify → display
  // decision → append runs SDK-side on the tool_result seam; the
  // display function is the sole parameter, consumer data, hints.ts).
  // The function returns the block body for the classified scenario
  // (null on no coverage); compliant suppression is a hard SDK floor —
  // the consumer display fn additionally returns null when the used
  // tool matches its inline promoted set (hints-structure-simplify).
  hints.use(hintDisplay);

  // Lifecycle wiring — the `lifecycle` capability owns the dual-face
  // context echo (card-3 closed: no consumer shape descriptors; the
  // adapter provides the face shape per dispatch). Failure diagnostics
  // ride the config `onError` hook (one process-log line, zero-deny).
  lifecycle.echo({ onError: (err: unknown) => reportFailure('context seam handler', err) });

  // Business middleware — PCL mark/detect and the deny gate
  // (sdk-hooks-capabilities conversion pattern: `(self) =>
  // Effect.gen(...)` — canonical event + delivery from the effect
  // environment).
  hooks.user_input.use(pclMarkMiddleware);
  hooks.chat_message.use(pclDetectMiddleware);
  hooks.tool_approval_requested.use(denyGateMiddleware);

  return {
    hooks,
  };
}
