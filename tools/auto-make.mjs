// 怪狗唱片 · 自动做歌守护进程
//
//   node tools/auto-make.mjs          # 前台跑
//   nohup node tools/auto-make.mjs > logs/auto-make.log 2>&1 &
//
// 每分钟查一次线上队列；发现新的待做歌曲就：
//   Suno 生成 → 等完成 → 取 WAV → 转 mp3 → 上传网站 → 确认 done
// 全程用接口，不动浏览器窗口；模型不参与，只有出错时日志里会写明。
//
// 设置：环境变量 GG_API / GG_ADMIN_TOKEN，或本目录上一级的 secrets.local.txt / .dev.vars。
import { execFileSync } from 'node:child_process';
import { writeFileSync, existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.dirname(here);
const STATE = path.join(root, 'logs', 'auto-make-state.json');
const LOGDIR = path.join(root, 'logs');
const SUNO = 'https://studio-api.prod.suno.com';

const say = (...a) => console.log(`[${new Date().toLocaleString('zh-CN', { hour12: false })}]`, ...a);

const vars = {};
for (const f of [path.join(root, '.dev.vars'), path.join(root, 'secrets.local.txt')]) {
  try {
    for (const line of (await fs.readFile(f, 'utf8')).split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
      if (m) vars[m[1]] = m[2];
    }
  } catch {}
}
const API = (process.env.GG_API || vars.GG_API || 'https://guaigou-songs.pages.dev').replace(/\/$/, '');
const TOKEN = process.env.GG_ADMIN_TOKEN || vars.ADMIN_TOKEN;
if (!TOKEN) { console.error('缺少管理口令'); process.exit(1); }

await fs.mkdir(LOGDIR, { recursive: true });
const state = existsSync(STATE) ? JSON.parse(await fs.readFile(STATE, 'utf8')) : { attempts: {}, done: [] };
const saveState = () => fs.writeFile(STATE, JSON.stringify(state, null, 1));

function runJs(code) {
  const js = path.join(os.tmpdir(), `am-${process.pid}-${Date.now()}.js`);
  const sc = `${js}.applescript`;
  writeFileSync(js, code);
  writeFileSync(sc, `set jsText to read POSIX file "${js}" as «class utf8»
tell application "Google Chrome"
  set hit to missing value
  repeat with w in windows
    repeat with t in tabs of w
      if (URL of t) contains "suno.com" then
        set hit to t
        exit repeat
      end if
    end repeat
    if hit is not missing value then exit repeat
  end repeat
  if hit is missing value then return "__NO_TAB__"
  return execute hit javascript jsText
end tell`);
  try { return execFileSync('/usr/bin/osascript', [sc], { encoding: 'utf8' }).trim(); }
  finally { fs.rm(js, { force: true }).catch(() => {}); fs.rm(sc, { force: true }).catch(() => {}); }
}

const getToken = () => {
  const t = runJs(`(() => { const m = document.cookie.match(/(?:^|; )__session=([^;]*)/); return m ? decodeURIComponent(m[1]) : ''; })()`);
  if (!t || t === '__NO_TAB__') throw new Error('拿不到 Suno 令牌（Suno 标签页要开着）');
  return t;
};

async function makeOne(job) {
  const token = getToken();
  const call = async (p, opts = {}) => {
    const r = await fetch(SUNO + p, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
    const t = await r.text();
    try { return JSON.parse(t); } catch { return t; }
  };
  const saveAs = `${job.id} ${job.title.replace(/[\\/:*?"<>|]/g, '')}.mp3`;
  say(`开始《${job.title}》`);

  const created = await call('/api/generate/v2-web/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ generation_type: 'TEXT', title: job.title, tags: job.tags || '', negative_tags: '', mv: 'chirp-hawk', prompt: job.lyrics, make_instrumental: false, metadata: {}, override_fields: [] }),
  });
  const clipId = created.clips?.[0]?.id;
  if (!clipId) throw new Error('生成接口没返回 clip');

  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const c = await call(`/api/clip/${clipId}`);
    if (c.status === 'complete') break;
    if (c.status === 'error') throw new Error('Suno 生成失败');
  }
  await call(`/api/gen/${clipId}/convert_wav/`, { method: 'POST' });
  let wavUrl = null;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const w = await call(`/api/gen/${clipId}/wav_file/`);
    if (w?.wav_file_url) { wavUrl = w.wav_file_url; break; }
  }
  if (!wavUrl) throw new Error('WAV 一直没转好');

  const wav = path.join(os.tmpdir(), `${clipId}.wav`);
  await fs.writeFile(wav, Buffer.from(await (await fetch(wavUrl)).arrayBuffer()));
  const out = path.join(os.homedir(), 'Downloads', saveAs);
  execFileSync('/opt/homebrew/bin/ffmpeg', ['-y', '-v', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-q:a', '2', out]);
  const body = await fs.readFile(out);
  const up = await fetch(`${API}/api/admin/jobs/${job.id}/audio`, { method: 'PUT', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'audio/mpeg' }, body });
  if (!up.ok) throw new Error(`上传失败 HTTP ${up.status}`);
  return { file: out, bytes: body.length, clipId };
}

say(`自动做歌启动，网站 ${API}`);
for (;;) {
  try {
    const res = await fetch(`${API}/api/admin/jobs`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(data).slice(0, 120)}`);
    const { jobs } = data;
    for (const j of jobs.filter((x) => x.status === 'queued')) {
      if (state.done.includes(j.id)) continue;
      const tries = state.attempts[j.id] || 0;
      if (tries >= 2) continue; // 试过两次就跳过，等人看
      state.attempts[j.id] = tries + 1;
      await saveState();
      try {
        const r = await makeOne(j);
        state.done.push(j.id);
        await saveState();
        say(`✅ #${j.id}《${j.title}》完成，${(r.bytes / 1024 / 1024).toFixed(2)} MB`);
      } catch (e) {
        say(`❌ #${j.id}《${j.title}》失败：${e.message}`);
      }
    }
  } catch (e) {
    say('查队列出错：', e.message);
  }
  await new Promise((r) => setTimeout(r, 60_000));
}
