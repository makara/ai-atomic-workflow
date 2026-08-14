# graph-fidelity/headroom-sdk-client Specification

## Purpose

The headroom compression channel connects through the official MCP SDK client instead of a hand-written stdio JSON-RPC client — the SDK is an already-installed project dependency (ladder rung 5: installed dependency, graph-scheduler uses 1.30.0).

## Requirements

### Requirement: Headroom compression via the MCP SDK client

The headroom client SHALL use `@modelcontextprotocol/sdk` `Client` + `StdioClientTransport` for the compression channel (`headroom mcp serve` over stdio). The compression result SHALL be parsed from the tool-call content blocks, preserving token-savings extraction (`savings_tokens` / `orig_tokens` - `compressed_tokens`, snake or camel). The client SHALL preserve the seam's contract: zero-deny — any connect/call failure rejects and the worker degrades to pass-through; a request timeout of 30 seconds is passed to the SDK; a tool-level error (`isError` result) is surfaced as a failure; protocol version negotiation is left to the SDK.

#### Scenario: Compress via SDK client

- **WHEN** the seam worker calls `compress(content)` through the SDK-backed client and the headroom server responds with a text content block
- **THEN** the compressed text and retrieval hash are returned, with token savings extracted when the payload carries them

#### Scenario: SDK connect failure degrades

- **WHEN** the headroom server cannot be spawned or the SDK connect/call fails
- **THEN** the client rejects, the worker records the down state, and the request proceeds uncompressed (zero deny)

#### Scenario: Timeout is passed to the SDK

- **WHEN** a compress request exceeds the configured timeout
- **THEN** the SDK request times out at 30 seconds and the failure propagates as a rejected promise

#### Scenario: Tool-level error surfaces as failure

- **WHEN** the headroom server returns a tool result with `isError: true`
- **THEN** the client rejects with the error and the worker degrades (never a silent empty result)

### Requirement: Respawn-once resilience preserved

The SDK-backed client SHALL retain the respawn-once semantics of the previous resilient wrapper: a crash or connection failure triggers exactly one fresh client+transport respawn; a second failure rejects. The spawn command SHALL honor the `HEADROOM_MCP_COMMAND` environment override.

#### Scenario: One respawn recovers

- **WHEN** the first SDK client connection fails once
- **THEN** a fresh client+transport respawns and the retry succeeds

#### Scenario: Second failure rejects

- **WHEN** the respawned client also fails
- **THEN** the client rejects and the worker degrades to pass-through (down state recorded)

### Requirement: Headroom client interface preserved

The `HeadroomClient` interface (`compress(content)`, `close()`) SHALL remain the seam's contract. The `close()` release becomes asynchronous under the SDK (fire-and-forget at call sites); the sync interface is preserved by the adapter.

#### Scenario: Sync interface preserved

- **WHEN** an adapter calls `close()` on the SDK-backed client
- **THEN** the release is triggered fire-and-forget without blocking or throwing (zero deny)
