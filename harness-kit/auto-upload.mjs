// Watches a folder (your Downloads by default). When a song file whose name matches a waiting song's
// title shows up, it is uploaded to that song automatically. Nothing is moved or deleted.
//
//   node tools/auto-upload.mjs                # watch ~/Downloads, talk to the local dev server
//   GG_API=https://xxx.workers.dev GG_ADMIN_TOKEN=... node tools/auto-upload.mjs [folder]
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.dirname(here);
// Settings come from the environment first, then config.env beside this script, then the project's .dev.vars.
const vars = {};
for (const f of [path.join(root, '.dev.vars'), path.join(here, 'config.env')]) {
  try {
    for (const line of (await fs.readFile(f, 'utf8')).split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
      if (m) vars[m[1]] = m[2];
    }
  } catch {}
}
const API = (process.env.GG_API || vars.GG_API || 'http://localhost:8791').replace(/\/$/, '');
const TOKEN = process.env.GG_ADMIN_TOKEN || vars.GG_ADMIN_TOKEN || vars.ADMIN_TOKEN;
const DIR = path.resolve(process.argv[2] || path.join(os.homedir(), 'Downloads'));
const TYPES = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4' };
const startedAt = Date.now();
const seen = new Map(); // path -> last size, to wait until the download has finished writing
const handled = new Set();

if (!TOKEN) { console.error('缺少管理口令：在 config.env 里填 GG_ADMIN_TOKEN'); process.exit(1); }

const now = () => new Date().toLocaleTimeString('zh-CN', { hour12: false });
const say = (...a) => console.log(`[${now()}]`, ...a);
// "院子里的光 (1).mp3" / "院子里的光-v2" / "12 院子里的光" all reduce to the same key.
const norm = (s) => s.normalize('NFKC').toLowerCase()
  .replace(/\.(mp3|wav|m4a)$/i, '').replace(/\s*\(\d+\)\s*$/, '').replace(/[《》\s_\-·,，.。!！?？'"“”]/g, '');

async function api(pathname, opts = {}) {
  const res = await fetch(API + pathname, { ...opts, headers: { Authorization: `Bearer ${TOKEN}`, ...(opts.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function match(file, jobs) {
  const key = norm(file);
  const byId = file.match(/^\s*(\d+)(?=\D)/);
  const waiting = jobs.filter((j) => j.status === 'queued');
  if (byId) {
    const j = jobs.find((x) => x.id === Number(byId[1]) && norm(x.title) && key.includes(norm(x.title)));
    if (j) return { job: j };
  }
  const hits = waiting.filter((j) => norm(j.title) && norm(j.title) === key);
  if (hits.length === 1) return { job: hits[0] };
  if (hits.length > 1) return { reason: `有 ${hits.length} 首待做的歌都叫《${hits[0].title}》，请把文件名改成以序号开头，比如 "${hits[0].id} ${file}"` };
  const done = jobs.find((j) => j.status === 'done' && norm(j.title) === key);
  if (done) return { reason: `《${done.title}》已经有音频了，跳过（Suno 一次给两版，只用第一版）` };
  return {};
}

async function tick() {
  let names;
  try { names = await fs.readdir(DIR); } catch (e) { say('读不到文件夹：', e.message); return; }
  const fresh = [];
  for (const name of names) {
    const ext = path.extname(name).toLowerCase();
    if (!TYPES[ext] || name.startsWith('.')) continue;
    const full = path.join(DIR, name);
    if (handled.has(full)) continue;
    const st = await fs.stat(full).catch(() => null);
    if (!st || !st.isFile() || st.mtimeMs < startedAt - 2000) continue;
    const stable = seen.get(full) === st.size && st.size > 0;
    seen.set(full, st.size);
    if (stable) fresh.push({ name, full, type: TYPES[ext] });
  }
  if (!fresh.length) return;

  let jobs;
  try { jobs = (await api('/api/admin/jobs')).jobs; } catch (e) { say('连不上网站：', e.message); return; }
  for (const f of fresh) {
    const { job, reason } = match(f.name, jobs);
    handled.add(f.full);
    if (!job) { say(reason || `"${f.name}" 对不上任何待做的歌，跳过`); continue; }
    try {
      await api(`/api/admin/jobs/${job.id}/audio`, { method: 'PUT', headers: { 'Content-Type': f.type }, body: await fs.readFile(f.full) });
      job.status = 'done';
      say(`已上传 "${f.name}" →《${job.title}》（${job.name}，取歌号码 ${job.code}）`);
    } catch (e) {
      handled.delete(f.full);
      say(`"${f.name}" 上传失败：${e.message}，稍后重试`);
    }
  }
}

say(`开始盯着 ${DIR}`);
say(`网站：${API}。把 Suno 下载的歌保存到这个文件夹，文件名保持歌名不变就行。按 Ctrl+C 停止。`);
try {
  const { jobs } = await api('/api/admin/jobs');
  const w = jobs.filter((j) => j.status === 'queued');
  say(w.length ? `现在有 ${w.length} 首待做：${w.map((j) => `《${j.title}》`).join(' ')}` : '现在没有待做的歌');
} catch (e) { say('连不上网站：', e.message); }
setInterval(tick, 3000);
