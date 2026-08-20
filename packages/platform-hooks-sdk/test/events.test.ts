import { describe, expect, it } from 'vitest';
import {
  CANONICAL_EVENTS,
  EVENT_DIRECTORY,
  ompEventName,
  opencodeEventName,
  opencodeOutKey,
} from '../src/core/events.js';

// Pinned against the installed @opencode-ai/plugin@1.18.16 Hooks surface
// (dist/index.d.ts 175-300) and .refs/opencode/packages/plugin/src/index.ts.
const OPENCODE_V1_HOOK_KEYS = [
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

// Pinned against @oh-my-pi/pi-coding-agent@17.2.12 HookAPI catalog
// (.refs/oh-my-pi hooks/types.ts 482-513).
const OMP_HOOK_KEYS = [
  'context',
  'before_agent_start',
  'input',
  'tool_call',
  'tool_result',
  'message_start',
  'message_update',
  'message_end',
  'session_shutdown',
  'session_before_compact',
  'before_provider_request',
  'after_provider_response',
  'credential_disabled',
  'tool_approval_requested',
];

describe('event directory', () => {
  it('covers the formal OMP hook faces (snake_case events)', () => {
    const mapped = EVENT_DIRECTORY.filter((e) => e.omp).map((e) => e.omp);
    for (const hook of OMP_HOOK_KEYS) expect(mapped).toContain(hook);
  });

  it('every opencode mapping is a REAL v1 hook key (differential vs pinned contract)', () => {
    const mapped = EVENT_DIRECTORY.filter((e) => e.opencode).map((e) => e.opencode);
    for (const hook of mapped) {
      expect(OPENCODE_V1_HOOK_KEYS).toContain(hook);
    }
  });

  it('covers the formal opencode v1 hook faces', () => {
    const mapped = EVENT_DIRECTORY.filter((e) => e.opencode).map((e) => e.opencode);
    for (const hook of [
      'tool.execute.before',
      'tool.execute.after',
      'chat.message',
      'event',
      'experimental.chat.messages.transform',
      'experimental.chat.system.transform',
      'dispose',
      'experimental.session.compacting',
      'provider',
      'auth',
      'permission.ask',
    ]) {
      expect(mapped).toContain(hook);
    }
  });

  it('has unique canonical names', () => {
    expect(new Set(CANONICAL_EVENTS).size).toBe(CANONICAL_EVENTS.length);
  });

  it('maps every directory entry to a canonical event', () => {
    for (const entry of EVENT_DIRECTORY) {
      expect(CANONICAL_EVENTS).toContain(entry.canonical);
    }
  });

  it('outKeys reference real output surfaces only', () => {
    expect(opencodeOutKey('tool_result')).toBe('output'); // tool.execute.after {title,output,metadata}
    expect(opencodeOutKey('context')).toBe('messages'); // transform {messages}
    expect(opencodeOutKey('tool_call')).toBeUndefined(); // tool.execute.before has no output key
    expect(opencodeOutKey('message_end')).toBeUndefined();
    expect(opencodeOutKey('tool_approval_requested')).toBeUndefined(); // permission.ask has no mutation output
  });

  it('lookups agree with the directory', () => {
    expect(ompEventName('tool_result')).toBe('tool_result');
    expect(opencodeEventName('tool_result')).toBe('tool.execute.after');
    expect(opencodeEventName('tool_approval_requested')).toBe('permission.ask');
    expect(opencodeEventName('before_agent_start')).toBe('experimental.chat.system.transform');
    expect(opencodeEventName('user_input')).toBeUndefined(); // interface-level alternative only
    expect(opencodeEventName('message_end')).toBeUndefined(); // shared substitute face, never auto-wired
    expect(ompEventName('event')).toBeUndefined();
  });
});
