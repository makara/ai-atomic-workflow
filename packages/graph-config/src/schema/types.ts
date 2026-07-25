import type { ConfigFile } from './config-schema';

// re-export Zen-derived type — zero hand-written interface
export type { ConfigFile };

/** init command output report */
export interface IInitReport {
  /** newly created files/directories — relative paths */
  created: string[];
  /** already existing files/directories — skipped */
  existed: string[];
  /** project root directory operated on */
  projectRoot: string;
}

/** validate command output report */
export interface IValidateReport {
  /** all checks passed */
  valid: boolean;
  /** validation error list — empty when valid=true */
  errors: string[];
}
