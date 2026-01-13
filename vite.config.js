import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
  plugins: [
    react(),
    {
      name: 'html-transform',
      transformIndexHtml(html) {
        return html
          .replace('%VITE_UMAMI_WEBSITE_ID%', env.VITE_UMAMI_WEBSITE_ID || '')
          .replace('%VITE_UMAMI_SRC%', env.VITE_UMAMI_SRC || '')
      }
    }
  ],
  optimizeDeps: {
    exclude: ['onnxruntime-web'] // Prevents path errors
  },
  server: {
    // Re-adding these ensures Dev behaves exactly like Prod
    // Using 'credentialless' instead of 'require-corp' to allow external scripts like Umami
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless'
    }
  },
  build: {
    // 1. CRITICAL: Disabling minification fixes "indirect call to null"
    // (WASM often crashes if variable names are shortened)
    minify: false,

    // 2. Ensures your bundle supports the newer WASM syntax
    target: "esnext",

    // 3. Generate source maps for debugging and PageSpeed insights
    sourcemap: true
  }
  }
})