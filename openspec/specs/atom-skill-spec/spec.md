# atom-skill-spec Specification

## Purpose

SKILL.md format reference. Asset: `packages/graph-workflow/skills/atom-skill-spec/SKILL.md`.

## Requirements

### Requirement: atom-skill-spec — SKILL.md format reference

`atom-skill-spec` SHALL define the authoritative format for `SKILL.md` files. It SHALL specify frontmatter rules (required and optional fields), body content rules (sections, language constraints), reference boundaries (what skills may and may not reference), and the `## Context Requirements` contract format.

#### Scenario: Spec defines frontmatter fields

- **WHEN** an agent loads `atom-skill-spec`
- **THEN** it SHALL receive the complete frontmatter specification
- **THEN** required fields SHALL include: `name` (skill identifier), `description` (when to use the skill)
- **THEN** optional fields SHALL include: `argument-hint`, `user-invocable`, `version`, `last_updated`, `allowed-tools`, `license`, `compatibility`, `metadata`
- **THEN** `user-invocable: false` SHALL mean the skill triggers only via internal dispatch, not user command

#### Scenario: Spec defines body content rules

- **WHEN** agent reads body content rules
- **THEN** the body SHALL use Markdown with `# Title` matching the skill name
- **THEN** sections SHALL describe behavior contracts, input/output contracts, and rules
- **THEN** constraints like "NEVER", "MUST", "SHOULD" SHALL follow RFC 2119 semantics

#### Scenario: Spec defines Context Requirements contract format

- **WHEN** an agent authors or edits the `## Context Requirements` section
- **THEN** the spec SHALL document the three-subsection contract (From upstream / Reference skills / Files) and its machine-parseable list format
- **THEN** the spec SHALL forbid placeholder entries and forbid hardcoded output paths in the skill body

#### Scenario: Spec defines reference boundaries

- **WHEN** a skill references external content
- **THEN** plain-name references (`<name>`) SHALL be valid for other skills in the same domain
- **THEN** `rule://<name>` SHALL reference project rules
- **THEN** file paths SHALL be relative to the skill's own package root
- **THEN** cross-package references SHALL be explicit about the package boundary

### Requirement: Context Requirements is a four-subsection machine-parseable contract

The `## Context Requirements` section SHALL be a machine-parseable contract with exactly four subsections — `### From upstream` (node IDs), `### Reference skills` (skill names), `### Operation classes` (closed-set members of the operation-class registry the skill performs by default — optional, absent = no default classes), `### Files` (file globs) — each containing a simple list. Placeholder entries (e.g. `<configurable — …>`) SHALL be rejected; a skill with an unparseable contract SHALL fail validation. (Class vocabulary per tool-usage-contract scenario registry — HLT wording removed, ADR 0194.)

#### Scenario: Contract parses into four lists

- **WHEN** a skill's `## Context Requirements` contains the four subsections
- **THEN** each subsection SHALL parse into a list of entries
- **THEN** missing or empty subsections SHALL be valid (no requirements of that kind)

#### Scenario: Placeholder contract rejected

- **WHEN** a skill declares an entry like `<configurable — decided at graph authoring>`
- **THEN** validation SHALL fail with an error naming the skill and the placeholder entry

#### Scenario: Unknown operation class rejected

- **WHEN** a skill declares an operation class outside the closed operation-class set
- **THEN** validation SHALL fail naming the skill and the unknown class

#### Scenario: Skill body avoids channel duplication

- **WHEN** a skill's contract declares a Reference skill or Files entry
- **THEN** the skill body SHALL NOT re-load that reference itself or re-read those files directly as its primary mechanism — the handler-injected context SHALL be authoritative

### Requirement: Operation classes feed handler injection

The skill's `Operation classes` subsection SHALL be the default source for class-based verification; a graph phase may override/complement it via `operations:`. The skill body SHALL NOT re-implement tool chains — the scenario-hints registry is the single chain source. (No HLT registry exists, ADR 0194.)

#### Scenario: Skill default drives injection

- **WHEN** a skill declares `Operation classes: [locate, verify]` and the phase declares none
- **THEN** the dispatch SHALL verify the classes for locate and verify
- **AND** the skill body SHALL reference the scenario-hints registry rather than re-specify chains

