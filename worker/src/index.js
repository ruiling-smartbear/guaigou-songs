// 怪狗唱片 backend: Cloudflare Worker + R2.
// Elders write lyrics with DeepSeek and queue a song; the admin makes it in Suno by hand and uploads the mp3.

const STYLES = {
  nostalgic: "1980s Mandopop nostalgic ballad, warm vocal, acoustic guitar, soft strings",
  tender: "gentle Mandarin ballad, piano, soft strings, heartfelt",
  cheerful: "upbeat Chinese folk pop, cheerful, accordion, hand claps, bright",
  squaredance: "Chinese square dance pop, four-on-the-floor beat, catchy synth, festive",
  campus: "1990s Chinese campus folk, acoustic guitar, harmonica, youthful and sincere",
  rnb: "contemporary R&B, smooth soulful vocal, silky groove, warm keys",
  reggae: "reggae, offbeat guitar skank, laid-back groove, sunny bass",
  folk: "Chinese folk song, erhu, dizi, pentatonic melody, storytelling",
  jiangnan: "Jiangnan folk tune, pipa, guzheng, soft and graceful, water town feeling",
  guofeng: "Chinese guofeng ancient style pop, guzheng, dizi, poetic and elegant",
  northwest: "Chinese northwest folk rock, xintianyou style, suona, big drums, bold and open",
  grassland: "Mongolian grassland style, morin khuur, long-tune vocal, wide and free",
  opera: "Chinese opera inspired pop, jinghu, gongs and cymbals, theatrical vocal",
  errenzhuan: "Northeast China errenzhuan style, suona, lively call and response, humorous",
  hkpop: "1980s Hong Kong pop ballad, saxophone, lush synth pads, romantic",
  army: "Chinese military march song, brass band, snare drums, proud group chorus",
  choir: "grand choir, orchestral, uplifting chorus, ceremonial",
  pop: "modern Mandopop, catchy hook, polished production",
  rock: "Chinese rock, electric guitar, powerful drums, anthemic chorus",
  punk: "pop punk, fast drums, distorted guitars, energetic shout-along chorus",
  metal: "heavy metal, distorted guitars, double kick drums, powerful vocal",
  indie: "indie pop, dreamy guitars, warm lo-fi texture, gentle vocal",
  citypop: "Japanese city pop, 1980s, funky bass, glossy synths",
  kpop: "K-pop style dance pop, energetic, punchy beat, catchy chorus",
  disco: "1980s disco, funky bass, groovy, retro synth, dance",
  funk: "funk, slap bass, tight horns, wah guitar, groovy",
  soul: "classic soul, Motown feel, warm horns, emotional vocal",
  rap: "Chinese hip hop, rap verses, boom bap beat, catchy sung hook",
  lofi: "lofi hip hop, chill beats, vinyl crackle, mellow keys",
  electro: "upbeat electronic dance pop, punchy synth bass, bright drop",
  latin: "latin pop, bossa nova, nylon guitar, light percussion, sunny",
  flamenco: "flamenco, passionate spanish guitar, hand claps, fiery",
  tango: "tango, bandoneon, dramatic strings, sharp rhythm",
  country: "country folk, banjo, acoustic guitar, warm storytelling",
  blues: "delta blues, slide guitar, harmonica, soulful and raw",
  gospel: "gospel choir, hammond organ, hand claps, joyful",
  irish: "irish folk, fiddle, tin whistle, lively jig",
  hawaii: "hawaiian, ukulele, steel guitar, breezy and sunny",
  afro: "afrobeat, djembe, joyful percussion, bright guitars",
  jazz: "smooth jazz swing, saxophone, upright bass, brushed drums, lounge",
  piano: "solo piano ballad, intimate vocal, tender",
  acoustic: "acoustic guitar singer-songwriter, warm and intimate",
  waltz: "romantic waltz, 3/4 time, strings, accordion, ballroom",
  classical: "classical crossover, orchestra, operatic vocal, grand",
  lullaby: "lullaby, soft music box, gentle humming vocal, warm and slow",
  kids: "children song, simple catchy melody, glockenspiel, playful",
  chiptune: "8-bit chiptune, retro video game, bouncy and bright",
  cartoon: "cartoon theme song, bouncy brass, playful and silly",
  circus: "circus march, oompah tuba, whimsical and quirky",
  polka: "polka, accordion, oompah bass, cheerful dance",
  acappella: "a cappella, layered vocal harmonies, beatbox",
  shanty: "sea shanty, stomping rhythm, rousing group vocals",
};
const VOICES = { female: 'female vocal', male: 'male vocal', any: '' };

