/**
 * Adapter failure diagnostics — the single process-log line on adapter
 * failure paths (ADR 0176 F6). The zero-deny try/catch stays per site;
 * the diagnostic line is single-sourced here. One line per failure:
 * `[graph-fidelity] <site> failed: <message>` — no stack, nothing
 * injected into LLM context, normal requests emit no process logs.
 *
 * @module
 */

/** Report one adapter failure line (site label + error message). */
export function reportFailure(site: string, err: unknown): void {
  console.warn(`[graph-fidelity] ${site} failed:`, err instanceof Error ? err.message : String(err));
}
