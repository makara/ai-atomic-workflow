/**
 * Canonical event directory — the normalized cross-platform event set,
 * DERIVED from the hook catalog (core/catalog.ts, ADR 0196). One
 * canonical name per cross-platform concept; platform spellings
 * (OMP snake_case, opencode dotted) live in adapter tables only.
 *
 * The catalog is the single source: 63 hook rows → 16 formal canonical
 * interfaces + 37 pending interfaces. Shared substitute faces
 * (opencode `event` stream × message_start/update/end) are declared in
 * the catalog and are NOT auto-wired here.
 *
 * opencode mappings are pinned against the real v1 Hooks contract
 * (@opencode-ai/plugin@1.18.16). Event-stream types (message.updated,
 * session.idle, ...) arrive through the generic 'event' hook — they are
 * NOT hook names and are not mapped.
 */

import { FORMAL_CANONICALS, formalFacesOf, type CanonicalName } from './catalog.js';

/** Canonical event names — the 16 formal interfaces (catalog-derived). */
export const CANONICAL_EVENTS = FORMAL_CANONICALS;

export type CanonicalEvent = CanonicalName;

export interface EventDirectoryEntry {
  /** canonical name — consumers reference this only */
  canonical: CanonicalEvent;
  /** OMP hook event name (snake_case); absent = OMP has no such hook */
  omp?: string;
  /** opencode v1 hook name (dotted); absent = opencode v1 has no such hook */
  opencode?: string;
  /** opencode v1 mutation output key receiving the canonical result (real surface only) */
  opencodeOutKey?: string;
  description: string;
}

const CANONICAL_DESCRIPTIONS: Record<CanonicalEvent, string> = {
  context: 'Pre-LLM-call context rewrite (OMP full-replacement chain; opencode message transform)',
  before_agent_start: 'Pre-prompt content injection (OMP before_agent_start; opencode system transform, merged)',
  user_input: 'Pre-prompt user input (OMP input hook; opencode chat.message is the interface-level alternative)',
  tool_call: 'Pre-execution tool invocation',
  tool_result: 'Post-execution tool result (pre-persistence rewrite; opencode output surface {title,output,metadata})',
  message_start: 'Message stream begin (OMP; opencode event stream is the shared substitute face)',
  message_update: 'Streaming message snapshot (OMP; opencode event stream is the shared substitute face)',
  message_end:
    'Completed assistant message with usage facts (OMP; opencode event stream is the shared substitute face)',
  session_shutdown: 'Session-end flush (OMP; opencode dispose)',
  session_before_compact: 'Pre-compaction timing (OMP; opencode experimental.session.compacting)',
  before_provider_request: 'Pre-provider payload replacement (OMP; opencode provider, weak substitute)',
  after_provider_response: 'Post-provider response observation (OMP only)',
  chat_message: 'Chat message emission (opencode; OMP input is the interface-level alternative)',
  credential_disabled: 'Credential event (OMP; opencode auth)',
  tool_approval_requested:
    'Tool approval request interception (OMP; opencode permission.ask — renamed from permission_ask)',
  event:
    'Generic event stream — message.updated / session.idle etc. arrive here (opencode; shared substitute for OMP message_*)',
};

/** Event directory — derived from CATALOG formal rows (ADR 0196). */
export const EVENT_DIRECTORY: readonly EventDirectoryEntry[] = CANONICAL_EVENTS.map((canonical) => {
  const { omp, opencode, opencodeOutKey } = formalFacesOf(canonical);
  const entry: EventDirectoryEntry = { canonical, description: CANONICAL_DESCRIPTIONS[canonical] };
  if (omp !== undefined) entry.omp = omp;
  if (opencode !== undefined) entry.opencode = opencode;
  if (opencodeOutKey !== undefined) entry.opencodeOutKey = opencodeOutKey;
  return entry;
});

/** canonical → OMP event name lookup (undefined = no OMP hook). */
export function ompEventName(canonical: CanonicalEvent): string | undefined {
  return EVENT_DIRECTORY.find((e) => e.canonical === canonical)?.omp;
}

/** canonical → opencode v1 hook name lookup (undefined = no opencode v1 hook). */
export function opencodeEventName(canonical: CanonicalEvent): string | undefined {
  return EVENT_DIRECTORY.find((e) => e.canonical === canonical)?.opencode;
}

/** canonical → opencode mutation output key lookup. */
export function opencodeOutKey(canonical: CanonicalEvent): string | undefined {
  return EVENT_DIRECTORY.find((e) => e.canonical === canonical)?.opencodeOutKey;
}