### Requirement: No self-repetition in the spec

atom-skill-spec SHALL follow its own no-self-repetition rule — each fact stated once.

#### Scenario: sibling-files single-sited

Given packages/graph-workflow/skills/atom-skill-spec/SKILL.md When searching for the sibling-files path-resolution fact ("Sibling files deployed with skill — `<name>/<path>` relative to the skill's SKILL.md") Then it appears exactly once

#### Scenario: no-op test governs skill content

- **WHEN** an agent authors or edits a skill body
- **THEN** every natural-language token SHALL pass the no-op test — deleting it changes behavior or meaning
- **THEN** pep-talk, filler, hedging, and restated-rationale tokens SHALL be deleted
- **THEN** a rule's rationale SHALL live in the ADR or domain docs, never inline

### Requirement: Invocation matrix complete

The invocation model table SHALL include a row for model-invoked + `user-invocable: true` (auto-trigger + slash-invokable hybrid).

#### Scenario: hybrid row present

Given packages/graph-workflow/skills/atom-skill-spec/SKILL.md When reading the invocation table Then a row exists for model-invoked + user-invocable: true

### Requirement: Content Quality Metrics quantified

atom-skill-spec SHALL specify quantified content-quality norms for SKILL.md bodies: length bands, why/how ratio targets, content-carrier selection, evidence-gated completion criteria, branch skip conditions, wrapper delegation contracts, single-source scope including sibling files, positive-first phrasing, and vocabulary discipline (avoid-lists + rejected framings). Length Bands are diagnostic; placement follows Loading Efficiency (Pareto Placement), which governs.

#### Scenario: Length bands enforced

- **WHEN** an agent authors or reviews a SKILL.md body
- **THEN** the target band SHALL be 500-2,000 words; reference skills SHALL be <=1,500; platform primitives (atom-kernel, atom-phase-handler) SHALL be <=1,400
- **THEN** a body under 200 words SHALL be legal only as a wrapper skill with a delegation contract
- **THEN** a body over 2,000 words SHALL trigger disclosure split (context pointer to sibling file) before acceptance
- **THEN** bands describe sizes, never placement — placement follows Loading Efficiency (Pareto Placement), which governs

#### Scenario: Why/how distribution norms

- **WHEN** an agent authors a SKILL.md body
- **THEN** the body SHALL open with a thesis sentence (why the skill exists)
- **THEN** each decision rule SHALL carry at most one line of rationale
- **THEN** the why/how lexical ratio SHALL target 1:5-1:40 — outside the band triggers review of why scattering or absence

#### Scenario: Content carrier selection

- **WHEN** an agent chooses how to render content in a SKILL.md body
- **THEN** fact mappings and decision matrices SHALL use tables
- **THEN** ordered behavior SHALL use numbered lists
- **THEN** checkable gates SHALL use checkbox lists
- **THEN** diagrams, file trees, templates, and code pairs SHALL use code fences
- **THEN** term definitions with bans SHALL use bold + `_Avoid_:` italic lists
- **THEN** narrative SHALL remain prose — carriers SHALL NOT be mixed without discipline

#### Scenario: Completion criteria evidence-gated

- **WHEN** a skill defines a step or phase
- **THEN** the step SHALL end with a completion criterion that is checkable
- **THEN** when the step involves runnable behavior, the criterion SHALL name the evidence (e.g. paste command invocation + output)
- **THEN** vague criteria ("extremely extensive", "fix anything...", "when answered") SHALL be rewritten to observable signals

#### Scenario: Branch skip conditions declared

- **WHEN** a skill declares branches
- **THEN** every branch SHALL declare its trigger condition and its skip condition
- **THEN** "exploration already settled the branch" SHALL be a legal skip and the default posture
- **THEN** optional steps SHALL be converted to conditional steps with skip conditions (optional = no-op signal)

#### Scenario: Wrapper delegation contract

- **WHEN** a skill delegates its work to other skills (wrapper)
- **THEN** it SHALL declare a delegation contract: which skills run, the output contract, the completion criterion, and degradation behavior when a dependency is missing
- **THEN** a wrapper without a delegation contract SHALL fail review

