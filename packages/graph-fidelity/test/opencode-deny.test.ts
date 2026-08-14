/**
 * opencode deny seam pins — the `permission.ask` gate honors a deny
 * provider supplied via the `options.deny` embedding seam (ADR 0177;
 * the built-in deny implementation is REMOVED — this suite pins the
 * retained contract surface only). The gate passes the permission type
 * as the invocation's toolName and the resolved target path; the
 * provider decides. Provider denial is written in place as
 * `output.status = 'deny'` (status-only output — the reason surfaces
 * through the platform's deny flow). Absent provider / provider
 * passthrough / handler throw → output untouched (fail-open); never
 * throws into the platform loop.
 *
 * @module
 */

import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import opencodeModule, { type OpencodePermission } from '../src/adapters/opencode.js';
import type { ToolDeny, WriteInvocation } from '../src/interfaces/tool-deny.js';

let ROOT: string;
let WRITABLE: string;

beforeAll(async () => {
  ROOT = await realpath(await mkdtemp(join(tmpdir(), 'fid-opencode-deny-seam-')));
  await mkdir(join(ROOT, 'src'), { recursive: true });
  WRITABLE = join(ROOT, 'src', 'new.ts');
});

afterAll(async () => {
  await rm(ROOT, { recursive: true, force: true });
});

/** Minimal plugin input — the server factory reads only options here. */
function pluginInput(): never {
  return {
    client: {},
    project: {},
    directory: ROOT,
    worktree: ROOT,
    experimental_workspace: { register() {} },
    serverUrl: new URL('http://localhost:4096'),
  } as never;
}

/** Platform-faithful permission request builder (SDK Permission structural subset). */
function permission(overrides?: Partial<OpencodePermission>): OpencodePermission {
  return {
    id: 'p1',
    type: 'edit',
    sessionID: 's1',
    messageID: 'm1',
    title: 'edit',
    metadata: {},
    time: { created: 0 },
    ...overrides,
  };
}

/** Hook surface produced by the server factory (deny seam). */
type Hooks = {
  'permission.ask': (i: OpencodePermission, o: { status: 'ask' | 'deny' | 'allow' }) => Promise<void>;
};

/** Build the hooks with an injected deny, then invoke the permission.ask handler. */
async function ask(
  deny: ToolDeny | undefined,
  input: OpencodePermission,
): Promise<{ status: 'ask' | 'deny' | 'allow' }> {
  const hooks = (await opencodeModule.server(pluginInput(), { deny })) as unknown as Hooks;
  const output = { status: 'ask' as const };
  await hooks['permission.ask'](input, output);
  return output;
}

/** Seam-stub provider — denies only the given tool name / path prefix. */
function stubDeny(denyTool: string, pathPrefix?: string): { deny: ToolDeny; invocations: WriteInvocation[] } {
  const invocations: WriteInvocation[] = [];
  return {
    invocations,
    deny: {
      engaged: true,
      determine: () => true,
      intercept: (input: WriteInvocation): { deny: boolean; reason?: string } => {
        invocations.push(input);
        if (input.toolName !== denyTool) return { deny: false };
        if (pathPrefix !== undefined && !(input.path ?? '').startsWith(pathPrefix)) return { deny: false };
        return { deny: true, reason: 'test provider' };
      },
    },
  };
}

describe('opencode deny seam — permission.ask interception (provider-supplied)', () => {
  it('provider denial → output.status = deny', async () => {
    const { deny } = stubDeny('edit', ROOT);
    const output = await ask(deny, permission({ type: 'edit', pattern: WRITABLE }));
    expect(output.status).toBe('deny');
  });

  it('absent provider → output untouched (fail-open no-op)', async () => {
    const output = await ask(undefined, permission({ type: 'edit', pattern: WRITABLE }));
    expect(output.status).toBe('ask');
  });

  it('provider passthrough → output untouched', async () => {
    const { deny } = stubDeny('edit');
    const output = await ask(deny, permission({ type: 'write', pattern: WRITABLE }));
    expect(output.status).toBe('ask');
  });

  it('gate passes the permission type as toolName and the first array element as path', async () => {
    const { deny, invocations } = stubDeny('edit', ROOT);
    await ask(deny, permission({ type: 'edit', pattern: [WRITABLE, '/other/x.ts'] }));
    expect(invocations).toHaveLength(1);
    expect(invocations[0].toolName).toBe('edit');
    expect(invocations[0].path).toBe(WRITABLE);
    expect(invocations[0].realPath).toBeUndefined();
  });

  it('handler throw → output untouched + no crash (fail-open)', async () => {
    const throwingDeny: ToolDeny = {
      engaged: true,
      determine: () => true,
      intercept: () => {
        throw new Error('boom');
      },
    };
    const hooks = (await opencodeModule.server(pluginInput(), { deny: throwingDeny })) as unknown as Hooks;
    const output = { status: 'ask' as const };
    await expect(
      hooks['permission.ask'](permission({ type: 'edit', pattern: WRITABLE }), output),
    ).resolves.toBeUndefined();
    expect(output.status).toBe('ask');
  });
});
