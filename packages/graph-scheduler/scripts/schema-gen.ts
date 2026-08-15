/**
 * Regenerates schemas/workflow.schema.json from the zod source of truth
 * (WorkflowSchema). Single generation channel for the derived JSON Schema
 * artifact — run `yarn schema:gen` after any WorkflowSchema change.
 *
 * Output normalization: the artifact is formatted with the repository's
 * prettier configuration before writing — committed JSON is prettier-formatted
 * (repo-wide `prettier --write` covers it), so the generation channel emits
 * the committed form directly. The drift-guard test
 * (workflow-json-schema.test.ts) compares through the same normalization —
 * formatting never fails the guard, content drift always does.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import prettier from 'prettier';
import { workflowJsonSchema } from '../src/schemas/workflow.js';

const out = resolve(import.meta.dirname, '..', 'schemas', 'workflow.schema.json');
const raw = `${JSON.stringify(workflowJsonSchema(), null, 2)}\n`;
// filepath makes prettier resolve the repo .prettierrc (printWidth 120 etc.) —
// programmatic format() without filepath/config falls back to prettier defaults.
const formatted = await prettier.format(raw, { parser: 'json', filepath: out });
writeFileSync(out, formatted, 'utf-8');
console.log(`wrote ${out}`);
