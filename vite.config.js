import { defineConfig } from 'vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

/** GitHub-Project-Pages: BASE_PATH=/repo-name/ setzen (z. B. in CI). Lokal weglassen → '/'. */
/** GitHub Actions setzt das automatisch; lokal leer → Fallback in buildVersion.js */
const ciBuildNum = process.env.GITHUB_RUN_NUMBER || ''

const rawBase = process.env.BASE_PATH?.trim()
const base =
  rawBase && rawBase !== '/'
    ? rawBase.endsWith('/')
      ? rawBase
      : `${rawBase}/`
    : '/'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
}

function patchManifestForBase() {
  return {
    name: 'patch-manifest-base',
    closeBundle() {
      if (base === '/') return
      const manifestPath = resolve(__dirname, 'dist/manifest.json')
      if (!existsSync(manifestPath)) return
      const m = JSON.parse(readFileSync(manifestPath, 'utf-8'))
      const prefix = base.replace(/\/$/, '')
      const withPrefix = (p) =>
        typeof p === 'string' && p.startsWith('/') ? `${prefix}${p}` : p
      if (m.action) {
        if (m.action.icon) m.action.icon = withPrefix(m.action.icon)
        if (m.action.popover) m.action.popover = withPrefix(m.action.popover)
      }
      if (ciBuildNum) {
        m.version = `1.0.${ciBuildNum}`
        const baseDesc = String(m.description || '')
          .replace(/^\[b\d+\]\s*/i, '')
          .replace(/^\[v[\d.]+\]\s*/i, '')
        m.description = `[b${ciBuildNum}] ${baseDesc}`.trim()
      }
      writeFileSync(manifestPath, `${JSON.stringify(m, null, 2)}\n`)
    },
  }
}

export default defineConfig({
  base,
  define: {
    __CI_BUILD_NUM__: JSON.stringify(ciBuildNum),
  },
  plugins: [basicSsl(), patchManifestForBase()],
  server: {
    host: true,
    headers: corsHeaders,
  },
  preview: {
    host: true,
    headers: corsHeaders,
  },
})
