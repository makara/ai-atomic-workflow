---
name: content-authoring
description: executing-plans execution mode — draft and deliver non-code content artifacts (tech docs, speech/slide outlines, action guides, analysis reports).
argument-hint: "[content type] [target file path]"
user-invocable: true
disable-model-invocation: false
version: "1.2.0"
last_updated: "2026-07-09"
---

# Content Authoring — executing-plans Execution Mode

> **Positioning**: Sub-mode of `executing-plans`, sibling to `test-driven-development`.
> **Usage**: During the implementation phase, load `executing-plans` and specify the content-authoring mode.

## Use Cases

- Draft technical docs, API docs
- Write speech outlines or slide deck outlines
- Create action guides, operational manuals
- Produce analysis reports, research summaries

## Relationship with executing-plans

This skill does not replace `executing-plans` — the user loads `executing-plans` during the implementation phase and indicates content-authoring mode. This skill describes the behavior guidance and deliverable requirements specific to this mode.

## Behavior Guide

1. Write output to the target file path specified in the plan document — no default path; must be passed at invocation
2. Output language: determined by `lang.conversation` parameter — default `zh` (Chinese) unless overridden by project standards or orchestrate invocation
3. Output format: Follow the content output conventions (O1: conclusion first, then details)
4. Content authoring is an implementation step — the planning phase has been completed at the upper layer; this mode only executes writing to disk

## Completion Criteria

- [ ] Content has been written to the target file path specified by the caller
- [ ] Output language follows `lang.conversation` parameter
- [ ] Follows O1 principle (conclusion first)

## Constraints

- Output language: determined by `lang.conversation` parameter
- No git operations
- Target file path must be explicitly passed by the caller at invocation
