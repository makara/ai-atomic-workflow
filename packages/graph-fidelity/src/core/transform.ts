/**
 * Session fidelity planner — pure functions deciding which tool messages get
 * fidelity-reduced at emission. Tiers (signal-distribution): L0 = protected
 * structural content (user/assistant text — never a candidate), L3 =
 * working-face reduction (tool outputs and errors).
 *
 * Working-face only: candidates are tool-result parts (tool outputs + errors).
 * Protection is by shape convention — text/reasoning parts carry no tool-call
 * ids, so only tool-role working content is ever touched.
 *
 * No parts are ever removed — replaced content keeps message structure intact
 * (recoverable: original lives in the platform transcript).
 *
 * @module
 */

import type { ToolCallRecord } from './types.js';

/** Normalized parameter signature — JSON with sorted keys (stable identity). */
export function normalizeParams(params: unknown): string {
  if (params === undefined || params === null) return '';
  try {
    const sorted = sortKeys(params);
    return JSON.stringify(sorted);
  } catch {
    return String(params);
  }
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = sortKeys(obj[key]);
    }
    return out;
  }
  return value;
}

/**
 * Build the fidelity plan for a message list.
 *
 * @param calls — all tool calls present in the transcript (in order).
 * @returns map of tool-call id → replacement content for superseded
 *          results; ids absent from the map keep their content verbatim.
 *          Errored results are decided by the adapter (`isError` on the
 *          result part) inside `applySessionFidelity` — plan-independent.
 */
export function buildFidelityPlan(calls: ReadonlyArray<ToolCallRecord>): Map<string, string> {
  const plan = new Map<string, string>();

  // Dedup — same tool name + normalized parameters: keep the LATEST call's
  // result; earlier occurrences are superseded (working-face supersede rule).
  const bySignature = new Map<string, ToolCallRecord>();
  for (const call of calls) bySignature.set(call.signature, call); // last wins
  for (const call of calls) {
    const latest = bySignature.get(call.signature);
    if (latest && latest.id !== call.id) {
      plan.set(
        call.id,
        `[superseded — identical ${call.name} call result kept at the latest occurrence; restore via the platform transcript]`,
      );
    }
  }

  return plan;
}

/** Marker for errored tool results (working-face fidelity reduction). */
export const ERROR_MARKER = '[input removed due to failed tool call]';

/**
 * Apply the fidelity plan to a transcript of parts.
 *
 * Parts with `toolCallId` matching a plan entry get their content replaced by
 * the marker (dedup/superseded). Parts flagged errored get the error marker
 * unless the opt-out keeps them. Text/reasoning/user parts carry no tool-call
 * ids and pass through untouched — the L0 protection set, by shape
 * convention.
 *
 * @param parts — transcript parts (opencode MessagePart shapes, structurally
 *                duck-typed for version tolerance).
 * @param plan — fidelity plan from buildFidelityPlan.
 */
export function applySessionFidelity<T extends Record<string, unknown>>(
  parts: ReadonlyArray<T>,
  plan: ReadonlyMap<string, string>,
  opts?: { readonly keepErrorContent?: boolean },
): ReadonlyArray<T> {
  return parts.map((part) => {
    const toolCallId = part['toolCallId'] ?? part['tool-call-id'];
    if (typeof toolCallId === 'string') {
      const marker = plan.get(toolCallId);
      if (marker !== undefined) {
        return { ...part, content: marker };
      }
      const isError = part['isError'] === true || part['state'] === 'error';
      if (isError && !opts?.keepErrorContent) {
        return { ...part, content: ERROR_MARKER };
      }
    }
    return part;
  });
}

/** Extract tool-call records from assistant parts (duck-typed). */
export function extractToolCalls<T extends Record<string, unknown>>(
  parts: ReadonlyArray<T>,
): ReadonlyArray<ToolCallRecord> {
  const calls: ToolCallRecord[] = [];
  for (const part of parts) {
    const toolCalls = part['toolCalls'] ?? part['tool-calls'];
    if (Array.isArray(toolCalls)) {
      for (const call of toolCalls) {
        const id = call['id'] ?? call['toolCallId'];
        const name = call['name'] ?? (call['tool'] as string | undefined);
        if (typeof id === 'string' && typeof name === 'string') {
          calls.push({ id, name, signature: `${name}:${normalizeParams(call['input'] ?? call['arguments'])}` });
        }
      }
    }
  }
  return calls;
}
