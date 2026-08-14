/**
 * opencode face — real platform contract adapter. Thin mapping shell:
 * normalize → the single core chain (`applyFidelityChain`, echo-only)
 * → denormalize + in-place write-back + hook registration. All branching
 * lives in `core/`. Text-level only, graceful no-op on any error.
 * Hints (ADR 0178) attach user-level guidance once per successful tool
 * execution via the post-execution result hook.
 *
 * R1 hook map:
 *
 * | action | hook | notes |
 * | --- | --- | --- |
 * | per-call discipline echo | `experimental.chat.messages.transform` | CONTROL WORK ONLY: identity + progress line rendered from the anchored frame; in-place splice write-back REQUIRED (the consumer ignores the hook return) |
 * | PCL detection | `chat.message` | mark-only (the input seam analog: fires when a NEW user message is received, before normalization/transform/LLM call); mechanical `detectPcl` over the joined user text parts; text parts UNCHANGED, no routing, no handled semantics; mark channel in-memory only (debug surface `onPclDetected`) |
 * | system resident block | `experimental.chat.system.transform` | fixed resident block appended per request; in-place write-back |
 * | tool-result hints | `tool.execute.after` | user-level routing guidance appended to classified successful results (write/content-read → serena; locate/CLI locate → jcodemunch); once per execution, append-only, fail-open (ADR 0178) |
 * | deny gate | `permission.ask` | embeddable deny (ADR 0177): honors a deny provider supplied via `options.deny` — deny → `output.status = 'deny'` set in place (status-only output); fail-open otherwise (absent provider → no-op); the built-in deny implementation is REMOVED |
 * | compaction | ABSENT | the platform owns compaction — `experimental.session.compacting` unregistered |
 *
 * R2 wiring (usage metering, settlement via `session.idle`, retention,
 * landing/prewarm, benefit ledger) was disconnected with the R2/R1
 * decoupling (ADR 0175) — the runtime path is R1 only; the reference
 * machinery lives in `graph-fidelity-context/src/context-management/`.
 *
 * @module
 */

import type { Plugin, PluginInput } from '@opencode-ai/plugin';
import { createToolHints, isErrorShaped } from '../core/hints.js';
import { detectPcl } from '../core/pcl.js';
import { USER_LIKE_ROLES } from '../core/runframe.js';
import {
  appendSeamLine,
  isToolResultMessage,
  joinTextChunks,
  joinWorkingText,
  toolResultIdsOf,
  type ChunkLike,
} from '../core/shape-ops.js';
import type { DenormalizeShape } from '../core/shapes.js';
import type { DisplayFeedback } from '../interfaces/display-feedback.js';
import { createSignalLifecycle } from '../interfaces/signal-lifecycle.js';
import type { ToolDeny } from '../interfaces/tool-deny.js';
import { reportFailure } from './diagnostics.js';

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

/**
 * opencode permission request shape (structural). The `permission.ask`
 * hook input — the SDK `Permission` type (the platform vocabulary for
 * `type` is an OPEN string — the SDK types carry no union — so the
 * gate passes the type to the deny provider as the invocation's
 * toolName; the provider decides).
 */
export interface OpencodePermission {
  readonly id: string;
  readonly type: string;
  readonly pattern?: string | readonly string[];
  readonly sessionID: string;
  readonly messageID: string;
  readonly callID?: string;
  readonly title: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly time: { readonly created: number };
}

/**
 * `permission.ask` hook output — status only; the deny reason surfaces
 * through the platform's deny flow (the output shape exposes no channel
 * for it).
 */
export interface OpencodePermissionOutput {
  status: 'ask' | 'deny' | 'allow';
}

