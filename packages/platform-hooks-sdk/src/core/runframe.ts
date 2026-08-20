/**
 * Shared run-frame parsing — the single anchored frame parser for the
 * discipline echo, the role-filtered frame scan, and the platform
 * adapter fallback.
 *
 * Anchor: a frame block carries the run-id line `Run <uuid> · node <id>`.
 * Documentation text that merely contains a `## Run Frame` heading plus
 * `node <word>` / `declared operations` prose (e.g. skill docs) carries no
 * uuid-anchored frame and is never treated as a frame boundary — the
 * round-5 live finding (R5-1) where the echo rendered a corrupted line
 * from the atom-phase-handler SKILL.md text.
 *
 * Pure: no scheduler state, no platform imports.
 *
 * @module
 */

/**
 * User-like roles — the single anchor-role source for echo append,
 * frame anchoring, and role-filtered frame scans (OMP delivers user
 * input as `developer` through custom_messenger/steer; opencode
 * assistant/user mapping differs — the set is the shared contract).
 */
export const USER_LIKE_ROLES: ReadonlySet<string> = new Set(['user', 'developer', 'custom']);

/**
 * User-like role predicate — membership in `USER_LIKE_ROLES` (single
 * source above).
 */
export function isUserLike(role: string | undefined): boolean {
  return role === undefined ? false : USER_LIKE_ROLES.has(role);
}

export const FRAME_HEADING = '## Run Frame';

/** Run-id anchored frame line: `Run <uuid> · node <nodeId>` — backticks around either segment are accepted (agent-side markdown emphasis must not kill the echo identity source; the anchor still requires the hex run-id + `· node` shape, so doc prose cannot forge a frame). */
export const RUN_RE = /Run\s+`?([0-9a-f-]+)`?\s*·\s*node\s+`?([\w\-/]+)`?/;

/** Optional progress segment: `· N/M` (handler-side node index / total count) — matched against the RUN_RE anchor line only. */
export const PROGRESS_RE = /·\s*(\d+)\/(\d+)\b/;

/** One parsed run-frame reference. */
export interface FrameRef {
  index: number;
  runId: string;
  nodeId: string;
  /** Progress `N/M` when the frame carries it — absent on legacy frames. */
  progress?: string;
}

/**
 * Locate every run-id anchored frame reference in a transcript (in order).
 * A text is a frame ONLY when it contains the `## Run Frame` heading AND
 * the anchored `Run <uuid> · node <id>` line — prose quoting the heading
 * without a run id never matches.
 */
export function parseAnchoredFrames(texts: readonly string[]): FrameRef[] {
  const frames: FrameRef[] = [];
  for (let i = 0; i < texts.length; i += 1) {
    const text = texts[i];
    if (text === undefined || !text.includes(FRAME_HEADING)) continue;
    // Progress parses from the RUN_RE anchor line ONLY — a `· N/M` anywhere
    // else in the text (task-text fraction, benefit dual numbers) must never
    // fabricate a progress segment on the echo line.
    const anchorLine = text.split('\n').find((line) => RUN_RE.test(line));
    if (anchorLine !== undefined) {
      const match = anchorLine.match(RUN_RE);
      const progressMatch = anchorLine.match(PROGRESS_RE);
      frames.push({
        index: i,
        runId: match?.[1] ?? '',
        nodeId: match?.[2] ?? '',
        ...(progressMatch == null ? {} : { progress: `${progressMatch[1]}/${progressMatch[2]}` }),
      });
    }
  }
  return frames;
}

/** Options for the single-source latest-frame lookup. */
export interface LatestFrameOptions {
  /**
   * Preferred (user-like) role set — the latest frame owned by a
   * preferred-role text anchors first; the latest frame of ANY role is
   * the fallback when no preferred-role frame exists (or when `roles`
   * is omitted). Roles come from `isUserLike` (core/runframe.ts) —
   * callers import the single source, the helper never re-implements
   * user-like membership.
   */
  roles?: ReadonlySet<string>;
  /**
   * Per-text roles, parallel to `texts` (same indexes) — required for
   * preferred-role ordering; a text's role is not inferable from its
   * content. Omitted -> every text eligible (all-roles selection).
   */
  roleOf?: readonly (string | undefined)[];
}

/**
 * Latest run frame across a transcript — the single "latest frame"
 * lookup shared by the discipline echo anchor and the platform adapter
 * fallback (the anchored-frame parser stays the one frame parser).
 *
 * Role ordering is caller-declared: `opts.roles` declares the preferred
 * (user-like) role set — the latest frame owned by a preferred-role
 * text wins; when none exists (or no roles declared) the latest frame
 * of ANY role anchors. Undefined when the transcript carries no
 * anchored frame — no frame → no echo.
 */
export function latestFrame(texts: readonly string[], opts?: LatestFrameOptions): FrameRef | undefined {
  const frames = parseAnchoredFrames(texts);
  if (frames.length === 0) return undefined;
  const preferred = opts?.roles;
  const roleOf = opts?.roleOf;
  if (preferred === undefined || preferred.size === 0 || roleOf === undefined) {
    return frames[frames.length - 1];
  }
  for (let i = frames.length - 1; i >= 0; i -= 1) {
    const frame = frames[i];
    if (frame === undefined) continue;
    const role = roleOf[frame.index];
    if (role !== undefined && preferred.has(role)) return frame;
  }
  return frames[frames.length - 1];
}
