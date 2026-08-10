# atom-domain-spec Specification

## Purpose

Format reference for docs/domains.md — mirrors the atom-skill-spec / atom-graph-spec pattern: the single authority for domain split principles (per clean-ddd-hexagonal and domain-modeling), domain count bounds, layering, and reverse-analysis provenance. Consumed by atom-doc-maintain index-class maintenance and the estate-maintain graph domains-index node.

## Requirements

### Requirement: Domain split principles

The domains.md standard SHALL classify every domain per clean-ddd-hexagonal bounded-context judgment and subdomain classification (core / supporting / generic), grounded in domain-modeling ubiquitous language. Every domain row SHALL state its boundary against adjacent domains and its subdomain kind.

#### Scenario: Classification recorded per row

- **WHEN** a domain row is added or modified
- **THEN** it SHALL carry a boundary statement and a subdomain kind (core / supporting / generic)

#### Scenario: Kind reflects actual responsibility

- **WHEN** a domain's actual responsibility shifts (e.g. engine-feature becomes orchestrating)
- **THEN** the kind SHALL be updated in the same change — never left stale

### Requirement: Domain count bound and layering

The total domain count SHALL stay within 10 and 100. When the count exceeds 100, the index SHALL layer domains by kind (engine-feature → graph → skill → pure primitive, per the existing dependency direction contract) so each layer stays within the bound.

#### Scenario: Count within bound

- **WHEN** the domain count is between 10 and 100
- **THEN** no layering is required

#### Scenario: Bound exceeded triggers layering

- **WHEN** the domain count would exceed 100
- **THEN** the index SHALL introduce kind-based layering and record the layer split in the standard

### Requirement: Reverse-analysis provenance

The index SHALL be derived from the actual repository state — every domain row SHALL reference at least one real asset; no asset → no domain. Forward-designed domains (no physical asset) are forbidden. Design Requirements (user-proposed, grill-confirmed constraints on domain design) are an exception recorded separately in the Design Requirements section — they constrain design judgment, never create domains, and never substitute for asset-derived provenance.

#### Scenario: Assetless domain rejected

- **WHEN** a domain is proposed without a referencing asset
- **THEN** it SHALL be rejected until the asset exists or the proposal is recorded as virtual with justification

#### Scenario: Bidirectional mapping verified

- **WHEN** the index changes
- **THEN** the asset reverse mapping SHALL be updated in both directions (domain → asset, asset → domain)

#### Scenario: Design requirement does not create a domain

- **WHEN** a user-proposed design requirement is confirmed via grilling
- **THEN** it SHALL be recorded in the Design Requirements section and SHALL NOT create or imply a domain row

### Requirement: Evolution four-step retained

The existing evolution procedure (intent → boundary → asset registration → naming de-duplication) SHALL remain the only path for add/modify/delete of a domain.

#### Scenario: Evolution compliance

- **WHEN** a domain is added, modified, or deleted
- **THEN** the four steps SHALL be executed in order and the change SHALL record them

#### Scenario: ADR frontmatter aligned on domain change

- **WHEN** a domain is added, removed, or renamed per the evolution four-step
- **THEN** the index tables SHALL be updated bidirectionally (domain → asset, asset → domain) and ADR frontmatter `Domain:` fields SHALL align to the new domain ID on next touch (no batch revision)

### Requirement: Language Convention Deferral

atom-domain-spec SHALL NOT mandate a specific language (Chinese, English, or any other) for `docs/domains.md` content. Language choice SHALL defer to the consuming project's language conventions (project instructions / constraints); the skill itself does not mandate a language.

#### Scenario: No language mandate

- **WHEN** an agent consults atom-domain-spec for the language of domains.md descriptions
- **THEN** the spec directs to the consuming project's language conventions, not a hardcoded language

#### Scenario: Project convention honored

- **WHEN** the consuming project declares a document-language convention (e.g. zh docs)
- **THEN** domains.md descriptions follow that convention without spec conflict

#### Scenario: Structural rules retained

- **WHEN** writing domain rows
- **THEN** kebab-case domain IDs matching the asset name, status tags, and table formats remain required

### Requirement: Design Requirements section standard

docs/domains.md SHALL carry a Design Requirements block at the head of the file (after the header, before Split Standard), with standing equal to `.graph-scheduler/constraints.json`: a binding constraint set for domain design (split, boundary, kind, naming), read and complied with by every maintenance pass. The block SHALL be a bullet list — one simple sentence per requirement, caveman style — with no IDs, status, source, or date metadata. A requirement that no longer applies SHALL be deleted outright (no retired rows). Requirements SHALL NOT create or imply a domain row and SHALL NOT substitute for asset-derived provenance.

