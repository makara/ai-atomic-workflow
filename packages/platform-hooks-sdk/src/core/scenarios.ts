/**
 * Scenario hints capability (hints-use-function-middleware) — the
 * single scenario surface of the SDK pure core: classification →
 * display decision → append behind the `hints` capability object.
 * `hints.use(fn)` wires the scenario-hints middleware onto the default
 * `tool_result` canonical hook (explicit hook target overrides; unknown
 * hook → loud MiddlewareHookError). The display-decision FUNCTION is
 * the sole use() parameter (real middleware): the SDK classifies the
 * invocation, builds the display context (verdict + invocation facts),
 * and the function decides what — if anything — to show. The consumer
 * carries its classification extension map on the function
 * (`toolMap` — consumer data; the SDK core carries zero third-party
 * vocabulary).
 *
 * Every successful attachment proactively emits a notify FeedbackLine
 * through the unified feedback channel. Wiring is re-wireable: the
 * returned handle unwires by identity.
 *
 * Closed scenario set {find, read, write, verify, run} — the review
 * scenario is role-triggered (graph review nodes carry their own
 * review standards), never tool-triggered, and is NOT a member.
 *
 * Pure — no platform imports, no cross-module state, no side effects.
 *
 * @module
 */

import { Effect, Schema } from 'effect';
import {
  classifyScenario,
  promotedSetOf,
  usedToolOf,
  type ClassificationResult,
  type DisciplineInput,
  type ToolMap,
} from './classify.js';
import type { CanonicalEvent } from './events.js';
import { createFeedbackChannel } from './feedback.js';
import { CanonicalEventService, wireCapability, type Hooks, type Middleware } from './middleware.js';
import { isRecord } from './shape-ops.js';
import { DeliveryContext, type HandlerResult } from './types.js';

/** Closed scenario set — the five tool-triggered scenarios (review excluded, role-triggered). */
export const SCENARIO_IDS = ['find', 'read', 'write', 'verify', 'run'] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];

/** Hint-block payload — the per-scenario guidance unit (spec: Scenario-keyed hints contract). Body-only: no title field. */
export const SCENARIO_HINT_BLOCK_SCHEMA = Schema.Struct({
  id: Schema.Literal(...SCENARIO_IDS),
  body: Schema.String,
});
export type ScenarioHintBlock = Schema.Schema.Type<typeof SCENARIO_HINT_BLOCK_SCHEMA>;

/**
 * Display-decision context — the classification verdict + invocation
 * facts the SDK hands to the display function. `scenario` is undefined
 * when the invocation has no scenario coverage (the middleware passes
 * through without calling the function). `compliant` = the invocation
 * already used a promoted tool for the scenario (or rtk-prefixed bash).
 * `usedTool` resolves bash to its effective locate token. `promoted`
 * lists the matched scenario's promoted tool names (consumer map
 * reverse lookup).
 */
export interface HintDisplayContext {
  /** Classified scenario — undefined when no coverage (function not called). */
  readonly scenario?: ScenarioId;
  /** Compliance verdict — the invocation already used a promoted tool (or rtk bash). */
  readonly compliant: boolean;
  /** The effective tool the caller used (bash resolves to its locate token). */
  readonly usedTool?: string;
  /** Normalized error verdict from the canonical payload (error results never reach the function). */
  readonly errorShaped: boolean;
  /** Promoted tool names for the matched scenario (consumer map reverse lookup; empty when no map). */
  readonly promoted?: readonly string[];
}

/**
 * Display-decision middleware — the consumer decides display. The
 * function returns a string or string array (attached verbatim,
 * multi-group preserved) or `null` to show nothing. The consumer
 * attaches its classification extension map as the `toolMap` property
 * before wiring (the SDK reads classification data off the function —
 * the function is the sole use() parameter).
 */
export interface HintDisplayFn {
  (ctx: HintDisplayContext): string | string[] | null;
  /** Consumer-supplied tool→scenario extension table (data only; native priority). Read at wiring time — captured; mutation after wiring has no effect on the wired chain. */
  toolMap?: ToolMap;
}

/**
 * Merge appended text blocks into a chain result — OMP face
 * append-only contract. A record result's own content array wins
 * (consumer-owned partial; blocks appended); a non-record result (the
 * void base) becomes a fresh partial carrying the ORIGINAL event
 * content + the appended blocks — the original tool-result content is
 * NEVER dropped. Never mutates the incoming value.
 */
function appendHintToResult(
  result: HandlerResult,
  blocks: readonly { type: string; text: string }[],
  originalContent: readonly unknown[],
): HandlerResult {
  const append = (content: readonly unknown[]): readonly unknown[] => [...content, ...blocks];
  if (result !== null && typeof result === 'object' && !Array.isArray(result)) {
    const rec = result as Record<string, unknown>;
    if (Array.isArray(rec.content)) return { ...rec, content: append(rec.content) };
    if (typeof rec.content === 'string') {
      return { ...rec, content: `${rec.content}\n${blocks.map((b) => b.text).join('\n')}` };
    }
    return { ...rec, content: append(originalContent) };
  }
  return { content: append(originalContent) };
}

