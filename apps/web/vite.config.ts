// apps/web/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  preview: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: ['menuweb-production.up.railway.app', 'atlasqrmenu.com', 'www.atlasqrmenu.com']
  }
});