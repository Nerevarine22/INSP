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
    host: true, // Allow access from local network (phone)
    headers: {
      // Allow SharedArrayBuffer (needed for some WebGL contexts)
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  
  // Custom API to save calibration data to local disk
  plugins: [
    {
      name: 'save-calibration-api',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url === '/api/save-calibration' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', async () => {
              try {
                const fs = await import('fs/promises');
                const path = await import('path');
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
    // Gzip for maximum browser compatibility
    compression({
      algorithm: 'gzip',
      ext: '.gz',
      threshold: 512,
    }),
    compression({
      algorithm: 'brotliCompress',
      ext: '.br',
      threshold: 512,
    }),
  ],
})
