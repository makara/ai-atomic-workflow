# graph-fidelity/signal-lifecycle-interface Specification

## Purpose

Normative interface for the signal lifecycle (assembly → injection → echo → landing → settlement → observation): one Schema contract behind which both the base module runtime and the additional (context-management) module operate, hiding platform adapters from all consumers.

## Requirements

### Requirement: Interface export surface

**Before**: The base package SHALL expose the SignalLifecycle contract types via a dedicated `exports["./interfaces"]` surface that is type-only — erased at build, carrying zero runtime code. The surface SHALL export no runtime values.

**After**: The SDK SHALL expose the SignalLifecycle contract types (assembly/echo/restore/injection inputs and outputs, usage facts, factory) via its package root barrel — type-only, erased at build, carrying zero runtime code. The base package interfaces surface SHALL export only the ToolHints and ToolDeny contract families and SHALL NOT re-export SignalLifecycle types.

#### Scenario: Type-only consumption

- **WHEN** a consumer imports SignalLifecycle types from `@ai-atomic-workflow/platform-hooks-sdk`
- **THEN** no runtime specifier of the SDK remains in the consumer's bundle (compile-time erasure), and the type-only import does not violate the SDK consumption contract (ADR 0192)

#### Scenario: Runtime import rejected

- **WHEN** a consumer imports a runtime value from the SDK barrel's type surface
- **THEN** the build/typecheck fails (the surface is type-only by contract)

### Requirement: Lifecycle phase contract

**Before**: The interface SHALL define six phases — assembly, injection, echo, landing, settlement, observation — each with a typed payload. The base module SHALL implement assembly/injection/echo (the R1 runtime chain); landing/observation SHALL be implemented by the additional module through the same interface (ADR 0191). Reserved-phase member slots with zero consumers SHALL NOT exist in the interface — settlement facts ride the usage observer (observeUsage), never a lifecycle member.

**After**: The SDK SHALL own the R1 chain contract: `createSignalLifecycle()` factory with assembly/echo/restore/injection phases, each with a typed payload, implemented by the pure chain modules in SDK core. Landing/observation/settlement phases SHALL NOT exist in the interface — settlement facts ride the usage observer (UsageFacts), never a lifecycle member (ADR 0193/0195). The base package SHALL construct module-local facades via the SDK factory; no shared lifecycle instance SHALL exist.

#### Scenario: Base consumes SDK chain

- **WHEN** the base package adapters build their lifecycle facade
- **THEN** they call `createSignalLifecycle()` from the SDK and hold module-local instances — no shared lifecycle module exists and no `./lifecycle` export surface remains

#### Scenario: No reserved-phase slots

- **WHEN** the SDK lifecycle contract surface is inspected
- **THEN** it carries no landing/observation/settlement member slots — the interface is assembly/echo/restore/injection only

#### Scenario: Reserved phases implemented later

- **WHEN** a consumer needs additional lifecycle observation beyond the R1 chain
- **THEN** it docks through the SDK contract (bind registry / canonical events / DeliveryContext) without SDK core changes, and the lifecycle interface carries no unused reserved member slots

### Requirement: Adapter isolation

**Before**: Platform adapters (OMP `ExtensionAPI`, opencode `Plugin`) SHALL be the only implementation of the interface; platform contract types and event names SHALL appear in adapters only, never in core logic.

**After**: Platform adapters (OMP `ExtensionAPI`, opencode `Plugin`) SHALL be the only translation layer for the interface; platform contract types, event names, and platform message shapes SHALL appear in SDK adapters only, never in SDK core or consumer logic.

#### Scenario: Platform contract change

- **WHEN** a platform hook contract changes
- **THEN** only the SDK adapter changes; SDK core and consumer logic are untouched
