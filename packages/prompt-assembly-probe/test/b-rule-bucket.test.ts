/**
 * PROBE B — axis-2 pre-emission: rule-bucket funnel
 * (TTSR→in-flight / always→prompt / rulebook→prompt).
 * Keyed axis-2 pre-emission · axis-1 C4.
 */
import type { Rule } from '@oh-my-pi/pi-coding-agent/capability/rule';
import { afterAll, describe, expect, it } from 'vitest';
import { assertion, recordIo, verifyOutput, type ProbeAssertion } from './io';

// Platform package is bun-runtime-bound (pi-utils `Bun.env` top-level; see
// group A note). Runtime probes skip under node/vitest with a documented
// reason; runner is yarn, platform runtime is bun.
const isBunRuntime = typeof Bun !== 'undefined';

async function loadBuckets() {
  const [{ bucketRules }, { TtsrManager }] = await Promise.all([
    import('@oh-my-pi/pi-coding-agent/capability/rule-buckets'),
    import('@oh-my-pi/pi-coding-agent/export/ttsr'),
  ]);
  return { bucketRules, TtsrManager };
}

const assertions: ProbeAssertion[] = [];

function source(provider: string): Rule['_source'] {
  return { provider, providerName: provider, path: '/tmp/probe-rule.md', level: 'user' };
}
function makeRule(partial: Partial<Rule>): Rule {
  return {
    name: partial.name ?? 'probe-rule',
    path: partial.path ?? '/tmp/probe-rule.md',
    content: partial.content ?? 'body',
    globs: partial.globs,
    alwaysApply: partial.alwaysApply,
    description: partial.description,
    condition: partial.condition,
    astCondition: partial.astCondition,
    scope: partial.scope,
    interruptMode: partial.interruptMode,
    _source: partial._source ?? source('native'),
  };
}

afterAll(() => {
  recordIo(
    'b-rule-bucket',
    { ruleShapes: ['condition (TTSR)', 'alwaysApply', 'description-only'] },
    { buckets: ['ttsr-inflight', 'always-prompt', 'rulebook-prompt'] },
    assertions,
  );
  verifyOutput('b-rule-bucket', assertions);
});

describe('PROBE B — axis-2 pre-emission: rule emission classification', () => {
  it.skipIf(!isBunRuntime)(
    'axis-2 · condition rule → TTSR (in-flight channel), excluded from prompt buckets',
    async () => {
      const { bucketRules, TtsrManager } = await loadBuckets();
      const mgr = new TtsrManager();
      const ttsr = makeRule({ name: 'probe-ttsr', condition: ['TOOL_WRITE'], description: 'write discipline' });
      const { rulebookRules, alwaysApplyRules } = bucketRules([ttsr], mgr);
      const pass = rulebookRules.length === 0 && alwaysApplyRules.length === 0 && mgr.hasRules();
      assertions.push(
        assertion(
          'TTSR excluded from prompt buckets + registered',
          pass,
          `rulebook=${rulebookRules.length} always=${alwaysApplyRules.length} ttsrRegistered=${mgr.hasRules()}`,
        ),
      );
      expect(rulebookRules).toHaveLength(0);
      expect(alwaysApplyRules).toHaveLength(0);
      expect(mgr.hasRules()).toBe(true);
    },
  );

  it.skipIf(!isBunRuntime)('axis-2 · alwaysApply → prompt bucket; description-only → rulebook bucket', async () => {
    const { bucketRules, TtsrManager } = await loadBuckets();
    const mgr = new TtsrManager();
    const sticky = makeRule({ name: 'probe-sticky', alwaysApply: true, description: 'sticky desc' });
    const book = makeRule({ name: 'probe-book', description: 'book desc' });
    const { rulebookRules, alwaysApplyRules } = bucketRules([sticky, book], mgr);
    const pass =
      alwaysApplyRules.map((r) => r.name).join() === 'probe-sticky' &&
      rulebookRules.map((r) => r.name).join() === 'probe-book';
    assertions.push(
      assertion(
        'always/rulebook bucketed correctly',
        pass,
        `always=${alwaysApplyRules.map((r) => r.name)} rulebook=${rulebookRules.map((r) => r.name)}`,
      ),
    );
    expect(alwaysApplyRules.map((r) => r.name)).toEqual(['probe-sticky']);
    expect(rulebookRules.map((r) => r.name)).toEqual(['probe-book']);
    expect(mgr.hasRules()).toBe(false);
  });
});
