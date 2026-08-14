# graph-fidelity/hook-contract-mapping Specification

## Purpose

The hook-contract mapping capability: the R4 timing→hooks carrier. One mapping table per platform face, derived from the platform's actual extension contracts (reference source verified), naming which platform hook executes which module action. Adapters are the mechanical registration of these tables — no invented seams, no actions on unsuited hooks.

## Requirements

### Requirement: Hook-contract mapping is the single source for hook registration

Each platform face SHALL register exactly the hooks its mapping table declares, and the table names the real platform hook for each module action (per-call echo, frame/resident injection, PCL detection, usage metering, settlement, benefit recording, landing store initiation, shutdown flush). A module action with no suitable real hook is not implemented rather than mapped to an unsuitable one. Settlement notification is a platform notify-surface action (`ctx.ui.notify` OMP / `client.tui.showToast` opencode) — not a message-channel action (REVISED 2026-08-14 by change `graph-fidelity-round8-spec-residue-sweep`).

#### Scenario: OMP face mapping matches verified contracts

- **WHEN** the OMP face registers its hooks
- **THEN** the registration matches the verified mapping: echo on the per-LLM-call context event; resident injection on the per-prompt pre-agent-start event (frames are parsed for identity, never injected); PCL detection on the user-input event; usage metering on the fire-and-forget message-update channel; landing store initiation (fire-and-forget, non-blocking) on the per-message end event — and no settlement, metering, or benefit work rides that event; settlement notification on the platform notify surface at frame-change detection; benefit recording on the compaction-end event; shutdown flush on the shutdown event

#### Scenario: opencode face mapping matches verified contracts

- **WHEN** the opencode face registers its hooks
- **THEN** the registration matches the verified mapping: echo on the messages.transform hook; resident injection on the system.transform hook; usage metering and landing store initiation (both fire-and-forget) on the `event` hook's `message.updated`; PCL detection on the input surface; settlement notification via `client.tui.showToast` (SDK-reachable — no ABSENT declaration); the transcript echo-class append is the declared fallback for toast-unreachable states, never emulated as a primary channel

#### Scenario: Unsupported actions degrade explicitly

- **WHEN** a platform face has no real hook for an action
- **THEN** the action is declared absent for that face rather than attached to an unsuitable hook, and the absence is visible in the mapping table

### Requirement: Lifecycle hooks stay unregistered

No handler is registered on compaction-preparation hooks (session.before-compact / session.compacting on the OMP face): context lifecycle decisions belong to the platform (R8), and the module's only compaction interaction is recording the platform-reported outcome.

#### Scenario: Compaction preparation is left to the platform

- **WHEN** the platform compacts a session
- **THEN** no module handler runs during compaction preparation or summary assembly, and only the outcome-recording event is consumed
