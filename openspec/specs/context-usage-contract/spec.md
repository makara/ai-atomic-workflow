# context-usage-contract Specification

## Purpose

The context usage policy has three fragmented contracts: a flat ">8KB" compression threshold with no content-type awareness and no fidelity boundary; a usage ledger with no delivery mechanism; and a policy with no execution context. This capability merges them into one coherent feature point: per-content-type compression contract with a protection list and three-state health gate, a `## Context hints:` block assembled on every main-node dispatch (policy delivery), and a `Context usage check:` per-node ledger block (adherence audit) with violation markers and a session-end context report. Headroom MCP (compress/retrieve/stats) is the current adapter — MCP interface only.

## Requirements

### Requirement: Per-content-type compression thresholds

MODIFIED: thresholds are the L1 trigger of the fidelity ladder (unchanged values: JSON/structured tool output > 2K tokens; code and logs > 8KB; text/markdown > 8KB); they govern condensation only — L2 mapping and L3 pruning have their own rules (Fidelity ladder / Prune laws). No-op compression SHALL remain prohibited. Compression is performed via the current adapter (headroom MCP `compress`), which returns compressed text plus a retrieval hash; the original is stored for retrieval.

#### Scenario: Large JSON compresses

- **WHEN** a tool result is JSON-shaped and exceeds 2K tokens
- **THEN** it SHALL condense to L1 via the adapter and the compressed text plus hash retained in the session

#### Scenario: Small content is not compressed

- **WHEN** content is below the type threshold (e.g. 300-token prose)
- **THEN** no compression call SHALL be made and no retrieval hash created

#### Scenario: Adapter unavailable degrades honestly

- **WHEN** the compression adapter reports `cold` (honest 0% on a compression attempt) or `down` (backend unreachable)
- **THEN** the ledger SHALL record the adapter state (`[HEADROOM COLD]` / `[HEADROOM PROXY DOWN]` markers) and the node proceeds without compression — the contract is not violated by adapter failure

### Requirement: Protection list — never compress, never clean

MODIFIED: the protection list is the L0 definition — protected items SHALL remain at L0 (never condensed, never mapped, never pruned while live): reference-face content (skills, convention files, task text, constraints blocks, run-mode blocks); task() sub-agent results; skill injection results; node outputs and approval/gate decisions; write-operation results. L1/L2/L3 apply to working-face content only (volatile tool outputs, stale reads).

#### Scenario: Protected content bypasses compression

- **WHEN** a node reads a reference-face file (e.g. skill reference) larger than the text threshold
- **THEN** it SHALL NOT be compressed — it stays at L0 and the ledger records it as reference-face read, not a compression

#### Scenario: Decisions never pruned

- **WHEN** a history-cleaning pass (L3 evaluation) considers older conversation content
- **THEN** node outputs and approval decisions SHALL be excluded from pruning — they remain at L0 while live

### Requirement: CCR retrieval contract

A compressed item SHALL be retrievable by hash via the adapter's retrieve operation while the store holds it (TTL per adapter configuration, default session-scale 1800s). A downstream phase needing original detail SHALL retrieve by hash; a hash unused until TTL expiry SHALL be treated as single-consumption (no re-compression obligation, no error).

#### Scenario: Retrieve restores original

- **WHEN** a downstream phase needs the original of a compressed item with hash H within TTL
- **THEN** retrieve(H) SHALL return the original content and the ledger records the retrieval

#### Scenario: TTL-expired hash is single-consumption

- **WHEN** a hash is not retrieved before TTL expiry
- **THEN** no retrieval is attempted, the expiry is recorded as single-consumption, and no error is raised

### Requirement: Three-state health gate

The compression adapter SHALL expose a health state — `ok`, `cold` (honest zero-savings), `down` (backend unreachable) — recorded per node in observability (platform events where available; contract check blocks otherwise). `down` SHALL NOT fail the node; it SHALL surface as the deployment-fault marker. **Gate-down compression skips SHALL be recorded as legal degradations, never as violations.**

#### Scenario: Down state marks but does not fail

- **WHEN** the adapter backend is unreachable during a node
- **THEN** the node SHALL complete normally with `[HEADROOM PROXY DOWN]` recorded

#### Scenario: Gate-down recorded as degradation

- **WHEN** the gate reports down and a compress-eligible output is left uncompressed
- **THEN** the degradation is recorded as legal (no violation counter increments — no package-level ledger exists)

**Reason**: The context-usage contract's mechanical face was the usage-constraint ledger; the ledger is retired with the policy engine. Gate semantics stay observable via platform events and the contract-layer check blocks. **Migration**: handler-side hints assembly and check blocks remain exactly as before.

### Requirement: Context usage check block on main nodes

MODIFIED: the context-usage ledger SHALL be the `context:` row of the single `## Checks` block (per class: A reference injected/slices read, B working compressions with savings + hash + cleaning + retrievals, C growth history/summary layers, plus output estimate and L3 prune count). The standalone `Context usage check:` section SHALL NOT exist. Values SHALL be factual for the executed node (ledger-as-was, auditable).

#### Scenario: Node reports its context ledger

- **WHEN** a main node executes and reads two file slices, compresses one 13.5KB tool result (27.4% savings, hash recorded), prunes one stale read, and produces ~2K tokens of output
- **THEN** its output SHALL contain a `## Checks` block whose `context:` row lists the reference reads, the compression row with before/after/hash, the L3 count, zero cleaning/retrieval rows, and the output estimate

#### Scenario: Zero-activity node still reports

