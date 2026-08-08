# query-plane Specification

## Purpose

Query plane — jcodemunch is the first-class engine for locate, search, and repository-scale analysis in the HLT registry. Read-only by charter; every result carries confidence/freshness metadata.

## Requirements

### Requirement: Locate chain head SHALL be the query plane

HLT locate-class chains SHALL name jcodemunch as the chain head (`search_symbols`, `find_references`, `check_references`, `get_blast_radius`, `plan_turn`). The query plane SHALL be used for repository-scale questions: where a symbol lives, who references it, dead-code probes, and impact preflight. The locate chain SHALL NOT name serena symbol tools as its head.

#### Scenario: Locate resolves a symbol via the index

- **WHEN** a locate step searches for a symbol across the repository
- **THEN** the step SHALL call a jcodemunch locate/search tool first
- **AND** the result SHALL carry jcodemunch confidence/freshness metadata

#### Scenario: Locate preflights an edit impact

- **WHEN** a step needs the blast radius of a potential edit
- **THEN** the step SHALL use jcodemunch impact tools (`check_edit_safe` / `get_blast_radius` / `get_impact_preview`)
- **AND** the preflight result SHALL be recorded before any mutation

### Requirement: Query-plane results SHALL be ground-truthed by serena before mutation

Before a mutation based on query-plane results, the step SHALL confirm critical symbols with serena LSP tools (`find_symbol`, `find_referencing_symbols`). The LSP confirmation SHALL be the authority for exact symbol identity and reference lists; the index SHALL be treated as a candidate source.

#### Scenario: Index candidate confirmed by LSP

- **WHEN** a locate result identifies a symbol to edit
- **THEN** the step SHALL verify the symbol with a serena LSP symbol tool before mutating
- **AND** a mismatch between index and LSP SHALL stop the mutation

### Requirement: Analytics class SHALL be query-plane-owned

Repository-scale analysis (repo health, PR risk, dependency cycles, dead code, hotspots) SHALL be performed with jcodemunch analytics tools (`get_repo_health`, `get_pr_risk_profile`, `get_dependency_cycles`, `find_dead_code`, `get_hotspots`). Serena has no analytics capability; no serena tool SHALL be listed as an analytics chain.

#### Scenario: Review consumes analytics from the index

- **WHEN** a review step needs repository-scale evidence
- **THEN** the step SHALL call jcodemunch analytics tools
- **AND** serena reads SHALL serve only as targeted evidence follow-up
