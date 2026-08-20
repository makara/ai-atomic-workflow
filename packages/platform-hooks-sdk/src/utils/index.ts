/**
 * Shared utils — display-render helpers + tool-name prefix
 * classification, consumed by graph-fidelity-context (single source of
 * truth; consumer bundles inline the SDK via tsup `noExternal`). The
 * base package holds no R2 render surface (ADR 0175/0195).
 *
 * @module
 */

export { toLandingInput } from './landing.js';
export type { LandingTransformInput, TextLikeBlock } from './landing.js';
export { renderBenefitSegment, renderCompact } from './render.js';
export type { BenefitFacts } from './render.js';
export { isControlPlaneTool, prefixClassOf } from './tool-prefix.js';
export type { ToolNamePrefixClass } from './tool-prefix.js';
