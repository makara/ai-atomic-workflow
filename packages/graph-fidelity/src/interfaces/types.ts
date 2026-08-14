/**
 * Interface export surface — `exports["./interfaces"]` (type-only, ADR
 * 0176 Q3).
 *
 * Types only: every export is erased at build; a runtime import from the
 * interface surface fails typecheck and has no runtime module behind it.
 * The additional module (`@ai-atomic-workflow/graph-fidelity-context`)
 * docks against these types — its bundle carries zero base-package
 * runtime code (self-containment, ADR 0166).
 *
 * @module
 */

export type { AuditInput, DisplayFeedback, DisplayInput, NotifyInput } from './display-feedback.js';
export type { HintInput, HintKind, HintResult, ToolHints } from './hints.js';
export type {
  AssemblyInput,
  EchoInput,
  EchoOutput,
  InjectionInput,
  InjectionOutput,
  LandingInput,
  ObservationInput,
  RestoreInput,
  SettlementInput,
  SignalLifecycle,
} from './signal-lifecycle.js';
export type { DenySnapshot, InterceptResult, ToolDeny, WriteInvocation } from './tool-deny.js';