- **WHEN** a main node executes with no channel reads, no compression, no cleaning, no pruning
- **THEN** its output SHALL still contain a `## Checks` block with a `context:` row of zero-value entries — the block is unconditional

### Requirement: Context violation marker

A main-node output whose ledger shows a hint not followed (per the compress contract: an over-threshold compressible output left uncompressed, or a protected item compressed/cleaned) SHALL be prefixed with `[CONTEXT VIOLATION: <count>]`, same emission style as the existing violation markers.

#### Scenario: Over-threshold output without compression marks violation

- **WHEN** a main node emits a 20KB tool result into its output without compression and no `n/a` reason
- **THEN** its output SHALL be prefixed with `[CONTEXT VIOLATION: 1]`

#### Scenario: Protected item compressed marks violation

- **WHEN** a node compresses or cleans a protected item (task receipt, skill injection, node decision, write result)
- **THEN** its output SHALL be prefixed with `[CONTEXT VIOLATION: <count>]` naming the protected item

### Requirement: Context usage check propagates via node streams

MODIFIED: the `## Checks` block (including the `context:` row with L3 counts) SHALL be part of the node's session output and SHALL propagate to downstream phases through the existing `node:<id>` channel mechanism — downstream gates and approvals SHALL be able to consume check rows (violation counts, L3 counts) in their judgment context.

#### Scenario: Downstream gate consumes check rows

- **WHEN** a gate phase declares `channels: [node:upstream]` and the upstream node's output contains `[CONTEXT VIOLATION: 2]`
- **THEN** the gate's judgment context SHALL include the upstream output text including the marker and the `## Checks` rows

### Requirement: Context hints block on main-node dispatch

MODIFIED: the `## Context hints:` block SHALL additionally carry prune guidance per the ladder: reference face (convention files already covered — slice/locate, never full re-read; cold siblings resolve as L2 pointers), working face (compress over-threshold output per L1; prune superseded/stale reads per L3), growth face (stale reads cleanable, repeated calls keep latest, summaries nest). Semantics SHALL be hint, not control: the agent follows at execution time; adherence is audited via the `## Checks` block, never enforced by the graph.

#### Scenario: Dispatch carries hints

- **WHEN** a main node is dispatched
- **THEN** its assembled context SHALL contain a `## Context hints:` block with the three per-class guidance lines including the ladder tiers and threshold values from the compress contract

#### Scenario: Hints never gate execution

- **WHEN** a node executes without following a hint (e.g. no compression on a compressible output)
- **THEN** execution SHALL NOT be blocked — the ledger marks `[CONTEXT VIOLATION: 1]` and the node completes

#### Scenario: Mechanical hints injection

- **WHEN** usage-constraint is installed and an agent starts
- **THEN** the static contract-default hints appear in the system prompt, and repeated injection does not duplicate them

### Requirement: Hints block content derives from contract defaults

The hints content SHALL be generated by the handler from contract defaults (thresholds, protection list) plus the node's resolved channels — identical for equal dispatch inputs (deterministic assembly), platform-neutral (no platform name in the content).

#### Scenario: Deterministic assembly

- **WHEN** two nodes have identical channel resolution and contract defaults
- **THEN** their `## Context hints:` blocks SHALL be identical

### Requirement: Session-end context report

MODIFIED: the pilot final report SHALL aggregate the `## Checks` context rows: per-node A/B/C ledger rows, L3 prune counts, node duration/retry counts (existing snapshot fields), and compression statistics (current adapter stats). The report SHALL use existing data only — no new MCP interfaces, no new engine storage.

#### Scenario: Final report includes context section

- **WHEN** a run completes
- **THEN** the pilot final report SHALL contain a context section with per-node rows (injection/compression/cleaning/prune counts, output estimates where recorded), total duration/retry counts, and compression savings from the adapter

#### Scenario: Report degrades on missing data

- **WHEN** an adapter stats endpoint is unavailable
- **THEN** the report SHALL state the adapter state and omit only the adapter-derived rows — per-node ledger rows still present

### Requirement: Fidelity ladder

Context management SHALL operate a four-tier fidelity ladder — L0 verbatim (protection-list items, full fidelity, resident), L1 condensed (compression per thresholds, retrievable by hash), L2 mapped (map-header/pointer, full content restored on demand), L3 pruned (deleted — superseded, consumed, stale, or orphaned). The ladder SHALL be the single standard for fidelity decisions: hot placement (every-dispatch content) is the L0 placement rule; cold content behind pointers is L2; cleaning clauses are L3. Compression thresholds remain the L1 trigger (JSON/structured > 2K tokens; code/logs > 8KB; text/markdown > 8KB; no-op compression prohibited).

#### Scenario: Over-threshold bulk condenses

- **WHEN** a working-face tool output exceeds its content-type threshold
- **THEN** it condenses to L1 via the compress adapter, retrievable by hash

#### Scenario: Cold reference mapped

- **WHEN** a reference-face document is reached only by some branches
- **THEN** it is delivered as an L2 pointer (map-header), full content restored on demand

### Requirement: Prune laws

Four prune laws SHALL govern L3 transitions: superseded (newer version entered), consumed (consuming node completed), stale (unused beyond the documented window; errored inputs immediately), orphaned (no downstream reference, no protection-list qualification). Pruning SHALL be reported in the acting node's `## Checks` context row as an L3 count. Prune is deletion — no re-addition by the same node.

#### Scenario: Stale working content prunes

- **WHEN** a working-face item passes the stale window untouched
- **THEN** it is pruned and the acting node reports the L3 count

#### Scenario: Superseded read keeps only latest

- **WHEN** a same-args read produces a newer result
- **THEN** the previous result is pruned and only the latest is kept
