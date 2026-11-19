import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths so the build works from any folder (itch.io, GitHub Pages).
  base: './',
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: {
    target: 'es2022',
    // Phaser alone is well over 1 MB minified, so the default 500 kB warning is noise.
    chunkSizeWarningLimit: 2500,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
