import { defineConfig } from 'vite';
import { cpSync, copyFileSync, mkdirSync, existsSync } from 'fs';

export default defineConfig({
  server: { port: 5173, open: false },
  build: {
    outDir: 'dist',
    // avoid collision with real game assets folder (assets/*.js)
    assetsDir: '_vite',
    emptyOutDir: true,
  },
  plugins: [
    {
      name: 'copy-static-game-assets',
      closeBundle() {
        // copy static game files that are referenced via <script src="..."> (not imported)
        // vite only copies `public/` — our files live at root/assets/*.js + phaser.min.js
        try {
          mkdirSync('dist/assets', { recursive: true });
          cpSync('assets', 'dist/assets', { recursive: true, force: true });
          if (existsSync('phaser.min.js')) copyFileSync('phaser.min.js', 'dist/phaser.min.js');
          console.log('[copy-static] assets/*.js + phaser.min.js -> dist/');
        } catch (e) {
          console.warn('[copy-static] failed:', e.message);
        }
      },
    },
  ],
});
