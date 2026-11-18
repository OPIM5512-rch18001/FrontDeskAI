import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { config } from './src/config.js';
import { initDb } from './src/db.js';
import { handleApi } from './src/api.js';

initDb();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain'
};

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  let file = path.normalize(path.join(config.publicDir, rel));
  if (!file.startsWith(config.publicDir)) { res.writeHead(403); return res.end('Forbidden'); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (path.extname(rel)) { res.writeHead(404); return res.end('Not found'); }
    file = path.join(config.publicDir, 'index.html'); // single-page app fallback
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  serveStatic(req, res, url);
});

server.listen(config.port, '0.0.0.0', () => {
  const lan = Object.values(os.networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal)?.address;
  console.log('\n  Club Studio × FrontDesk AI  (unaffiliated class demo)\n');
  console.log(`  Website:   http://localhost:${config.port}`);
  console.log(`  Staff:     http://localhost:${config.port}/#/staff`);
  if (lan) console.log(`  On LAN:    http://${lan}:${config.port}`);
  console.log(`  Endpoint:  POST /api/bookings   (API key ${config.apiKey ? 'REQUIRED' : 'not required'})`);
  console.log(`  Phone:     ${config.phone || '(not set: showing placeholder)'}\n`);
});
