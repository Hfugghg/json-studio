import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // 线上部署在 GitHub Pages 的子路径下（https://<user>.github.io/json-studio/），
  // 构建时必须指定 base，否则 JS/CSS 会以根路径请求而 404。开发服务器仍用根路径。
  base: command === 'build' ? '/json-studio/' : '/',
  plugins: [react()],
  server: {
    // 默认仅允许本机访问，避免开发代理将本地文件 API 暴露给局域网。
    host: process.env.JSON_STUDIO_DEV_HOST || '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
    // 忽略 json-files 文件夹的文件变化监听，避免 EBUSY 崩溃
    watch: {
      ignored: ['**/json-files/**'],
    },
  },
}))