const MAX_STORY = 2000;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export default {
  async fetch(request, bindings) {
    // Storage is R2 when a bucket is bound, otherwise Workers KV (free plan, no card needed).
    const env = bindings.BUCKET ? bindings : { ...bindings, BUCKET: kvBucket(bindings.KV) };
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      const res = await route(request, env);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) console.error(err);
      return json({ error: err.expose ? err.message : '服务器开小差了，请稍后再试' }, status, cors);
    }
  },
};

async function route(request, env) {
  const url = new URL(request.url);
  const p = url.pathname;
  const m = request.method;

  if (p === '/api/ping') return json({ ok: true, mock: env.MOCK === '1' });

  if (p.startsWith('/api/admin/')) {
    requireAdmin(request, env, url);
    if (p === '/api/admin/jobs' && m === 'GET') return json(await listJobs(env));
    if (p === '/api/admin/quota' && m === 'PUT') return json(quotaView(await editQuota(env, await readJson(request))));
    if (p === '/api/admin/pulse' && m === 'GET') {
      const o = await env.BUCKET.get('meta/pulse');
      return json({ pulse: o ? await o.text() : '0' });
    }
    const f = p.match(/^\/api\/admin\/jobs\/(\d+)\/(audio|drawing|cover)$/);
    if (f && m === 'GET') return serveFile(env, await getJob(env, f[1]), f[2], false, request);
    let mm = p.match(/^\/api\/admin\/jobs\/(\d+)\/audio$/);
    if (mm && m === 'PUT') return json(squareView(await uploadAudio(env, mm[1], request)));
    if (mm && m === 'DELETE') return json(squareView(await removeAudio(env, mm[1])));
    mm = p.match(/^\/api\/admin\/jobs\/(\d+)$/);
    if (mm && m === 'DELETE') return json(await deleteJob(env, mm[1]));
    throw httpError(404, '没有这个接口');
  }

  requireFamily(request, env, url);
  if (p === '/api/quota' && m === 'GET') return json(quotaView(await getQuota(env)));
  if (p === '/api/lyrics' && m === 'POST') return json(await writeLyrics(env, await readJson(request)));
  if (p === '/api/jobs' && m === 'POST') {
    const job = await createJob(env, await readJson(request), request);
    // The owner key is shown this once; the device that made the song keeps it.
    return json({ ...ownerView(job, true), ownerKey: job.ownerKey, quota: quotaView(await getQuota(env)) });
  }
  const ownerKey = request.headers.get('X-Owner-Key') || '';
  const dl = url.searchParams.get('dl') === '1';

  // The song code lets anyone listen. Changing a song also needs the owner key held by the device that made it.
  let mm = p.match(/^\/api\/songs\/(\d{3,6})$/);
  if (mm && m === 'GET') {
    const job = await jobByCode(env, mm[1]);
    return json(ownerView(job, isOwner(job, ownerKey)));
  }
  mm = p.match(/^\/api\/songs\/(\d{3,6})\/public$/);
  if (mm && m === 'POST') return json(ownerView(await setPublic(env, requireOwner(await jobByCode(env, mm[1]), ownerKey), (await readJson(request)).public === true), true));
  mm = p.match(/^\/api\/songs\/(\d{3,6})\/cover$/);
  if (mm && m === 'POST') return json(ownerView(await setCover(env, requireOwner(await jobByCode(env, mm[1]), ownerKey), (await readJson(request)).image), true));
  mm = p.match(/^\/api\/songs\/(\d{3,6})\/(audio|drawing|cover)$/);
  if (mm && m === 'GET') return serveFile(env, await jobByCode(env, mm[1]), mm[2], dl, request);

  // Shared songs: read-only, only while the owner keeps them public.
  if (p === '/api/square' && m === 'GET') return json(await listSquare(env));
  mm = p.match(/^\/api\/square\/(\d+)$/);
  if (mm && m === 'GET') return json(squareView(await publicJobById(env, mm[1])));
  mm = p.match(/^\/api\/square\/(\d+)\/(audio|drawing|cover)$/);
  if (mm && m === 'GET') return serveFile(env, await publicJobById(env, mm[1]), mm[2], dl, request);
  throw httpError(404, '没有这个接口');
}

// ---------- lyrics ----------

