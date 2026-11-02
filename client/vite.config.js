import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    fs: { allow: ['..'] }, // lets the client import ../shared/geo.js (same maths as the server)
    proxy: { '/api': { target: 'http://localhost:8080', ws: true, changeOrigin: true } },
  },
});
