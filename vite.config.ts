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
        // Backup images directory before build
        const imagesDir = path.resolve(__dirname, 'public/images');
        const backupDir = path.resolve(__dirname, 'public/images.backup');
        if (fs.existsSync(imagesDir)) {
          // Remove old backup if exists
          if (fs.existsSync(backupDir)) {
            fs.rmSync(backupDir, { recursive: true, force: true });
          }
          // Copy images to backup
          fs.cpSync(imagesDir, backupDir, { recursive: true });
        }
      },
      writeBundle() {
        // Restore images directory after build
        const imagesDir = path.resolve(__dirname, 'public/images');
        const backupDir = path.resolve(__dirname, 'public/images.backup');
        if (fs.existsSync(backupDir)) {
          // Restore images
          if (fs.existsSync(imagesDir)) {
            fs.rmSync(imagesDir, { recursive: true, force: true });
          }
          fs.cpSync(backupDir, imagesDir, { recursive: true });
          // Clean up backup
          fs.rmSync(backupDir, { recursive: true, force: true });
        } else {
          // Ensure images directory exists even if no backup
          const operatorsDir = path.resolve(__dirname, 'public/images/operators');
          if (!fs.existsSync(operatorsDir)) {
            fs.mkdirSync(operatorsDir, { recursive: true });
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

