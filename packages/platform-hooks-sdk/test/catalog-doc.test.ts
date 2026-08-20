/**
 * Catalog ↔ document consistency (ADR 0196): the first-principles
 * document directory derives from CATALOG — this test verifies the doc
 * states the catalog-derived counts, the single-source linkage, and
 * every pending interface name. A doc edit that drifts from the catalog
 * fails here (and vice versa).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CATALOG, FORMAL_CANONICALS, formalFacesOf } from '../src/core/catalog.js';
import { PENDING_INTERFACES } from '../src/core/pending-interfaces.js';

const DOC_PATH = fileURLToPath(new URL('../../../docs/first-principles/platform-hooks-sdk.md', import.meta.url));
const doc = readFileSync(DOC_PATH, 'utf8');

describe('first-principles doc derives from the catalog', () => {
  it('doc states the 16 formal / 37 pending counts', () => {
    expect(doc).toContain('16');
    expect(doc).toContain('37');
  });

  it('doc declares the single-source linkage to CATALOG', () => {
    expect(doc).toMatch(/CATALOG/i);
    expect(doc).toMatch(/single[ -]source/i);
  });

  it('doc lists every formal canonical', () => {
    const formal = [...new Set(CATALOG.filter((r) => r.status === 'formal').map((r) => r.canonical as string))];
    for (const name of formal) {
      expect(doc, `formal canonical missing in doc: ${name}`).toContain(name);
    }
  });

  it('doc lists every pending interface with its reason', () => {
    for (const p of PENDING_INTERFACES) {
      expect(doc, `pending interface missing in doc: ${p.name}`).toContain(p.name);
      expect(doc, `pending reason missing in doc: ${p.name}`).toContain(p.reason.slice(0, 24));
    }
  });

  it('formal table rows match CATALOG faces row-for-row', () => {
    const lines = doc.split('\n');
    const start = lines.findIndex((line) => line.startsWith('### 6.1'));
    const end = lines.findIndex((line, i) => i > start && line.startsWith('###'));
    const section = lines.slice(start, end === -1 ? lines.length : end);
    for (const canonical of FORMAL_CANONICALS) {
      const { omp, opencode } = formalFacesOf(canonical);
      const row = section.find((line) => line.includes(`\`${canonical}\``) && line.includes('|'));
      expect(row, `no formal table row for ${canonical}`).toBeDefined();
      if (row === undefined) continue;
      const ompSeg = omp === undefined ? '—' : omp;
      expect(row, `OMP face mismatch for ${canonical}`).toContain(ompSeg);
      if (opencode === undefined) {
        // no opencode face — the row must show '—' or the substitute_shared marker
        expect(
          row.includes('—') || row.includes('substitute_shared'),
          `opencode face must be absent for ${canonical}`,
        ).toBe(true);
      } else {
        expect(row, `opencode face mismatch for ${canonical}`).toContain(opencode);
      }
    }
  });
});
