import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import * as fs from 'fs';

export default defineConfig({
  // GitHub Pages: /arknights-website/ ; local dev: /
  base: process.env.NODE_ENV === 'production' ? '/arknights-website/' : '/',
  plugins: [
    react(),
    // Plugin to preserve images directory during build
    {
      name: 'preserve-images',
      buildStart() {
        // Backup images directory before build (outside of public to avoid deletion)
        const imagesDir = path.resolve(__dirname, 'public/images');
        const backupDir = path.resolve(__dirname, '.images-backup');
        if (fs.existsSync(imagesDir)) {
          console.log('📦 Backing up images directory...');
          // Remove old backup if exists
          if (fs.existsSync(backupDir)) {
            fs.rmSync(backupDir, { recursive: true, force: true });
          }
          // Copy images to backup (outside public directory)
          fs.cpSync(imagesDir, backupDir, { recursive: true });
          console.log(`✅ Backed up ${fs.readdirSync(backupDir).length} items`);
        }
      },
      closeBundle() {
        // GitHub Pages: serve SPA for any path so client-side routing works (no 404 on /profile etc.)
        const outDir = path.resolve(__dirname, 'public');
        const indexPath = path.join(outDir, 'index.html');
        const notFoundPath = path.join(outDir, '404.html');
        if (fs.existsSync(indexPath)) {
          fs.copyFileSync(indexPath, notFoundPath);
          console.log('✅ 404.html created for client-side routing');
        }

        // Restore entire images directory after build (IStitles, ISsquads, operators, modules, E2.png, etc.)
        const imagesDir = path.resolve(__dirname, 'public/images');
        const backupDir = path.resolve(__dirname, '.images-backup');
        if (fs.existsSync(backupDir)) {
          console.log('📦 Restoring images directory...');
          if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir, { recursive: true });
          }
          const items = fs.readdirSync(backupDir);
          for (const item of items) {
            const src = path.join(backupDir, item);
            const dest = path.join(imagesDir, item);
            if (fs.statSync(src).isDirectory()) {
              if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
              fs.mkdirSync(dest, { recursive: true });
              fs.cpSync(src, dest, { recursive: true });
            } else {
              fs.copyFileSync(src, dest);
            }
          }
          console.log(`✅ Restored ${items.length} items (operators, modules, IStitles, ISsquads, etc.)`);
          fs.rmSync(backupDir, { recursive: true, force: true });
        } else {
          const operatorsDir = path.resolve(__dirname, 'public/images/operators');
          const modulesDir = path.resolve(__dirname, 'public/images/modules');
          if (!fs.existsSync(operatorsDir)) fs.mkdirSync(operatorsDir, { recursive: true });
          if (!fs.existsSync(modulesDir)) fs.mkdirSync(modulesDir, { recursive: true });
          console.log('⚠️  No backup found, created empty images directories');
        }
      }
    },
  ],
  root: 'src/frontend',
  build: {
    outDir: '../../public',
    emptyOutDir: true, // Vite will empty, but we restore images after
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        // Don't proxy /api.ts — it's a frontend source file; let Vite 404 it instead of hitting the backend
        bypass(req, _res) {
          return req.url === '/api.ts' ? req.url : undefined;
        },
      },
      '/images': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
