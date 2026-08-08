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

The `## Context Requirements` section SHALL be a machine-parseable contract with exactly four subsections — `### From upstream` (node IDs), `### Reference skills` (skill names), `### Operation classes` (closed-set members of the High-Level Tool Registry the skill performs by default — optional, absent = no default classes), `### Files` (file globs) — each containing a simple list. Placeholder entries (e.g. `<configurable — …>`) SHALL be rejected; a skill with an unparseable contract SHALL fail validation. An unknown operation class SHALL fail validation naming the skill and the class. Skills SHALL NOT hardcode `.taskflow/outputs/` paths or duplicate channel resolution inside their bodies — content reachable via declared channels SHALL be consumed as injected context, not re-read by the skill itself.

#### Scenario: Contract parses into four lists

- **WHEN** a skill's `## Context Requirements` contains the four subsections
- **THEN** each subsection SHALL parse into a list of entries
- **THEN** missing or empty subsections SHALL be valid (no requirements of that kind)

#### Scenario: Placeholder contract rejected

- **WHEN** a skill declares an entry like `<configurable — decided at graph authoring>`
- **THEN** validation SHALL fail with an error naming the skill and the placeholder entry

#### Scenario: Unknown operation class rejected

- **WHEN** a skill declares an operation class outside the HLT closed set
- **THEN** validation SHALL fail naming the skill and the unknown class

#### Scenario: Skill body avoids channel duplication

- **WHEN** a skill's contract declares a Reference skill or Files entry
- **THEN** the skill body SHALL NOT re-load that reference itself or re-read those files directly as its primary mechanism — the handler-injected context SHALL be authoritative
- **THEN** a graph-dispatch skill referencing `.taskflow/outputs/<id>.output.txt` in its body SHALL be flagged

### Requirement: Operation classes feed handler injection

The skill's `Operation classes` subsection SHALL be the default source for handler registry injection and class-based verification; a graph phase may override/complement it via `operations:`. The skill body SHALL NOT re-implement tool chains — the HLT Registry is the single chain source.

#### Scenario: Skill default drives injection

- **WHEN** a skill declares `Operation classes: [locate, verify]` and the phase declares none
- **THEN** the dispatch SHALL inject the registry entries for locate and verify
- **AND** the skill body SHALL reference the registry rather than re-specify chains

### Requirement: No self-repetition in the spec

atom-skill-spec SHALL follow its own no-self-repetition rule — each fact stated once.

#### Scenario: sibling-files single-sited

Given packages/graph-workflow/skills/atom-skill-spec/SKILL.md When searching for the sibling-files path-resolution fact ("Sibling files deployed with skill — `<name>/<path>` relative to the skill's SKILL.md") Then it appears exactly once

### Requirement: Invocation matrix complete

The invocation model table SHALL include a row for model-invoked + `user-invocable: true` (auto-trigger + slash-invokable hybrid).

#### Scenario: hybrid row present

Given packages/graph-workflow/skills/atom-skill-spec/SKILL.md When reading the invocation table Then a row exists for model-invoked + user-invocable: true

### Requirement: Content Quality Metrics quantified

atom-skill-spec SHALL specify quantified content-quality norms for SKILL.md bodies: length bands, why/how ratio targets, content-carrier selection, evidence-gated completion criteria, branch skip conditions, wrapper delegation contracts, single-source scope including sibling files, positive-first phrasing, and vocabulary discipline (avoid-lists + rejected framings).

#### Scenario: Length bands enforced

- **WHEN** an agent authors or reviews a SKILL.md body
- **THEN** the target band SHALL be 400–1,500 words (reference skills ≤ 1,000)
- **THEN** a body under 200 words SHALL be legal only as a wrapper skill with a delegation contract
- **THEN** a body over 1,500 words SHALL trigger disclosure split (context pointer to sibling file) before acceptance

#### Scenario: Why/how distribution norms

- **WHEN** an agent authors a SKILL.md body
- **THEN** the body SHALL open with a thesis sentence (why the skill exists)
- **THEN** each decision rule SHALL carry at most one line of rationale
- **THEN** the why/how lexical ratio SHALL target 1:5–1:40 — outside the band triggers review of why scattering or absence

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
- **THEN** vague criteria ("extremely extensive", "fix anything…", "when answered") SHALL be rewritten to observable signals

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

### Requirement: Runtime constraints — writing-great-skills alignment

