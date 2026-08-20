# graph-fidelity/module-split Specification

## Purpose

Two-package boundary for graph-fidelity: base package (zero runtime deps, interface export surface) + additional reference package (`private: true`, relocated context-management tree), loading via platform manifest second entry, docking via type-only interface import, disabled state = unregistered.

## Requirements

### Requirement: Two-package boundary

**Before**: The module SHALL split into two npm packages: base `@ai-atomic-workflow/graph-fidelity` (exports `./omp`, `./server`, `./interfaces`, `./lifecycle`; the shared lifecycle bundle `dist/lifecycle.js` holds the ONE runtime instance per face, ADR 0191) and additional `@ai-atomic-workflow/graph-fidelity-context`.

**After**: The module SHALL split into two npm packages: base `@ai-atomic-workflow/graph-fidelity` (exports `./omp`, `./server`, `./interfaces` only; the R1 signal chain SHALL be consumed from the platform-hooks-sdk — no shared lifecycle module, no `./lifecycle` export) and additional `@ai-atomic-workflow/graph-fidelity-context` (docks through the SDK only).

#### Scenario: Base zero-dep bundle

- **WHEN** the base package builds
- **THEN** the dist bundles contain no bare third-party specifier (platform SDKs inlined or absent) and the adapter bundles contain no shared lifecycle module import

#### Scenario: Context tree relocated

- **WHEN** the additional package is built and inspected
- **THEN** the context module tree lives under `packages/graph-fidelity-context/` as an ACTIVE module, the base package contains no R2 runtime code or imports, and the context dist bundles carry no bare third-party specifiers (deployment contract)

#### Scenario: No lifecycle export surface

- **WHEN** the base package exports map is inspected
- **THEN** `./lifecycle` is absent, and no bundle references `@ai-atomic-workflow/graph-fidelity/lifecycle`

### Requirement: Type-only docking

**Before**: The additional module SHALL consume base-package interface types type-only (erased at build). Runtime cooperation SHALL use the shared lifecycle instance — a bare runtime import of the base lifecycle entry (`@ai-atomic-workflow/graph-fidelity/lifecycle`) per the deployment contract.

**After**: The additional module SHALL dock through the platform-hooks-sdk contract directly (bind registry, canonical events, DeliveryContext). Runtime cooperation with the base package SHALL NOT use a shared instance — there is no shared lifecycle module; singleton ownership is module-local.

#### Scenario: Docking compile-time verified

- **WHEN** the additional package builds with SDK type imports
- **THEN** interface types are erased at build, and the bundle carries zero base-package runtime imports

#### Scenario: No shared instance

- **WHEN** the additional package source tree is inspected
- **THEN** no import references the base lifecycle entry, and a scan test asserts zero base-package references

### Requirement: Reference tests keep running

**Before**: The relocated context-management tests SHALL stay green in the additional package; the dist-smoke test pins the bundle composition contract (shared instance, no bare third-party specifiers).

**After**: The relocated context-management tests SHALL stay green in the additional package; the dist-smoke test pins the bundle composition contract (no bare third-party specifiers, zero base-package runtime references, SDK inlined).

#### Scenario: Reference suite green

- **WHEN** the additional package test suite runs
- **THEN** the context-module tests pass unchanged in behavior, and the dist-smoke assertions verify the bundle composition contract without a shared instance
