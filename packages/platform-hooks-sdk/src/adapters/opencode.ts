/**
 * opencode v1 adapter — translation table for the opencode v1 Hooks
 * contract (mutation-style `(input, output) => Promise<void>`, dotted
 * event names).
 * Reference: .refs/opencode/packages/plugin/src/index.ts (Hooks 156-335);
 * pinned keys: tool.execute.before/after, tool.definition, chat.message,
 * event, config, permission.ask, experimental.chat.messages.transform,
 * experimental.chat.system.transform.
 *
 * Delivery translation (ADR 0193): the server call captures the toast
 * surface (input.client.tui.showToast); notify delivers toasts when the
 * surface exists, otherwise enqueues transcript fallback lines that an
 * adapter-owned chat-transform hook flushes IN PLACE (law L4 — opencode
 * rebuilds requests from the original references). mutate writes output
 * surfaces in place. Payloads are normalized to canonical shapes.
 * Published d.ts is platform-type-free — platform types are
 * module-internal only.
 */

import { Effect } from 'effect';
import { isErrorShapedContent } from '../core/error-shape.js';
import { CANONICAL_EVENTS, opencodeEventName, opencodeOutKey, type CanonicalEvent } from '../core/events.js';
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
  type OpencodeAdapterOptions,
} from '../core/types.js';

type OpencodeHook = (input: unknown, output: Record<string, unknown>) => Promise<void>;
export type { OpencodeHook };

/** opencode plugin shape — platform-type-free. Per-server-call options (deny, PCL mark) are accepted on the server entry and validated by the adapter. */
export type OpencodeServer = (input: unknown, options?: unknown) => Promise<Record<string, OpencodeHook>>;
export type OpencodePluginShape = { server: OpencodeServer };

/**
 * In-place write-back — opencode consumes the hook return value and
 * rebuilds the request from its ORIGINAL array reference; a reassigned
 * `output.messages` / `output.system` is silently discarded (law L4).
 * This is the ONLY supported mutation pattern on the opencode face.
 */
export function writeBackInPlace<T>(target: T[], replacement: readonly T[]): void {
  target.splice(0, target.length, ...replacement);
}

/**
 * Normalize an opencode input payload to the canonical shape (ADR 0193),
 * then decode it through the canonical Schema (R-SDK2 — the single
 * validation point; a decode failure throws CanonicalError).
 * The mutation pair carries the real data: message/args/content/messages
 * live on the OUTPUT surface (pinned refs — Hooks 156-335); the input
 * carries identity fields only. Events arrive nested under input.event.
 */
function normalizeOpencode(name: CanonicalEvent, input: unknown, output: Record<string, unknown>): unknown {
  const rec = isRecord(input) ? input : {};
  switch (name) {
    case 'tool_result':
      // input {tool, sessionID, callID, args} + output {title, output, metadata}
      return {
        toolName: rec.tool,
        args: rec.args,
        content: output.output,
        metadata: output.metadata,
        errorShaped: isErrorShapedContent(output.output),
      };
    case 'tool_call':
      // input {tool, sessionID, callID} + output {args}
      return { toolName: rec.tool, args: output.args };
    case 'context':
      // input {} + output {messages}
      return { messages: Array.isArray(output.messages) ? output.messages : [] };
    case 'before_agent_start':
      // input {sessionID?, model} + output {system}
      return { system: Array.isArray(output.system) ? output.system : [] };
    case 'chat_message':
      // input {sessionID, agent, model, messageID, variant} + output {message, parts}
      return { message: output.message };
    case 'event': {
      // input { event } — the event object is nested
      const event = isRecord(rec.event) ? rec.event : {};
      return { type: event.type, properties: isRecord(event.properties) ? event.properties : {} };
    }
    case 'tool_approval_requested':
      // input = Permission (canonical picks the known fields: type = tool
      // name, pattern = path)
      return { type: rec.type, pattern: rec.pattern, sessionID: rec.sessionID, description: rec.description };
    case 'session_before_compact':
    case 'credential_disabled':
      // canonical = generic record (auth/compaction platform surfaces)
      return input;
    default:
      return input;
  }
}

