// Builds pages/dist: a copy of docs/ plus the Pages entry file.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, 'pages', 'dist');
await fs.rm(out, { recursive: true, force: true });
await fs.cp(path.join(root, 'docs'), out, { recursive: true });
await fs.copyFile(path.join(root, 'pages', '_worker.js'), path.join(out, '_worker.js'));
const files = await fs.readdir(out, { recursive: true });
console.log(`pages/dist ready: ${files.length} files`);
