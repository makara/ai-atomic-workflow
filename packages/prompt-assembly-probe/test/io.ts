/**
 * I/O extraction helper — every probe group dumps {input, output, assertions}
 * to outputs/<group>.json so prompt-assembly inputs/outputs are auditable.
 * outputs/ is gitignored; the JSON is the audit artifact.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ProbeAssertion {
  name: string;
  pass: boolean;
  evidence: string;
}

const here = fileURLToPath(new URL('.', import.meta.url));
const outputsDir = path.resolve(here, '../outputs');

/** Record and persist one group's I/O extract; returns the record. */
export function recordIo(group: string, input: unknown, output: unknown, assertions: ProbeAssertion[]): void {
  fs.mkdirSync(outputsDir, { recursive: true });
  const record = {
    group,
    runAt: new Date().toISOString(),
    input,
    output,
    assertions,
  };
  fs.writeFileSync(path.join(outputsDir, `${group}.json`), JSON.stringify(record, null, 2));
}

/** Render an assertion object from a check result. */
export function assertion(name: string, pass: boolean, evidence: string): ProbeAssertion {
  return { name, pass, evidence };
}

/**
 * Post-run output existence gate (T6 acceptance): fails the group if the
 * group's outputs/<group>.json was not written by recordIo.
 */
export function verifyOutput(group: string, assertions: ProbeAssertion[]): void {
  const p = path.join(outputsDir, `${group}.json`);
  const exists = fs.existsSync(p);
  assertions.push(assertion('output file written', exists, p));
  if (!exists) {
    throw new Error(`output file missing after run: ${p}`);
  }
}
