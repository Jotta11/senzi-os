import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { buildManifest } from './src/pwa/manifest'

/**
 * App instalável: serve/emite o manifesto e, no build, gera o service worker com a lista de arquivos
 * da versão (cada build tem um id novo → o app avisa "Nova versão disponível").
 */
function pwa(startUrl: string): Plugin {
  const manifest = JSON.stringify(buildManifest(startUrl), null, 2)
  return {
    name: 'senzi-pwa',
    configureServer(server) {
      server.middlewares.use('/manifest.webmanifest', (_req, res) => {
        res.setHeader('Content-Type', 'application/manifest+json')
        res.end(manifest)
      })
    },
    generateBundle(_options, bundle) {
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifest })
      const files = Object.keys(bundle).filter((f) => /\.(js|css|woff2?)$/.test(f))
      const precache = ['/', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/icons/apple-touch-icon.png', ...files.map((f) => `/${f}`)]
      const template = readFileSync(fileURLToPath(new URL('./src/pwa/sw.js', import.meta.url)), 'utf8')
      const source = template
        .replace("'__BUILD_ID__'", `'${Date.now().toString(36)}'`)
        .replace('const PRECACHE = __PRECACHE__', `const PRECACHE = ${JSON.stringify(precache)}`)
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  // Sem Supabase configurado o sistema real só mostra "Configurar conexão"; o app instalado abre na prévia.
  const startUrl = env.VITE_PWA_START_URL || (env.VITE_SUPABASE_URL ? '/' : '/preview')
  return {
    plugins: [react(), pwa(startUrl)],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
  }
})