async function writeLyrics(env, body) {
  const ownLyrics = body.kind === 'lyrics';
  const story = clean(body.story, ownLyrics ? 3000 : MAX_STORY);
  const name = clean(body.name, 20) || '朋友';
  const keys = Object.keys(STYLES);
  const style = STYLES[body.style] ? body.style : body.style === 'surprise' ? keys[Math.floor(Math.random() * keys.length)] : 'tender';
  const voice = VOICES[body.voice] !== undefined ? body.voice : 'any';
  const myTitle = clean(body.title, 20);
  let picture = '';

  const isPhoto = body.kind === 'photo';
  if ((body.kind === 'drawing' || isPhoto) && body.image) {
    picture = await describeDrawing(env, body.image, isPhoto);
  }
  if (!story && !picture) throw httpError(400, ownLyrics ? '先写几句歌词吧' : isPhoto ? '没看清这张照片，说一句照片里是什么吧' : '先讲一点故事，或者说说画的是什么');

  await countUsage(env, 'lyrics', Number(env.DAILY_LYRICS_LIMIT || 60));

  if (env.MOCK === '1') {
    const r = mockLyrics(name, story || picture, style, voice, ownLyrics);
    return myTitle ? { ...r, title: myTitle } : r;
  }

  const styleHint = `${STYLES[style]}${VOICES[voice] ? ', ' + VOICES[voice] : ''}`;
  if (ownLyrics) {
    const r = await finishOwnLyrics(env, name, story, styleHint, style, myTitle);
    return myTitle ? { ...r, title: myTitle } : r;
  }

  const sys = [
    '你是一位擅长为普通人写歌的中文作词人。用户可能是老人，也可能是小孩。',
    '根据他们讲的故事（或画的画），写一首可以直接交给 Suno 生成的中文歌。',
    '用讲述者自己的视角和口吻：小孩讲的就写得天真有趣，老人讲的就写得朴实深情。',
    '要求：口语化、真诚、温暖，用故事里的具体人名、地名、物件和细节，不说空话套话；押韵自然；',
    '结构用 Suno 标签：[Verse 1] [Chorus] [Verse 2] [Chorus] [Bridge] [Outro]，总长不超过 40 行；',
    '不要出现真实歌手名字。',
    '只输出 JSON：{"title": 歌名(不超过10个字), "lyrics": 带标签的歌词, "tags": 英文风格标签(不超过180个字符)}。',
  ].join('\n');
  const user = [
    `讲故事的人：${name}`,
    story ? `故事：${story}` : '',
    picture ? `${isPhoto ? '他们上传的一张照片（画面描述）' : '他们画的画（画面描述）'}：${picture}` : '',
    `建议风格：${styleHint}`,
  ].filter(Boolean).join('\n');

  const out = await chat(env, {
    base: env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    key: env.DEEPSEEK_API_KEY,
    model: env.DEEPSEEK_MODEL || 'deepseek-chat',
    messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
    json: true,
  });
  let parsed;
  try { parsed = JSON.parse(out); } catch { throw httpError(502, '歌词没写好，请再试一次'); }
  return {
    title: clean(parsed.title, 30) || '无题',
    lyrics: clean(parsed.lyrics, 3000),
    tags: clean(parsed.tags, 200) || STYLES[style],
    picture,
  };
}

// The elder wrote lyrics themselves: keep complete lyrics word for word, otherwise finish the song around their lines.
async function finishOwnLyrics(env, name, text, styleHint, style, myTitle) {
  // Split the author's text into stanzas ourselves, so "kept" lyrics are rebuilt from the original words.
  const hasTags = /^\s*\[[^\]\n]+\]\s*$/m.test(text);
  let stanzas = text.split(/\n\s*\n+/).map((x) => x.trim()).filter(Boolean);
  if (!hasTags && stanzas.length === 1) {
    const lines = stanzas[0].split('\n').map((l) => l.trim()).filter(Boolean);
    stanzas = [];
    for (let i = 0; i < lines.length; i += 4) stanzas.push(lines.slice(i, i + 4).join('\n'));
  }
  const numbered = stanzas.map((x, i) => `【第${i + 1}段】\n${x}`).join('\n\n');
  const sys = [
    '你是中文作词助手。用户给了自己写的歌词，已经按段编号。先判断它是不是一首完整的歌词：',
    '完整 = 大约 12 行以上、至少三段，读起来已经是一首歌。',
    '如果完整：kept = true，不要输出歌词正文，只给每一段贴一个 Suno 结构标签，放进 labels 数组，',
    `labels 的长度必须正好是 ${stanzas.length}，按段落顺序，例如 ["Verse 1","Verse 2","Chorus","Outro"]。反复出现或最点题的一段标为 Chorus。`,
    '如果不完整（只有几句、一段或一个想法）：kept = false，在 lyrics 里写出完整的歌：用户的原句全部保留且原样出现（最好的一句可以放进副歌），',
    '围绕它们的意思、口吻和押韵续写，带 [Verse 1] [Chorus] [Verse 2] [Bridge] [Outro] 标签，总长不超过 40 行。',
    '只输出 JSON：{"kept": true 或 false, "title": 歌名(不超过10个字), "tags": 英文风格标签(不超过180个字符), "labels": [...], "lyrics": "..."}。',
  ].join('\n');
  const out = await chat(env, {
    base: env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    key: env.DEEPSEEK_API_KEY,
    model: env.DEEPSEEK_MODEL || 'deepseek-chat',
    messages: [{ role: 'system', content: sys }, { role: 'user', content: `写歌词的人：${name}\n${myTitle ? `歌名（作者自己起的，围绕它写）：${myTitle}\n` : ''}建议风格：${styleHint}\n歌词：\n${numbered}` }],
    json: true,
  });
  let parsed;
  try { parsed = JSON.parse(out); } catch { throw httpError(502, '没整理好，请再试一次'); }

  let lyrics;
  const kept = parsed.kept === true || hasTags;
  if (hasTags) {
    lyrics = text.trim(); // already structured by the author: use as is
  } else if (kept) {
    const labels = Array.isArray(parsed.labels) && parsed.labels.length === stanzas.length ? parsed.labels : [];
    let verse = 0;
    lyrics = stanzas.map((x, i) => {
      const label = /^[A-Za-z][A-Za-z0-9 -]{1,20}$/.test(labels[i] || '') ? labels[i] : `Verse ${++verse}`;
      return `[${label}]\n${x}`;
    }).join('\n\n');
  } else {
    lyrics = clean(parsed.lyrics, 3000);
    if (!lyrics) throw httpError(502, '没整理好，请再试一次');
  }
  return {
    title: clean(parsed.title, 30) || '无题',
    lyrics: clean(lyrics, 3000),
    tags: clean(parsed.tags, 200) || STYLES[style],
    kept,
    picture: '',
  };
}