#### Scenario: Requirement block at head with list format

- **WHEN** docs/domains.md is written or reviewed
- **THEN** the Design Requirements block SHALL sit at the file head (before Split Standard)
- **AND** each requirement SHALL be one bullet, one simple sentence, caveman style
- **AND** no ID / status / source / date metadata SHALL appear in the block

#### Scenario: Requirement recorded with confirmation evidence

- **WHEN** a requirement is confirmed via the estate-maintain user-request grilling
- **THEN** it SHALL be recorded as a bullet in the head-position Design Requirements block
- **AND** its confirmation evidence SHALL live in the requirement node output (graph stream), never in the index file

#### Scenario: Requirement retired

- **WHEN** a requirement is superseded or no longer applies
- **THEN** its bullet SHALL be deleted outright — no retired rows, no trace rows

#### Scenario: No orphan requirements

- **WHEN** the estate-maintain review gate runs the requirements class
- **THEN** every requirement SHALL have its consensus evidence in the requirement node output
- **AND** workstream changes SHALL comply with each requirement (compliance checked by the gate, evidence = stream consensus)

#### Scenario: Requirement never creates a domain

- **WHEN** a user-proposed design requirement is confirmed via grilling
- **THEN** it SHALL be recorded in the Design Requirements block
- **AND** it SHALL NOT create or imply a domain row

### Requirement: Single-file domain standard and index

The index SHALL maintain `docs/domains.md` as the single-source domain standard + index (ADR 0090 — `docs/domains/` directory tree forbidden), carrying: split standard (granularity rules, naming conventions, kind classification), dependency rules, overview table + per-kind detail sections, Design Requirements section, bidirectional asset mapping, and evolution rules.

#### Scenario: Asset lookup resolves to a domain row

- **WHEN** a reader or agent queries the domain ownership of any asset (skill, graph, engine feature point)
- **THEN** docs/domains.md SHALL provide the mapping row (domain → asset, asset → domain)
- **AND** the domain ID SHALL strictly match the asset name (kebab-case English, prefix kept)

#### Scenario: All live assets registered

- **WHEN** index completeness is checked
- **THEN** all skill assets, graph assets, and engine feature points SHALL be mapped into the index

#### Scenario: Retired assets take no row

- **WHEN** the index covers assets retired as a whole (e.g. root skills/ retired by ADR 0056)
- **THEN** they SHALL be noted as a whole, not listed as index rows

### Requirement: Kind classification and naming

docs/domains.md SHALL define kind classification (skill / graph / engine-feature) and present per-kind detail sections plus a top overview table. Every domain row SHALL carry a boundary statement and a subdomain classification (core / supporting / generic, per clean-ddd-hexagonal).

#### Scenario: Sections organized by kind

- **WHEN** a reader browses the detail tables
- **THEN** domains SHALL be presented in per-kind sections (skill domains / graph domains / engine-feature domains)
- **AND** the top SHALL provide an overview table of all domains

#### Scenario: Subdomain classification recorded

- **WHEN** a domain row is added or modified
- **THEN** the row SHALL carry a boundary statement and a subdomain classification (core / supporting / generic)

#### Scenario: New asset naming attribution

- **WHEN** a skill, graph, or feature-point asset is added
- **THEN** its domain ID SHALL equal the asset name (kebab-case English)
- **AND** the asset SHALL be attributed to the matching kind section

### Requirement: Dependency rules

docs/domains.md SHALL declare inter-domain dependency rules — one-way declarations, no cycles, aligned with clean-ddd-hexagonal dependency direction (engine-feature → graph → skill → pure primitive layer).

#### Scenario: Dependency direction queryable

- **WHEN** a reader queries a domain's dependency relations
- **THEN** docs/domains.md SHALL provide the domain's upstream/downstream declarations
- **AND** inter-domain dependencies SHALL be one-way and acyclic

### Requirement: Term linkage

docs/domains.md SHALL stay linked to the glossary (term disambiguation), CONTEXT.md (Docs map), and ADRs (decisions) — referencing, never duplicating their content.

#### Scenario: Navigation between documents

- **WHEN** a reader navigates from CONTEXT.md or the glossary into the domain system
- **THEN** the CONTEXT.md Docs map SHALL reference docs/domains.md
- **AND** the glossary SHALL carry the "domain index" entry defining its responsibility and boundary

