/**
 * Platform hook catalog — the SINGLE machine-readable source for every
 * platform hook's SDK interface (ADR 0196). The canonical directory
 * (core/events.ts), the pending interface list (core/pending-interfaces.ts),
 * the first-principles document directory, and the consistency assertions
 * all derive from this catalog. Platform hook universes are verified
 * against .refs (OMP extensions/types.ts on() overloads 1083-1136;
 * opencode v1 Hooks interface plugin/src/index.ts 222-335).
 */

/** Formal canonical interface names — one per cross-platform semantic. */
export const FORMAL_CANONICALS = [
  'context',
  'before_agent_start',
  'user_input',
  'tool_call',
  'tool_result',
  'message_start',
  'message_update',
  'message_end',
  'session_shutdown',
  'session_before_compact',
  'before_provider_request',
  'after_provider_response',
  'chat_message',
  'credential_disabled',
  'tool_approval_requested',
  'event',
] as const;

export type CanonicalName = (typeof FORMAL_CANONICALS)[number];

export type CatalogStatus = 'formal' | 'pending' | 'v2';

export interface CatalogEntry {
  /** Platform owning the hook. */
  platform: 'omp' | 'opencode';
  /** Platform hook name (OMP snake_case / opencode dotted). */
  hook: string;
  /**
   * formal — implemented canonical interface (direct or substitute face);
   * pending — defined interface, deliberately NOT implemented;
   * v2 — opencode v2 reserved generation, zero functional claims.
   */
  status: CatalogStatus;
  /** Formal only: the canonical interface this hook maps to. */
  canonical?: CanonicalName;
  /**
   * direct — native platform surface for the canonical;
   * substitute — cross-platform substitute (promoted, one consistent name).
   */
  face?: 'direct' | 'substitute';
  /**
   * True when this hook serves as the SHARED substitute face for several
   * canonicals (opencode `event` stream × message_start/update/end —
   * the single declared exception to the single-face rule, grilling Q4).
   */
  substituteShared?: boolean;
  /** substituteShared only: the canonicals served by this shared face. */
  substituteFor?: readonly CanonicalName[];
  /** Pending: interface name (snake_case, per naming rules). */
  interfaceName?: string;
  /** Interface-level alternative canonical (different interface, adjacent semantics). */
  alternativeCanonical?: CanonicalName;
  /** Pending reason / substitute weakness note. */
  reason?: string;
  /** Pending only: future substitution path. */
  futurePath?: string;
  /** opencode mutation output key (real surface only). */
  opencodeOutKey?: string;
}

/**
 * The catalog — 63 hook rows (OMP 42 + opencode 21) + v2 reserved entry.
 * Single-face rule: every hook appears in at most one formal row with a
 * direct/substitute face, except the declared shared substitute (`event`).
 */