// Looks at the drawing and says what is in it. Uses DeepSeek itself (deepseek-chat / deepseek-flash can read images)
// unless a separate VISION_* model is configured. Never blocks song writing: on any failure it returns ''.
async function describeDrawing(env, dataUrl, isPhoto = false) {
  if (env.MOCK === '1') return '';
  const key = env.VISION_API_KEY || env.DEEPSEEK_API_KEY;
  if (!key || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return '';
  if (dataUrl.length > MAX_IMAGE_BYTES * 1.4) throw httpError(413, '画太大了');
  try {
    return clean(await chat(env, {
      base: env.VISION_BASE_URL || env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
      key,
      model: env.VISION_MODEL || env.DEEPSEEK_MODEL || 'deepseek-chat',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: isPhoto
            ? '这是用户上传的一张照片，他们想为它写一首歌。用 2~3 句中文描述照片里有什么人或物、在什么地方、是什么氛围。只描述看得到的，不要猜测人物的身份、姓名和年龄。如果看不到图片，只回答「看不到」。'
            : '这是有人在平板上画的画（可能是老人，也可能是小孩）。用 2~3 句中文描述画了什么、颜色和情绪，不要评价画得好不好。如果看不到图片，只回答「看不到」。' },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      }],
    }), 400).replace(/^看不到[。.!！]?$/, '');
  } catch (e) {
    console.error('vision failed', e.message);
    return '';
  }
}