/**
 * Append a line to the LAST real user-role message's parts — in place,
 * never a fabricated user-role message (round 14 R7: the echo anchor
 * binds to the latest user-like message; a synthetic message would
 * pollute the input stream). No user message → documented no-op.
 */
function appendTranscriptLine(output: Record<string, unknown>, text: string): void {
  const messages = output.messages;
  if (!Array.isArray(messages) || messages.length === 0) return;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!isRecord(message)) continue;
    // Role source consistent with the message model (info.role with the
    // top-level `role` fallback for degraded/legacy shapes).
    if (opencodeMessageRole(message as OpencodeMessage) !== 'user') continue;
    const parts = Array.isArray(message.parts) ? message.parts : [];
    const next = { ...message, parts: [...parts, { type: 'text', text }] };
    writeBackInPlace(messages, [...messages.slice(0, i), next, ...messages.slice(i + 1)]);
    return;
  }
  // No user-role message — documented no-op (never fabricate).
}

function opencodeWrapper(
  name: CanonicalEvent,
  chain: readonly Middleware[],
  deliveryFor: (output: Record<string, unknown>) => DeliveryContextService,
  optionsFor: () => OpencodeAdapterOptions | undefined,
): OpencodeHook {
  const outKey = opencodeOutKey(name);
  // Compose the chain ONCE at bind time — the folded program is the
  // single Effect awaited per platform event (single execution face).
  const composed = foldMiddleware(chain)(BASE_HANDLER);
  return async (input, output) => {
    const hookEvent = {
      name,
      payload: decodeCanonicalPayload(name, normalizeOpencode(name, input, output)) as CanonicalPayloadOf<typeof name>,
    };
    const delivered = Effect.provideService(
      OpencodeOptionsService,
      optionsFor(),
    )(
      Effect.provideService(
        FaceShapeService,
        toFaceShape(OPENCODE_SHAPE),
      )(
        Effect.provideService(
          CanonicalEventService,
          hookEvent,
        )(Effect.provideService(DeliveryContext, deliveryFor(output))(composed)),
      ),
    );
    const result = await runChainAsync(delivered);
    // mutation-style translation: the canonical result is Schema-encoded
    // (R-SDK2 delivery encode), denormalized per face where the platform
    // surface shape differs, then written to the real output surface
    // (per-event key), in place for arrays; undefined = side-effect only.
    if (result !== undefined && outKey && output && typeof output === 'object') {
      const encoded = encodeCanonicalPayload(name, result);
      const value = denormalizeForOutKey(name, encoded);
      const existing = (output as Record<string, unknown>)[outKey];
      if (Array.isArray(existing) && Array.isArray(value)) writeBackInPlace(existing, value);
      else (output as Record<string, unknown>)[outKey] = value;
    }
  };
}

/**
 * Per-face denormalization of a canonical result for the opencode outKey
 * write. `tool_result` is the asymmetric case: the canonical partial
 * carries `content` as text BLOCKS (the OMP merge shape), while the
 * opencode output surface expects the result STRING — blocks are joined
 * (text of every block, empty for non-text, newline-separated; a string
 * content passes through as-is). All other events pass the encoded value
 * unchanged. This is why consumers return the partial uniformly: the
 * adapter owns the face translation (ADR 0199 — no consumer key-presence
 * discrimination).
 */
function denormalizeForOutKey(name: CanonicalEvent, encoded: unknown): unknown {
  if (name !== 'tool_result' || !isRecord(encoded)) return encoded;
  const content = encoded['content'];
  if (Array.isArray(content)) {
    return content
      .map((block) => (isRecord(block) && typeof block['text'] === 'string' ? block['text'] : ''))
      .join('\n');
  }
  if (typeof content === 'string') return content;
  return encoded;
}