#### Scenario: Directory tree forbidden

- **WHEN** evolution considers a `docs/domains/` directory tree
- **THEN** ADR 0090 SHALL block it — domain knowledge lives in the single file docs/domains.md

### Requirement: Live graph and engine-feature indexing

`docs/domains.md` SHALL index the live domain set and state live counts matching disk facts: graph domains include `estate-maintain` (asset `packages/graph-scheduler/graphs/estate-maintain.taskflow.yaml`); engine-feature domains include `mutation-plane`, `query-plane`, and `atomic-step-flows` (two-plane tool division — ADR 0128); the index SHALL state counts matching disk facts (50 domains — 46 active + 4 retired; 9 graphs; 14 skill assets).

#### Scenario: Index counts match disk

- **WHEN** the domain index is scanned
- **THEN** total / active / retired counts SHALL match directory facts (50 / 46 / 4)
- **AND** the graph section SHALL list 9 graphs including estate-maintain
- **AND** the engine-feature section SHALL list mutation-plane, query-plane, and atomic-step-flows

#### Scenario: No stale graph language

- **WHEN** the domain index is scanned
- **THEN** no entry references grill-with-docs, refine, or two-tier loop

### Requirement: Linkage rule

Spec and ADR associations in docs/domains.md SHALL be allowed ONLY inside the domain list tables (Overview + per-kind detail sections): the Aggregate specs column and ADR provenance annotations (e.g. `SUPERSEDED (ADR n)`). Everywhere else — header, split standard, dependency rules, reverse mapping, evolution rules, design requirements, linkages — associations to specs or ADRs SHALL be forbidden.

#### Scenario: Association inside domain list allowed

- **WHEN** a domain row carries its aggregate spec path or an ADR provenance annotation
- **THEN** the association SHALL be valid

#### Scenario: Association outside domain list rejected

- **WHEN** any section outside the domain list tables references a spec or an ADR
- **THEN** the reference SHALL be a validation error (deterministic rule)

#### Scenario: Mechanical check

- **WHEN** the index is validated at write or review time
- **THEN** grep of spec/ADR references SHALL match only rows inside domain list tables

### Requirement: Validation — requirements class without in-file records

At write or review time, the requirements validation SHALL verify: the Design Requirements block sits at the file head; the block is a bullet list with no metadata columns; every maintenance change complies with each requirement; and no spec/ADR association exists outside the domain list tables. Validation SHALL NOT require in-file confirmation records (source/date) — consensus evidence lives in the graph stream (estate-maintain requirement node output).

#### Scenario: Valid block passes

- **WHEN** the Design Requirements block is a head-position bullet list and all maintenance changes comply
- **THEN** the requirements validation SHALL pass

#### Scenario: Stale record check removed

- **WHEN** the review gate runs the requirements class
- **THEN** it SHALL NOT require source/date confirmation records inside docs/domains.md
- **AND** consensus evidence SHALL come from the requirement node output (node:requirement channel)

### Requirement: Mapping and Linkage Single Home

atom-domain-spec SHALL be the single home for the 1:1 asset/domain mapping rule and the linkage rule (spec/ADR associations appear only inside domain list tables). Consumers (atom-doc-maintain §Consistency Gate, atom-spec-maintain §1:1 Mapping Rule) SHALL carry evidence commands + pointers only.

#### Scenario: Home holds the rules

- **WHEN** reading atom-domain-spec §Validation and §Linkage Rule
- **THEN** the 1:1 mapping and linkage rules appear there in full

#### Scenario: Consumers pointerize

- **WHEN** scanning atom-doc-maintain and atom-spec-maintain for those rules
- **THEN** only evidence commands + `per atom-domain-spec §X` pointers appear

### Requirement: Validation Command-Only

atom-domain-spec §Validation SHALL contain one-line pointers per check plus mechanical evidence commands (e.g. grep spec/ADR refs -> every hit in a domain list row) — no restated rule prose from the skill's own body.

#### Scenario: No self-restatement

- **WHEN** reading §Validation
- **THEN** each item maps to a body section via pointer + command, and no item restates the section's rule text

### Requirement: Language Clause Single-Homed

The language-convention clause SHALL be stated once at atom-doc-maintain §Language Constraints; atom-domain-spec §Language and Format SHALL point to it (or apply it row-specifically without a second phrasing).

#### Scenario: One phrasing

- **WHEN** scanning the estate family for the language-convention rule
- **THEN** exactly one phrasing exists — no second "follow the consuming project language conventions" variant
