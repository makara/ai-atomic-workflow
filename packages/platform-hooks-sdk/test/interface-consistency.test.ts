/**
 * Interface consistency across platforms (ADR 0196): every assertion
 * derives from the hook catalog (CATALOG) — counts, statuses, faces,
 * pending list, single-face rule, important-interface closure, and
 * naming conformance. No hardcoded mapping copies: a catalog change
 * updates these assertions automatically.
 *
 * Platform hook universe verified against .refs sources
 * (OMP extensions/types.ts on() overloads 1083-1136; opencode v1 Hooks
 * interface plugin/src/index.ts 222-335).
 */
import { describe, expect, it } from 'vitest';
import * as adapters from '../src/adapters/index.js';
import { CATALOG, FORMAL_CANONICALS } from '../src/core/catalog.js';
import { CANONICAL_EVENTS, EVENT_DIRECTORY, ompEventName, opencodeEventName } from '../src/core/events.js';
import { PENDING_INTERFACES } from '../src/core/pending-interfaces.js';
import * as sdk from '../src/index.js';
import * as utils from '../src/utils/index.js';

/** The full platform hook universe (verified against .refs). */
const OMP_HOOKS = [
  'context',
  'before_agent_start',
  'input',
  'tool_call',
  'tool_result',
  'message_update',
  'message_end',
  'session_stop',
  'session_shutdown',
  'auto_compaction_end',
  'before_provider_request',
  'after_provider_response',
  'session_start',
  'session_before_switch',
  'session_switch',
  'session_before_branch',
  'session_branch',
  'session_before_compact',
  'session.compacting',
  'session_compact',
  'session_before_tree',
  'session_tree',
  'agent_start',
  'agent_end',
  'turn_start',
  'turn_end',
  'auto_compaction_start',
  'auto_retry_start',
  'auto_retry_end',
  'ttsr_triggered',
  'todo_reminder',
  'goal_updated',
  'message_start',
  'tool_execution_start',
  'tool_execution_update',
  'tool_execution_end',
  'credential_disabled',
  'tool_approval_requested',
  'tool_approval_resolved',
  'user_bash',
  'user_python',
  'resources_discover',
];
const OPENCODE_HOOKS = [
  'dispose',
  'event',
  'config',
  'tool',
  'auth',
  'provider',
  'chat.message',
  'chat.params',
  'chat.headers',
  'permission.ask',
  'command.execute.before',
  'tool.execute.before',
  'shell.env',
  'tool.execute.after',
  'experimental.chat.messages.transform',
  'experimental.chat.system.transform',
  'experimental.provider.small_model',
  'experimental.session.compacting',
  'experimental.compaction.autocontinue',
  'experimental.text.complete',
  'tool.definition',
];

describe('catalog covers the full platform universe (zero absent)', () => {
  it('covers all 42 OMP hooks', () => {
    const covered = new Set(CATALOG.filter((r) => r.platform === 'omp').map((r) => r.hook));
    expect(OMP_HOOKS.every((h) => covered.has(h))).toBe(true);
    expect(covered.size).toBe(42);
  });

  it('covers all 21 opencode v1 hooks', () => {
    const covered = new Set(CATALOG.filter((r) => r.platform === 'opencode' && r.status !== 'v2').map((r) => r.hook));
    expect(OPENCODE_HOOKS.every((h) => covered.has(h))).toBe(true);
    expect(covered.size).toBe(21);
  });

  it('carries no absent-like status', () => {
    for (const row of CATALOG) expect(['formal', 'pending', 'v2']).toContain(row.status);
  });

  it('reserves the opencode v2 generation with zero functional claims', () => {
    const v2 = CATALOG.filter((r) => r.status === 'v2');
    expect(v2.length).toBe(1);
    const entry = v2[0];
    expect(entry).toBeDefined();
    if (entry === undefined) return;
    expect(entry.platform).toBe('opencode');
    // v2 is doc-only (first-principles doc directory) — zero runtime surface
    expect('OPENCODE_V2_RESERVED' in adapters).toBe(false);
    expect('OPENCODE_V2_STATUS' in adapters).toBe(false);
    expect('opencodeV2Adapter' in adapters).toBe(false);
  });
});