/** Platform-faithful role source — `info.role` first, top-level fallback. */
export function messageRole(message: OpencodeMessage): string | undefined {
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
  role: messageRole,
  toolResultIds: (m) => toolResultIdsOf(m.parts ?? [], isNotToolPart),
  isToolResult: (m) => isToolResultMessage(messageRole(m), (m.parts ?? []).some(isToolPart)),
  payload: (m) => ((m.parts ?? []).length > 0 ? JSON.stringify(m.parts) : (opencodeMessageText(m) ?? undefined)),
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

/**
 * In-place write-back (root cause): the opencode consumer ignores
 * the hook return value and rebuilds the request from its ORIGINAL array
 * reference — a reassigned `output.messages` / `output.system` is silently
 * discarded. The transformed messages must replace the payload's contents
 * in place. This is the ONLY splice site on the opencode face.
 */
export function writeBackInPlace<T>(target: T[], replacement: readonly T[]): void {
  target.splice(0, target.length, ...replacement);
}

/**
 * opencode plugin options — the opencode-only PCL mark debug surface
 * (R1 has no shared option seam; the suspended R2 engines took their own
 * constructor args in the reference tree) plus the deny test/embedding
 * seam (ADR 0177).
 */
export type OpencodePluginOptions = {
  /**
   * PCL mark channel (debug) — fired on each `chat.message` detection.
   * opencode has no `appendEntry` (declared difference: mark persistence
   * ABSENT); the detection records in memory and this callback surfaces
   * the record for tests/operator tooling.
   */
  readonly onPclDetected?: (record: { readonly text: string; readonly matched: string }) => void;
  /**
   * Pre-built deny (embedding seam) — the ONLY deny source: the built-in
   * deny implementation is REMOVED, so an absent option means NO deny —
   * the permission.ask gate no-ops (fail-open). Providers dock against
   * the ToolDeny contract.
   */
  readonly deny?: ToolDeny;
};

/**
 * Target path from a permission request — the SDK `pattern` is the path
 * string when single (string) or an array of paths (first element).
 */
function normalizePathFromPermission(permission: OpencodePermission): string | undefined {
  const pattern = permission.pattern;
  if (typeof pattern === 'string') return pattern;
  return Array.isArray(pattern) && pattern.length > 0 ? pattern[0] : undefined;
}

const server: Plugin = async (input, options?: OpencodePluginOptions) => {
  // The single R1 lifecycle — assembly/echo/restore/injection (the
  // adapter routes exclusively through the interface layer, ADR 0176).
  const lifecycle = createSignalLifecycle();
  // The built-in hints (ToolHints) — user-level routing guidance
  // attached to tool-call results before they reach the LLM (R-EXT
  // hints capability). Wired unconditionally at the post-execution
  // result hook; pure classification, fail-open, never breaks the
  // platform loop.
  const hints = createToolHints();
  // The opencode audit channel — in-memory mark through the debug
  // surface (opencode has no appendEntry — declared absence).
  const feedback: DisplayFeedback = {
    audit: ({ record }) => {
      // opencode has no appendEntry (declared absence) — the mark
      // records in memory through the debug surface. The contract binds
      // the PCL mark payload shape, so no narrowing is needed here.
      options?.onPclDetected?.(record.payload);
    },
  };
  // The deny — provider-supplied only (ADR 0177): the built-in deny
  // implementation is REMOVED; the permission.ask gate no-ops on an
  // undefined deny (fail-open). The `options.deny` embedding seam is
  // the only deny source.
  const deny: ToolDeny | undefined = options?.deny;
  return {
    // PCL detection seam — the input-seam analog (fires when a NEW user
    // message is received, BEFORE image normalization / transform / LLM
    // call; the raw user text parts are inspectable here). Mark-only:
    // text parts UNCHANGED (returning undefined keeps the current state —
    // the consumer rebuilds from the original parts), no routing, no
    // handled semantics; the record flows through the DisplayFeedback
    // audit channel. opencode has no appendEntry — the mark records in
    // memory and surfaces through the `onPclDetected` debug callback.
    'chat.message': async (_input, output) => {
      try {
        // Raw SDK parts pass straight in — the core op owns narrowing.
        const text = joinTextChunks(output?.parts ?? []) ?? '';
        if (text.length === 0) return;
        const matched = detectPcl(text);
        if (matched === undefined) return;
        feedback.audit({ record: { type: 'graph-fidelity.pcl', payload: { text, matched } } });
      } catch (err) {
        // Failure diagnostics — the detection hook must never break the
        // message path (zero-deny); one process-log line on the failure
        // path only.
        reportFailure('chat.message', err);
      }
    },
    // Hints (ToolHints) — the post-execution result hook. The platform
    // contract passes the RESULT as the second argument (the trigger
    // hands the output object to the hook, which mutates it in place,
    // void return). Append-only: the original result output is
    // preserved and the user-level guidance line is appended BEFORE it
    // reaches the LLM. Non-classified tools / odd shapes / throws →
    // output untouched (fail-open; never breaks the platform loop).
    'tool.execute.after': async (input, output) => {
      try {
        const tool = input?.tool;
        if (typeof tool !== 'string') return;
        const result = hints.hints({
          toolName: tool,
          args:
            input.args !== null && typeof input.args === 'object'
              ? (input.args as Readonly<Record<string, unknown>>)
              : undefined,
        });
        if (result === undefined) return;
        // Content-embedded errors (validation failures, oversized answers,
        // non-zero exits) skip attachment — guidance noise on error paths.
        // Normalize the input domain once: odd/missing shapes fail open
        // (isErrorShaped false) and the append path never dereferences the
        // raw value (undefined.length would throw and silently drop the hint).
        const normalized = output.output ?? '';
        if (isErrorShaped(normalized)) return;
        output.output = normalized.length > 0 ? `${normalized}\n${result.text}` : result.text;
      } catch (err) {
        // Failure diagnostics — the result hook must never break the
        // tool path (zero-deny); one process-log line on the failure
        // path only; output untouched.
        reportFailure('tool.execute.after', err);
      }
    },
    'experimental.chat.messages.transform': async (_input, output) => {
      if (!Array.isArray(output.messages) || output.messages.length === 0) return;
      try {
        const platform = output.messages as OpencodeMessage[];
        const echoMessages = lifecycle.assembly({ messages: platform, shape: OPENCODE_SHAPE });
        // Latest anchored frame over the TEXT-ONLY anchor surface —
        // user-like roles first (dispatch side), all-roles fallback
        // (degraded transcripts; anchored RUN_RE keeps doc-text
        // corruption impossible). Role-order parameterization is the
        // single frame lookup (ADR 0176 F2). The frame scan feeds the
        // echo identity ONLY (the R2 settle/prewarm scans are gone).
        const out = lifecycle.echo({
          messages: echoMessages,
          frameTexts: platform.map((m) => opencodeMessageText(m) ?? ''),
          frameRoles: {
            roles: USER_LIKE_ROLES,
            roleOf: echoMessages.map((m) => m.role),
          },
        });
        if (!out.changed) return;
        // In-place write-back: the platform consumer keeps
        // using the original array reference after the hook returns.
        writeBackInPlace(
          output.messages,
          lifecycle.restore({
            messages: platform,
            echoMessages,
            result: out.messages,
            shape: OPENCODE_SHAPE,
          }) as typeof output.messages,
        );
      } catch (err) {
        // Failure diagnostics — the transform chain must never break a
        // request (zero-deny); one process-log line on the failure path
        // only; nothing is injected into LLM context.
        reportFailure('messages transform', err);
      }
    },
    // Compaction boundary — the platform owns compaction; the module
    // registers no `experimental.session.compacting` handler.
    // System-resident prompts — append the fixed resident block to the
    // system prompt on every request (lifecycle.injection). Disjoint from
    // the messages seam; canonical-dedup + self-heal in the pure core;
    // zero deny on failure.
    'experimental.chat.system.transform': async (_input, output) => {
      try {
        const out = lifecycle.injection({ systemPrompts: Array.isArray(output.system) ? output.system : [] });
        if (out.changed) {
          // In-place write-back — the platform consumer reads
          // the original system array after the hook returns.
          writeBackInPlace(output.system, [...out.systemPrompts]);
        }
      } catch (err) {
        // Failure diagnostics — the system transform must never break a
        // request (zero-deny); one process-log line on the failure path
        // only; nothing is injected into LLM context.
        reportFailure('system transform', err);
      }
    },
    // Deny gate (ADR 0177) — the one non-text surface. The platform
    // raises `permission.ask` only when its permission flow asks (a
    // non-raising flow is fail-open by platform design — acceptable).
    // The gate honors a deny provider supplied via `options.deny`: the
    // permission type passes as the invocation's toolName and the
    // provider decides. The output shape exposes only `status`; the
    // deny reason surfaces through the platform's deny flow. Fail-open:
    // no provider / provider passthrough / throw → output untouched
    // (undefined return keeps the current state); never throws into
    // the platform loop.
    'permission.ask': async (input: OpencodePermission, output: OpencodePermissionOutput) => {
      try {
        if (deny === undefined) return;
        const path = normalizePathFromPermission(input);
        const result = deny.intercept({
          toolName: input.type,
          path,
          args: {},
        });
        if (result.deny) {
          // In-place deny decision — the consumer reads the output
          // object (undefined return keeps the current state).
          output.status = 'deny';
        }
      } catch (err) {
        // Failure diagnostics — the permission hook must never break the
        // platform permission flow (zero-deny); one process-log line on
        // the failure path only; output untouched.
        reportFailure('permission.ask', err);
      }
    },
  };
};

/**
 * The v1 plugin module shape — `{ id, server }`. File plugins REQUIRE an
 * `id` (the loader's resolvePluginId throws otherwise), and the loader must
 * never treat the named helper exports as plugin instances (legacy path
 * iterates every module export — a bare-function default export breaks
 * loading, live-log confirmed: "messages.flatMap is not a function").
 */
export default { id: 'graph-fidelity', server };
