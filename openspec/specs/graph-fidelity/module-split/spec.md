# graph-fidelity/module-split Specification

## Purpose

Two-package boundary for graph-fidelity: base package (zero runtime deps, interface export surface) + additional reference package (`private: true`, relocated context-management tree), loading via platform manifest second entry, docking via type-only interface import, disabled state = unregistered.

## Requirements

### Requirement: Two-package boundary

The module SHALL split into two npm packages: base `@ai-atomic-workflow/graph-fidelity` (exports `./omp`, `./server`, `./interfaces`; zero runtime dependencies; self-contained bundles per ADR 0166) and additional `@ai-atomic-workflow/graph-fidelity-context` (`private: true`, reference-only, carrying the relocated `context-management` tree and its MCP SDK dependency).

#### Scenario: Base zero-dep bundle

- **WHEN** the base package builds
- **THEN** the dist bundles contain no bare specifier (platform SDKs inlined or absent), satisfying the self-containment contract

#### Scenario: Context tree relocated

- **WHEN** the additional package is built and inspected
- **THEN** the `context-management` source tree lives under `packages/graph-fidelity-context/` with its `REFERENCE ONLY — R2 cost economy suspended (ADR 0175)` headers, and the base package contains no R2 runtime code or imports

### Requirement: Loading via manifest second entry

The additional module SHALL load through a second platform manifest entry — OMP `omp.extensions` array member or opencode `plugin` array member. Disabled state = no entry, which means zero runtime imports of the additional module (ADR 0175 preserved).

#### Scenario: Registered

- **WHEN** the second manifest entry is present in a deployment
- **THEN** the platform loads both modules and hooks run in registration order (platform-native multi-module semantics)

#### Scenario: Unregistered (disabled)

- **WHEN** the second manifest entry is absent
- **THEN** no R2 code is loaded at runtime; the base module behaves exactly as before

### Requirement: Type-only docking

The additional module SHALL consume base-package interface types type-only (erased at build). Runtime cooperation SHALL use platform channels — OMP shared EventBus / appendEntry, opencode shared client — never a bare runtime import of the base package (forbidden by the self-containment contract).

#### Scenario: Docking compile-time verified

- **WHEN** the additional package builds with type-only interface imports
- **THEN** its bundle is self-contained; any runtime import of the base package fails the build/typecheck

### Requirement: Reference tests keep running

The relocated context-management tests SHALL stay green in the additional package (reference pins per ADR 0175 retention policy).

#### Scenario: Reference suite green

- **WHEN** the additional package test suite runs
- **THEN** the relocated reference tests pass unchanged in behavior