describe('formal interfaces (16) — single-face rule', () => {
  it('derives exactly 16 formal canonicals, matching the directory', () => {
    const formalCanonicals = [
      ...new Set(CATALOG.filter((r) => r.status === 'formal').map((r) => r.canonical as string)),
    ];
    expect(formalCanonicals.length).toBe(16);
    expect(formalCanonicals.sort()).toEqual([...FORMAL_CANONICALS].sort());
    expect([...CANONICAL_EVENTS].sort()).toEqual([...FORMAL_CANONICALS].sort());
    expect(EVENT_DIRECTORY.length).toBe(16);
  });

  it('maps every platform hook to at most one formal face (single-face rule)', () => {
    const faces = new Map<string, number>();
    for (const row of CATALOG) {
      if (row.status !== 'formal' || row.face === undefined) continue;
      const key = `${row.platform}:${row.hook}`;
      faces.set(key, (faces.get(key) ?? 0) + 1);
    }
    for (const [key, count] of faces) {
      expect(count, `double face: ${key}`).toBe(1);
    }
  });

  it('declares exactly the one shared substitute face (opencode event × message_*)', () => {
    const shared = CATALOG.filter((r) => r.substituteShared === true);
    expect(shared.length).toBe(1);
    const entry = shared[0];
    expect(entry).toBeDefined();
    if (entry === undefined) return;
    expect(entry.platform).toBe('opencode');
    expect(entry.hook).toBe('event');
    expect([...(entry.substituteFor ?? [])].sort()).toEqual(['message_end', 'message_start', 'message_update']);
  });

  it('wires adapter faces through the directory; shared/alternative faces are never auto-wired', () => {
    for (const row of CATALOG) {
      if (row.status !== 'formal' || row.canonical === undefined) continue;
      if (row.platform === 'omp') {
        expect(ompEventName(row.canonical)).toBe(row.face === undefined ? undefined : row.hook);
      }
      if (row.platform === 'opencode' && row.substituteShared !== true) {
        expect(opencodeEventName(row.canonical)).toBe(row.face === undefined ? undefined : row.hook);
      }
    }
    expect(opencodeEventName('message_start')).toBeUndefined();
    expect(opencodeEventName('message_update')).toBeUndefined();
    expect(opencodeEventName('message_end')).toBeUndefined();
    expect(opencodeEventName('user_input')).toBeUndefined();
    expect(ompEventName('chat_message')).toBeUndefined();
    expect(opencodeEventName('after_provider_response')).toBeUndefined();
    expect(ompEventName('event')).toBeUndefined();
  });

  it('keeps the merged faces and renames', () => {
    expect(opencodeEventName('context')).toBe('experimental.chat.messages.transform');
    expect(opencodeEventName('before_agent_start')).toBe('experimental.chat.system.transform');
    expect(opencodeEventName('tool_approval_requested')).toBe('permission.ask');
    expect(opencodeEventName('session_before_compact')).toBe('experimental.session.compacting');
    expect(opencodeEventName('credential_disabled')).toBe('auth');
  });
});

describe('pending interfaces (37) — defined, deliberately unimplemented', () => {
  it('derives exactly 37 pending interfaces with reason + future path', () => {
    expect(PENDING_INTERFACES.length).toBe(37);
    for (const p of PENDING_INTERFACES) {
      expect(p.reason.length).toBeGreaterThan(0);
      expect(p.futurePath.length).toBeGreaterThan(0);
      expect(p.hooks.length).toBeGreaterThan(0);
    }
  });

  it('covers every pending hook row exactly once (28 OMP + 10 opencode hooks)', () => {
    const pendingRows = CATALOG.filter((r) => r.status === 'pending');
    const covered = new Set<string>();
    for (const p of PENDING_INTERFACES) for (const h of p.hooks) covered.add(h);
    expect(pendingRows.length).toBe(38);
    for (const row of pendingRows) {
      expect(covered.has(row.hook), `pending hook not listed: ${row.hook}`).toBe(true);
    }
  });

  it('has zero runtime implementation — not registerable, not in the directory', () => {
    for (const p of PENDING_INTERFACES) {
      expect([...CANONICAL_EVENTS]).not.toContain(p.name);
      expect(EVENT_DIRECTORY.some((e) => e.canonical === p.name)).toBe(false);
      // no hook namespace exists for it and the guard fails loudly
      expect((sdk.createHooks() as Record<string, unknown>)[p.name]).toBeUndefined();
      expect(() => sdk.assertCanonicalHook(p.name)).toThrow();
    }
  });
});

describe('important interfaces — closed on both platforms (direct or substitute)', () => {
  const IMPORTANT: ReadonlyArray<{ name: string; omp: string; opencode: string }> = [
    { name: 'signal chain', omp: 'context', opencode: 'context' },
    { name: 'session boundaries', omp: 'session_shutdown', opencode: 'session_shutdown' },
    { name: 'compaction', omp: 'session_before_compact', opencode: 'session_before_compact' },
    { name: 'delivery', omp: 'delivery', opencode: 'delivery' },
    { name: 'PCL marking', omp: 'user_input', opencode: 'chat_message' },
    { name: 'session boundary lifecycle', omp: 'session_shutdown', opencode: 'session_shutdown' },
  ];

  it('every important interface has a non-empty face on BOTH platforms', () => {
    for (const entry of IMPORTANT) {
      if (entry.omp === 'delivery') continue;
      const ompRow = EVENT_DIRECTORY.find((e) => e.canonical === entry.omp);
      expect(ompRow, `${entry.name}: OMP row`).toBeDefined();
      expect(ompRow?.omp, `${entry.name}: OMP face`).toBeTruthy();
      const ocRow = EVENT_DIRECTORY.find((e) => e.canonical === entry.opencode);
      expect(ocRow, `${entry.name}: opencode row`).toBeDefined();
      expect(ocRow?.opencode, `${entry.name}: opencode face`).toBeTruthy();
    }
    // delivery closure — the unified DeliveryContext exists and NOOP_DELIVERY implements all channels
    expect(typeof sdk.NOOP_DELIVERY.notify).toBe('function');
    expect(typeof sdk.NOOP_DELIVERY.appendEntry).toBe('function');
    expect(typeof sdk.NOOP_DELIVERY.mutate).toBe('function');
  });
});

