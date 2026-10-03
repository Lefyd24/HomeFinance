/// <reference types="vitest/config" />
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Dev-only: where `vite dev` forwards /api and /health. 8223 is the backend's
// default everywhere else (Dockerfile, docker-compose, .env.example); override
// with BACKEND_PORT if your local .env uses a different one.
const backendTarget = `http://localhost:${process.env.BACKEND_PORT ?? '8224'}`

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/health': {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.ts',
    pool: 'forks',
    // Node 25+ ships its own global localStorage (empty and unusable without
    // --localstorage-file), which shadows jsdom's and breaks every component
    // that reads storage. Turn it off in the test workers.
    execArgv: ['--no-experimental-webstorage'],
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 15_000,
    teardownTimeout: 5_000,
  },
})