#### Scenario: Single source covers sibling files

- **WHEN** a rule appears in a skill
- **THEN** it SHALL appear in exactly one home (SKILL.md or one sibling file)
- **THEN** SKILL.md + sibling duplication of the same rule SHALL be a violation — pointers (`see <sibling> §X`) are the only legal reuse

#### Scenario: Positive-first phrasing

- **WHEN** a skill states a prohibition
- **THEN** the prohibition SHALL be paired with the positive target behavior ("X banned; do Y instead")
- **THEN** vocabulary bans SHALL use the avoid-list pattern (`_Avoid_:` + list) alongside the positive definition
- **THEN** reference skills SHALL concentrate common misreadings in a rejected-framings section

#### Scenario: No-op test explicit

- **WHEN** an agent reviews skill prose
- **THEN** each sentence SHALL pass the no-op test — deleting it SHALL change behavior
- **THEN** rhetorical pep-talk and self-encouragement SHALL be deleted

#### Scenario: Lazy creation and scope discipline

- **WHEN** a skill manages external files (docs, glossaries)
- **THEN** the skill SHALL declare the file's scope boundary ("X contains only Y")
- **THEN** creation SHALL be lazy — only when content exists to write
- **THEN** the skill SHALL NOT overwrite user edits to surrounding content

#### Scenario: Pointer existence validated

- **WHEN** a skill references another skill or file
- **THEN** the target SHALL exist within the skill set at authoring time — dangling pointers SHALL be deleted or localized

### Requirement: Pareto Placement Priority

The skill spec SHALL rank Loading Efficiency (Pareto placement) above the length-bands word-count norm: Pareto placement governs skill structure; Length Bands are diagnostic and secondary. Conflict SHALL resolve to Loading Efficiency — an in-band body with hot content behind a pointer fails review; length bands NEVER justify inlined cold content.

#### Scenario: Placement governs over word count

- **WHEN** a SKILL.md body is within word band but its hot content lives in a sibling file
- **THEN** review fails on placement (Loading Efficiency violation) regardless of band compliance

#### Scenario: Bands never justify cold inline

- **WHEN** a SKILL.md body is over band and the surplus is cold content
- **THEN** the surplus SHALL move to a sibling — band pressure SHALL NOT be relieved by keeping cold content in SKILL.md

#### Scenario: Metrics section orders LE first

- **WHEN** reading the Content Quality Metrics section of the spec's SKILL.md
- **THEN** Loading Efficiency (Pareto Placement) appears before Length Bands

### Requirement: Hot-content Non-Transferability

The ~20% of a skill's content serving ~80% of activations SHALL be non-transferable: it MUST reside in the SKILL.md body; moving it to a sibling is a violation. The pointer-cost rule applies to cold content only.

#### Scenario: Hot content in SKILL.md mandatory

- **WHEN** reviewing a skill whose hot 20% (every-dispatch execution-critical content) sits in a sibling file
- **THEN** review fails — hot content SHALL be restored to the SKILL.md body, not referenced

#### Scenario: Pointer rule cold-only

- **WHEN** a sibling pointer replaces cold content (edge cases, full tables, examples)
- **THEN** it is legal under Loading Efficiency — the non-transferability rule does not apply

### Requirement: Loading Efficiency Pareto Placement

The skill spec SHALL require that SKILL.md body carries the hot path — execution-critical references and specs needed on every dispatch — while low-frequency content (edge cases, full field tables, complete examples) SHALL live in sibling files behind `(see sibling §X)` pointers. This rule is the primary structural rule, outranking the length bands (see Pareto Placement Priority).

#### Scenario: Hot-path content in SKILL.md

- **WHEN** a rule or reference is needed on every dispatch of the skill
- **THEN** its single home is the SKILL.md body — and it is non-transferable (see Hot-content Non-Transferability)

#### Scenario: Cold content behind pointers

- **WHEN** content is reached only by some branches or rare activations
- **THEN** it lives in a sibling file and SKILL.md carries only a `(see sibling §X)` pointer

#### Scenario: Hot-path rule primary

- **WHEN** an agent decides where content lives
- **THEN** reachability + frequency (Loading Efficiency) decide first; word-count band is checked after placement