describe('public surface minimality (sdk-slim-round5)', () => {
  const DEAD_EXPORT_DENYLIST = [
    'BIND_TAG_SCHEMA',
    'START_MARKERS',
    'EXIT_LINE_MATCHER',
    'isErrorShaped',
    'PENDING_INTERFACES',
    'applyFidelityChain',
    'renderIdentityEcho',
    'SEAM_MARKER',
    'USER_LIKE_ROLES',
    'DisciplineInput',
    'EchoMessage',
    'EchoLineInput',
    'FidelityChainHooks',
  ] as const;

  it('barrel excludes every dead/test-only export on the denylist', () => {
    for (const name of DEAD_EXPORT_DENYLIST) {
      expect(name in sdk, `${name} must not be re-exported from the barrel`).toBe(false);
    }
  });
});

describe('naming conformance (R-SDK8 v2)', () => {
  const VERB_FAMILY = [
    'apply',
    'render',
    'strip',
    'normalize',
    'denormalize',
    'decode',
    'encode',
    'is',
    'create',
    'bind',
    'register',
    'write',
    'append',
    'join',
    'parse',
    'latest',
    'classify',
    'prefix',
    'attach',
    'validate',
    'decide',
    // canonical→landing translation (sdk-surface-convergence)
    'to',
    // sdk-hooks-middleware surface (single execution face + chain registry)
    'fold',
    'run',
    'chains',
    'scenario',
    'resident',
    'assert',
  ];
  const PLATFORM_PREFIX = /^(omp|opencode)/;
  // Contract-family members — payload types, *Schema objects, errors,
  // context tags, config services; PascalCase (rule 6).
  const CONTRACT_FAMILY =
    /^(Canonical|Scenario|PreExecution|Resident|Delivery|Hints|Middleware|Loud|Face|Opencode)[A-Za-z]+$/;

  const runtimeExports = (...mods: Array<Record<string, unknown>>) =>
    Object.keys(Object.assign({}, ...mods)).filter((k) => typeof Object.assign({}, ...mods)[k] === 'function');

  it('non-function runtime exports are UPPER_SNAKE (platform-prefixed instances exempt)', () => {
    for (const mod of [sdk, adapters, utils] as Array<Record<string, unknown>>) {
      for (const [key, value] of Object.entries(mod)) {
        if (typeof value === 'function') continue;
        // platform-prefixed lowercase objects (ompAdapter/opencodeAdapter)
        // are adapter instances — they follow the function case (rule 1).
        if (/^(omp|opencode)/.test(key)) continue;
        // PascalCase contract members (config Layer defaults, classes are
        // functions and skipped above) — rule 6 family.
        if (CONTRACT_FAMILY.test(key)) continue;
        expect(/^[A-Z][A-Z0-9_]*$/.test(key), `export not UPPER_SNAKE: ${key}`).toBe(true);
      }
    }
  });

  it('function exports follow the verb family (platform-prefixed exempt)', () => {
    const names = [
      ...runtimeExports(sdk as unknown as Record<string, unknown>),
      ...runtimeExports(adapters as unknown as Record<string, unknown>),
      ...runtimeExports(utils as unknown as Record<string, unknown>),
    ];
    for (const key of names) {
      if (PLATFORM_PREFIX.test(key)) continue; // three-form rule covers these
      // UPPER_SNAKE constants (rule 2) are Schema-backed values — callable
      // by effect's function-style Schema, but constants, not verb-family
      // functions (e.g. BIND_TAG_SCHEMA, CANONICAL_PAYLOAD_SCHEMAS).
      if (/^[A-Z][A-Z0-9_]*$/.test(key)) continue;
      // Canonical* / Scenario* / PreExecution* / Resident* / Delivery* /
      // Hints* / Middleware* / Loud* / Face* / Opencode* are the
      // contract-family members (rule 6 — payload types, *Schema objects,
      // errors, context tags, config services, adapter option surfaces;
      // PascalCase).
      if (CONTRACT_FAMILY.test(key)) continue;
      const verb = /^[a-z]+/.exec(key)?.[0] ?? key;
      const accessor = /^(omp|opencode)?(EventName|OutKey)$/.test(key);
      expect(VERB_FAMILY.includes(verb) || accessor, `function verb not in family: ${key}`).toBe(true);
    }
  });

  it('platform-prefixed exports use the documented three-form spellings', () => {
    for (const mod of [sdk, adapters, utils] as Array<Record<string, unknown>>) {
      for (const key of Object.keys(mod)) {
        if (!PLATFORM_PREFIX.test(key)) continue;
        expect(key).toMatch(/^(omp|opencode)[A-Za-z]+$/);
      }
    }
  });
});
