/**
 * The judgment face: the port shape, the mechanical default, and the
 * read-narrowing rule. The port is this repo's extension to the concept set;
 * the refuse code for an unusable judgment lives with `settle`.
 *
 * @module
 */
import type { ReportInput } from '../contract/report.js';
import type { Json, KeySpec } from '../ir.js';
import type { Task } from '../step/plan.js';

/** The minimum view a judge reads: the folded values and the next frontier. */
export type StateSnapshot = {
  readonly values: Readonly<Record<string, Json>>;
  readonly next: readonly string[];
};

/** What one judgment reads: state, task, report, declared keys, and the narrowed reads. */
export type JudgeRequest = {
  readonly state: StateSnapshot;
  readonly task: Task;
  readonly report: ReportInput;
  readonly keys: readonly KeySpec[];
  /** Read-narrowing from the node's declared face; absent means the full folded state. */
  readonly reads?: readonly string[];
};

/** The judging face the settle reads when a key is missing and several are declared. */
export type JudgePort = {
  judge(request: JudgeRequest): Promise<{ readonly key: string }>;
};

/** The key a keyless node answers: the mechanical default, declared or not, that its router may carry. */
export const DEFAULT_KEY = 'complete';

/** The mechanical default: the declared key the report carries, else the sole declared key, else
 *  the default key for a node that declares none — and a keyless node's report carrying anything
 *  but the default stays undecided; undecided too when none of these holds. */
export function mechanicalKey(keys: readonly string[], reportKey?: string): string | undefined {
  if (keys.length === 0) return reportKey === undefined || reportKey === DEFAULT_KEY ? DEFAULT_KEY : undefined;
  if (reportKey !== undefined && keys.includes(reportKey)) return reportKey;
  return keys.length === 1 ? keys[0] : undefined;
}

/** The narrowing rule: the node's readable face trims the judgment input; an empty face keeps the full state. */
export function readsOf(read: readonly string[]): readonly string[] | undefined {
  return read.length === 0 ? undefined : read;
}
