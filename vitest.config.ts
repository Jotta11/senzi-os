import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) }

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
          setupFiles: ['src/test/setup.ts'],
          // telas inteiras com digitação simulada: sob carga (suíte paralela) 5 s é pouco
          testTimeout: 15000,
          globals: true,
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'db',
          environment: 'node',
          include: ['tests/db/**/*.test.ts', 'supabase/functions/**/*.test.ts'],
          testTimeout: 30000,
          hookTimeout: 30000,
          globals: true,
        },
      },
    ],
  },
})
