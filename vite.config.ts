import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import * as fs from 'fs';

export default defineConfig({
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
          // Restore images
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
          // Clean up backup
          fs.rmSync(backupDir, { recursive: true, force: true });
        } else {
          // Ensure images directory exists even if no backup
          const operatorsDir = path.resolve(__dirname, 'public/images/operators');
          if (!fs.existsSync(operatorsDir)) {
            fs.mkdirSync(operatorsDir, { recursive: true });
            console.log('⚠️  No backup found, created empty images directory');
          }
        }
      }
    }
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
      },
    },
  },
});

