import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    define: {
      // This allows the code to access process.env.API_KEY safely in the browser
      'process.env.API_KEY': JSON.stringify(env.API_KEY)
    }
  };
});