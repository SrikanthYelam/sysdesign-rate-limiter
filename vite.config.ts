import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Backend mode: forward API calls to the NGINX load balancer from
    // backend/docker-compose.yml, so the browser stays on one origin (no CORS).
    proxy: { '/api': 'http://localhost:8080' },
  },
});