function toHooks(
  chains: HookChains,
  deliveryFor: (output: Record<string, unknown>) => DeliveryContextService,
  optionsFor: () => OpencodeAdapterOptions | undefined,
): Record<string, OpencodeHook> {
  const hooks: Record<string, OpencodeHook> = {};
  for (const name of CANONICAL_EVENTS) {
    const chain = chains[name];
    if (chain.length === 0) continue;
    const hookName = opencodeEventName(name);
    if (!hookName) continue; // no opencode v1 hook for this canonical event
    const wrapped = opencodeWrapper(name, chain, deliveryFor, optionsFor);
    const existing = hooks[hookName];
    // chain multiple registrations per hook in order — never overwrite
    hooks[hookName] = existing ? chain2(existing, wrapped) : wrapped;
  }
  return hooks;
}

/** Chain two hooks in registration order — never drop registrations. */
function chain2(a: OpencodeHook, b: OpencodeHook): OpencodeHook {
  return async (input, output) => {
    await a(input, output);
    await b(input, output);
  };
}

/**
 * opencode v1 adapter — bind(chains) returns the plugin shape
 * `{ server }` the consumer default-exports as its plugin entry
 * (opencode config plugin list / exports["./server"]).
 *
 * sdk-surface-convergence: the adapter owns bind-time option
 * validation — per-server-call options (deny provider, PCL mark
 * channel) are accepted on the server entry, shape-validated here
 * (the former consumer-side `optionsShape` guard is absorbed), and
 * provided to bound middleware through the `OpencodeOptionsService`
 * effect-environment tag. Consumers hold no module-level mutable slot.
 */

/** Shape guard — narrow the opaque platform options record to the opencode-only seam (SDK-owned, sdk-surface-convergence). */
export function validateOpencodeOptions(options: unknown): OpencodeAdapterOptions | undefined {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) return undefined;
  const record = options as Record<string, unknown>;
  const onPclDetected =
    typeof record.onPclDetected === 'function'
      ? (record.onPclDetected as (record: { readonly text: string; readonly matched: string }) => void)
      : undefined;
  let deny: OpencodeAdapterOptions['deny'] | undefined;
  if (record.deny !== undefined && record.deny !== null && typeof record.deny === 'object') {
    const candidate = record.deny as Record<string, unknown>;
    // Runtime guard: the deny path consumes `intercept` only (ADR 0177
    // embedding seam); the remaining ToolDeny fields pass through
    // structurally (determine/engaged stay provider-owned).
    if (typeof candidate.intercept === 'function') deny = record.deny as OpencodeAdapterOptions['deny'];
  }
  if (onPclDetected === undefined && deny === undefined) return undefined;
  return { ...(onPclDetected !== undefined ? { onPclDetected } : {}), ...(deny !== undefined ? { deny } : {}) };
}

