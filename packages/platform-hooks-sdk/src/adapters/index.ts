/**
 * Adapter barrel — per-platform translation tables + platform shape
 * surface. Published d.ts stays platform-type-free (ADR 0193/0196).
 * opencode-v2 placeholder stub deleted (sdk-hooks-middleware — the v2
 * contract stays documented as pending in the first-principles doc
 * directory only; zero runtime surface).
 */

export { OMP_SHAPE, ompAdapter, ompMessageText } from './omp.js';
export type { OmpAgentMessage, OmpContextEvent, OmpFactory } from './omp.js';
export {
  OPENCODE_SHAPE,
  opencodeAdapter,
  opencodeMessageRole,
  opencodeMessageText,
  validateOpencodeOptions,
} from './opencode.js';
export type { OpencodeHook, OpencodeMessage, OpencodePluginShape, OpencodeServer } from './opencode.js';