### Requirement: Pareto 20/80 Rule of Thumb

The skill spec SHALL state the loading-efficiency rule of thumb: approximately 20% of a skill's content serves approximately 80% of activations, and that 20% MUST reside in SKILL.md — it is non-transferable (see Hot-content Non-Transferability); pointer indirection costs less per activation than inlined cold content.

#### Scenario: Placement by frequency

- **WHEN** placing new content into a skill
- **THEN** placement follows usage frequency: every-dispatch content in SKILL.md, rare content in siblings

#### Scenario: Rule of thumb enforceable

- **WHEN** an agent places the hot 20% in a sibling
- **THEN** it is a spec violation (non-transferability), not a style suggestion

### Requirement: Checkable Placement Criterion

The skill spec SHALL define a checkable placement criterion: every rule referenced on every dispatch has its home in SKILL.md, and cold content is absent from the SKILL.md body.

#### Scenario: Review check passes

- **WHEN** a reviewer checks a skill's placement
- **THEN** the check confirms every-dispatch rules are in SKILL.md and cold detail is not

### Requirement: Structure Rule Dual Criterion

The §Structure placement rule SHALL reference the Loading Efficiency subsection, making reachability and usage frequency the dual placement criteria.

#### Scenario: Structure points to loading efficiency

- **WHEN** the Structure rule states where content goes
- **THEN** it cites the Loading Efficiency (Pareto Placement) subsection alongside reachability

### Requirement: Reference Band Offset

Adding the loading-efficiency priority rules SHALL NOT push the skill spec itself out of the reference band (<=1,500 body words); equivalent content SHALL be trimmed as offset.

#### Scenario: Spec stays in band

- **WHEN** the loading-efficiency priority rules are added to atom-skill-spec
- **THEN** the body word count stays <=1,500

### Requirement: Character Standardization

The skill spec SHALL require standard ASCII characters in prose wherever an equivalent exists: `—`/`–` -> `-`, `→` -> `->`, `≤` -> `<=`, `≥` -> `>=`, `×` -> `x`, `…` -> `...`. Literal content inside code fences and backticks SHALL be exempt (code samples stay verbatim). `§` is allowed as a section-pointer marker (`§X`) — a family convention, never substituted.

#### Scenario: Prose special char replaced

- **WHEN** a skill body uses an em-dash, arrow, or other special char in prose (outside code fences/backticks)
- **THEN** the standard ASCII equivalent is used instead

#### Scenario: Fence literal exemption

- **WHEN** a special char appears inside a code fence or backtick span (code example, literal display template)
- **THEN** it is preserved verbatim - no substitution

#### Scenario: Grep-checkable rule

- **WHEN** auditing a skill body for special characters
- **THEN** a grep for the substitution list (outside fences/backticks) finds zero hits
- **THEN** a grep for un-backticked `§` outside section-pointer references finds zero hits

#### Scenario: Section pointer allowed

- **WHEN** a skill body uses `§` in a section-pointer reference (outside code fences)
- **THEN** it is preserved — no ASCII substitution

### Requirement: Raised Length Bands

The skill spec SHALL use reference band <=1,500 words and general band 500-2,000 words; bodies over 2,000 words SHALL be disclosure-split to siblings. Platform primitives (atom-kernel, atom-phase-handler — every-dispatch hot contracts) SHALL use the platform-primitive reference band <=1,400 words.

#### Scenario: Reference band margin

- **WHEN** measuring a reference skill body (fence-inclusive, frontmatter-stripped)
- **THEN** <=1,500 words is in-band

#### Scenario: Platform-primitive band margin

- **WHEN** measuring a platform-primitive skill body (atom-kernel, atom-phase-handler; fence-inclusive, frontmatter-stripped)
- **THEN** <=1,400 words is in-band

#### Scenario: General band margin

- **WHEN** measuring a non-reference skill body
- **THEN** 500-2,000 words is in-band

#### Scenario: Split threshold raised

- **WHEN** a body exceeds 2,000 words
- **THEN** disclosure split to sibling is required (was >1,500)

### Requirement: Language Convention Deferral

