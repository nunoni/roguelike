// Zero-dependency static server for local play:  node tools/serve.js [port]
// With `--dev <dir>` it also accepts debug reports (logs, canvas captures) from
// the page, which is how automated visual checks get pixels out of a headless browser.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const devIdx = args.indexOf('--dev');
const devDir = devIdx >= 0 ? path.resolve(args[devIdx + 1]) : null;
const port = Number(args.find((a, i) => /^\d+$/.test(a) && i !== devIdx + 1)) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (devDir && req.method === 'POST' && url.pathname.startsWith('/__dev/')) {
    const body = await readBody(req);
    const name = (url.searchParams.get('name') || 'out').replace(/[^\w.-]/g, '_');
    if (url.pathname === '/__dev/shot') {
      const b64 = body.toString('utf8').replace(/^data:image\/png;base64,/, '');
      fs.writeFileSync(path.join(devDir, name + '.png'), Buffer.from(b64, 'base64'));
    } else {
      fs.appendFileSync(path.join(devDir, name + '.log'), body.toString('utf8') + '\n');
    }
    res.writeHead(204).end();
    return;
  }
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(root, rel);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Neon Heartstorm running at http://localhost:${port}${devDir ? '  (dev reports -> ' + devDir + ')' : ''}`);
});
