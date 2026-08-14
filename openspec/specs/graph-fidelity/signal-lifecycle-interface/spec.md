# graph-fidelity/signal-lifecycle-interface Specification

## Purpose

Normative interface for the signal lifecycle (assembly → injection → echo → landing → settlement → observation): one Schema contract behind which both the base module runtime and the additional (context-management) module operate, hiding platform adapters from all consumers.

## Requirements

### Requirement: Interface export surface

The base package SHALL expose the SignalLifecycle contract types via a dedicated `exports["./interfaces"]` surface that is type-only — erased at build, carrying zero runtime code. The surface SHALL export no runtime values.

#### Scenario: Type-only consumption

- **WHEN** the additional module imports SignalLifecycle types from `@ai-atomic-workflow/graph-fidelity/interfaces`
- **THEN** no runtime specifier of the base package remains in the additional module's bundle (compile-time erasure), and the type-only import does not violate the self-containment contract (ADR 0166)

#### Scenario: Runtime import rejected

- **WHEN** a consumer imports a runtime value from `./interfaces`
- **THEN** the build/typecheck fails (the surface is type-only by contract)

### Requirement: Lifecycle phase contract

The interface SHALL define six phases — assembly, injection, echo, landing, settlement, observation — each with a typed payload. The base module SHALL implement assembly/injection/echo (the R1 runtime chain); landing/settlement/observation SHALL be reserved for the additional module and implement the same interface.

#### Scenario: Reserved phases implemented later

- **WHEN** the additional module (R2 redesign) implements landing/settlement/observation
- **THEN** it does so against the same interface contract without base-module changes

### Requirement: Adapter isolation

Platform adapters (OMP `ExtensionAPI`, opencode `Plugin`) SHALL be the only implementation of the interface; platform contract types and event names SHALL appear in adapters only, never in core logic.

#### Scenario: Platform contract change

- **WHEN** a platform hook contract changes
- **THEN** only the adapter implementing the interface changes; core logic is untouched
