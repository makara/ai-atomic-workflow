# graph-fidelity/distribution-contract Specification

## Purpose

Deployment contract for the OMP plugin install channel: the installer copies package folders verbatim and delivers no dependencies, so every extension entry bundle must be install-ready byte-for-byte from the repository build.

## Requirements

### Requirement: Self-contained install bundles

**Before**: Every OMP extension entry (dist/omp.js, dist/opencode.js) SHALL load from a verbatim folder copy with zero dependency installation. Relative imports SHALL reference files shipped inside the package; third-party runtime dependencies SHALL be inlined into the bundle; bare specifiers SHALL be limited to packages the installer co-locates (the `@ai-atomic-workflow` family). The family reference scenario resolved `@ai-atomic-workflow/graph-fidelity/lifecycle` to the SAME instance the base adapters render from.

**After**: Every OMP extension entry SHALL load from a verbatim folder copy with zero dependency installation. Relative imports SHALL reference files shipped inside the package; third-party runtime dependencies SHALL be inlined into the bundle; the SDK dependency SHALL be inlined (noExternal). No bundle SHALL reference `@ai-atomic-workflow/graph-fidelity/lifecycle` — the R1 chain ships inside the SDK, which is inlined into consumer bundles.

#### Scenario: Verbatim copy loads

- **WHEN** the installed plugin cache folder is copied to a directory with no node_modules and the extension entry is imported
- **THEN** all imports resolve (no ResolveMessage) and the bundle loads its default export

#### Scenario: Third-party dependency inlined

- **WHEN** a bundle is scanned for bare third-party specifiers (e.g. `@modelcontextprotocol/*`)
- **THEN** none remain — the dependency is bundled inline, including the SDK

#### Scenario: Family reference resolves

- **WHEN** a bundle is scanned for `@ai-atomic-workflow/graph-fidelity/lifecycle`
- **THEN** no match exists — the shared lifecycle module is gone, and the R1 chain resolves from the inlined SDK instead

### Requirement: Build-chain single entry

**Before**: The repository build SHALL produce install-ready dist artifacts in one command. Artifact normalization (lifecycle import path `./lifecycle.js`, dependency inlining) SHALL be part of the package build configuration. When `yarn build` runs at the repository root, `packages/graph-fidelity/dist/omp.js` and `dist/opencode.js` import the shared `./lifecycle.js` (never `../lifecycle.js`).

**After**: The repository build SHALL produce install-ready dist artifacts in one command. Dependency inlining (including the SDK) SHALL be part of the package build configuration; no lifecycle import-path normalization SHALL exist. When `yarn build` runs at the repository root, `packages/graph-fidelity/dist/omp.js` and `dist/opencode.js` carry the R1 chain inlined via the SDK dependency, with no shared lifecycle module artifact.

#### Scenario: Root build produces normalized dist

- **WHEN** `yarn build` runs at the repository root
- **THEN** `packages/graph-fidelity/dist/omp.js` and `dist/opencode.js` load with no shared `./lifecycle.js` reference, and `packages/graph-fidelity-context/dist/*.js` carry no bare third-party specifiers

#### Scenario: No external post-processing step

- **WHEN** the build completes
- **THEN** no file outside the package build configuration is required to produce the normalized artifacts (no standalone normalization script, no lifecycle path rewrite)

### Requirement: Dist contract pin enforcement

The repository check chain SHALL build then run dist-contract smoke tests for both packages; regressions (bare third-party specifiers, out-of-package relative imports, missing shared files) SHALL fail the check.

#### Scenario: Regression fails the check

- **WHEN** a change introduces a bare third-party specifier or an out-of-package relative import into a dist bundle
- **THEN** the dist-smoke test fails and the repository check reports the failure

#### Scenario: Check chain order

- **WHEN** `yarn check` runs
- **THEN** dist artifacts are built before the dist-smoke assertions execute
