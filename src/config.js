import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Tiny .env loader (no dependencies). Real environment variables win.
try {
  const envFile = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  for (const line of envFile.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch { /* no .env file, that's fine */ }

const dbPath = process.env.DB_PATH || './data/frontdesk.db';

export const config = {
  port: Number(process.env.PORT) || 3000,
  phone: (process.env.FRONTDESK_PHONE || '').trim(),
  apiKey: (process.env.API_KEY || '').trim(),
  dbPath: path.isAbsolute(dbPath) ? dbPath : path.join(ROOT, dbPath),
  dataDir: path.join(ROOT, 'data'),
  publicDir: path.join(ROOT, 'public'),
  timezone: 'America/New_York',
  club: {
    name: 'Club Studio',
    location: 'South Windsor',
    address: '100 Cedar Avenue, South Windsor, CT 06074',
    clubPhone: '(860) 466-7628'
  }
};
