---
name: atom-scope-interview
description: Generic entry procedure for graph entry phases - caller-declared contract (topics, output fields, behavior flags), collect -> propose -> interview() consensus -> derive -> check -> emit. Use when dispatching entry scope phases.
argument-hint: none (entry skill - dispatched by atom-phase-handler)
disable-model-invocation: true
user-invocable: false
version: 2.2.0
last_updated: '2026-08-09'
---

> **Runtime constraints** - load `atom-kernel` for interview() and approval() behavior contracts.

Generic entry procedure for graph entry phases - caller-declared contract (topics, output fields, behavior flags), collect -> propose -> interview() consensus -> derive -> check -> emit.

## Entry

**MUST EXECUTE** - when dispatched by atom-phase-handler for a graph entry phase, run the parameterized entry procedure and emit the caller-declared output contract.

## Input

Caller-declared contract, shipped via task text:

|Declaration|Shape|Meaning|
|-|-|-|
|`Topics:`|list|Interview decision points. Absent or empty -> classification-only mode - no interview, no questions|
|`Output contract:`|list (canonical spelling)|Exact output fields to emit (incl. `scope_complete` when declared)|

`canonical spelling` - the caller-declared field list is authoritative: emit exactly those fields, no implicit additions.

`Behavior:` flags (one per line, all optional):

- **confirm** - `confirm: mandatory` (default: at least one question per activation; scope_complete only after user participation) \| `confirm: as-needed` (per atom-kernel §Zero-question degradation)
- **output path** - `output path: user_owned` (confirm the deliverable path, recommendation first) \| `output path: derived` (default: never ask)
- **dual-name check** - `<field>` (produced name != executed graph name; equal -> warning + re-ask) \| `none` (default)
- **context** - `context: convention` (default: CONTEXT.md lookup via convention layer; absence degrades gracefully - skip domain lookup, not a failure) \| `context: optional` (same degrade)

## Context Requirements

### From upstream

<!-- none - entry phases receive scope via graph task text -->

### Reference skills

<!-- atom-kernel excluded - platform primitives, always available -->

### Operation classes

<!-- none - conversation-only phase, no registry classes -->

### Files

<!-- none - CONTEXT.md arrives via the platform convention layer (default-loaded, absence-tolerant) -->

## Flow

1. **Collect** - search conversation for user answers on each topic. Facts discoverable from environment (files, upstream outputs, CONTEXT.md via convention layer when present - absence degrades to direct scoping, never a failure) - look up, never ask.
2. **Propose** - topic without user input -> propose with rationale from context analysis.
3. **Interview** - interview() consensus mode per atom-kernel over Topics. Behavior flags per §Input (confirm=mandatory -> at least one question per activation; as-needed -> per atom-kernel §Zero-question degradation; empty Topics -> classification-only).
4. **Derive** - output path per behavior: user_owned -> confirm the deliverable path (recommendation first); derived -> never ask.
5. **Check** - dual-name check per behavior: produced name in declared field != executed graph name; equal -> warning + re-ask, never accept silently.
6. **Emit** - write the declared Output contract fields. No implicit fields.
