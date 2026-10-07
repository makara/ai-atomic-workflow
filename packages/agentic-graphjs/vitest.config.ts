import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const PKG_ROOT = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
  resolve: {
    alias: [
      // The examples import the package by name: without an alias those imports resolve through
      // the workspace link to `dist`, so the transcript equality assertion would pin whatever the
      // last build left there instead of the source it means to cover. The gates keep their own
      // face — they run in their own processes and read `dist` directly.
      { find: /^agentic-graphjs$/, replacement: join(PKG_ROOT, 'src', 'index.ts') },
      { find: /^agentic-graphjs\/internal$/, replacement: join(PKG_ROOT, 'src', 'internal.ts') },
    ],
  },
});
