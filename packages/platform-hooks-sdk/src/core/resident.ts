/**
 * System-resident prompts — the P0 prompt class: a fixed set of
 * correctness directives injected into the outgoing SYSTEM PROMPT
 * (position law: C4-class knowledge rides the system-prompt seam, never
 * the user channel) on every top-level turn on both platform faces (OMP
 * `before_agent_start`, opencode `experimental.chat.system.transform`).
 * Install = resident; no session toggle.
 *
 * The block carries a machine anchor marker (`[resident]`) and is
 * canonical-deduped + refreshed in place (the discipline echo module's
 * dedup pattern, applied to system-prompt arrays).
 *
 * sdk-hooks-capabilities: resident wiring is the `resident` capability
 * object — `resident.use(config)` self-wires onto the default
 * `before_agent_start` canonical hook (explicit hook target overrides;
 * unknown hook → loud MiddlewareHookError). Configuration is CAPTURED
 * AT BIND TIME as a plain object (the former ResidentConfig service was
 * deleted); absent/empty content → pass-through no-op. Content stays
 * consumer-owned data (`{ id, title, text }` entries) — the SDK holds
 * no resident content. Method name never repeats the capability name
 * (user decision: `resident.use()`, not `resident.resident()`).
 *
 * Pure: no platform imports, no platform state. Adapters wire this core
 * to their system-prompt seams.
 *
 * @module
 */

import { Effect } from 'effect';
import type { CanonicalEvent } from './events.js';
import { createFeedbackChannel } from './feedback.js';
import { CanonicalEventService, type Hooks, type Middleware, wireCapability } from './middleware.js';
import { isRecord } from './shape-ops.js';
import { DeliveryContext, type HandlerResult } from './types.js';

/** Machine anchor — resident block lines are marker-prefixed (grep-anchor, same family as `[seam]`). */
export const RESIDENT_MARKER = '[resident]';

/** Block heading — single source for render + strip (byte-identity keeps self-heal reliable). */
export const RESIDENT_HEADING = '## Resident Prompts';

/** A resident prompt entry — fixed at install, rendered per turn. */
export interface ResidentPrompt {
  readonly id: string;
  readonly title: string;
  readonly text: string;
}

/** Resident capability configuration — captured at bind time (plain object). */
export interface ResidentConfigValue {
  /** Resident prompt entries — `{ id, title, text }`, consumer-owned. */
  readonly content: readonly ResidentPrompt[];
  /** Proactive feedback on successful application — 'notify' (default) | 'compliance' | false. */
  readonly feedback?: 'notify' | 'compliance' | false;
}

/** True when the text carries a resident line. */
function hasResidentLine(text: string): boolean {
  return text.split('\n').some((line) => isResidentLine(line));
}

/** True when a line is a resident line — marker-prefixed (optional list prefix tolerated). */
function isResidentLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith(RESIDENT_MARKER) || trimmed.startsWith(`- ${RESIDENT_MARKER}`);
}

/**
 * Strip the resident block from a system-prompt entry (self-heal helper).
 * Keeps the entry's own text before the first resident line/heading and
 * collapses the trailing whitespace — byte-identical to the round-1
 * behavior (self-heal relies on byte identity).
 */
export function stripResidentLines(text: string): string {
  const lines = text.split('\n');
  const first = lines.findIndex((line) => isResidentLine(line) || isResidentHeading(line));
  if (first === -1) return text;
  const kept = lines.slice(0, first);
  return kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n+$/, '');
}

/** True when a line is the resident block heading. */
function isResidentHeading(line: string): boolean {
  return line.trim() === RESIDENT_HEADING;
}

/** True when the text carries the resident heading. */
function hasResidentHeading(text: string): boolean {
  return text.split('\n').some((line) => isResidentHeading(line));
}

/** Render the resident block — deterministic, one heading + marker-prefixed entries. */
export function renderResidentBlock(prompts: readonly ResidentPrompt[]): string {
  const rows = prompts.map((p) => `${RESIDENT_MARKER} ${p.title}: ${p.text}`).join('\n');
  return `${RESIDENT_HEADING}\n${rows}`;
}

/**
 * Apply the resident block to a system-prompt array — canonical-dedup
 * (byte-equal block entry present → skip) + self-heal (stale resident
 * block stripped from other entries), then append the fresh block as the
 * last entry. Returns undefined when nothing changed. Never mutates input.
 */
