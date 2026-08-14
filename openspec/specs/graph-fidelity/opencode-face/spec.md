# graph-fidelity/opencode-face Specification

## Purpose

The opencode plugin face as a first-class capability: loadable module shape, platform-faithful message-role mapping, usage metering via the platform event hook, compaction-boundary archiving, and a tui-kind user-visible module — restoring parity with the OMP face.

## Requirements

### Requirement: Loadable module shape

The opencode plugin module default-exports the v1 plugin record `{ id, server }` — never a bare function — so the platform loader registers the server hooks and never misreads named exports as plugin instances.

#### Scenario: Module loads without error

- **WHEN** opencode starts with the graph-fidelity plugin registered
- **THEN** the plugin loads successfully and the log carries no `failed to load plugin` entry for it

#### Scenario: Named exports are not treated as plugins

- **WHEN** the adapter module exposes named helper functions alongside the default export
- **THEN** only the default `server` hook factory is invoked as a plugin; the log carries no "export is not a function" or call-error entries for the helpers

### Requirement: Platform-faithful message-role mapping

The transform payload delivers messages as `{ info: Message, parts: Part[] }` — the role lives in `info.role`. Every role-consuming scan (echo append anchor, tool-result protection) SHALL read the platform role source. No consumed-elision window exists (elision removed, ADR 0170).

#### Scenario: Echo appends on user-role messages

- **WHEN** the messages.transform hook processes a transcript whose user input is delivered with `info.role = "user"`
- **THEN** the single-line echo appends to that message (no seam line before it)

#### Scenario: Elision windows form on platform shape

- **WHEN** a transcript carries three or more user-role frames in the platform `{ info, parts }` shape
- **THEN** no consumed-elision plan runs — elision is removed (ADR 0170) and the frames pass through the chain untouched by any elision logic

#### Scenario: Tool-result protection on platform shape

- **WHEN** a user-role message with `info.role = "user"` carries a protected tool result part
- **THEN** the compress stage never selects that message as a candidate

### Requirement: Usage metering via the event hook

The opencode face SHALL consume the platform `event` hook: `message.updated` events carry the completed message with token facts (`tokens.input`, `tokens.cache.read/write`), which feed the shared per-node ledger and benefit ledger.

#### Scenario: Message completion feeds the ledger

- **WHEN** a `message.updated` event arrives with token facts for the active node
- **THEN** the node ledger accumulates the input/cache-read/cache-write totals

#### Scenario: Zero events degrade gracefully

- **WHEN** no `message.updated` event has fired for the active node
- **THEN** the echo renders without the value-ratio segment (no fabricated numbers)

### Requirement: Transform-hook output is written back in place

The `experimental.chat.messages.transform` hook SHALL write its transformed messages back into the payload array the platform supplies — never a new array assigned to a fresh object. The platform consumer keeps using the original array reference after the hook returns (its trigger return value is ignored); a reassigned `output.messages` is silently discarded.

#### Scenario: Echo line survives the transform hook

- **WHEN** the messages.transform hook renders the single-line discipline echo (anchored frame present)
- **THEN** the echo line is observable in the model request after the hook returns — the transformed messages replace the payload's original array contents in place

#### Scenario: Resident block survives the system.transform hook

- **WHEN** the system.transform hook applies the resident block
- **THEN** the system prompt array seen by the platform after the hook carries the resident block — prior resident lines are stripped and the block is appended in place

#### Scenario: Elision and fidelity passes land in the request

- **WHEN** the transform chain reduces errored tool results or applies cached compression markers
- **THEN** the reduced messages are what the model request carries — in-place replacement, not a discarded new array (no elision pass exists in the chain)

### Requirement: In-place write is a no-op on empty input

The in-place write never throws and never breaks the request when the payload is a non-array or empty — zero-denial degrade (the platform contract: a failing hook must not fail the request).

#### Scenario: Non-array or empty payload passes through

- **WHEN** the messages.transform or system.transform hook receives a non-array or empty payload
- **THEN** the hook returns without throwing and the request proceeds unchanged

### Requirement: Management stays off the request path

The opencode face performs settlement and notification through back-side events per its own platform contract (verified against reference source); no management action SHALL be drained on the per-call message-transform request path. Notification delivers via `client.tui.showToast` (`tui.toast.show` event — SDK-reachable from server plugins; the former "server plugins have no toast/sendMessage API" ABSENT claim was false, corrected by change `graph-fidelity-round5cd-notify-classification`); when the toast surface is unreachable (workspace gate mismatch, SDK client absent), the pre-rendered settlement line rides the transcript as an echo-class append — the declared fallback, explicitly annotated. No compaction-boundary archiving exists (removed, ADR 0170); lifecycle residue is platform-owned.

#### Scenario: No pending settlement on the transform path

- **WHEN** the opencode message-transform hook runs
- **THEN** it performs control work only: no settlement rendering, ledger read/reset, or prewarm executes inside the hook, and no queued settlement is rendered from within it

#### Scenario: Settlement delivered as transcript echo-class append

- **WHEN** an opencode node boundary settles and the toast surface is unreachable (workspace gate mismatch, SDK client absent)
- **THEN** the pre-rendered settlement line rides the transcript as an echo-class append, annotated as the declared fallback — the toast path (`client.tui.showToast`) is the primary delivery when reachable
