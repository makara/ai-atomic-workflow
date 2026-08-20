/**
 * F3 — runframe regex edge semantics (shared echo/frame anchor).
 *
 * The frame parser is the single anchor for BOTH the discipline echo and
 * the consumed-elision window. Regex drift silently desynchronizes the two
 * mechanisms, so edge semantics must be pinned: multiple frames in one
 * text, non-hex run ids, and the echo/elision agreement on frame sets.
 */
import { describe, expect, it } from 'vitest';
import {
  FRAME_HEADING,
  isUserLike,
  latestFrame,
  parseAnchoredFrames,
  RUN_RE,
  USER_LIKE_ROLES,
} from '../src/core/runframe.js';

const RUN = '9e392f79f3c049069ae36fe22021a5ee';
const frame = (nodeId: string) => `## Run Frame\nRun ${RUN} · node ${nodeId} · type main · task: t`;

describe('F3 · parseAnchoredFrames edge semantics', () => {
  it('two frames in ONE text: only the first anchored frame matches', () => {
    const double = `${frame('a1')}\n\n${frame('b2')}`;
    const frames = parseAnchoredFrames([double]);
    expect(frames).toHaveLength(1);
    expect(frames[0]!.nodeId).toBe('a1');
  });

  it('non-hex run ids do not anchor a frame', () => {
    const bad = `## Run Frame\nRun not-a-hex-id · node n5 · type main`;
    expect(RUN_RE.test(bad)).toBe(false);
    expect(parseAnchoredFrames([bad])).toHaveLength(0);
  });

  it('run id with hyphens (uuid shape) anchors', () => {
    const uuid = '9e392f79-f3c0-4906-9ae3-6fe22021a5ee';
    const text = `## Run Frame\nRun ${uuid} · node n6 · type main`;
    const frames = parseAnchoredFrames([text]);
    expect(frames).toHaveLength(1);
    expect(frames[0]!.runId).toBe(uuid);
  });

  it('heading without anchored run line never anchors (doc-text immunity)', () => {
    const doc = `${FRAME_HEADING}\nnode requirement/arch-review\ndeclared operations [read] · out of scope: write`;
    expect(parseAnchoredFrames([doc])).toHaveLength(0);
  });

  it('backtick-wrapped run line anchors (markdown emphasis tolerance)', () => {
    const wrapped = `## Run Frame\nRun \`${RUN}\` · node \`a1\` · type main · task: t`;
    const frames = parseAnchoredFrames([wrapped]);
    expect(frames).toHaveLength(1);
    expect(frames[0]!.runId).toBe(RUN);
    expect(frames[0]!.nodeId).toBe('a1');
  });

  it('backtick-wrapped short hex run id anchors', () => {
    const wrapped = `## Run Frame\nRun \`fb268b76\` · node \`requirement/scope-entry\` · type main`;
    const frames = parseAnchoredFrames([wrapped]);
    expect(frames).toHaveLength(1);
    expect(frames[0]!.runId).toBe('fb268b76');
    expect(frames[0]!.nodeId).toBe('requirement/scope-entry');
  });

  it('doc-text with backticked prose still never anchors', () => {
    const doc = `${FRAME_HEADING}\nRun \`not-hex\` · node \`n5\`\ndeclared operations [read]`;
    expect(parseAnchoredFrames([doc])).toHaveLength(0);
  });

  it('task text fraction never fabricates a progress segment (anchor-line-only scan)', () => {
    // Frame line carries no `· N/M`; the task text below holds a fraction
    // (e.g. `merge 2/5 branches` as a task bullet). Whole-text scanning
    // picked the bullet's `· 2/5` up as progress — progress must parse from
    // the RUN_RE anchor line only.
    const text = `## Run Frame\nRun ${RUN} · node a1 · type main\n· 2/5 branches merged`;
    const frames = parseAnchoredFrames([text]);
    expect(frames).toHaveLength(1);
    expect(frames[0]!.nodeId).toBe('a1');
    expect(frames[0]!.progress).toBeUndefined();
  });

  it('frames are returned in transcript order with correct indices', () => {
    const texts = ['no frame', frame('a1'), frame('b2'), 'no frame again'];
    const frames = parseAnchoredFrames(texts);
    expect(frames.map((f) => f.nodeId)).toEqual(['a1', 'b2']);
    expect(frames.map((f) => f.index)).toEqual([1, 2]);
  });
});

describe('F3 · echo/frame anchor agreement', () => {
  it('user-role-only parse agrees with the full anchored parse (assistant prose never shifts frames)', () => {
    const texts = [frame('a1'), 'assistant prose', frame('b2')];
    const anchored = parseAnchoredFrames(texts);
    const userOnly = parseAnchoredFrames(texts.filter((_, i) => isUserLike(i === 1 ? 'assistant' : 'user')));
    expect(userOnly.map((f) => f.nodeId)).toEqual(anchored.map((f) => f.nodeId));
  });
});

describe('F8 · latestFrame — single-source latest-frame lookup', () => {
  it('user-like-first: latest frame in a user-like text wins over a later non-user-like frame', () => {
    const texts = [frame('a1'), 'assistant prose', frame('b2')];
    const f = latestFrame(texts, { roles: USER_LIKE_ROLES, roleOf: ['user', 'assistant', 'assistant'] });
    expect(f?.nodeId).toBe('a1');
    expect(f?.index).toBe(0);
  });

  it('user-like-first: preferred-role frame later in the transcript wins over an earlier one', () => {
    const texts = [frame('a1'), 'prose', frame('b2')];
    const f = latestFrame(texts, { roles: USER_LIKE_ROLES, roleOf: ['user', 'assistant', 'developer'] });
    expect(f?.nodeId).toBe('b2');
    expect(f?.index).toBe(2);
  });

  it('all-roles fallback: no preferred-role frame exists → latest frame of any role', () => {
    const texts = ['system text', frame('a1')];
    const f = latestFrame(texts, { roles: USER_LIKE_ROLES, roleOf: ['system', 'assistant'] });
    expect(f?.nodeId).toBe('a1');
    expect(f?.index).toBe(1);
  });

  it('no roles declared → latest frame of any role', () => {
    const texts = ['no frame', frame('a1'), frame('b2')];
    const f = latestFrame(texts);
    expect(f?.nodeId).toBe('b2');
    expect(f?.index).toBe(2);
  });

  it('no anchored frame → undefined (no frame → no echo)', () => {
    expect(latestFrame(['prose', 'more prose'])).toBeUndefined();
    expect(latestFrame(['prose'], { roles: USER_LIKE_ROLES, roleOf: ['user'] })).toBeUndefined();
  });

  it('role-less texts never rank as preferred (undefined role ≠ user-like)', () => {
    const texts = [frame('a1'), frame('b2')];
    const f = latestFrame(texts, { roles: USER_LIKE_ROLES, roleOf: [undefined, 'assistant'] });
    expect(f?.nodeId).toBe('b2');
    expect(f?.index).toBe(1);
  });
});
