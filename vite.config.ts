import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      // index.html = dashboard with Live data; mini.html = paper mini app
      input: { main: 'index.html', mini: 'mini.html' },
    },
  },
});
