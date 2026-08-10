# opencode-hlt-policy Specification

## Purpose

Defines the Opencode plugin port of the HLT scenario-table enforcement prototype: restriction (deny platform-native tool calls on in-project code targets) + promote (caveman/rtk prompt injection) as an always-on, project-local Opencode plugin. Validation-only prototype — the report is the record carrier.

## Requirements

### Requirement: Tool restriction for in-project code targets

When a permission-gated tool call targets an in-project code file, the plugin's injected permission ruleset denies it; non-code targets are not restricted.

#### Scenario: Edit denied on in-project code

- **WHEN** the agent calls `edit` (or `write`/`apply_patch`) with a resource matching an in-project code pattern (e.g. `packages/**/*.ts`)
- **THEN** the permission assertion fails with a deny rule and the tool call is blocked (never executes)

#### Scenario: Read/search denied on in-project code

- **WHEN** the agent calls `read` (or `grep`/`glob`) with a target matching an in-project code pattern
- **THEN** the permission assertion fails with a deny rule and the tool call is blocked

#### Scenario: Run-class tools pass

- **WHEN** the agent calls `bash`, `webfetch`, or `task`
- **THEN** no deny rule matches and the call proceeds (run class)

#### Scenario: Non-code targets pass

- **WHEN** the agent calls a restricted tool on a non-code text target, a special-type target, or an extensionless target
- **THEN** no deny rule matches and the call proceeds

#### Scenario: Out-of-project code targets pass (classifier) with runtime limitation

- **WHEN** the classifier evaluates a restricted tool on an out-of-project code path
- **THEN** the classifier allows the call (location-aware semantics)
- **AND** the runtime ruleset is suffix-based and cannot express location scoping — external code files may still be denied by the injected patterns (documented limitation; the classifier stays the honest semantics contract)

### Requirement: Scenario-table-driven rule injection

The deny ruleset is compiled from the HLT scenario table at plugin init; unclassified targets are never blocked.

#### Scenario: Ruleset injected on init

- **WHEN** the plugin initializes and the merged config is available
- **THEN** the permission ruleset contains one deny rule per restricted action over in-project code patterns

#### Scenario: Unknown targets pass through

- **WHEN** a tool call's target cannot be classified (unknown extension, no resolvable target)
- **THEN** no deny rule matches and the call proceeds (never block what cannot be classified)

### Requirement: Prompt promotion on every LLM request

The caveman and rtk discipline prompts are appended to the system prompt on every LLM request, for all sessions.

#### Scenario: System prompt carries discipline prompts

- **WHEN** an LLM request is prepared (main session or sub-agent session)
- **THEN** the system prompt array contains the caveman prompt and the rtk prompt as trailing entries

### Requirement: Always-on, non-disableable

The plugin has no toggle and no disable command; enforcement and promotion are resident for the project.

#### Scenario: No disable path

- **WHEN** a user inspects the plugin surface
- **THEN** no disable/toggle command or option exists
