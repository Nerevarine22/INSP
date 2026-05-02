import { defineConfig } from 'vite'
import compression from 'vite-plugin-compression'
import fs from 'fs/promises'
import path from 'path'

export default defineConfig({
  publicDir: 'public',

  plugins: [
    // 1. Custom API to save calibration data to local disk
    {
      name: 'save-calibration-api',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url === '/api/save-calibration' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', async () => {
              try {
                const filePath = path.join(process.cwd(), 'calibration_data.json');
                
                let existingData = [];
                try {
                  const content = await fs.readFile(filePath, 'utf-8');
                  existingData = JSON.parse(content);
                } catch (e) {
                  // File doesn't exist yet
                }
                
                const newData = JSON.parse(body);
                existingData.push({
                  id: Date.now(),
                  timestamp: new Date().toISOString(),
                  ...newData
                });
                
                await fs.writeFile(filePath, JSON.stringify(existingData, null, 2));
                
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, count: existingData.length }));
              } catch (err) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err.message }));
              }
            });
          } else {
            next();
          }
        });
      }
    },
    // 2. Gzip for maximum browser compatibility
    compression({
      algorithm: 'gzip',
      ext: '.gz',
      threshold: 512,
    }),
    // 3. Brotli for modern browsers
    compression({
      algorithm: 'brotliCompress',
      ext: '.br',
      threshold: 512,
    }),
  ],

  build: {
    target: 'es2017',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },

  server: {
    host: true, // Allow access from local network (phone)
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})