export const CATALOG: readonly CatalogEntry[] = [
  // ── OMP formal (14) ────────────────────────────────────────────────
  { platform: 'omp', hook: 'context', status: 'formal', canonical: 'context', face: 'direct' },
  { platform: 'omp', hook: 'before_agent_start', status: 'formal', canonical: 'before_agent_start', face: 'direct' },
  {
    platform: 'omp',
    hook: 'input',
    status: 'formal',
    canonical: 'user_input',
    face: 'direct',
    alternativeCanonical: 'chat_message',
  },
  { platform: 'omp', hook: 'tool_call', status: 'formal', canonical: 'tool_call', face: 'direct' },
  { platform: 'omp', hook: 'tool_result', status: 'formal', canonical: 'tool_result', face: 'direct' },
  { platform: 'omp', hook: 'message_start', status: 'formal', canonical: 'message_start', face: 'direct' },
  { platform: 'omp', hook: 'message_update', status: 'formal', canonical: 'message_update', face: 'direct' },
  { platform: 'omp', hook: 'message_end', status: 'formal', canonical: 'message_end', face: 'direct' },
  { platform: 'omp', hook: 'session_shutdown', status: 'formal', canonical: 'session_shutdown', face: 'direct' },
  {
    platform: 'omp',
    hook: 'session_before_compact',
    status: 'formal',
    canonical: 'session_before_compact',
    face: 'direct',
  },
  {
    platform: 'omp',
    hook: 'before_provider_request',
    status: 'formal',
    canonical: 'before_provider_request',
    face: 'direct',
  },
  {
    platform: 'omp',
    hook: 'after_provider_response',
    status: 'formal',
    canonical: 'after_provider_response',
    face: 'direct',
  },
  { platform: 'omp', hook: 'credential_disabled', status: 'formal', canonical: 'credential_disabled', face: 'direct' },
  {
    platform: 'omp',
    hook: 'tool_approval_requested',
    status: 'formal',
    canonical: 'tool_approval_requested',
    face: 'direct',
  },

  // ── OMP pending (28) ───────────────────────────────────────────────
  {
    platform: 'omp',
    hook: 'session_start',
    status: 'pending',
    interfaceName: 'session_start',
    reason: 'opencode v1 has no session-start hook (generic event stream only)',
    futurePath: 'opencode v2 event stream',
  },
  {
    platform: 'omp',
    hook: 'session_before_switch',
    status: 'pending',
    interfaceName: 'session_before_switch',
    reason: 'opencode has no session-switch concept',
    futurePath: 'opencode v2',
  },
  {
    platform: 'omp',
    hook: 'session_switch',
    status: 'pending',
    interfaceName: 'session_switch',
    reason: 'opencode has no session-switch concept',
    futurePath: 'opencode v2',
  },
  {
    platform: 'omp',
    hook: 'session_before_branch',
    status: 'pending',
    interfaceName: 'session_before_branch',
    reason: 'opencode has no session-branch concept',
    futurePath: 'opencode v2',
  },
  {
    platform: 'omp',
    hook: 'session_branch',
    status: 'pending',
    interfaceName: 'session_branch',
    reason: 'opencode has no session-branch concept',
    futurePath: 'opencode v2',
  },
  {
    platform: 'omp',
    hook: 'session.compacting',
    status: 'pending',
    interfaceName: 'session_compacting',
    reason: 'opencode has only a pre-compaction hook (claimed by session_before_compact)',
    futurePath: 'platform alignment',
  },
  {
    platform: 'omp',
    hook: 'session_compact',
    status: 'pending',
    interfaceName: 'session_compact',
    reason: 'opencode has no after-compaction counterpart',
    futurePath: 'platform alignment',
  },
  {
    platform: 'omp',
    hook: 'session_stop',
    status: 'pending',
    interfaceName: 'session_stop',
    reason: 'per-turn flush; opencode has no per-turn boundary hook',
    futurePath: 'event-stream extension',
  },
  {
    platform: 'omp',
    hook: 'session_before_tree',
    status: 'pending',
    interfaceName: 'session_before_tree',
    reason: 'opencode has no tree mechanism',
    futurePath: 'opencode v2',
  },
  {
    platform: 'omp',
    hook: 'session_tree',
    status: 'pending',
    interfaceName: 'session_tree',
    reason: 'opencode has no tree mechanism',
    futurePath: 'opencode v2',
  },
  {
    platform: 'omp',
    hook: 'agent_start',
    status: 'pending',
    interfaceName: 'agent_start',
    reason: 'opencode has no agent concept',
    futurePath: 'event-stream extension',
  },
  {
    platform: 'omp',
    hook: 'agent_end',
    status: 'pending',
    interfaceName: 'agent_end',
    reason: 'opencode has no agent concept',
    futurePath: 'event-stream extension',
  },
  {
    platform: 'omp',
    hook: 'turn_start',
    status: 'pending',
    interfaceName: 'turn_start',
    reason: 'opencode has no turn boundary',
    futurePath: 'event-stream extension',
  },
  {
    platform: 'omp',
    hook: 'turn_end',
    status: 'pending',
    interfaceName: 'turn_end',
    reason: 'opencode has no turn boundary',
    futurePath: 'event-stream extension',
  },
  {
    platform: 'omp',
    hook: 'tool_execution_start',
    status: 'pending',
    interfaceName: 'tool_execution_start',
    reason: 'fine-grained execution telemetry; opencode execution faces are claimed by tool_call/tool_result',
    futurePath: 'event-stream extension',
  },
  {
    platform: 'omp',
    hook: 'tool_execution_update',
    status: 'pending',
    interfaceName: 'tool_execution_update',
    reason: 'fine-grained execution telemetry; opencode execution faces are claimed by tool_call/tool_result',
    futurePath: 'event-stream extension',
  },
  {
    platform: 'omp',
    hook: 'tool_execution_end',
    status: 'pending',
    interfaceName: 'tool_execution_end',
    reason: 'fine-grained execution telemetry; opencode execution faces are claimed by tool_call/tool_result',
    futurePath: 'event-stream extension',
  },
  {
    platform: 'omp',
    hook: 'auto_compaction_start',
    status: 'pending',
    interfaceName: 'auto_compaction_start',
    reason: 'mechanism event; opencode autocontinue is a decision hook, not an equivalent',
    futurePath: 'platform alignment',
  },
  {
    platform: 'omp',
    hook: 'auto_compaction_end',
    status: 'pending',
    interfaceName: 'auto_compaction_end',
    reason: 'mechanism event; opencode autocontinue is a decision hook, not an equivalent',
    futurePath: 'platform alignment',
  },
  {
    platform: 'omp',
    hook: 'auto_retry_start',
    status: 'pending',
    interfaceName: 'auto_retry_start',
    reason: 'opencode has no retry mechanism surface',
    futurePath: 'platform alignment',
  },
  {
    platform: 'omp',
    hook: 'auto_retry_end',
    status: 'pending',
    interfaceName: 'auto_retry_end',
    reason: 'opencode has no retry mechanism surface',
    futurePath: 'platform alignment',
  },
  {
    platform: 'omp',
    hook: 'ttsr_triggered',
    status: 'pending',
    interfaceName: 'ttsr_triggered',
    reason: 'opencode has no TTSR mechanism',
    futurePath: 'platform alignment',
  },
  {
    platform: 'omp',
    hook: 'todo_reminder',
    status: 'pending',
    interfaceName: 'todo_reminder',
    reason: 'opencode has no planning-surface event',
    futurePath: 'platform alignment',
  },
  {
    platform: 'omp',
    hook: 'goal_updated',
    status: 'pending',
    interfaceName: 'goal_updated',
    reason: 'opencode has no planning-surface event',
    futurePath: 'platform alignment',
  },
  {
    platform: 'omp',
    hook: 'user_bash',
    status: 'pending',
    interfaceName: 'user_bash',
    reason: 'opencode has no user-code surface',
    futurePath: 'platform alignment',
  },
  {
    platform: 'omp',
    hook: 'user_python',
    status: 'pending',
    interfaceName: 'user_python',
    reason: 'opencode has no user-code surface',
    futurePath: 'platform alignment',
  },
  {
    platform: 'omp',
    hook: 'resources_discover',
    status: 'pending',
    interfaceName: 'resources_discover',
    reason: 'opencode has no resource-discovery surface',
    futurePath: 'opencode v2',
  },
  {
    platform: 'omp',
    hook: 'tool_approval_resolved',
    status: 'pending',
    interfaceName: 'tool_approval_resolved',
    reason: 'opencode permission.ask covers only the request side',
    futurePath: 'permission-resolution events',
  },

  // ── opencode v1 formal (11) ────────────────────────────────────────
  {
    platform: 'opencode',
    hook: 'experimental.chat.messages.transform',
    status: 'formal',
    canonical: 'context',
    face: 'direct',
    opencodeOutKey: 'messages',
  },
  { platform: 'opencode', hook: 'tool.execute.before', status: 'formal', canonical: 'tool_call', face: 'direct' },
  {
    platform: 'opencode',
    hook: 'tool.execute.after',
    status: 'formal',
    canonical: 'tool_result',
    face: 'direct',
    opencodeOutKey: 'output',
  },
  {
    platform: 'opencode',
    hook: 'chat.message',
    status: 'formal',
    canonical: 'chat_message',
    face: 'direct',
    alternativeCanonical: 'user_input',
  },
  {
    platform: 'opencode',
    hook: 'experimental.chat.system.transform',
    status: 'formal',
    canonical: 'before_agent_start',
    face: 'substitute',
    reason: 'pre-prompt content injection counterpart (system_transform merged, ADR 0196)',
  },
  {
    platform: 'opencode',
    hook: 'event',
    status: 'formal',
    canonical: 'event',
    face: 'direct',
    substituteShared: true,
    substituteFor: ['message_start', 'message_update', 'message_end'],
    reason: 'generic event stream; shared substitute face for OMP message_* canonicals (grilling Q4)',
  },
  {
    platform: 'opencode',
    hook: 'dispose',
    status: 'formal',
    canonical: 'session_shutdown',
    face: 'substitute',
    reason: 'session-end flush counterpart',
  },
  {
    platform: 'opencode',
    hook: 'experimental.session.compacting',
    status: 'formal',
    canonical: 'session_before_compact',
    face: 'substitute',
    reason: 'pre-compaction counterpart',
  },
  {
    platform: 'opencode',
    hook: 'provider',
    status: 'formal',
    canonical: 'before_provider_request',
    face: 'substitute',
    reason: 'weak — provider definition/update event; closest request-surface counterpart',
  },
  {
    platform: 'opencode',
    hook: 'auth',
    status: 'formal',
    canonical: 'credential_disabled',
    face: 'substitute',
    reason: 'credential/auth event counterpart',
  },
  {
    platform: 'opencode',
    hook: 'permission.ask',
    status: 'formal',
    canonical: 'tool_approval_requested',
    face: 'substitute',
    reason: 'permission request counterpart (canonical renamed from permission_ask, ADR 0196)',
  },

  // ── opencode v1 pending (10 hooks → 9 interfaces) ──────────────────
  {
    platform: 'opencode',
    hook: 'config',
    status: 'pending',
    interfaceName: 'config_updated',
    reason: 'OMP has no config event',
    futurePath: 'platform alignment',
  },
  {
    platform: 'opencode',
    hook: 'tool.definition',
    status: 'pending',
    interfaceName: 'tool_definition',
    reason: 'OMP registerTool is an extension API, not a hook',
    futurePath: 'platform alignment',
  },
  {
    platform: 'opencode',
    hook: 'tool',
    status: 'pending',
    interfaceName: 'tool_definition',
    reason: 'definition-registration map — same pending interface as tool.definition',
    futurePath: 'platform alignment',
  },
  {
    platform: 'opencode',
    hook: 'chat.params',
    status: 'pending',
    interfaceName: 'chat_params',
    reason: 'OMP inlines params in the provider payload',
    futurePath: 'platform alignment',
  },
  {
    platform: 'opencode',
    hook: 'chat.headers',
    status: 'pending',
    interfaceName: 'chat_headers',
    reason: 'OMP inlines headers in the provider payload',
    futurePath: 'platform alignment',
  },
  {
    platform: 'opencode',
    hook: 'command.execute.before',
    status: 'pending',
    interfaceName: 'command_execute_before',
    reason: 'OMP has no command mechanism',
    futurePath: 'platform alignment',
  },
  {
    platform: 'opencode',
    hook: 'shell.env',
    status: 'pending',
    interfaceName: 'shell_env',
    reason: 'OMP has no shell-environment surface',
    futurePath: 'platform alignment',
  },
  {
    platform: 'opencode',
    hook: 'experimental.provider.small_model',
    status: 'pending',
    interfaceName: 'experimental_provider_small_model',
    reason: 'distinct small-model capability; no OMP counterpart',
    futurePath: 'platform alignment',
  },
  {
    platform: 'opencode',
    hook: 'experimental.compaction.autocontinue',
    status: 'pending',
    interfaceName: 'experimental_compaction_autocontinue',
    reason: 'decision hook; OMP compaction events are notifications',
    futurePath: 'platform alignment',
  },
  {
    platform: 'opencode',
    hook: 'experimental.text.complete',
    status: 'pending',
    interfaceName: 'experimental_text_complete',
    reason: 'OMP has no completion surface',
    futurePath: 'opencode v2',
  },

  // ── opencode v2 (reserved generation) ──────────────────────────────
  {
    platform: 'opencode',
    hook: 'v2 define/effect stream',
    status: 'v2',
    reason: 'reserved generation — zero functional claims',
    futurePath: 'stabilize when opencode v2 lands',
  },
];

