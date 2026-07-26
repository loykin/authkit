import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
  },
  resolve: {
    alias: {
      // Import directly from source — no rebuild needed during development
      '@loykin/authkit/react': resolve(__dirname, '../src/react/index.ts'),
      '@loykin/authkit/testing': resolve(__dirname, '../src/testing/index.ts'),
      '@loykin/authkit': resolve(__dirname, '../src/index.ts'),
      '@': resolve(__dirname, './src'),
    },
  },
})