atom-skill-spec §Language Constraints SHALL NOT mandate a specific language for skill bodies. Language choice SHALL defer to the consuming project's language conventions (project instructions / constraints); the skill spec itself does not mandate a language. Code examples and error strings remain exempt (kept in their native language).

#### Scenario: No language mandate

- **WHEN** an agent loads atom-skill-spec language constraints
- **THEN** no specific language is mandated - the consuming project's conventions decide

#### Scenario: Style rules retained

- **WHEN** an agent checks caveman style or ASCII character-standardization rules
- **THEN** they remain in force - style/format rules, language-neutral

#### Scenario: Native-language literals exempt

- **WHEN** a skill embeds code examples or error strings
- **THEN** they stay verbatim in their native language

### Requirement: Portability tier property — no project path enumeration

The SKILL.md format spec SHALL replace family enumeration with the tier property in its reference constraints: skill bodies SHALL NOT hardcode project-specific file paths (any path outside the skill set, the platform convention layer, and workflow runtime artifacts). Convention files (`CONTEXT.md`, `docs/domains.md`) arrive via the platform convention layer — default-loaded, absence-tolerant; the spec SHALL NOT enumerate families (no `docs/`, `README.md`, `CONTEXT.md` style lists). `## Context Requirements → ### Files` contract entries SHALL reference convention files or project-layer channels — a specific odd path (e.g. `openspec/specs/adr/spec.md`) SHALL be expressed as its convention/project family (`openspec/specs/**/*.md` via project layer) when it exists, never as a hardcoded expectation.

#### Scenario: Body references convention file without enumeration

- **WHEN** a skill body needs the project glossary
- **THEN** it SHALL reference the convention channel (CONTEXT.md arrives via convention layer, absence-tolerant) rather than hardcoding the path family list

#### Scenario: Files entry is a project family, not an odd file

- **WHEN** a skill contract declares Files
- **THEN** each entry SHALL be a convention file, a project family glob, or a workflow artifact — never a specific odd file whose existence is project-dependent

### Requirement: Skill document terminology surface = valid surface

