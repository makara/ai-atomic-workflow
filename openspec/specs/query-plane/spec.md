# query-plane Specification

## Purpose

Query plane — jcodemunch is the first-class engine for locate, search, and repository-scale analysis in the HLT registry. Read-only by charter; every result carries confidence/freshness metadata.

## Requirements

### Requirement: Locate chain head SHALL be the query plane

HLT locate-class chains SHALL name jcodemunch as the chain head (`search_symbols`, `find_references`, `check_references`, `get_blast_radius`, `plan_turn`) for in-project indexed targets. The query plane SHALL be used for repository-scale questions: where a symbol lives, who references it, dead-code probes, and impact preflight. For unindexed in-project targets (markdown/plain text), the scenario's designated locate adapter (serena `search_for_pattern`, FS tier) SHALL apply and jcodemunch SHALL be declared `n/a: not indexed`. For out-of-project paths, jcodemunch SHALL be `n/a: not indexed` and the platform-native search adapter SHALL apply. The locate chain SHALL NOT name serena symbol tools as its head for indexed targets.

#### Scenario: Locate resolves a symbol via the index

- **WHEN** a locate step searches for a symbol across an indexed repository
- **THEN** the step SHALL call a jcodemunch locate/search tool first
- **AND** the result SHALL carry jcodemunch confidence/freshness metadata

#### Scenario: Locate preflights an edit impact

- **WHEN** a step needs the blast radius of a potential edit
- **THEN** the step SHALL use jcodemunch impact tools (`check_edit_safe` / `get_blast_radius` / `get_impact_preview`)
- **AND** the preflight result SHALL be recorded before any mutation

#### Scenario: Locate on unindexed text uses serena

- **WHEN** a locate step searches in-project markdown or plain text
- **THEN** the step SHALL use serena `search_for_pattern` (FS tier, project-internal regex)
- **AND** jcodemunch SHALL be declared `n/a: not indexed` (markdown is never indexed)

#### Scenario: Locate on out-of-project paths

- **WHEN** a locate step targets a path outside the project root
- **THEN** jcodemunch SHALL be declared `n/a: not indexed` and the platform-native search adapter SHALL apply

### Requirement: Query-plane results SHALL be ground-truthed by serena before mutation

Before a mutation based on query-plane results, the step SHALL confirm critical symbols with serena LSP tools (`find_symbol`, `find_referencing_symbols`). The LSP confirmation SHALL be the authority for exact symbol identity and reference lists; the index SHALL be treated as a candidate source. Ground-truth confirmation applies to in-project indexed targets; unindexed targets have no index candidates to confirm.

#### Scenario: Index candidate confirmed by LSP

- **WHEN** a locate result identifies a symbol to edit
- **THEN** the step SHALL verify the symbol with a serena LSP symbol tool before mutating
- **AND** a mismatch between index and LSP SHALL stop the mutation

### Requirement: Analytics class SHALL be query-plane-owned

Repository-scale analysis (repo health, PR risk, dependency cycles, dead code, hotspots) SHALL be performed with jcodemunch analytics tools (`get_repo_health`, `get_pr_risk_profile`, `get_dependency_cycles`, `find_dead_code`, `get_hotspots`). Analytics SHALL apply to indexed repositories only; an unindexed target SHALL declare `n/a: not indexed`. Serena has no analytics capability; no serena tool SHALL be listed as an analytics chain.

#### Scenario: Review consumes analytics from the index

- **WHEN** a review needs repository-scale analytics on an indexed repo
- **THEN** the review SHALL consume jcodemunch analytics tools
- **AND** the evidence SHALL be aggregated by the review adapter
