import { defineConfig } from 'vite'
import compression from 'vite-plugin-compression'

export default defineConfig({
  publicDir: 'public',

  plugins: [
    // Gzip for maximum browser compatibility
    compression({
      algorithm: 'gzip',
      ext: '.gz',
      threshold: 512, // compress files > 512 bytes
    }),
    // Brotli for modern browsers (smaller than gzip)
    compression({
      algorithm: 'brotliCompress',
      ext: '.br',
      threshold: 512,
    }),
  ],

  build: {
    // Keep the bundle tiny — Jeeliz loads itself dynamically
    target: 'es2017',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: undefined, // single small chunk is fine since Jeeliz is external
      },
    },
  },

  server: {
    headers: {
      // Allow SharedArrayBuffer (needed for some WebGL contexts)
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})
