# atom-graph-design Specification

## Purpose

TBD - created by archiving change remaining-med-sweep. Update Purpose after archive.

## Requirements

### Requirement: Output schema covers branch routes

The design output SHALL include route:/routing: fields for branch-route cases + a task-content pointer to §Task Content Spec.

#### Scenario: route fields present

Given packages/graph-workflow/skills/atom-graph-design/SKILL.md When reading the Output contract Then route:/routing: appear for branch-route cases and §Task Content Spec is referenced
