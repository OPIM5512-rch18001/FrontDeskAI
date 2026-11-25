import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { config } from './src/config.js';
import { initDb } from './src/db.js';
import { handleApi } from './src/api.js';

if (process.env.RENDER === 'true' && (!config.apiKey || !process.env.STAFF_PASSWORD?.trim())) {
  throw new Error('Set API_KEY and STAFF_PASSWORD in Render before starting FrontDesk AI.');
}

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

const agentPort = Number(process.env.RETELL_PORT || 0);
const host = process.env.HOST || (agentPort ? '127.0.0.1' : '0.0.0.0');
if (agentPort && !config.apiKey) throw new Error('Set API_KEY before starting the Retell listener.');

if (agentPort) {
  const retellServer = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const callable = req.method === 'POST' && ['/api/bookings', '/api/availability'].includes(url.pathname);
    if (!callable) { res.writeHead(404); return res.end('Not found'); }
    // This listener deliberately accepts the key in a header only.
    if (req.headers['x-api-key'] !== config.apiKey) { res.writeHead(401); return res.end('Unauthorized'); }
    return handleApi(req, res, url);
  });
  retellServer.listen(agentPort, '127.0.0.1', () => {
    console.log(`  Retell tools only: http://127.0.0.1:${agentPort}`);
  });
}

server.listen(config.port, host, () => {
  const lan = Object.values(os.networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal)?.address;
  console.log('\n  Club Studio × FrontDesk AI  (unaffiliated class demo)\n');
  console.log(`  Website:   http://localhost:${config.port}`);
  console.log(`  Staff:     http://localhost:${config.port}/#/staff`);
  if (lan && host === '0.0.0.0') console.log(`  On LAN:    http://${lan}:${config.port}`);
  console.log(`  Endpoint:  POST /api/bookings   (API key ${config.apiKey ? 'REQUIRED' : 'not required'})`);
  console.log(`  Phone:     ${config.phone || '(not set: showing placeholder)'}\n`);
});
