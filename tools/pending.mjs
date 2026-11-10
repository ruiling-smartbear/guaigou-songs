// Daily to-do for making songs by hand.
// Saves every waiting song into a folder on this computer (one text file each, plus the drawing if there is one)
// and prints a short reminder that can be read out or forwarded.
//
//   node pending.mjs              # save waiting songs, print the reminder
//   node pending.mjs --json       # same, but print JSON (for another program to read)
//   node pending.mjs --quiet      # print nothing when there is nothing to do
//
// Settings: environment, then config.env beside this script, then the project's secrets.local.txt / .dev.vars.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const args = new Set(process.argv.slice(2));

const vars = {};
for (const f of [path.join(root, '.dev.vars'), path.join(root, 'secrets.local.txt'), path.join(here, 'config.env')]) {
  try {
    for (const line of (await fs.readFile(f, 'utf8')).split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
      if (m) vars[m[1]] = m[2];
    }
  } catch {}
}
const API = (process.env.GG_API || vars.GG_API || 'http://localhost:8791').replace(/\/$/, '');
const TOKEN = process.env.GG_ADMIN_TOKEN || vars.GG_ADMIN_TOKEN || vars.ADMIN_TOKEN;
const SITE = (process.env.GG_SITE || vars.GG_SITE || '').replace(/\/$/, '');
const OUT = path.resolve(process.env.GG_PENDING_DIR || vars.GG_PENDING_DIR || path.join(here, '待做的歌'));
if (!TOKEN) { console.error('缺少管理口令：在 config.env 里填 GG_ADMIN_TOKEN'); process.exit(1); }

const auth = { Authorization: `Bearer ${TOKEN}` };
const safe = (s) => String(s).replace(/[\\/:*?"<>|\n\r]/g, '').trim().slice(0, 40) || '无题';
const when = (iso) => new Date(iso).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const days = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

let jobs;
try {
  const res = await fetch(`${API}/api/admin/jobs`, { headers: auth });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  jobs = data.jobs;
} catch (e) {
  console.error(`连不上网站（${API}）：${e.message}`);
  process.exit(1);
}

const waiting = jobs.filter((j) => j.status === 'queued').sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
const doneDir = path.join(OUT, '已完成');
await fs.mkdir(doneDir, { recursive: true });

// Write one file per waiting song.
const keep = new Set();
for (const j of waiting) {
  const base = `${j.id} ${safe(j.title)}`;
  keep.add(base);
  const text = [
    `歌名：${j.title}`,
    `谁的歌：${j.name}（${({ drawing: '画的', lyrics: '自己写的词' })[j.kind] || '讲的故事'}）`,
    `提交时间：${when(j.createdAt)}`,
    `取歌号码：${j.code}`,
    `做好后的文件名：${base}.mp3`,
    '',
    '—— 风格（粘到 Style of Music）——',
    j.tags || '',
    '',
    '—— 歌词（粘到 Lyrics）——',
    j.lyrics || '',
    ...(j.story ? ['', '—— 对方原本说的 / 写的 ——', j.story] : []),
    '',
  ].join('\n');
  await fs.writeFile(path.join(OUT, `${base}.txt`), text);
  if (j.hasDrawing) {
    try {
      const r = await fetch(`${API}/api/admin/jobs/${j.id}/drawing`, { headers: auth });
      if (r.ok) await fs.writeFile(path.join(OUT, `${base}.jpg`), Buffer.from(await r.arrayBuffer()));
    } catch {}
  }
}

// Songs that are no longer waiting move to 已完成, so the folder only shows what is left to do.
let moved = 0;
for (const name of await fs.readdir(OUT)) {
  const ext = path.extname(name);
  if (!['.txt', '.jpg'].includes(ext) || keep.has(name.slice(0, -ext.length))) continue;
  await fs.rename(path.join(OUT, name), path.join(doneDir, name)).catch(() => {});
  if (ext === '.txt') moved++;
}

const oldest = waiting[0];
const summary = {
  waiting: waiting.length,
  total: jobs.length,
  folder: OUT,
  admin: SITE ? `${SITE}/admin.html` : '',
  songs: waiting.map((j) => ({ id: j.id, title: j.title, from: j.name, code: j.code, submitted: j.createdAt, waitingDays: days(j.createdAt), file: `${j.id} ${safe(j.title)}.txt` })),
};

if (args.has('--json')) {
  console.log(JSON.stringify(summary, null, 2));
} else if (!waiting.length) {
  if (!args.has('--quiet')) console.log('今天没有待做的歌。');
} else {
  const lines = [
    `怪狗唱片：有 ${waiting.length} 首歌在等你做。`,
    ...waiting.map((j, i) => `${i + 1}. 《${j.title}》 ${j.name}，${days(j.createdAt) >= 1 ? `已等 ${days(j.createdAt)} 天` : '今天提交'}`),
    '',
    `歌词和风格已存在：${OUT}`,
    ...(summary.admin ? [`待做清单：${summary.admin}`] : []),
    '做好后把 mp3 按文件里写的名字存到「下载」文件夹，或直接拖到待做清单页对应的卡片上。',
    ...(oldest && days(oldest.createdAt) >= 2 ? [`最早的一首《${oldest.title}》已经等了 ${days(oldest.createdAt)} 天。`] : []),
  ];
  console.log(lines.join('\n'));
}