export const opencodeAdapter: Adapter<'opencode', OpencodePluginShape> = {
  platform: 'opencode',
  bind(chains) {
    const server: OpencodeServer = async (input, options?: unknown) => {
      // sdk-surface-convergence: per-server-call options are shape-
      // validated here (SDK-owned; the consumer-side optionsShape guard
      // is gone) and provided to bound middleware through the effect
      // environment. Invalid/absent shapes fail open to undefined.
      const serverOptions = validateOpencodeOptions(options);
      // Delivery capture (ADR 0193): toast surface from the plugin input;
      // absent → transcript fallback queue flushed by an adapter-owned
      // chat-transform hook (in place, never reassigned).
      const client = isRecord(input) ? (input.client as Record<string, unknown> | undefined) : undefined;
      const tui = isRecord(client) ? (client.tui as { showToast?: (text: string) => void } | undefined) : undefined;
      const showToast = typeof tui?.showToast === 'function' ? tui.showToast.bind(tui) : undefined;
      const pendingLines: string[] = [];

      const deliveryFor = (output: Record<string, unknown>): DeliveryContextService => ({
        notify: (text: string) => {
          if (showToast) {
            try {
              showToast(text);
            } catch {
              // fail-open — a throwing toast surface degrades to a no-op
              // (never enqueue: the flush hook is not registered in the
              // toast path and a dead queue would grow unbounded).
            }
          } else {
            pendingLines.push(text);
          }
        },
        appendEntry: () => {
          // opencode has no appendEntry (declared absence, ADR 0193) —
          // fail-open no-op.
        },
        mutate: (target, key, value) => {
          try {
            if (!output || typeof output !== 'object') return;
            const obj = target === 'output' ? output : target;
            if (!obj || typeof obj !== 'object') return;
            const existing = (obj as Record<string, unknown>)[key];
            if (Array.isArray(existing) && Array.isArray(value)) writeBackInPlace(existing, value);
            else (obj as Record<string, unknown>)[key] = value;
          } catch {
            // fail-open — never throw into the platform loop
          }
        },
      });

      const hooks = toHooks(chains, deliveryFor, () => serverOptions);

      if (!showToast) {
        // Transcript fallback flush — adapter-owned, in place.
        const flushHook: OpencodeHook = async (_input, output) => {
          if (pendingLines.length === 0) return;
          const lines = pendingLines.splice(0, pendingLines.length);
          for (const line of lines) appendTranscriptLine(output, line);
        };
        const transformName = 'experimental.chat.messages.transform';
        const existing = hooks[transformName];
        hooks[transformName] = existing ? chain2(existing, flushHook) : flushHook;
      }
      return hooks;
    };
    // The server satisfies the real Plugin contract when the consumer
    // wires it (platform types never appear in published d.ts).
    return { server };
  },
};

// ── opencode shape surface (migrated from graph-fidelity, ADR 0195) ──

/**
 * opencode message shape (structural). The transform payload delivers
 * `{ info: Message, parts: Part[] }[]` — the role lives in `info.role`
 * (platform shape, prompt.ts `m.info.role`); the top-level `role` fallback
 * covers degraded/legacy shapes.
 */
export interface OpencodeMessage {
  role?: string;
  info?: { role?: string };
  parts?: Array<{ type?: string; text?: string }>;
}

/** Platform-faithful role source — `info.role` first, top-level fallback. */
export function opencodeMessageRole(message: OpencodeMessage): string | undefined {
  return message.info?.role ?? message.role;
}

/** Extract joined text parts from an opencode message (thin wrapper over the shared text join). */
export function opencodeMessageText(message: OpencodeMessage): string | null {
  if (!Array.isArray(message.parts)) return null;
  return joinTextChunks(message.parts);
}

/**
 * Working-face text — text parts PLUS tool-part content. Thin wrapper
 * over the shared working-text op (R2 reference surface; kept for shape
 * parity).
 */
export function opencodeWorkingText(message: OpencodeMessage): string {
  return joinWorkingText(message.parts ?? [], opencodeMessageText(message), isToolPart, true);
}

/** Tool-part evidence — an opencode part is a tool-result carrier. */
const isToolPart: (chunk: ChunkLike) => boolean = (chunk) => chunk['type'] === 'tool';

/** Non-tool part evidence — the id-scan skip predicate (opencode shape). */
const isNotToolPart: (chunk: ChunkLike) => boolean = (chunk) => chunk['type'] !== 'tool';

/** The opencode container shape — one descriptor for the parametric seam (thin wiring over the shared ops). */
export const OPENCODE_SHAPE: DenormalizeShape<OpencodeMessage> = {
  text: opencodeMessageText,
  workingText: opencodeWorkingText,
  role: opencodeMessageRole,
  toolResultIds: (m) => toolResultIdsOf(m.parts ?? [], isNotToolPart),
  isToolResult: (m) => isToolResultMessage(opencodeMessageRole(m), (m.parts ?? []).some(isToolPart)),
  appendLine: (m, line) =>
    appendSeamLine(
      m,
      line,
      [
        {
          chunks: m.parts ?? [],
          rebuild: (parts) => ({ ...m, parts }),
          useWhenEmpty: true,
        },
      ],
      '',
      (text) => ({ ...m, parts: [{ type: 'text', text }] }),
    ),
  replaceWithText: (m, text) => ({ ...m, parts: [{ type: 'text', text }] }),
};
