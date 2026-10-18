import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// En dev, Vite sirve la UI (5173) y proxya la API a Express (3000) para evitar CORS.
// En producción, Express sirve `web/dist` y la UI llama a la API en el mismo origen.
const API_TARGET = process.env.VITE_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/solicitudes': API_TARGET,
      '/health': API_TARGET,
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
