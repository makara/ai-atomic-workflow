/**
 * ConfigService — runtime-resolved project configuration for dispatch.
 *
 * Carries the project-level ambient context (config.json `context`) to the
 * NodeDetail merge at dispatch time — the default layer of the global
 * channel (config → graph, merged once). Resolved once at createRuntime;
 * injected via the environment layer.
 */

import { Context } from 'effect';

/**
 * ConfigService Context.Tag — injectable runtime config.
 *
 * Single field `context` — project-level ambient context entries
 * (explicit `skill:`/`node:` prefixes or file globs; bare names are
 * rejected at config validation). Absent config → empty array.
 */
export class ConfigService extends Context.Tag('ConfigService')<
  ConfigService,
  {
    /** Project-level ambient context entries — default layer of the global channel. */
    readonly context: readonly string[];
    /** Resolved db path — active-run mirror path derivation source. */
    readonly dbPath: string;
  }
>() {}
