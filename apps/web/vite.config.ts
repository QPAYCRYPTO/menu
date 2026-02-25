import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    __PUBLIC_API_BASE_URL__: JSON.stringify(process.env.PUBLIC_API_BASE_URL ?? '')
  }
});
