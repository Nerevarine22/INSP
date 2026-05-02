import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const DIST_PATH = path.join(__dirname, 'dist');
const DATA_FILE = path.join(__dirname, 'calibration_data.json');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
};

const server = http.createServer(async (req, res) => {
  console.log(`${req.method} ${req.url}`);

  // 1. API Endpoint for saving data
  if (req.url === '/api/save-calibration' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        let existingData = [];
        try {
          const content = await fs.readFile(DATA_FILE, 'utf-8');
          existingData = JSON.parse(content);
        } catch (e) {}

        const newData = JSON.parse(body);
        existingData.push({
          id: Date.now(),
          timestamp: new Date().toISOString(),
          source: 'production-server',
          ...newData
        });

        await fs.writeFile(DATA_FILE, JSON.stringify(existingData, null, 2));
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, count: existingData.length }));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 2. Serve the dynamic JSON file itself
  if (req.url === '/calibration_data.json') {
    try {
      const content = await fs.readFile(DATA_FILE, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(content);
    } catch (e) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: "No data yet" }));
    }
    return;
  }

  // 3. Static File Server (serving /dist)
  let filePath = path.join(DIST_PATH, req.url === '/' ? 'index.html' : req.url);
  
  // Handle SPA routing (redirect all unknown to index.html if no extension)
  const ext = path.extname(filePath);
  if (!ext) filePath = path.join(DIST_PATH, 'index.html');

  try {
    const content = await fs.readFile(filePath);
    const contentType = MIME_TYPES[path.extname(filePath)] || 'application/octet-stream';
    
    // Crucial for MediaPipe Wasm in production
    res.writeHead(200, { 
      'Content-Type': contentType,
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    });
    res.end(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.writeHead(404);
      res.end('404 Not Found');
    } else {
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  🚀 Production Server running at http://localhost:${PORT}
  Serving from: ${DIST_PATH}
  Saving to: ${DATA_FILE}
  `);
});
