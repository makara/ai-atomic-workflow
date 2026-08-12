#!/usr/bin/env node
/**
 * Manifest generator — single ground truth: `packages/`.
 *
 * The 16-skill inventory was hand-maintained in two manifests (marketplace.json
 * + skills.sh.json). This generator derives both from the filesystem
 * (`packages/graph-workflow/skills/` + `packages/` layout) so a skill add/remove
 * touches one place only. Deterministic, idempotent, byte-identical check:
 * run with `--check` to fail on drift (wired into `yarn check`).
 *
 * Split rules (mirror packages/ per readme-blueprint §1 Manifest grouping):
 * - marketplace plugins[]: one entry per package — graph-workflow (14 core
 *   skills), graph-workflow-extra (release-prep-analyze + release-prep-apply,
 *   optional), graph-fidelity (plugin entry, no skills).
 * - skills.sh groupings[]: one per package that ships skills.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const SKILLS_DIR = join(ROOT, 'packages', 'graph-workflow', 'skills');

/** Optional (extra) skills — split into their own grouping/plugin entry. */
const EXTRA_SKILLS = new Set(['release-prep-analyze', 'release-prep-apply']);

/** Package-domain descriptions — mirror readme-blueprint §1 Manifest grouping. */
const PLUGIN_DESCRIPTIONS = {
  'graph-workflow':
    'Core graph-execution skill system — atom-pilot lifecycle loop, atom-phase-handler node dispatch, entry/reference skills, and format references for graphs, skills, docs, and domains.',
  'graph-workflow-extra':
    'Optional release-prep pipeline — analyze proposes the next version and changelog inventory from git history; apply performs the confirmed release writes. Not required for normal operation.',
  'graph-fidelity':
    'Platform-seam signal discipline — per-call discipline echo, context fidelity reduction, and observability, delivered as one module for OMP (ExtensionAPI) and opencode (Plugin).',
};

/** Scan the skills dir — sorted skill names (stable output). */
function scanSkills() {
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/** Build the marketplace.json document. */
function buildMarketplace(skills) {
  const core = skills.filter((s) => !EXTRA_SKILLS.has(s));
  const extra = skills.filter((s) => EXTRA_SKILLS.has(s));
  const plugins = [
    {
      name: 'graph-workflow',
      source: './packages/graph-workflow',
      description: PLUGIN_DESCRIPTIONS['graph-workflow'],
      skills: core.map((s) => `./skills/${s}`),
    },
    {
      name: 'graph-workflow-extra',
      source: './packages/graph-workflow',
      description: PLUGIN_DESCRIPTIONS['graph-workflow-extra'],
      skills: extra.map((s) => `./skills/${s}`),
    },
    {
      name: 'graph-fidelity',
      source: './packages/graph-fidelity',
      description: PLUGIN_DESCRIPTIONS['graph-fidelity'],
    },
  ];
  return {
    $schema: 'https://anthropic.com/claude-code/marketplace.schema.json',
    name: 'ai-atomic-workflow',
    version: readFileSync(join(ROOT, 'package.json'), 'utf-8').match(/"version":\s*"([^"]+)"/)?.[1] ?? '0.0.0',
    description: readFileSync(join(ROOT, 'package.json'), 'utf-8').match(/"description":\s*"([^"]+)"/)?.[1] ?? '',
    owner: { name: 'makarawang', email: 'makara15@gmail.com' },
    metadata: { pluginRoot: './' },
    plugins,
    skills: [],
  };
}

/** Build the skills.sh.json document. */
function buildSkillsSh(skills) {
  const core = skills.filter((s) => !EXTRA_SKILLS.has(s));
  const extra = skills.filter((s) => EXTRA_SKILLS.has(s));
  return {
    $schema: 'https://skills.sh/schemas/skills.sh.schema.json',
    notGrouped: 'bottom',
    groupings: [
      {
        title: 'Graph Workflow',
        description: PLUGIN_DESCRIPTIONS['graph-workflow'],
        skills: core,
      },
      {
        title: 'Graph Workflow Extra',
        description: PLUGIN_DESCRIPTIONS['graph-workflow-extra'],
        skills: extra,
      },
    ],
  };
}

function main() {
  const check = process.argv.includes('--check');
  const skills = scanSkills();
  const documents = [
    { path: join(ROOT, '.claude-plugin', 'marketplace.json'), doc: buildMarketplace(skills) },
    { path: join(ROOT, 'skills.sh.json'), doc: buildSkillsSh(skills) },
  ];

  let drift = false;
  for (const { path, doc } of documents) {
    const generated = `${JSON.stringify(doc, null, 2)}\n`;
    if (check) {
      const current = readFileSync(path, 'utf-8');
      if (current !== generated) {
        console.error(
          `[manifest-drift] ${path} differs from generated ground truth — run "node scripts/gen-manifests.mjs" to regenerate`,
        );
        drift = true;
      }
    } else {
      mkdirSync(resolve(path, '..'), { recursive: true });
      writeFileSync(path, generated);
      console.log(`[manifests] wrote ${path} (${skills.length} skills)`);
    }
  }
  if (drift) process.exit(1);
}

main();
