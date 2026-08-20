---
name: atom-scope-interview
description: Generic entry procedure for graph entry phases - caller-declared contract (topics, output fields, behavior flags), collect -> propose -> interview() consensus -> derive -> check -> emit. Use when dispatching entry scope phases.
argument-hint: none (entry skill - dispatched by atom-phase-handler)
disable-model-invocation: true
user-invocable: false
version: 2.3.0
last_updated: '2026-08-18'
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

- **confirm** - `confirm: mandatory` (default: at least one question per activation; scope_complete only after user participation) \| `confirm: as-needed` (per atom-kernel §interview() participation: 'as-needed')
- **output path** - `output path: user_owned` (confirm the deliverable path, recommendation first) \| `output path: derived` (default: never ask)
- **dual-name check** - `<field>` (produced name != executed graph name; equal -> warning + re-ask) \| `none` (default)
- **context** - `context: convention` (default: CONTEXT.md lookup via convention layer; absence degrades gracefully - skip domain lookup, not a failure) \| `context: optional` (same degrade)
- **direct end** - `direct end: <label>` — see atom-kernel §interview() §Direct end (generic contract; final-card options follow the gated-content state: content empty -> `nothing to adopt (recommended)` + `<label>`; content non-empty -> adoption action recommended + `<label>` alternative — `nothing to adopt` never appears with non-empty content; entry wiring = emit + output contract, `direct_end` MUST be declared when used, absent -> warning + emit anyway).

## Context Requirements

### From upstream

<!-- none -->

### Reference skills

<!-- none -->

### Operation classes

<!-- none -->

### Files

<!-- none -->

## Flow

1. **Collect** - search conversation for user answers on each topic. Facts discoverable from environment (files, upstream outputs, CONTEXT.md via convention layer when present - absence degrades to direct scoping, never a failure) - look up, never ask.
2. **Propose** - topic without user input -> propose with rationale from context analysis.
3. **Interview** - interview() per atom-kernel over Topics (confirmation contract). Behavior flags per §Input (confirm=mandatory -> participation: mandatory, at least one question per activation; as-needed -> participation: as-needed; empty Topics -> classification-only). `direct end: <label>` declared -> per atom-kernel §Direct end.
4. **Derive** - output path per behavior: user_owned -> confirm the deliverable path (recommendation first); derived -> never ask.
5. **Check** - dual-name check per behavior: produced name in declared field != executed graph name; equal -> warning + re-ask, never accept silently.
6. **Emit** - write the declared Output contract fields. No implicit fields. `direct end` chosen -> `direct_end: true` per the declared contract (pilot routing per atom-kernel §Direct end).
