/**
 * OMP adapter — translation table for the OMP hook contract
 * (return-style handlers, snake_case event names).
 * Reference: .refs/oh-my-pi/packages/coding-agent/src/extensibility/hooks/types.ts
 * (HookAPI event catalog 482-513, HookHandler signature 448).
 *
 * Delivery translation (ADR 0193): the per-event ExtensionContext
 * handle carries the notify surface (ctx.ui.notify); the ExtensionAPI
 * handle (captured at factory time) carries appendEntry. Handlers
 * receive a DeliveryContext and never touch platform handles.
 * Payloads are normalized to canonical shapes; returns pass through
 * (OMP merge keys = canonical partial keys). Published d.ts is
 * platform-type-free — platform types are module-internal only.
 */

import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent';
import { Effect } from 'effect';
import { isErrorShapedContent } from '../core/error-shape.js';
import { CANONICAL_EVENTS, ompEventName, type CanonicalEvent } from '../core/events.js';
import { FaceShapeService, toFaceShape } from '../core/face-shape.js';
import {
  BASE_HANDLER,
  CanonicalEventService,
  foldMiddleware,
  type HookChains,
  type Middleware,
} from '../core/middleware.js';
import { runChainAsync } from '../core/runtime.js';
import { decodeCanonicalPayload, encodeCanonicalPayload } from '../core/schemas.js';
import { NOOP_DELIVERY } from '../core/services.js';
import {
  appendSeamLine,
  isRecord,
  isToolResultMessage,
  joinTextChunks,
  joinWorkingText,
  toolResultIdsOf,
  type ChunkLike,
} from '../core/shape-ops.js';
import type { DenormalizeShape } from '../core/shapes.js';
import {
  DeliveryContext,
  OpencodeOptionsService,
  type Adapter,
  type CanonicalPayloadOf,
  type DeliveryContextService,
} from '../core/types.js';

type OmpHookHandler = (event: unknown, ctx: unknown) => unknown | void | Promise<unknown | void>;

/** OMP factory shape — platform-type-free (d.ts makes no platform type imports). */
export type OmpFactory = (pi: unknown) => void | Promise<void>;

/**
 * Normalize an OMP platform payload to the canonical shape (ADR 0193),
 * then decode it through the canonical Schema (R-SDK2 — the single
 * validation point; a decode failure throws CanonicalError).
 */
function normalizeOmp(name: CanonicalEvent, event: unknown): unknown {
  const rec = isRecord(event) ? event : {};
  switch (name) {
    case 'tool_result':
      // input (tool args) + toolCallId are real platform fields
      // (ToolResultEventBase — pinned refs); canonical carries args.
      // The error verdict folds the platform isError flag OR the
      // content-embedded error shape — single verdict, consumers check
      // errorShaped only (no separate isError guard).
      return {
        toolName: rec.toolName,
        content: rec.content,
        isError: rec.isError,
        errorShaped: rec.isError === true || isErrorShapedContent(rec.content),
        args: isRecord(rec.input) ? rec.input : undefined,
        toolCallId: rec.toolCallId,
      };
    case 'tool_call':
      return { toolName: rec.toolName, args: rec.args };
    case 'context':
      return { messages: Array.isArray(rec.messages) ? rec.messages : [] };
    case 'user_input':
      return { text: rec.text };
    case 'before_agent_start':
      return { systemPrompt: rec.systemPrompt, sessionId: rec.sessionId };
    case 'tool_approval_requested':
      // OMP approval-request payload: the tool name rides `tool` (the
      // canonical type documents type = tool name, matching the
      // opencode permission.ask face).
      return {
        type: rec.tool ?? rec.type,
        pattern: rec.pattern,
        sessionID: rec.sessionID,
        description: rec.description,
      };
    case 'message_end':
    case 'message_update':
    case 'message_start': {
      const message = isRecord(rec.message) ? rec.message : {};
      return { usage: message.usage };
    }
    case 'session_shutdown':
    case 'before_provider_request':
    case 'after_provider_response': {
      // Canonical lifecycle events: strip the platform `type` discriminator.
      const { type: _type, ...rest } = rec;
      return rest;
    }
    default:
      return event;
  }
}

