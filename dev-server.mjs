// Local dev: serves docs/ and runs the Worker with a folder-backed fake R2 bucket.
// Usage: node dev-server.mjs [port]
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import worker from './worker/src/index.js';

const root = path.dirname(new URL(import.meta.url).pathname);
const port = Number(process.argv[2] || process.env.PORT || 8787);
const dataDir = path.join(root, '.data');

const env = {};
try {
  for (const line of (await fs.readFile(path.join(root, '.dev.vars'), 'utf8')).split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && m[2]) env[m[1]] = m[2];
  }
} catch {}

const file = (key) => path.join(dataDir, key.replace(/\.\./g, ''));
env.BUCKET = {
  async get(key, opts = {}) {
    try {
      const full = await fs.readFile(file(key));
      const r = opts.range;
      let buf = full;
      if (r) {
        const start = 'suffix' in r ? Math.max(0, full.length - r.suffix) : r.offset;
        if (start >= full.length) throw new RangeError('range');
        buf = full.subarray(start, r.length !== undefined ? start + r.length : undefined);
      }
      let meta = {};
      try { meta = JSON.parse(await fs.readFile(file(key) + '.meta')); } catch {}
      return {
        body: new Blob([buf]).stream(), httpMetadata: meta, size: full.length, range: r,
        text: async () => buf.toString(), json: async () => JSON.parse(buf.toString()),
        arrayBuffer: async () => buf,
      };
    } catch (e) { if (e instanceof RangeError) throw e; return null; }
  },
  async put(key, value, opts = {}) {
    await fs.mkdir(path.dirname(file(key)), { recursive: true });
    const buf = typeof value === 'string' ? value : Buffer.from(value instanceof ArrayBuffer ? new Uint8Array(value) : value);
    await fs.writeFile(file(key), buf);
    if (opts.httpMetadata) await fs.writeFile(file(key) + '.meta', JSON.stringify(opts.httpMetadata));
  },
  async delete(key) { await fs.rm(file(key), { force: true }); await fs.rm(file(key) + '.meta', { force: true }); },
  async list({ prefix }) {
    let names = [];
    try { names = await fs.readdir(file(prefix)); } catch {}
    return { objects: names.filter((n) => !n.endsWith('.meta')).map((n) => ({ key: prefix + n })), truncated: false };
  },
};

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname.startsWith('/api/')) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const r = await worker.fetch(new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env);
    res.writeHead(r.status, Object.fromEntries(r.headers));
    if (r.body) Readable.fromWeb(r.body).pipe(res); else res.end();
    return;
  }
  let p = path.join(root, 'docs', decodeURIComponent(url.pathname));
  if (p.endsWith('/')) p += 'index.html';
  try {
    const buf = await fs.readFile(p);
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(port, () => console.log(`怪狗唱片 dev server: http://localhost:${port}  (MOCK=${env.MOCK || 0})`));
