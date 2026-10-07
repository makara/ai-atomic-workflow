# Changelog

> Release history for `agentic-graphjs` — the graph runtime kernel for agents. Content derived from code state, not git commits. Terse style — one line per change, latest state wins. **Languages**: English (this file) · [中文](CHANGELOG.zh-CN.md)

## [0.1.0]

"First release: the graph runtime kernel for agents."

### Added

- Runtime: entry `createRuntime` with the seven-port table (`checkpointer` / `context` / `graphs` required; `judge` / `store` / `writer` / `logger` optional), the seven-method face (`take` / `report` / `rewind` / `history` / `getState` / `status` / `boundGraph`), and the Awilix convenience face (`runtimeRegistrations` / `runtimeContainer`) row-for-row with the port table.
- Execution: one checkpoint per super-step (plan steps included) · byte-identical same-prefix replay · single-chain ledger per thread (one driver at a time) · the twelve-code refusal face (`REFUSALS` / `REFUSAL_CODES` / `refuse`).
- Build face: `StateGraph` / `Annotation` / `Command` · compile-time validation (`validateGraph`) · the IR contract (`IR_VERSION` = `1`) · the interrupt face (`interrupt` / `Suspended`).
- Memory ports: `createMemoryLog` / `createMemorySaver` (fixed identity and clock — a replayed transcript mints the same ids).
- Examples: `memory-e2e` (functional) · `awilix-e2e` (Awilix convenience) · `read-face-e2e` (the ledger read back) — `bun run example` prints all three.
- Docs: `README.md` + `README.zh-CN.md` (fast face) · `docs/api.md` + `docs/schema.md` (+ zh mirrors).
