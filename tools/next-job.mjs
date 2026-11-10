// Prints the next waiting song as JSON, for any tool that wants to pick up requests.
//
//   node tools/next-job.mjs            # next waiting song, or {"job":null} if none
//   node tools/next-job.mjs --wait     # block until a new request arrives, then print it
//   node tools/next-job.mjs --all      # every waiting song
//   node tools/next-job.mjs --status 12   # has song 12 received its audio yet?
//   node tools/next-job.mjs --release 12  # give song 12 back to the queue (e.g. generation failed)
//   node tools/next-job.mjs --reset    # forget which songs were already handed out
//
// A song is handed out once (remembered in tools/.handed.json) so the same request isn't made twice.
// Save the finished audio as the printed "saveAs" name in your Downloads folder and
// tools/auto-upload.mjs will attach it to the right song.
// Uses GG_API / GG_ADMIN_TOKEN, or the local dev server and .dev.vars when they are not set.
import fs from 'node:fs/promises';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.dirname(here);
const stateFile = path.join(here, '.handed.json');
const argv = process.argv.slice(2);
const args = new Set(argv);
const argAfter = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? Number(argv[i + 1]) : NaN; };

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
if (!TOKEN) { console.error('缺少管理口令：在 config.env 里填 GG_ADMIN_TOKEN'); process.exit(1); }

if (args.has('--reset')) { await fs.rm(stateFile, { force: true }); console.log('{"reset":true}'); process.exit(0); }

const handed = new Set(JSON.parse(await fs.readFile(stateFile, 'utf8').catch(() => '[]')));
const shape = (j) => ({
  id: j.id,
  from: j.name,
  title: j.title,
  style: j.tags,
  lyrics: j.lyrics,
  saveAs: `${j.id} ${j.title.replace(/[\\/:*?"<>|]/g, '')}.mp3`,
});

async function allJobs() {
  const res = await fetch(`${API}/api/admin/jobs`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data.jobs;
}
const waiting = async () => (await allJobs()).filter((j) => j.status === 'queued').sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
const pulse = async () => (await (await fetch(`${API}/api/admin/pulse`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json()).pulse;

if (args.has('--status')) {
  const id = argAfter('--status');
  const j = (await allJobs()).find((x) => x.id === id);
  console.log(JSON.stringify(j ? { id, title: j.title, uploaded: j.status === 'done' } : { id, error: '没有这首歌' }));
  process.exit(0);
}
if (args.has('--release')) {
  const id = argAfter('--release');
  handed.delete(id);
  await fs.writeFile(stateFile, JSON.stringify([...handed]));
  console.log(JSON.stringify({ released: id }));
  process.exit(0);
}

if (args.has('--all')) {
  console.log(JSON.stringify({ jobs: (await waiting()).map(shape) }, null, 2));
  process.exit(0);
}

// While waiting, only the tiny "pulse" value is polled; the full list is fetched when it changes.
let lastPulse = null;
for (;;) {
  let job = null;
  try {
    const p = args.has('--wait') ? await pulse() : NaN;
    if (p !== lastPulse) {
      job = (await waiting()).find((j) => !handed.has(j.id)) || null;
      lastPulse = p;
    }
  } catch (e) {
    if (!args.has('--wait')) { console.error('连不上网站：' + e.message); process.exit(1); }
  }
  if (job) {
    handed.add(job.id);
    await fs.writeFile(stateFile, JSON.stringify([...handed]));
    console.log(JSON.stringify({ job: shape(job) }, null, 2));
    process.exit(0);
  }
  if (!args.has('--wait')) { console.log('{"job":null}'); process.exit(0); }
  await new Promise((r) => setTimeout(r, 10000));
}