function ompWrapper(name: CanonicalEvent, chain: readonly Middleware[]): OmpHookHandler {
  // Compose the chain ONCE at bind time — the folded program is the
  // single Effect executed per platform event (single execution face).
  const composed = foldMiddleware(chain)(BASE_HANDLER);
  // The platform invokes the wrapped handler with (platformEvent,
  // DeliveryContext) — the factory builds the delivery per event; the
  // platform event payload is normalized and Schema-decoded before
  // dispatch (R-SDK2). Both faces run the whole chain via the async
  // path (runChainAsync): the OMP platform awaits handler promises
  // (sdk-hooks-capabilities — sync-face machinery deleted). A chain
  // containing async programs is awaited and its settled result
  // delivered — never fire-and-forget, never a silent partial drop.
  return async (event, delivery) => {
    const hookEvent = {
      name,
      payload: decodeCanonicalPayload(name, normalizeOmp(name, event)) as CanonicalPayloadOf<typeof name>,
    };
    const delivered = Effect.provideService(
      OpencodeOptionsService,
      undefined,
    )(
      Effect.provideService(
        FaceShapeService,
        toFaceShape(OMP_SHAPE),
      )(
        Effect.provideService(
          CanonicalEventService,
          hookEvent,
        )(
          Effect.provideService(
            DeliveryContext,
            (delivery as DeliveryContextService | undefined) ?? NOOP_DELIVERY,
          )(composed),
        ),
      ),
    );
    const value = await runChainAsync(delivered);
    // Canonical partials ARE the OMP merge keys (identity denormalize,
    // documented ADR 0193 asymmetry); the Schema encode validates the
    // partial's fields before the platform merges them. void =
    // side-effect only, no merge keys.
    return encodeCanonicalPayload(name, value);
  };
}

function toHandlers(
  chains: HookChains,
): Array<{ canonical: CanonicalEvent; ompName: string; handler: OmpHookHandler }> {
  const out: Array<{ canonical: CanonicalEvent; ompName: string; handler: OmpHookHandler }> = [];
  for (const name of CANONICAL_EVENTS) {
    const chain = chains[name];
    if (chain.length === 0) continue;
    const ompName = ompEventName(name);
    if (!ompName) continue; // no OMP hook for this canonical event
    out.push({ canonical: name, ompName, handler: ompWrapper(name, chain) });
  }
  return out;
}

/**
 * OMP adapter — bind(chains) returns the OMP factory
 * `(pi) => void` the consumer exports as its extension entry.
 */

export const ompAdapter: Adapter<'omp', OmpFactory> = {
  platform: 'omp',
  bind(chains) {
    const wired = toHandlers(chains);
    const factory: OmpFactory = (pi) => {
      // structural narrow: ExtensionAPI.on carries a literal event-name
      // union; adapter tables register dynamically per the directory.
      // TODO(type-narrow): ExtensionAPI's literal-union overloads are not
      // assignable to the dynamic registration shape; keep the unknown
      // round-trip until the platform types expose a string-keyed on().
      const api = pi as ExtensionAPI;
      const hookApi = api as unknown as { on(name: string, handler: unknown): void };
      for (const { ompName, handler } of wired) {
        hookApi.on(ompName, (event: unknown, ctx: unknown) => {
          // Delivery translation: per-event ctx carries the notify
          // surface; the api (factory closure) carries appendEntry.
          const delivery: DeliveryContextService = {
            notify: (text: string) => {
              try {
                const ui = isRecord(ctx) ? (ctx.ui as { notify?: (t: string) => void } | undefined) : undefined;
                if (ui?.notify) {
                  ui.notify(text);
                  return;
                }
                // The OMP notify surface is optional — when ctx.ui (or
                // its notify) is absent, degrade to the transcript
                // channel so the attached guidance stays observable
                // instead of silently no-op'ing. When appendEntry is
                // also unavailable, record the undelivered state
                // (audit trace, fail-open) — never throw into the
                // platform event loop.
                if (api.appendEntry) {
                  api.appendEntry('transcript', { type: 'text', text });
                } else {
                  // undelivered marker — auditable, never silent
                  console.warn('[omp] notify undelivered (ctx.ui and appendEntry absent):', text);
                }
              } catch {
                // fail-open — never throw into the platform loop
              }
            },
            appendEntry: (channel: string, payload: unknown) => {
              try {
                api.appendEntry?.(channel, payload);
              } catch {
                // fail-open
              }
            },
            mutate: () => {
              // OMP return-style surface — the handler's return value is
              // the mutation channel (documented asymmetry, ADR 0193).
            },
          };
          return handler(event, delivery);
        });
      }
    };
    return factory;
  },
};

