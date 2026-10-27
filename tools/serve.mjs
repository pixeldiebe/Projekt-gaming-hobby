// Mini-Server für die lokale Vorschau: node tools/serve.mjs  →  http://localhost:8642
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +process.env.PORT || 8642;
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    const body = await readFile(join(ROOT, path.endsWith('/') ? path + 'index.html' : path));
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'text/html; charset=utf-8' }).end(body);
  } catch {
    res.writeHead(404).end('Nicht gefunden');
  }
}).listen(PORT, () => console.log(`Spieleregal läuft auf http://localhost:${PORT}`));
