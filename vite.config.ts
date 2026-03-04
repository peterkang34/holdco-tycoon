/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
        }
      }
    }
  },
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'frontend',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
      {
        extends: true,
        test: {
          name: 'api',
          environment: 'node',
          include: ['api/__tests__/**/*.test.ts'],
          setupFiles: ['api/__tests__/setup.ts'],
        },
      },
    ],
  },
})