async function chat(env, { base, key, model, messages, json: wantJson }) {
  if (!key) throw httpError(500, '还没配置 API key', true);
  let res;
  try {
    res = await fetch(base.replace(/\/$/, '') + '/chat/completions', {
      signal: AbortSignal.timeout(45000), // never leave the visitor's page waiting on a stuck model call
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.9,
        ...(wantJson ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
  } catch (e) {
    console.error('LLM unreachable', e.name);
    throw httpError(502, '写歌的小狗累了，请稍后再试', true);
  }
  if (!res.ok) {
    console.error('LLM error', res.status, (await res.text()).slice(0, 300));
    throw httpError(502, '写歌的小狗累了，请稍后再试', true);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

function mockLyrics(name, story, style, voice, ownLyrics) {
  const s = story.slice(0, 18);
  const tags = STYLES[style] + (VOICES[voice] ? ', ' + VOICES[voice] : '');
  if (ownLyrics) {
    const lines = story.split(/\n+/).filter(Boolean);
    const kept = lines.length >= 12;
    return {
      title: '我写的歌',
      lyrics: kept ? `[Verse 1]\n${story}` : `[Verse 1]\n${lines.join('\n')}\n日子一天天地过\n心里还是暖和\n\n[Chorus]\n${lines[0]}\n唱给你听 唱给我听\n\n[Outro]\n${lines[0]}`,
      tags, kept, picture: '',
    };
  }
  return {
    title: '院子里的光',
    lyrics: `[Verse 1]\n${name}说起那年的事\n${s}……\n风从窗口吹进来\n日子慢慢地走\n\n[Chorus]\n唱给你听 唱给你听\n那些年的光还亮着\n唱给你听 唱给你听\n一家人都在这里\n\n[Outro]\n还在这里`,
    tags: STYLES[style] + (VOICES[voice] ? ', ' + VOICES[voice] : ''),
    picture: '',
  };
}

// ---------- jobs ----------

async function createJob(env, body, request) {
  const lyrics = clean(body.lyrics, 3000);
  if (!lyrics) throw httpError(400, '还没有歌词');
  // The monthly allowance never blocks: songs handed in after it runs out simply wait for the next period.
  const quota = await getQuota(env);
  // Per person first (so the message is about them), then the whole site.
  await countPerPerson(env, request);
  await countUsage(env, 'jobs', Number(env.DAILY_SONG_LIMIT || 20));

  const id = await nextId(env);
  const code = await newCode(env, id);
  const job = {
    id,
    code,
    ownerKey: randomHex(16),
    public: body.public === true,
    name: clean(body.name, 20) || '朋友',
    dog: /^[a-z]{2,12}$/.test(body.dog || '') ? body.dog : 'pug',
    kind: ['drawing', 'lyrics', 'photo'].includes(body.kind) ? body.kind : 'story',
    story: clean(body.story, 3000),
    title: clean(body.title, 30) || '无题',
    lyrics,
    tags: clean(body.tags, 200),
    status: 'queued',
    hasDrawing: false,
    hasAudio: false,
    createdAt: new Date().toISOString(),
  };

  if ((job.kind === 'drawing' || job.kind === 'photo') && typeof body.image === 'string') {
    const m = body.image.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
    if (m) {
      const bytes = base64ToBytes(m[2]);
      if (bytes.length > MAX_IMAGE_BYTES) throw httpError(413, '画太大了');
      await env.BUCKET.put(`drawings/${id}`, bytes, { httpMetadata: { contentType: `image/${m[1]}` } });
      job.hasDrawing = true;
    }
  }
  await saveJob(env, job);
  if (job.public) await env.BUCKET.put(`public/${id}`, '1');
  await saveQuota(env, { ...quota, left: quota.left - 1 });
  await touchPulse(env);
  await pruneOldSongs(env);
  return job;
}

// Keep storage bounded: past MAX_SONGS, drop the oldest finished songs (never ones still waiting to be made).
async function pruneOldSongs(env) {
  const max = Number(env.MAX_SONGS || 100);
  const { jobs } = await listJobs(env);
  let extra = jobs.length - max;
  if (extra <= 0) return;
  const done = jobs.filter((j) => j.status === 'done').sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  for (const j of done) {
    if (extra-- <= 0) break;
    await deleteJob(env, j.id);
  }
}

// A short random code so songs can't be found by counting 1, 2, 3...
async function newCode(env, id) {
  for (let digits = 3; digits <= 6; digits++) {
    for (let i = 0; i < 40; i++) {
      const lo = 10 ** (digits - 1);
      const code = String(lo + Math.floor(Math.random() * 9 * lo));
      if (!(await env.BUCKET.get(`codes/${code}`))) {
        await env.BUCKET.put(`codes/${code}`, String(id));
        return code;
      }
    }
  }
  throw httpError(500, '号码用完了');
}

async function jobByCode(env, code) {
  const obj = await env.BUCKET.get(`codes/${code}`);
  if (!obj) throw httpError(404, '没有这个号码，再看看是不是输错了', true);
  return getJob(env, await obj.text());
}

async function publicJobById(env, id) {
  const job = await getJob(env, id);
  if (!job.public) throw httpError(404, '这首歌没有公开', true);
  return job;
}

async function setPublic(env, job, on) {
  job.public = on;
  await saveJob(env, job);
  if (on) await env.BUCKET.put(`public/${job.id}`, '1');
  else await env.BUCKET.delete(`public/${job.id}`);
  return job;
}

async function setCover(env, job, dataUrl) {
  const m = typeof dataUrl === 'string' && dataUrl.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
  if (!m) throw httpError(400, '这张图片用不了，换一张试试');
  const bytes = base64ToBytes(m[2]);
  if (bytes.length > MAX_IMAGE_BYTES) throw httpError(413, '图片太大了');
  await env.BUCKET.put(`covers/${job.id}`, bytes, { httpMetadata: { contentType: `image/${m[1]}` } });
  job.hasCover = true;
  await saveJob(env, job);
  return job;
}

async function listSquare(env) {
  const page = await env.BUCKET.list({ prefix: 'public/' });
  const ids = page.objects.map((o) => Number(o.key.slice(7))).slice(0, 120);
  const jobs = await Promise.all(ids.map((id) => getJob(env, id).catch(() => null)));
  const newest = (a, b) => String(b.doneAt || '').localeCompare(String(a.doneAt || ''));
  return { songs: jobs.filter((j) => j && j.public && j.status === 'done').sort(newest).slice(0, 80).map(squareView) };
}

// Random rather than counting up: a shared counter can hand two people the same number
// when storage is eventually consistent (KV), and the second song would overwrite the first.
async function nextId(env) {
  for (let digits = 4; digits <= 7; digits++) {
    for (let i = 0; i < 20; i++) {
      const lo = 10 ** (digits - 1);
      const id = lo + Math.floor(Math.random() * 9 * lo);
      if (!(await env.BUCKET.get(`jobs/${id}.json`))) return id;
    }
  }
  throw httpError(500, '编号用完了');
}

// Makes Workers KV look like the small part of the R2 API this file uses.
function kvBucket(kv) {
  if (!kv) throw httpError(500, '没有配置存储（BUCKET 或 KV）');
  return {
    async get(key, opts = {}) {
      const { value, metadata } = await kv.getWithMetadata(key, { type: 'arrayBuffer' });
      if (value === null) return null;
      const full = new Uint8Array(value);
      const r = opts.range;
      let buf = full;
      if (r) {
        const start = 'suffix' in r ? Math.max(0, full.length - r.suffix) : r.offset;
        if (start >= full.length) throw new RangeError('range');
        buf = full.subarray(start, r.length !== undefined ? start + r.length : undefined);
      }
      const text = () => new TextDecoder().decode(buf);
      return { body: buf, size: full.length, httpMetadata: metadata || {}, text: async () => text(), json: async () => JSON.parse(text()) };
    },
    put: (key, value, opts = {}) => kv.put(key, value, { metadata: opts.httpMetadata || {} }),
    delete: (key) => kv.delete(key),
    async list({ prefix, cursor }) {
      const page = await kv.list({ prefix, cursor });
      return { objects: page.keys.map((k) => ({ key: k.name })), truncated: !page.list_complete, cursor: page.cursor };
    },
  };
}

// One tiny value that changes whenever the song list does, so pollers can check cheaply.
const touchPulse = (env) => env.BUCKET.put('meta/pulse', String(Date.now()));

async function getJob(env, id) {
  const obj = await env.BUCKET.get(`jobs/${Number(id)}.json`);
  if (!obj) throw httpError(404, '没找到这首歌', true);
  return obj.json();
}

function saveJob(env, job) {
  return env.BUCKET.put(`jobs/${job.id}.json`, JSON.stringify(job), {
    httpMetadata: { contentType: 'application/json' },
  });
}

function squareView(job) {
  return {
    id: job.id, name: job.name, dog: job.dog, kind: job.kind, title: job.title,
    lyrics: job.lyrics, status: job.status, hasDrawing: job.hasDrawing, hasCover: !!job.hasCover,
    hasAudio: job.hasAudio, createdAt: job.createdAt, doneAt: job.doneAt || null,
  };
}

function ownerView(job, canEdit = false) {
  return { ...squareView(job), code: job.code, public: !!job.public, canEdit };
}

function isOwner(job, key) {
  return !!job.ownerKey && typeof key === 'string' && key.length === job.ownerKey.length && key === job.ownerKey;
}

function requireOwner(job, key) {
  if (!isOwner(job, key)) throw httpError(403, '只有做这首歌的人才能改它');
  return job;
}

function randomHex(bytes) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function listJobs(env) {
  const jobs = [];
  let cursor;
  do {
    const page = await env.BUCKET.list({ prefix: 'jobs/', cursor });
    const batch = await Promise.all(page.objects.map((o) => env.BUCKET.get(o.key).then((r) => r && r.json())));
    jobs.push(...batch.filter(Boolean));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  // Waiting songs first (oldest request on top), then finished ones (newest on top).
  const t = (j) => String(j.createdAt);
  jobs.sort((a, b) => (a.status !== b.status ? (a.status === 'queued' ? -1 : 1) : a.status === 'queued' ? t(a).localeCompare(t(b)) : t(b).localeCompare(t(a))));
  // Owner keys stay on the server and on the owner's device; nobody else needs them.
  return { jobs: jobs.map(({ ownerKey, ...rest }) => rest), max: Number(env.MAX_SONGS || 100) };
}

async function uploadAudio(env, id, request) {
  const job = await getJob(env, id);
  const type = request.headers.get('Content-Type') || 'audio/mpeg';
  if (!/^audio\//.test(type)) throw httpError(415, '只能传音频文件', true);
  const buf = await request.arrayBuffer();
  if (!buf.byteLength) throw httpError(400, '文件是空的', true);
  if (buf.byteLength > MAX_AUDIO_BYTES) throw httpError(413, '文件太大（最多 25MB）', true);
  await env.BUCKET.put(`audio/${job.id}`, buf, { httpMetadata: { contentType: type } });
  job.hasAudio = true;
  job.status = 'done';
  job.doneAt = new Date().toISOString();
  await saveJob(env, job);
  await touchPulse(env);
  return job;
}

async function removeAudio(env, id) {
  const job = await getJob(env, id);
  await env.BUCKET.delete(`audio/${job.id}`);
  Object.assign(job, { hasAudio: false, status: 'queued', doneAt: null });
  await saveJob(env, job);
  return job;
}

async function deleteJob(env, id) {
  const job = await getJob(env, id);
  // A song removed before it was made gives its place back.
  if (job.status === 'queued') {
    const q = await getQuota(env);
    await saveQuota(env, { ...q, left: q.left + 1 });
  }
  await env.BUCKET.delete(`audio/${job.id}`);
  await env.BUCKET.delete(`drawings/${job.id}`);
  await env.BUCKET.delete(`covers/${job.id}`);
  await env.BUCKET.delete(`jobs/${job.id}.json`);
  await env.BUCKET.delete(`public/${job.id}`);
  if (job.code) await env.BUCKET.delete(`codes/${job.code}`);
  return { ok: true };
}

async function serveFile(env, job, what, download, request) {
  const key = `${({ audio: 'audio', drawing: 'drawings', cover: 'covers' })[what]}/${job.id}`;
  // iPad Safari only plays audio from servers that honour byte ranges.
  const m = (request.headers.get('Range') || '').match(/^bytes=(\d*)-(\d*)$/);
  let range;
  if (m && (m[1] || m[2])) {
    if (m[1] === '') range = { suffix: Number(m[2]) };
    else if (m[2] === '') range = { offset: Number(m[1]) };
    else range = { offset: Number(m[1]), length: Number(m[2]) - Number(m[1]) + 1 };
  }
  let obj;
  try { obj = await env.BUCKET.get(key, range ? { range } : undefined); } catch { range = undefined; obj = null; }
  if (!obj) throw httpError(range ? 416 : 404, '还没有文件', true);

  const type = obj.httpMetadata?.contentType || 'application/octet-stream';
  const headers = new Headers({ 'Content-Type': type, 'Cache-Control': 'private, max-age=300', 'Accept-Ranges': 'bytes' });
  if (download) {
    const ext = type.includes('mpeg') ? 'mp3' : type.split('/')[1] || 'bin';
    const name = `${job.title}.${ext}`;
    headers.set('Content-Disposition', `attachment; filename="song-${job.id}.${ext}"; filename*=UTF-8''${encodeURIComponent(name)}`);
  }
  if (!range) {
    headers.set('Content-Length', String(obj.size));
    return new Response(obj.body, { headers });
  }
  let start, len;
  if ('suffix' in range) { len = Math.min(range.suffix, obj.size); start = obj.size - len; }
  else { start = range.offset; len = Math.min(range.length ?? Infinity, obj.size - start); }
  headers.set('Content-Range', `bytes ${start}-${start + len - 1}/${obj.size}`);
  headers.set('Content-Length', String(len));
  return new Response(obj.body, { status: 206, headers });
}

// ---------- guards ----------

function requireFamily(request, env, url) {
  // The passphrase gate is off unless REQUIRE_FAMILY_KEY is "1" (and a FAMILY_KEY secret exists).
  if (env.REQUIRE_FAMILY_KEY !== '1' || !env.FAMILY_KEY) return;
  // Headers can only carry ASCII, so the site percent-encodes the passphrase (it may be Chinese).
  let k = request.headers.get('X-Family-Key') || '';
  try { k = decodeURIComponent(k); } catch {}
  k = k || url.searchParams.get('k') || '';
  // Forgiving on purpose: tablets capitalise the first letter and add stray spaces.
  const norm = (x) => String(x).trim().toLowerCase();
  if (norm(k) !== norm(env.FAMILY_KEY)) throw httpError(401, '暗号不对', true);
}

function requireAdmin(request, env, url) {
  // <img>/<audio> can't send headers, so the admin page passes ?t= for file reads.
  const auth = request.headers.get('Authorization') || (url.searchParams.get('t') ? `Bearer ${url.searchParams.get('t')}` : '');
  if (!env.ADMIN_TOKEN || auth !== `Bearer ${env.ADMIN_TOKEN}`) throw httpError(401, '管理口令不对', true);
}

async function countUsage(env, kind, limit) {
  const day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); // Beijing date
  const key = `meta/usage/${day}/${kind}`;
  const obj = await env.BUCKET.get(key);
  const n = obj ? Number(await obj.text()) : 0;
  if (n >= limit) throw httpError(429, '今天的次数用完啦，明天再来', true);
  await env.BUCKET.put(key, String(n + 1));
}

// ---------- monthly allowance ----------
// One shared number: how many more songs can be made before the next reset day (the 20th by default).
// Handing in a song spends one. It may go below zero: those songs are owed, and are taken out of the
// next period's allowance when it refills. People only ever see zero. The admin can edit all three numbers.

function cycleInfo(resetDay) {
  const now = new Date(Date.now() + 8 * 3600e3); // Beijing date, same as the daily limits
  let y = now.getUTCFullYear(), m = now.getUTCMonth();
  if (now.getUTCDate() < resetDay) { m--; if (m < 0) { m = 11; y--; } }
  const nextMonth = (m + 1) % 12;
  return { cycle: `${y}-${String(m + 1).padStart(2, '0')}-${resetDay}`, next: `${nextMonth + 1}月${resetDay}号` };
}

async function getQuota(env) {
  const obj = await env.BUCKET.get('meta/quota');
  const base = Number(env.MONTHLY_SONGS || 20);
  const q = obj ? await obj.json() : { left: base, refill: base, resetDay: Number(env.QUOTA_RESET_DAY || 20) };
  const info = cycleInfo(q.resetDay);
  if (q.cycle !== info.cycle) {
    if (q.cycle) q.left = q.refill + Math.min(0, q.left); // new period: refill, minus songs already waiting
    q.cycle = info.cycle;
    await saveQuota(env, q);
  }
  return { ...q, next: info.next };
}

function saveQuota(env, q) {
  const { left, refill, resetDay, cycle } = q;
  return env.BUCKET.put('meta/quota', JSON.stringify({ left, refill, resetDay, cycle }));
}

function quotaView(q) {
  return { left: Math.max(0, q.left), owed: Math.max(0, -q.left), refill: q.refill, resetDay: q.resetDay, next: q.next };
}

async function editQuota(env, body) {
  const q = await getQuota(env);
  const int = (v, lo, hi, d) => (Number.isInteger(v) && v >= lo && v <= hi ? v : d);
  const resetDay = int(body.resetDay, 1, 28, q.resetDay);
  const next = { ...q, left: int(body.left, 0, 9999, q.left), refill: int(body.refill, 0, 9999, q.refill), resetDay };
  next.cycle = cycleInfo(resetDay).cycle; // changing the day must not trigger a refill by itself
  await saveQuota(env, next);
  return getQuota(env);
}

// "Per person" without logins: each device sends a random id it keeps in its browser.
// Clearing the browser gives a new id, so the network address is capped as a backstop.
async function countPerPerson(env, request) {
  const day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  const perDevice = Number(env.DAILY_SONGS_PER_PERSON || 2);
  const perNetwork = Number(env.DAILY_SONGS_PER_NETWORK || 6);
  const device = (request.headers.get('X-Device-Id') || '').toLowerCase();
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const keys = [];
  if (/^[a-z0-9]{16,40}$/.test(device)) keys.push([`meta/usage/${day}/device/${device}`, perDevice]);
  if (ip) keys.push([`meta/usage/${day}/net/${await sha(ip)}`, /^[a-z0-9]{16,40}$/.test(device) ? perNetwork : perDevice]);
  const counts = [];
  for (const [key, limit] of keys) {
    const obj = await env.BUCKET.get(key);
    const n = obj ? Number(await obj.text()) : 0;
    if (n >= limit) throw httpError(429, `今天已经交了 ${perDevice} 首啦，歌词帮你存好了，明天再交`, true);
    counts.push([key, n]);
  }
  for (const [key, n] of counts) await env.BUCKET.put(key, String(n + 1));
}

async function sha(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- utils ----------

function corsHeaders(request, env) {
  const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim());
  const origin = request.headers.get('Origin') || '';
  const allow = allowed.includes('*') ? '*' : allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Family-Key,X-Owner-Key,X-Device-Id,Authorization',
    'Access-Control-Expose-Headers': 'Content-Disposition',
    Vary: 'Origin',
  };
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
  });
}

async function readJson(request) {
  try { return await request.json(); } catch { throw httpError(400, '请求格式不对', true); }
}

function httpError(status, message, expose = status < 500) {
  return Object.assign(new Error(message), { status, expose });
}

function clean(v, max) {
  return typeof v === 'string' ? v.replace(/\u0000/g, '').trim().slice(0, max) : '';
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
