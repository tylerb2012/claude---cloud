/** Builds the paper-trader page as one script with React loaded from a CDN (npm run build:paper). */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: 'dist-paper',
    cssCodeSplit: false,
    rollupOptions: {
      input: 'src/mini-main.tsx',
      external: ['react', 'react-dom', 'react-dom/client'],
      output: {
        format: 'iife',
        entryFileNames: 'paper.js',
        assetFileNames: 'paper.[ext]',
        globals: { react: 'React', 'react-dom': 'ReactDOM', 'react-dom/client': 'ReactDOM' },
      },
    },
  },
});
