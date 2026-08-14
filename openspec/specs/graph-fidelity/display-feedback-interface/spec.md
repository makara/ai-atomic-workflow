# graph-fidelity/display-feedback-interface Specification

## Purpose

Normative interface for information display / feedback output (notify → display → audit): all runtime feedback flows through one contract whose platform notification capabilities (OMP `ctx.ui.notify`, opencode toast) are adapter implementations, never direct calls.

## Requirements

### Requirement: Feedback contract

All runtime feedback — notifications, display lines, audit records — SHALL flow through the DisplayFeedback interface. Platform notify/toast capabilities SHALL be adapter implementations of the interface; core logic SHALL NOT call platform feedback APIs directly.

#### Scenario: Notify via interface

- **WHEN** the module completes a background action (e.g. a settlement line)
- **THEN** the feedback is emitted through the DisplayFeedback interface and the platform adapter delivers it (OMP `ctx.ui.notify` / opencode toast), with no direct platform call in core logic

### Requirement: Audit independence

Audit records (appendEntry) SHALL execute independently of display delivery; a display failure SHALL NOT drop the audit record.

#### Scenario: Display failure

- **WHEN** the platform display surface errors or is unavailable
- **THEN** the audit record is still written (audit never lost — platform law)

### Requirement: LLM-channel avoidance

Feedback SHALL NOT use the LLM message channel except as the documented degrade when no platform notification capability exists.

#### Scenario: Degrade only when no capability

- **WHEN** the platform has a notification capability
- **THEN** feedback uses it; the transcript echo / message injection path is not used
- **WHEN** the platform lacks any notification capability
- **THEN** the documented degrade path applies and is explicitly marked as degrade
