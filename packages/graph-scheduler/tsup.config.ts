import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['server.ts'],
  target: ['node22'],
  format: ['esm'],
  clean: true,
  dts: true,
  splitting: false,
  sourcemap: true,
  treeshake: true,
  tsconfig: './tsconfig.json',
});