/**
 * Scenario-hints middleware factory — the display function is captured
 * in closure at `hints.use(fn)` time. Classifies the current
 * tool-result event, builds the display context, delegates the display
 * decision to the function, appends the returned text to the result
 * (OMP content-array merge) or mutates the output in place (opencode
 * string content), and emits a notify FeedbackLine on every successful
 * attachment. Fail-open at dispatch: odd payloads and throws degrade
 * to pass-through — the tool path never breaks. A compliant invocation
 * is a HARD floor: the function sees `compliant: true` and any non-null
 * return still attaches nothing (silent suppression).
 */
function createScenarioHintsMiddleware(fn: HintDisplayFn): Middleware {
  // The consumer extension map is CAPTURED at wiring time (snapshot
  // semantics): a shallow copy, so any later mutation of fn.toolMap —
  // including in-place — does not affect the already-wired chain;
  // classification is deterministic per wiring.
  const toolMap = { ...fn.toolMap }; // values are scenario-id strings — shallow copy suffices
  return (self) =>
    Effect.gen(function* () {
      const event = yield* CanonicalEventService;
      const ctx = yield* DeliveryContext;
      try {
        const record = isRecord(event.payload as unknown) ? (event.payload as Record<string, unknown>) : undefined;
        if (record === undefined) return yield* self;
        const toolName = typeof record.toolName === 'string' ? record.toolName : undefined;
        if (toolName === undefined) return yield* self;
        // Content-embedded errors are detected at adapter normalization —
        // the errorShaped verdict skips attachment (no guidance noise on errors).
        if (record.errorShaped === true) return yield* self;
        const recordArgs = isRecord(record.args) ? record.args : undefined;
        const classInput: DisciplineInput = recordArgs === undefined ? { toolName } : { toolName, args: recordArgs };
        const classified: ClassificationResult = classifyScenario(classInput, toolMap);
        const scenario = classified.scenario;
        if (scenario === undefined) return yield* self; // no coverage — pass through
        const displayCtx: HintDisplayContext = {
          scenario,
          compliant: classified.compliant,
          usedTool: usedToolOf(classInput),
          errorShaped: false,
          promoted: [...promotedSetOf(toolMap)[scenario]],
        };
        const text = fn(displayCtx);
        // Compliant = silent, always: the function sees the verdict but a
        // non-null return on a compliant invocation still attaches nothing.
        if (text === null || classified.compliant) return yield* self;
        const blocks = (Array.isArray(text) ? text : [text]).map((part) => ({ type: 'text' as const, text: part }));
        const joined = blocks.map((b) => b.text).join('\n');
        createFeedbackChannel(ctx).emit({ kind: 'notify', text: joined });
        const content = record.content;
        if (Array.isArray(content)) {
          // OMP face — the result partial is the surface; append the
          // blocks to the ORIGINAL content (append-only: never drop the
          // tool result content, even when the chain result is the void base).
          return yield* self.pipe(Effect.map((result) => appendHintToResult(result, blocks, content)));
        }
        if (typeof content === 'string') {
          // opencode face — in-place output mutation (law L4); OMP mutate is a no-op (return is the surface).
          ctx.mutate('output', 'output', content.length > 0 ? `${content}\n${joined}` : joined);
          return yield* self;
        }
        return yield* self; // odd shape — pass through
      } catch {
        return yield* self; // fail-open — never breaks the tool path
      }
    });
}

/** The scenario-hints capability — wiring + the classify primitive (spec: Scenario-keyed hints contract). */
export interface HintsCapability {
  /**
   * Wire the scenario-hints middleware onto a canonical hook. Defaults
   * to `tool_result`; an explicit hook target (single or
   * array of canonical names) overrides. Unknown hook → loud
   * MiddlewareHookError. Returns an unwire handle. The display function
   * is the sole parameter — carry the consumer extension map on
   * `toolMap` before wiring.
   */
  use(fn: HintDisplayFn, hook?: CanonicalEvent | readonly CanonicalEvent[]): () => void;
  /**
   * Classify a tool invocation against the wired display function's
   * extension map — returns the scenario key + compliance verdict, or
   * an empty result (no coverage, fail-open). Consumer contributes
   * extension table DATA only, never classification rules.
   */
  classify(input: DisciplineInput): ClassificationResult;
}

/** Create the hints capability over a hooks surface (via createCapabilities). */
export function createHints(hooks: Hooks): HintsCapability {
  // Latest wiring's captured map snapshot — the classify face resolves
  // against it: single source of truth, no divergence from active chains.
  // Set only AFTER the wiring succeeds, so a failed use() (unknown hook)
  // never points the face at a chain that did not attach.
  let currentSnapshot: ToolMap | undefined;
  return {
    use(fn, hook = 'tool_result') {
      const unwire = wireCapability(hooks, hook, createScenarioHintsMiddleware(fn));
      currentSnapshot = { ...fn.toolMap };
      return unwire;
    },
    classify(input) {
      return classifyScenario(input, currentSnapshot);
    },
  };
}
