import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { cwd } from 'node:process'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig((config) => {
  const env = loadEnv(config.mode, cwd(), 'VITE_')
  return {
    plugins: [
      react(),
      babel({ presets: [reactCompilerPreset()] })
    ],
    server: env.VITE_API_URL
      ? {}
      : {
          proxy: {
            '/api': 'http://127.0.0.1:3000',
          },
        },
    test: {
      include: ['src/**/*.test.js', 'server/**/*.test.js'],
    },
  }
})
