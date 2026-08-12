/**
 * PROBE G — seam live assertions (drift guard). Proves the OMP seams
 * against the pinned npm package at runtime: the `context` event rewrite is
 * effective on the outgoing message array (handler result replaces the
 * messages), and the interception/result seams' signatures match the npm
 * dist types. Reference-tree drift guard — same discipline as the D-group
 * envelope-tag fact.
 */
import { ExtensionRunner } from '@oh-my-pi/pi-coding-agent';
import { afterAll, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { assertion, recordIo, verifyOutput, type ProbeAssertion } from './io';

const assertions: ProbeAssertion[] = [];

const sharedTypesPath = path.resolve(
  import.meta.dir,
  '../node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/shared-events.ts',
);
const extTypesPath = path.resolve(
  import.meta.dir,
  '../node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/extensions/types.ts',
);
const sharedSrc = fs.readFileSync(sharedTypesPath, 'utf8');
const extSrc = fs.readFileSync(extTypesPath, 'utf8');

const PROBE_MARKER = '[seam] PROBE-MARKER';

function makeRunner() {
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
  const runner = new ExtensionRunner([ext], {}, process.cwd(), { getCwd: () => process.cwd() }, {});
  return runner;
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
      liveRewrite: true,
      originalUntouched: true,
      signatures: Object.fromEntries(signatureChecks),
    },
    assertions,
  );
  verifyOutput('g-seam-live', assertions);
});

describe('PROBE G — seam live assertions', () => {
  it('G · context seam rewrite is effective on the outgoing array', async () => {
    const runner = makeRunner();
    const msgs = [{ role: 'user', content: 'hi' }];
    const out = await runner.emitContext(msgs as never);
    const serialized = JSON.stringify(out);
    const present = serialized.includes(PROBE_MARKER);
    assertions.push(assertion('context seam: rewrite effective', present, JSON.stringify(out)));
    expect(present).toBe(true);
  });

  it('G · original session messages are untouched (deep copy)', async () => {
    const runner = makeRunner();
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
      const res = Bun.spawnSync(['omp', 'plugin', 'list'], { stdout: 'pipe', stderr: 'pipe' });
      return res.exitCode === 0 ? res.stdout.toString() : '';
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
    const repoRoot = path.resolve(import.meta.dir, '../../..');
    const pkg = JSON.parse(fs.readFileSync(path.resolve(repoRoot, 'packages/graph-fidelity/package.json'), 'utf8')) as {
      omp?: { extensions?: string[] };
      exports?: Record<string, string>;
    };
    const manifestOk = pkg.omp?.extensions?.includes('./src/adapters/omp.ts') === true;
    const serverOk = pkg.exports?.['./server'] === './src/adapters/opencode.ts';
    assertions.push(assertion('distribution: omp.extensions manifest declared', manifestOk, JSON.stringify(pkg.omp)));
    assertions.push(assertion('distribution: exports["./server"] declared', serverOk, JSON.stringify(pkg.exports)));
    expect(manifestOk).toBe(true);
    expect(serverOk).toBe(true);
  });
});
