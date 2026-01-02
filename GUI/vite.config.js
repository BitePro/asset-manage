import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import * as fs from 'fs';
import * as path from 'path';

export default defineConfig({
  plugins: [
    react(),
    // 开发模式下生成一个特殊的 HTML 文件供扩展使用
    {
      name: 'dev-html-generator',
      apply: 'serve',
      configureServer(server) {
        // 监听服务器启动
        server.httpServer?.once('listening', () => {
          const address = server.httpServer?.address();
          if (address && typeof address === 'object') {
            const devServerUrl = `http://localhost:${address.port}`;
            
            // 生成开发模式的 HTML 文件
            const devHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AssetLens Panel (Dev)</title>
  <!-- PDF.js CDN -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  <script>
    // 配置 PDF.js worker
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  </script>
  <script type="module">
    // 连接到 Vite 开发服务器
    import RefreshRuntime from '${devServerUrl}/@react-refresh'
    RefreshRuntime.injectIntoGlobalHook(window)
    window.$RefreshReg$ = () => {}
    window.$RefreshSig$ = () => (type) => type
    window.__vite_plugin_react_preamble_installed__ = true
  </script>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="${devServerUrl}/src/main.tsx"></script>
</body>
</html>`;
            
            // 写入到 dist 目录
            const distDir = path.resolve(__dirname, 'dist');
            if (!fs.existsSync(distDir)) {
              fs.mkdirSync(distDir, { recursive: true });
            }
            fs.writeFileSync(path.join(distDir, 'index.html'), devHtml);
            
            console.log(`\n✨ Dev HTML generated for VSCode extension`);
            console.log(`📍 Dev server: ${devServerUrl}`);
            console.log(`📄 Dev HTML: ${path.join(distDir, 'index.html')}\n`);
          }
        });
      }
    }
  ],
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    }
  },
  base: './',
  server: {
    port: 5173,
    strictPort: false,
    cors: true
  }
});