/**
 * PROBE G — seam live assertions (drift guard). Proves the OMP seams
 * against the pinned npm package at runtime: the `context` event rewrite is
 * effective on the outgoing message array (handler result replaces the
 * messages), and the interception/result seams' signatures match the npm
 * dist types. Reference-tree drift guard — same discipline as the D-group
 * envelope-tag fact.
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { assertion, recordIo, verifyOutput, type ProbeAssertion } from './io';

const assertions: ProbeAssertion[] = [];

const here = fileURLToPath(new URL('.', import.meta.url));
const platformRoot = path.resolve(here, '../../../node_modules/@oh-my-pi/pi-coding-agent');

const sharedTypesPath = path.join(platformRoot, 'src/extensibility/shared-events.ts');
const extTypesPath = path.join(platformRoot, 'src/extensibility/extensions/types.ts');
const sharedSrc = fs.readFileSync(sharedTypesPath, 'utf8');
const extSrc = fs.readFileSync(extTypesPath, 'utf8');

const PROBE_MARKER = '[seam] PROBE-MARKER';

// The pinned npm platform package (@oh-my-pi/pi-coding-agent@17.2.12) is
// bun-runtime-bound (pi-utils/src/env.ts reads `Bun.env` at module top
// level; pi-natives loader uses bun-only `import.meta.dir`) — its runtime
// seam can only be exercised under the bun runtime. Under node/vitest these
// live assertions skip with a documented reason; the fs-level signature and
// distribution pins run everywhere. (Yarn migration debt: platform package
// stays bun-bound — runner is yarn, platform runtime is bun.)
const isBunRuntime = typeof Bun !== 'undefined';

async function makeRunner() {
  const { ExtensionRunner } = await import('@oh-my-pi/pi-coding-agent');
  const handler = async (event: { messages: Array<{ role?: string; content?: string }> }) => {
    const replaced = event.messages.map((m, i) =>
      i === event.messages.length - 1 ? { ...m, content: `${m.content ?? ''}\n${PROBE_MARKER}` } : m,
    );
    return { messages: replaced };
  };
  const ext = {
    name: 'probe-g',
    path: 'probe-g',
    handlers: new Map<string, ((event: never) => unknown)[]>([['context', [handler as (event: never) => unknown]]]),
  };
  return new ExtensionRunner([ext], {}, process.cwd(), { getCwd: () => process.cwd() }, {});
}

const signatureChecks = [
  ['tool_call result can block (ToolCallEventResult.block)', sharedSrc.includes('block?: boolean')],
  ['tool_call result carries reason', sharedSrc.includes('reason?: string')],
  [
    'tool_result result can replace content',
    sharedSrc.includes('content?:') && sharedSrc.includes('isError?: boolean'),
  ],
  [
    'input result can handle/replace text (InputEventResult)',
    extSrc.includes('handled?: boolean') && extSrc.includes('text?: string'),
  ],
  ['before_agent_start can replace systemPrompt', extSrc.includes('systemPrompt?: string[]')],
] as const;

afterAll(() => {
  recordIo(
    'g-seam-live',
    {
      standard: 'seam map — live seam assertions (signal-distribution)',
      npm: '@oh-my-pi/pi-coding-agent@17.2.12',
    },
    {
      liveRewrite: isBunRuntime,
      originalUntouched: isBunRuntime,
      signatures: Object.fromEntries(signatureChecks),
    },
    assertions,
  );
  verifyOutput('g-seam-live', assertions);
});

describe('PROBE G — seam live assertions', () => {
  it.skipIf(!isBunRuntime)('G · context seam rewrite is effective on the outgoing array', async () => {
    const runner = await makeRunner();
    const msgs = [{ role: 'user', content: 'hi' }];
    const out = await runner.emitContext(msgs as never);
    const serialized = JSON.stringify(out);
    const present = serialized.includes(PROBE_MARKER);
    assertions.push(assertion('context seam: rewrite effective', present, JSON.stringify(out)));
    expect(present).toBe(true);
  });

  it.skipIf(!isBunRuntime)('G · original session messages are untouched (deep copy)', async () => {
    const runner = await makeRunner();
    const msgs = [{ role: 'user', content: 'hi' }];
    await runner.emitContext(msgs as never);
    assertions.push(assertion('context seam: originals untouched', msgs[0].content === 'hi', msgs[0].content));
    expect(msgs[0].content).toBe('hi');
  });

  it('G · interception/result seam signatures pinned vs npm dist', () => {
    for (const [name, present] of signatureChecks) {
      assertions.push(assertion(`signature: ${name}`, present, sharedTypesPath));
      expect(present, `signature: ${name}`).toBe(true);
    }
  });

  // Live install channel: the plugin is installed via `omp plugin` (package
  // `omp.extensions` manifest discovery) — no repo-level deploy copy exists.
  // The CLI may be absent on non-OMP machines; skipIf at collection time
  // keeps the check skip-aware without in-test it.skip (group-C pattern).
  const ompList = (() => {
    try {
      const res = spawnSync('omp', ['plugin', 'list'], { stdio: 'pipe' });
      return res.status === 0 ? res.stdout.toString() : '';
    } catch {
      return '';
    }
  })();
  const ompCliPresent = ompList.length > 0;

  it.skipIf(!ompCliPresent)('G · graph-fidelity plugin installed via omp plugin (live install channel)', () => {
    const listed = ompList.includes('graph-fidelity@ai-atomic-workflow');
    assertions.push(assertion('plugin: graph-fidelity listed by omp plugin list', listed, ompList));
    expect(listed).toBe(true);
  });

  it('G · package declares native distribution channels (omp.extensions manifest + ./server entry)', () => {
    const repoRoot = path.resolve(here, '../../..');
    const pkg = JSON.parse(fs.readFileSync(path.resolve(repoRoot, 'packages/graph-fidelity/package.json'), 'utf8')) as {
      omp?: { extensions?: string[] };
      exports?: Record<string, string>;
    };
    const manifestOk = pkg.omp?.extensions?.includes('./dist/omp.js') === true;
    const serverOk = pkg.exports?.['./server'] === './dist/opencode.js';
    assertions.push(assertion('distribution: omp.extensions manifest declared', manifestOk, JSON.stringify(pkg.omp)));
    assertions.push(assertion('distribution: exports["./server"] declared', serverOk, JSON.stringify(pkg.exports)));
    expect(manifestOk).toBe(true);
    expect(serverOk).toBe(true);
  });
});
