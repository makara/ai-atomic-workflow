/**
 * SignalLifecycle — the normative signal lifecycle contract (ADR 0176):
 * assembly → injection → echo → landing → settlement → observation.
 *
 * The base module implements assembly / injection / echo / restore (the
 * R1 runtime chain); landing / settlement / observation are RESERVED for
 * the additional module (`@ai-atomic-workflow/graph-fidelity-context`,
 * R2 redesign) against the same contract — the additional package
 * consumes this contract type-only via `./types.js`.
 *
 * Frame selection is the single role-order parameterization (ADR 0176
 * F2): `frameRoles`/`frameRoleOf` declare the preferred (user-like)
 * role set — latest preferred-role frame wins, all-roles fallback;
 * omitted -> all-roles latest. Platform differences are parameters, not
 * divergent implementations.
 *
 * Implementation = pure functions over the discipline core; platform
 * adapters route exclusively through this module (no direct platform
 * contract use in core logic).
 *
 * @module
 */

import { applyFidelityChain } from '../core/chain.js';
import { renderIdentityEcho } from '../core/echo-line.js';
import { applyResidentToSystem } from '../core/resident.js';
import { latestFrame } from '../core/runframe.js';
import {
  denormalizeMessages,
  normalizeToEchoMessages,
  type DenormalizeShape,
  type MessageShape,
} from '../core/shapes.js';
import type { EchoMessage } from '../core/types.js';

/** Assembly phase — normalize a platform transcript to the echo contract. */
export interface AssemblyInput<M> {
  readonly messages: readonly M[];
  readonly shape: MessageShape<M>;
}

/** Echo phase — render + append the discipline echo line. */
export interface EchoInput {
  readonly messages: readonly EchoMessage[];
  /**
   * Text-only anchor surface, parallel to `messages` — the frame scan
   * reads TEXT-ONLY content (the OMP working text excludes plain text,
   * so the echo contract's working text cannot anchor frames; the shape
   * `text` reader is the anchor surface both faces).
   */
  readonly frameTexts: readonly string[];
  /**
   * Preferred (user-like) frame roles — latest frame owned by a
   * preferred-role text anchors first; all-roles fallback when none
   * exists. Omitted -> all-roles latest (the OMP contract). `roleOf`
   * parallels `messages` and is required with `roles` (the pair is one
   * option — a lone `roles` is a type error, never a silent degrade).
   */
  readonly frameRoles?: {
    readonly roles: ReadonlySet<string>;
    readonly roleOf: readonly (string | undefined)[];
  };
}

export interface EchoOutput {
  readonly messages: readonly EchoMessage[];
  /** True when the echo stage changed a message (false = unchanged passthrough). */
  readonly changed: boolean;
}

/** Restore phase — denormalize the chain result back to platform shapes. */
export interface RestoreInput<M> {
  readonly messages: readonly M[];
  readonly echoMessages: readonly EchoMessage[];
  readonly result: readonly EchoMessage[];
  readonly shape: DenormalizeShape<M>;
}

/** Injection phase — append the resident prompt block to the system prompt. */
export interface InjectionInput {
  readonly systemPrompts: readonly string[];
}

export interface InjectionOutput {
  readonly systemPrompts: readonly string[];
  readonly changed: boolean;
}

/** Reserved: landing phase (additional module / R2 redesign). */
export interface LandingInput {
  readonly nodeId: string;
}

/** Reserved: settlement phase (additional module / R2 redesign). */
export interface SettlementInput {
  readonly nodeId: string;
}

/** Reserved: observation phase (additional module / R2 redesign). */
export interface ObservationInput {
  readonly facts: Readonly<Record<string, number>>;
}

/** The normative signal lifecycle contract — six phases, typed payloads. */
export interface SignalLifecycle {
  assembly<M>(input: AssemblyInput<M>): readonly EchoMessage[];
  echo(input: EchoInput): EchoOutput;
  restore<M>(input: RestoreInput<M>): M[];
  injection(input: InjectionInput): InjectionOutput;
  /** Reserved — the additional module implements these against the same contract. */
  readonly landing?: (input: LandingInput) => unknown;
  readonly settlement?: (input: SettlementInput) => unknown;
  readonly observation?: (input: ObservationInput) => unknown;
}

/** The single R1 lifecycle implementation — pure, platform-neutral. */
export function createSignalLifecycle(): SignalLifecycle {
  return {
    assembly: ({ messages, shape }) => normalizeToEchoMessages(messages, shape),
    echo: ({ messages, frameTexts, frameRoles }) => {
      const frame = latestFrame(
        frameTexts,
        frameRoles === undefined ? undefined : { roles: frameRoles.roles, roleOf: frameRoles.roleOf },
      );
      const line =
        frame === undefined
          ? undefined
          : renderIdentityEcho({
              nodeId: frame.nodeId,
              progress: frame.progress,
            });
      const result = applyFidelityChain(messages, { echo: line });
      return result === undefined ? { messages, changed: false } : { messages: result, changed: true };
    },
    restore: ({ messages, echoMessages, result, shape }) => denormalizeMessages(messages, echoMessages, result, shape),
    injection: ({ systemPrompts }) => {
      const applied = applyResidentToSystem(systemPrompts);
      return applied === undefined ? { systemPrompts, changed: false } : { systemPrompts: applied, changed: true };
    },
  };
}