// ── OMP shape surface (migrated from graph-fidelity, ADR 0195) ───────

/** Structural message subset (payloads are read-only here — never mutated). */
export interface OmpAgentMessage {
  role?: string;
  content?: string | Array<{ type?: string; text?: string }>;
  parts?: Array<{ type?: string; text?: string }>;
}

/** Canonical context payload — the SDK normalizes the OMP context event to `{ messages }`. */
export interface OmpContextEvent {
  messages: OmpAgentMessage[];
}

/** Extract text from an OMP agent message (content string | content array | parts). */
export function ompMessageText(message: OmpAgentMessage): string | null {
  const { content } = message;
  if (typeof content === 'string') return content;
  const chunks: ChunkLike[] = [];
  if (Array.isArray(content)) chunks.push(...content);
  if (Array.isArray(message.parts)) chunks.push(...message.parts);
  return joinTextChunks(chunks);
}

/**
 * Working-face text — message text PLUS tool-result block content. Thin
 * wrapper over the shared working-text op (R2 reference surface; kept for
 * shape parity).
 */
export function ompWorkingText(message: OmpAgentMessage): string {
  return joinWorkingText(contentBlocksOf(message), ompMessageText(message), isToolResultBlock, false);
}

/** Content blocks of a message (empty when the content is not an array). */
function contentBlocksOf(message: OmpAgentMessage): Array<Record<string, unknown>> {
  return Array.isArray(message.content) ? message.content : [];
}

/** Tool-result block evidence — a content block carrying result identity (OMP shape). */
const isToolResultBlock: (chunk: ChunkLike) => boolean = (chunk) =>
  'toolCallId' in chunk || chunk['type'] === 'tool-result';

/** Assistant call block evidence — the id-scan skip predicate (OMP shape). */
const isCallBlock: (chunk: ChunkLike) => boolean = (chunk) =>
  chunk['type'] === 'tool-call' || chunk['type'] === 'function-call';

/** True when a user message carries tool-result content (OMP shape). */
function hasToolResultBlock(message: OmpAgentMessage): boolean {
  return contentBlocksOf(message).some(isToolResultBlock);
}

/** The OMP container shape — one descriptor for the parametric seam (thin wiring over the shared ops). */
export const OMP_SHAPE: DenormalizeShape<OmpAgentMessage> = {
  text: ompMessageText,
  workingText: ompWorkingText,
  role: (m) => m.role,
  toolResultIds: (m) => toolResultIdsOf(contentBlocksOf(m), isCallBlock),
  isToolResult: (m) => isToolResultMessage(m.role, hasToolResultBlock(m)),
  appendLine: (m, line) =>
    appendSeamLine(
      m,
      line,
      [
        {
          chunks: Array.isArray(m.content) ? m.content : undefined,
          rebuild: (chunks) => ({ ...m, content: chunks }),
        },
        {
          chunks: Array.isArray(m.parts) ? m.parts : undefined,
          rebuild: (parts) => ({ ...m, parts }),
          useWhenEmpty: true,
        },
      ],
      typeof m.content === 'string' ? m.content : '',
      (text) => ({ ...m, content: text }),
    ),
  replaceWithText: (m, text) => {
    if (Array.isArray(m.content)) return { ...m, content: [{ type: 'text', text }] };
    if (Array.isArray(m.parts)) return { ...m, parts: [{ type: 'text', text }] };
    return { ...m, content: text };
  },
};
