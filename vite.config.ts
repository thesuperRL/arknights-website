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
        // Restore images directory after build completes
        const imagesDir = path.resolve(__dirname, 'public/images');
        const backupDir = path.resolve(__dirname, '.images-backup');
        if (fs.existsSync(backupDir)) {
          console.log('📦 Restoring images directory...');
          // Ensure images directory exists
          if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir, { recursive: true });
          }
          
          // Restore operators directory
          const operatorsDir = path.join(imagesDir, 'operators');
          if (fs.existsSync(operatorsDir)) {
            fs.rmSync(operatorsDir, { recursive: true, force: true });
          }
          const backupOperatorsDir = path.join(backupDir, 'operators');
          if (fs.existsSync(backupOperatorsDir)) {
            fs.mkdirSync(operatorsDir, { recursive: true });
            fs.cpSync(backupOperatorsDir, operatorsDir, { recursive: true });
            const fileCount = fs.readdirSync(operatorsDir).length;
            console.log(`✅ Restored ${fileCount} operator images`);
          }
          
          // Restore modules directory
          const modulesDir = path.join(imagesDir, 'modules');
          if (fs.existsSync(modulesDir)) {
            fs.rmSync(modulesDir, { recursive: true, force: true });
          }
          const backupModulesDir = path.join(backupDir, 'modules');
          if (fs.existsSync(backupModulesDir)) {
            fs.mkdirSync(modulesDir, { recursive: true });
            fs.cpSync(backupModulesDir, modulesDir, { recursive: true });
            const fileCount = fs.readdirSync(modulesDir).length;
            console.log(`✅ Restored ${fileCount} module images`);
          }
          
          // Restore E2.png and other root-level images
          const backupE2 = path.join(backupDir, 'E2.png');
          if (fs.existsSync(backupE2)) {
            fs.copyFileSync(backupE2, path.join(imagesDir, 'E2.png'));
            console.log('✅ Restored E2.png badge');
          }
          
          // Clean up backup
          fs.rmSync(backupDir, { recursive: true, force: true });
        } else {
          // Ensure images directory exists even if no backup
          const operatorsDir = path.resolve(__dirname, 'public/images/operators');
          const modulesDir = path.resolve(__dirname, 'public/images/modules');
          if (!fs.existsSync(operatorsDir)) {
            fs.mkdirSync(operatorsDir, { recursive: true });
          }
          if (!fs.existsSync(modulesDir)) {
            fs.mkdirSync(modulesDir, { recursive: true });
          }
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