export function applyResidentBlock(systemPrompts: readonly string[], block: string): string[] | undefined {
  if (block.length === 0) return undefined;
  if (systemPrompts.some((entry) => entry === block)) return undefined;
  const base = systemPrompts.map((entry) =>
    hasResidentHeading(entry) || hasResidentLine(entry) ? stripResidentLines(entry) : entry,
  );
  return [...base, block];
}

/**
 * One-call adapter helper — render the block and apply it to the
 * system-prompt array; returns the new array or undefined when nothing
 * changed (dedup). Both platform faces call this from their
 * system-prompt seams; zero deny (undefined → no injection). The
 * resident prompt entries are consumer-provided (PCL + activate
 * content stays consumer-side).
 */
export function applyResidentToSystem(
  systemPrompts: readonly string[],
  prompts: readonly ResidentPrompt[],
): string[] | undefined {
  return applyResidentBlock(systemPrompts, renderResidentBlock(prompts));
}

/** Extract the system-prompt array from a canonical before-agent-start payload (string | array). */
function systemPromptsOf(raw: unknown): string[] {
  return typeof raw === 'string'
    ? [raw]
    : Array.isArray(raw)
      ? raw.filter((s): s is string => typeof s === 'string')
      : [];
}

/** Merge a partial into a chain result — OMP fresh-merge semantics; a non-record result becomes the partial. Single home (consumers import, never duplicate). */
export function joinPartial(result: HandlerResult, partial: Record<string, unknown>): HandlerResult {
  if (result !== null && typeof result === 'object' && !Array.isArray(result)) {
    return { ...(result as Record<string, unknown>), ...partial };
  }
  return partial;
}

/**
 * Resident middleware factory — configuration captured in closure at
 * `resident.use(config)` time. Renders the resident block and applies
 * it to the current event's system prompt via dedup/self-heal, with
 * dual-face delivery (opencode `system` key → in-place output mutation,
 * law L4; OMP `systemPrompt` key or absent → fresh merge partial
 * `{ systemPrompt }`). Empty content → pass-through no-op. Fail-open:
 * odd payloads and throws degrade to pass-through — the session path
 * never breaks.
 */
function createResidentMiddleware(config: ResidentConfigValue): Middleware {
  return (self) =>
    Effect.gen(function* () {
      const event = yield* CanonicalEventService;
      const ctx = yield* DeliveryContext;
      const { content, feedback } = config;
      if (content.length === 0) return yield* self; // empty content — pass-through no-op (never inject a bare heading)
      try {
        const record = isRecord(event.payload as unknown) ? (event.payload as Record<string, unknown>) : undefined;
        if (record === undefined) return yield* self;
        const kind = feedback ?? 'notify';
        const emit =
          kind === false
            ? undefined
            : () => createFeedbackChannel(ctx).emit({ kind, text: renderResidentBlock(content) });
        // Face discrimination by key presence: opencode payloads carry
        // `system`; OMP payloads carry `systemPrompt` (or neither — an
        // empty payload is an empty system prompt, block-only injection).
        if ('system' in record) {
          // opencode face: system key → in-place output mutation (law L4).
          const applied = applyResidentToSystem(systemPromptsOf(record.system), content);
          if (applied === undefined) return yield* self;
          if (emit !== undefined) emit();
          ctx.mutate('output', 'system', [...applied]);
          return yield* self;
        }
        // OMP face: systemPrompt key (or absent) → fresh merge partial.
        const applied = applyResidentToSystem(systemPromptsOf(record.systemPrompt), content);
        if (applied === undefined) return yield* self;
        if (emit !== undefined) emit();
        return yield* self.pipe(Effect.map((result) => joinPartial(result, { systemPrompt: [...applied] })));
      } catch {
        return yield* self; // fail-open — never breaks the session path
      }
    });
}

/** The resident capability — `use(config, hook?)` self-wires the middleware to a canonical hook. */
export interface ResidentCapability {
  /**
   * Wire the resident middleware onto a canonical hook. Defaults to
   * `before_agent_start` (ADR 0211); an explicit hook target (single or
   * array of canonical names) overrides. Unknown hook → loud
   * MiddlewareHookError. Returns an unwire handle.
   */
  use(config: ResidentConfigValue, hook?: CanonicalEvent | readonly CanonicalEvent[]): () => void;
}

/** Create the resident capability over a hooks surface (via createCapabilities). */
export function createResident(hooks: Hooks): ResidentCapability {
  return {
    use(config, hook = 'before_agent_start') {
      return wireCapability(hooks, hook, createResidentMiddleware(config));
    },
  };
}
