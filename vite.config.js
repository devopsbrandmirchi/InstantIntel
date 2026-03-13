// import { defineConfig } from 'vite'
// import react from '@vitejs/plugin-react'

// export default defineConfig({
//   plugins: [react()],
//   server: {
//     port: 3000,
//     open: true
//   }
// })

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync } from 'fs'
import { join } from 'path'

// Copy index.html to 404.html so GitHub Pages serves the SPA for direct/refresh URLs
function githubPagesSpafallback() {
  return {
    name: 'github-pages-spa-fallback',
    closeBundle() {
      const outDir = join(process.cwd(), 'dist')
      const index = join(outDir, 'index.html')
      const notFound = join(outDir, '404.html')
      if (existsSync(index)) {
        copyFileSync(index, notFound)
      }
    }
  }
}

const isProd = process.env.NODE_ENV === 'production'

export default defineConfig({
  base: isProd ? '/instanintelsupabase/' : '/',   // subpath only for GitHub Pages build
  plugins: [react(), githubPagesSpafallback()],
  server: {
    port: 3000,
    open: true
  }
})