Skill bodies (`packages/graph-workflow/skills/**`) MUST NOT contain finding-number references (`(F\d+)` form — referencing docs/reports/ content, violating atom-skill-spec §Reference Constraints' deployment-independence commitment) or references to deleted concepts (e.g. `skip-checkpoint mode` — the concept was removed along with Routing Modes). Referenced facts MUST be inlined and expressed in neutral wording. Glossary references SHALL point to the CONTEXT.md convention channel (project glossary) — the retired docs/glossary.md SHALL NOT be referenced.

#### Scenario: No finding-number references

- **WHEN** searching for `(F\d+)`-form text inside `packages/graph-workflow/skills/`
- **THEN** zero hits — graph-spec's field-removal notes and pilot's retry-target notes are both expressed in self-explanatory wording

#### Scenario: No dangling concept references

- **WHEN** searching `packages/graph-workflow/skills/` for `skip-checkpoint` text
- **THEN** zero hits — kernel §Decision Request and pilot §Entry no longer reference the deleted Routing Modes concepts

#### Scenario: No retired glossary reference

- **WHEN** a skill body references the project glossary
- **THEN** it SHALL reference the CONTEXT.md convention channel, never `docs/glossary.md` (retired)

### Requirement: Runtime constraints — writing-for-agents alignment

atom-skill-spec SHALL load `writing-for-agents` before use (the successor of `writing-great-skills`) and SHALL maintain an alignment table mapping each content-quality rule to its writing-for-agents concept with gap markers (supplements where the baseline lacks quantified norms; corrections where it misses patterns). The spec SHALL NOT reference `writing-great-skills` anywhere in its body — no backward-compatibility residue.

#### Scenario: Alignment table present

- **WHEN** an agent loads atom-skill-spec
- **THEN** a table SHALL exist mapping content-quality rules to writing-for-agents concepts with gap markers
- **THEN** corrections SHALL be marked as supplements, never replacements

#### Scenario: Concept remapping covers wfa vocabulary

- **WHEN** the alignment table maps a rule to a concept
- **THEN** same-name concepts (sprawl, no-op, negation, pruning, completion criterion, context pointer) SHALL map directly
- **THEN** wrapper-contract SHALL note the wfa router-skills relation
- **THEN** structure rules SHALL reference the wfa information-hierarchy ladder

#### Scenario: wfa new concepts absorbed

- **WHEN** atom-skill-spec defines content-quality metrics
- **THEN** it SHALL cover the wfa levers absent from wgs: leading words, two loads (context/cognitive), demand/legwork, premature completion, co-location/scattering, sediment, and environment-as-source-of-truth
- **THEN** each absorbed concept SHALL carry a quantified or checkable form, consistent with the existing metric style

#### Scenario: Reference-constraint context declared

- **WHEN** an agent reads §Reference Constraints
- **THEN** the spec SHALL state that external-reference freedom is the wfa document-layer principle, while the skill-dependency layer resolves within the skillsDir per project constraints (spec priority over baseline)

#### Scenario: Dependency load succeeds

- **WHEN** an agent follows the Runtime constraints line
- **THEN** `writing-for-agents` SHALL resolve within the skill set — the declaration SHALL name only skills that exist

### Requirement: Shipped skill set self-compliance

packages/graph-workflow/skills SHALL comply with the atom-skill-spec rules they ship: a rule SHALL live in exactly one home (SKILL.md or one sibling — duplication is a violation, `see sibling §X` pointers are the only legal reuse); frontmatter SHALL use only the four documented invocation combos; skill-internal pointers SHALL resolve to existing files or sections within the skill set.

#### Scenario: Alignment intro single-sited

- **WHEN** searching packages/graph-workflow/skills for the alignment intro sentence "Every Content Quality Metrics rule maps to a wfa concept"
- **THEN** exactly one occurrence exists (in ALIGNMENT.md)
- **AND** atom-skill-spec/SKILL.md references the table only via `(see sibling ALIGNMENT.md §Mapping)`

#### Scenario: Frontmatter combos sanctioned

- **WHEN** reading the frontmatter of a graph-dispatch skill under packages/graph-workflow/skills
- **THEN** every skill with `user-invocable: false` also declares `disable-model-invocation: true` (injection-only row)
- **AND** no skill declares the unsanctioned combo "omit disable-model-invocation + user-invocable: false"

#### Scenario: Tool-reference pointers resolve

- **WHEN** a skill body references atom-pilot's MCP tool reference
- **THEN** it names the existing file `atom-pilot MCP-REFERENCE.md` (or a section within it)
- **AND** no pointer names the nonexistent section "atom-pilot §MCP Tool Reference"

### Requirement: Band-limiting rule strengthened

Every atom execution skill (atom-graph-spec, atom-kernel, atom-phase-handler, atom-pilot) SHALL follow the band-limited structure: SKILL.md = contracts + pointers (hot-path loading surface); reference files = cold detail. Cold-detail distribution SHALL be uniform across primitives (no primitive with inline cold detail while a sibling has a cold file).

#### Scenario: Band-limiting audit

- **WHEN** a skill author audits an atom skill's structure
- **THEN** SKILL.md stays within the reference length band and cold detail resolves to named reference files; no primitive mixes inline + file cold detail

### Requirement: Vocabulary disambiguation delegated to glossary

Skill bodies SHALL NOT define overloaded vocabulary (channel/contract/block, route vs routing, entry node vs prologue, retryCount); disambiguation lives in CONTEXT.md glossary, and skills reference terms without re-defining them.

#### Scenario: Term meaning queried

- **WHEN** a consumer needs the meaning of an overloaded term
- **THEN** CONTEXT.md glossary is the single disambiguation site; skill bodies use the term without a second definition

### Requirement: Contract entries support trailing parenthetical annotations

The `## Context Requirements` machine-parseable contract SHALL accept a trailing parenthetical annotation on list entries in all three subsections (`### From upstream`, `### Reference skills`, `### Files`): `- <value> ( <annotation> )`. The annotation is prose — it SHALL be stripped at parse and SHALL NOT participate in matching (channel coverage, exact-match, glob resolution). An entry's value is everything before the annotation; annotations never turn a valid entry into a parse error or an unmatched string.

#### Scenario: Annotated Files entry parses to its path

- **WHEN** a skill declares `- ./CONTEXT.md (project glossary per domain-modeling CONTEXT-FORMAT.md)` in `### Files`
- **THEN** the contract parses the entry as `./CONTEXT.md`
- **AND** coverage matching resolves against `./CONTEXT.md` — the annotation causes no load failure

#### Scenario: Annotation on upstream and reference entries

- **WHEN** a skill declares `- up (review output)` in `### From upstream` or `- codebase-design (vocabulary)` in `### Reference skills`
- **THEN** the entry parses to `up` / `codebase-design` respectively — matching unaffected

#### Scenario: Placeholder detection sees the stripped value

- **WHEN** a skill declares `- <configurable> (decided at authoring)`
- **THEN** the placeholder check applies to `<configurable>` — the entry SHALL still be rejected as a placeholder

### Requirement: Convention-layer files are not contract obligations

Files entries matching the platform convention layer (`DEFAULT_CONVENTIONS`: `./CONTEXT.md`, `docs/domains.md`) SHALL NOT be contract obligations. Convention files are platform-shipped, default-loaded into every phase, and absence-tolerant — coverage by graph channels is guaranteed by construction. A skill SHALL be free to declare a convention file, omit it, or annotate it; none of these forms SHALL affect graph loading. Forward coverage SHALL exempt convention-layer entries, and channel resolution SHALL classify convention paths as convention files. Non-convention Files entries SHALL keep full obligation semantics — an uncovered non-convention entry remains a load error.

#### Scenario: Declared convention file never fails coverage

- **WHEN** a skill declares `./CONTEXT.md` (clean or annotated) in `### Files` and no graph phase declares a `./CONTEXT.md` channel
- **THEN** forward coverage SHALL pass — the platform convention layer supplies the file

#### Scenario: Omitted convention file is legal

- **WHEN** a skill's `### Files` omits convention files entirely
- **THEN** loading SHALL succeed — omission is the sanctioned form, not a gap

#### Scenario: Non-convention obligation intact

- **WHEN** a skill declares a non-convention file (e.g. `docs/adr/*.md`) and no dispatching phase channel covers it
- **THEN** forward coverage SHALL report the missing channel — the obligation surface excludes only convention files

### Requirement: Direct point, no explanation — content principle

The skill system SHALL follow the user-mandated content principle "直接说重点，不解释" (state the point directly, do not explain): process descriptions SHALL be one sentence; a single-sourced rule SHALL appear exactly once and every other occurrence SHALL be a pointer to its home; explanatory annotations on structural markers (e.g. `<!-- none -->`) SHALL be omitted; natural-language output SHALL follow caveman full level.

#### Scenario: process description one sentence

- **WHEN** a skill documents a process step (entry, activation, loop mechanics)
- **THEN** the step description SHALL be a single sentence stating action, ordering, and precondition
- **THEN** rationale, history, and alternative considerations SHALL NOT appear in the step description

#### Scenario: single-sourced rule referenced, never restated

- **WHEN** a rule has an authoritative definition site (e.g. `atom-kernel` §Direct end, `atom-graph-spec` §Run Completion)
- **THEN** every other occurrence SHALL be a pointer (`see <home> §X`), never a restatement

#### Scenario: structural marker annotations omitted

- **WHEN** a structural marker carries no information beyond its grammar (e.g. `<!-- none -->` in Context Requirements)
- **THEN** explanatory text after the marker SHALL be omitted

### Requirement: Spec-class skills accept limited explanation

Spec-class skills (atom-skill-spec, atom-graph-spec) SHALL be exempt from the strictest reading of the no-explanation principle: format definitions themselves are content, so bounded explanation of format meaning is permitted. The exemption SHALL NOT license verbose prose — caveman full level still applies, and the no-op test still governs every token.

#### Scenario: spec-class format explanation allowed

- **WHEN** a spec-class skill explains the meaning of a format field
- **THEN** bounded explanation is permitted as long as it is caveman-compressed and each token passes the no-op test

#### Scenario: spec-class verbosity still rejected

- **WHEN** a spec-class skill contains filler, pep-talk, or restated rationale
- **THEN** the content SHALL be rejected per the no-op test