atom-skill-spec SHALL load `writing-great-skills` before use and SHALL maintain an alignment table mapping each content-quality rule to its writing-great-skills concept with gap markers (supplements where the baseline lacks quantified norms; corrections where it misses patterns).

#### Scenario: Alignment table present

- **WHEN** an agent loads atom-skill-spec
- **THEN** a table SHALL exist mapping content-quality rules to writing-great-skills concepts with gap markers
- **THEN** corrections SHALL be marked as supplements, never replacements

### Requirement: Loading Efficiency Pareto Placement

The skill spec SHALL require that SKILL.md body carries the hot path — execution-critical references and specs needed on every dispatch — while low-frequency content (edge cases, full field tables, complete examples) SHALL live in sibling files behind `(see sibling §X)` pointers.

#### Scenario: Hot-path content in SKILL.md

- **WHEN** a rule or reference is needed on every dispatch of the skill
- **THEN** its single home is the SKILL.md body

#### Scenario: Cold content behind pointers

- **WHEN** content is reached only by some branches or rare activations
- **THEN** it lives in a sibling file and SKILL.md carries only a `(see sibling §X)` pointer

### Requirement: Pareto 20/80 Rule of Thumb

The skill spec SHALL state the loading-efficiency rule of thumb: approximately 20% of a skill's content serves approximately 80% of activations, and that 20% MUST reside in SKILL.md; pointer indirection costs less per activation than inlined cold content.

#### Scenario: Placement by frequency

- **WHEN** placing new content into a skill
- **THEN** placement follows usage frequency: every-dispatch content in SKILL.md, rare content in siblings

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

Adding the loading-efficiency requirement SHALL NOT push the skill spec itself out of the reference band (≤1,000 body words); equivalent content SHALL be trimmed as offset.

#### Scenario: Spec stays in band

- **WHEN** the loading-efficiency rule is added to atom-skill-spec
- **THEN** the body word count stays ≤1,000

### Requirement: Character Standardization

The skill spec SHALL require standard ASCII characters in prose wherever an equivalent exists: `—`/`–` -> `-`, `→` -> `->`, `≤` -> `<=`, `≥` -> `>=`, `×` -> `x`, `…` -> `...`. Literal content inside code fences and backticks SHALL be exempt (code samples stay verbatim).

#### Scenario: Prose special char replaced

- **WHEN** a skill body uses an em-dash, arrow, or other special char in prose (outside code fences/backticks)
- **THEN** the standard ASCII equivalent is used instead

#### Scenario: Fence literal exemption

- **WHEN** a special char appears inside a code fence or backtick span (code example, literal display template)
- **THEN** it is preserved verbatim - no substitution

#### Scenario: Grep-checkable rule

- **WHEN** a reviewer checks a skill for special-char violations
- **THEN** a grep for prose occurrences (outside fences) returns zero hits

### Requirement: Raised Length Bands

The skill spec SHALL use reference band <=1,200 words and general band 400-1,800 words (raised from <=1,000 / 400-1,500); bodies over 1,800 words SHALL be disclosure-split to siblings.

#### Scenario: Reference band margin

- **WHEN** measuring a reference skill body (fence-inclusive, frontmatter-stripped)
- **THEN** <=1,200 words is in-band

#### Scenario: General band margin

- **WHEN** measuring a non-reference skill body
- **THEN** 400-1,800 words is in-band

#### Scenario: Split threshold raised

- **WHEN** a body exceeds 1,800 words
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

Skill bodies (`packages/graph-workflow/skills/**`) MUST NOT contain finding-number references (`(F\d+)` form — referencing docs/reports/ content, violating atom-skill-spec §Reference Constraints' deployment-independence commitment) or references to deleted concepts (e.g. `skip-checkpoint mode` — the concept was removed along with Routing Modes and the glossary has been marked obsolete). Referenced facts MUST be inlined and expressed in neutral wording.

#### Scenario: No finding-number references

- **WHEN** searching for `(F\d+)`-form text inside `packages/graph-workflow/skills/`
- **THEN** zero hits — graph-spec's field-removal notes and pilot's retry-target notes are both expressed in self-explanatory wording

#### Scenario: No dangling concept references

- **WHEN** searching `packages/graph-workflow/skills/` for `skip-checkpoint` text
- **THEN** zero hits — kernel §Decision Request and pilot §Entry no longer reference the deleted Routing Modes concepts