/** Formal rows grouped by canonical — the EVENT_DIRECTORY derivation source. */
export function formalFacesOf(canonical: CanonicalName): {
  omp?: string;
  opencode?: string;
  opencodeOutKey?: string;
} {
  let omp: string | undefined;
  let opencode: string | undefined;
  let opencodeOutKey: string | undefined;
  for (const row of CATALOG) {
    if (row.status !== 'formal' || row.canonical !== canonical) continue;
    if (row.platform === 'omp' && row.face !== undefined) omp = row.hook;
    if (row.platform === 'opencode' && row.face !== undefined) {
      opencode = row.hook;
      opencodeOutKey = row.opencodeOutKey;
    }
  }
  const out: { omp?: string; opencode?: string; opencodeOutKey?: string } = {};
  if (omp !== undefined) out.omp = omp;
  if (opencode !== undefined) out.opencode = opencode;
  if (opencodeOutKey !== undefined) out.opencodeOutKey = opencodeOutKey;
  return out;
}

/** Pending rows grouped by interface name — the pending list derivation source. */
export function pendingInterfacesOf(): Array<{
  name: string;
  hooks: readonly string[];
  reason: string;
  futurePath: string;
}> {
  const byName = new Map<string, { hooks: string[]; reason: string; futurePath: string }>();
  for (const row of CATALOG) {
    if (row.status !== 'pending' || row.interfaceName === undefined) continue;
    const entry = byName.get(row.interfaceName);
    if (entry) entry.hooks.push(row.hook);
    else
      byName.set(row.interfaceName, { hooks: [row.hook], reason: row.reason ?? '', futurePath: row.futurePath ?? '' });
  }
  return [...byName.entries()].map(([name, v]) => ({
    name,
    hooks: v.hooks,
    reason: v.reason,
    futurePath: v.futurePath,
  }));
}
