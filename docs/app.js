(() => {
  'use strict';

  const API = ((window.GG_CONFIG || {}).apiBase || '').replace(/\/$/, '');
  const GATE = !!(window.GG_CONFIG || {}).gate; // true = ask visitors for a passphrase (the server must require it too)
  const MAKER = (window.GG_CONFIG || {}).maker || '小高'; // who makes the songs, shown in "…正在忙" messages

  const DOGS = [
    ['pug', '皱皱'], ['corgi', '短腿'], ['shiba', '斜眼柴'], ['bulldog', '斗斗'],
    ['schnauzer', '胡子爷'], ['chihuahua', '大耳朵'], ['pom', '毛球'], ['frenchie', '法斗'],
    ['chow', '狮子头'], ['shihtzu', '紫辫儿'], ['sharpei', '褶褶'], ['bichon', '棉花糖'],
    ['jackrussell', '小花脸'], ['puli', '拖把'], ['cavalier', '小花卷'], ['bully', '憨憨'],
    ['poodle', '薄荷卷'],
  ];
  const SG = window.GG_STYLES || { cats: [], styles: [] };
  const CHIP_COLORS = ['#ffd43b', '#81d8d0', '#ff8fb1', '#ff9f68', '#b8e05b', '#b9a7ff', '#7cc6ff', '#ffc078', '#8ce99a', '#ffa8a8'];
  const VOICES = [['female', '女声'], ['male', '男声'], ['any', '都行']];
  const COLORS = ['#1d1a16', '#e2553f', '#f0a23a', '#f4d03f', '#3f9b5a', '#69c8ef', '#2457c9', '#9b59b6', '#f19bb5', '#8a5a2b'];

  const ICON = {
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12.5h5"/></svg>',
    brush: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4l6 6-8.5 8.5a3 3 0 0 1-2 .9L5 20l.6-4.5a3 3 0 0 1 .9-2Z"/><path d="M12 6l6 6"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4.5" height="16" rx="1"/><rect x="13.5" y="4" width="4.5" height="16" rx="1"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12M6 11l6 6 6-6M5 20h14"/></svg>',
    undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
    eraser: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M16 3l5 5-11 11H5l-2-2a2 2 0 0 1 0-3Z"/><path d="M9 10l5 5M10 21h11"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4M4 20h16"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
  };

  // ---------- storage (wrapped: private mode can throw) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('gg.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('gg.' + k, JSON.stringify(v)); } catch {} },
  };

  // Family key can come from a personal link: ...?k=wangwang
  (function takeKeyFromUrl() {
    const u = new URL(location.href);
    const k = u.searchParams.get('k');
    const n = u.searchParams.get('name');
    if (k) store.set('key', k);
    if (n && !store.get('profile')) store.set('pendingName', n);
    if (k || n) { u.searchParams.delete('k'); u.searchParams.delete('name'); history.replaceState(null, '', u.pathname + u.search + u.hash); }
  })();

  // A random id for this browser, used only to count "two songs a day per person".
  const deviceId = (() => {
    let id = store.get('device', '');
    if (!/^[a-z0-9]{16,40}$/.test(id)) {
      id = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('');
      store.set('device', id);
    }
    return id;
  })();

  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dogSrc = (id) => `assets/dogs/${DOGS.some((d) => d[0] === id) ? id : 'pug'}.webp`;
  const dogName = (id) => (DOGS.find((d) => d[0] === id) || DOGS[0])[1];
  // A song is reached either by its owner code (/api/songs/123) or, when shared, by id (/api/square/7).
  const base = (j) => (j.code ? `/api/songs/${j.code}` : `/api/square/${j.id}`);
  const fileUrl = (j, what, dl) => `${API}${base(j)}/${what}?k=${encodeURIComponent(store.get('key', ''))}${dl ? '&dl=1' : ''}`;
  const view = $('#view');

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }

  async function api(path, opts = {}) {
    let res;
    try {
      res = await fetch(API + path, {
        ...opts,
        headers: { 'Content-Type': 'application/json', 'X-Family-Key': encodeURIComponent(store.get('key', '')), 'X-Device-Id': deviceId, ...(opts.headers || {}) },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
    } catch {
      throw Object.assign(new Error(`${MAKER}正在忙！过一会儿再试`), { busy: true });
    }
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok) {
      if (res.status === 401) {
        // Wrong passphrase: forget it and go straight back to the page that asks for it.
        store.set('key', '');
        setTimeout(() => { render(); toast('口令不对，请再输入一次'); }, 0);
      }
      // No answer, server trouble or today's limit reached: worth keeping the work and retrying later.
      const busy = res.status >= 500 || res.status === 429;
      throw Object.assign(new Error(data.error || '网络不太好，请再试一次'), { busy, limit: res.status === 429 });
    }
    return data;
  }

  // Owner keys: proof that this device made a song. Needed to change it (share, cover); never shown.
  const ownerKeys = {
    get: (code) => store.get('ownerKeys', {})[code] || '',
    set(code, key) { if (key) store.set('ownerKeys', { ...store.get('ownerKeys', {}), [code]: key }); },
  };
  const asOwner = (code) => ({ 'X-Owner-Key': ownerKeys.get(code) });
  function mySongs() { return store.get('mysongs', []); }
  function rememberSong(code) {
    const s = mySongs().filter((x) => x !== code);
    s.unshift(code);
    store.set('mysongs', s.slice(0, 60));
  }

  // ---------- router ----------
  let cleanup = null;
  function go(hash) { location.hash = hash; }
  async function render() {
    if (cleanup) { cleanup(); cleanup = null; }
    const profile = store.get('profile');
    const me = $('#me');
    if (profile) {
      me.hidden = false;
      me.innerHTML = `<img src="${dogSrc(profile.dog)}" alt=""><span>${esc(profile.name)}</span>`;
    } else me.hidden = true;

    const h = location.hash.replace(/^#/, '') || '/';
    if (!profile || (GATE && !store.get('key')) || h === '/me') return renderWelcome();
    window.scrollTo(0, 0);
    let m;
    if (h === '/story') return renderStory();
    if (h === '/draw') return renderDraw();
    if (h === '/write') return renderWrite();
    if (h === '/photo') return renderPhoto();
    if ((m = h.match(/^\/song\/(\d{3,6})/))) return renderSong(m[1], false);
    if ((m = h.match(/^\/square\/(\d+)/))) return renderSong(m[1], true);
    if (h === '/square') return renderSquare();
    return renderHome();
  }
  window.addEventListener('hashchange', render);
  $('#me').addEventListener('click', () => go('/me'));

  // ---------- welcome ----------
  function renderWelcome() {
    const profile = store.get('profile') || { name: store.get('pendingName', ''), dog: '' };
    const needKey = GATE && !store.get('key');
    view.innerHTML = `
      <div class="parade">${['shiba', 'pug', 'corgi', 'chow', 'bichon'].map((d) => `<img src="${dogSrc(d)}" alt="">`).join('')}</div>
      <section class="paper card">
        <h1>你好，大宝！</h1>
        <p class="hint">讲一个故事、画一幅画，或者自己写几句词，都能变成一首真的歌。</p>
        <label for="nm"><h2>你叫什么？</h2></label>
        <input type="text" id="nm" maxlength="12" placeholder="比如：姥姥、豆豆" value="${esc(profile.name)}" autocomplete="off">
        <h2 style="margin-top:22px">挑一只你喜欢的小狗</h2><p class="hint">以后它就代表你。</p>
        <div class="dogs" id="dogs">${DOGS.map(([id, n]) => `<button class="dog-pick" data-dog="${id}" aria-pressed="${profile.dog === id}"><img src="${dogSrc(id)}" alt=""><span>${n}</span></button>`).join('')}</div>
        <div ${needKey ? '' : 'hidden'}>
          <label for="key"><h2>进门口令</h2></label>
          <p class="hint">不知道的话，问问把这个网址发给你的人。</p>
          <input type="password" id="key" autocomplete="off">
        </div>
        <div style="margin-top:22px"><button class="btn primary big block" id="go">开始做歌</button></div>
      </section>`;
    let dog = profile.dog;
    $('#dogs').addEventListener('click', (e) => {
      const b = e.target.closest('.dog-pick');
      if (!b) return;
      dog = b.dataset.dog;
      view.querySelectorAll('.dog-pick').forEach((x) => x.setAttribute('aria-pressed', x === b));
    });
    $('#go').addEventListener('click', async () => {
      const name = $('#nm').value.trim();
      if (!name) return toast('请先写上你的名字');
      if (!dog) return toast('请先点一只小狗');
      if (needKey) {
        const k = $('#key').value.trim();
        if (!k) return toast('请输入进门口令');
        store.set('key', k);
      }
      store.set('profile', { name, dog });
      if (location.hash === '#/me') go('/'); else render();
    });
  }

  // ---------- home ----------
  function renderHome() {
    const p = store.get('profile');
    const peeks = ['poodle', 'corgi', 'pug', 'frenchie', 'shiba'].filter((d) => d !== p.dog);
    view.innerHTML = `
      <div class="hello"><img src="${dogSrc(p.dog)}" alt=""><div><p class="on-felt" style="margin:0">你好，${esc(p.name)}！</p><h1 class="on-felt">今天想做一首什么歌？</h1></div></div>
      <div class="choices">
        <a class="choice paper" href="#/story"><div class="icon">${ICON.chat}</div><img class="peek" src="${dogSrc(peeks[0])}" alt=""><b>讲个故事</b><span>说一件事，帮你写成歌</span></a>
        <a class="choice paper" href="#/draw"><div class="icon">${ICON.brush}</div><img class="peek" src="${dogSrc(peeks[1])}" alt=""><b>画一幅画</b><span>画完了，帮你给画写首歌</span></a>
        <a class="choice paper" href="#/write"><div class="icon">${ICON.pen}</div><img class="peek" src="${dogSrc(peeks[2])}" alt=""><b>自己写词</b><span>写好的直接唱，没写完的帮你补完</span></a>
        <a class="choice paper" href="#/photo"><div class="icon">${ICON.image}</div><img class="peek" src="${dogSrc(peeks[3] || 'bichon')}" alt=""><b>传张照片</b><span>选一张照片，帮你写成歌</span></a>
      </div>
      <form class="find" id="find">
        <div class="find-pill">
          <input type="text" id="no" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="输入取歌号码，找到你的歌" aria-label="取歌号码" autocomplete="off">
          <button class="find-go">找歌 ${ICON.arrow}</button>
        </div>
      </form>
      <div id="pending"></div>
      <div class="section-head"><h2 class="on-felt">我的歌</h2></div>
      <div class="songs" id="songs"></div>
      <div class="section-head"><h2 class="on-felt">大家的歌</h2><a class="btn mini-light" href="#/square">看全部</a></div>
      <div class="songs" id="square"></div>`;
    const no = $('#no');
    no.addEventListener('input', () => { no.value = no.value.replace(/\D/g, ''); });
    $('#find').addEventListener('submit', (e) => {
      e.preventDefault();
      if (/^\d{3,6}$/.test(no.value)) go(`/song/${no.value}`);
      else toast('取歌号码是 3 位数字');
    });
    renderPending();
    loadMySongs();
    loadSquare($('#square'), 8);
  }

  function renderPending() {
    const box = $('#pending');
    if (!box) return;
    const list = pending.all();
    box.innerHTML = list.map((x) => `
      <div class="paper card busy" data-id="${x.id}">
        <img src="${dogSrc(x.body.dog)}" alt="">
        <div>
          <b>${x.why === 'limit' ? '今天的名额用完了' : `${esc(MAKER)}正在忙！`}</b><br>
          《${esc(x.body.title)}》的歌词和风格已经存在这台设备上了，还没交上去。${x.why === 'limit' ? '明天点「再交一次」就行。' : ''}
          <div class="row" style="margin-top:12px">
            <button class="btn primary" data-act="send">再交一次</button>
            <button class="btn" data-act="drop">不要了</button>
          </div>
        </div>
      </div>`).join('');
    box.onclick = async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const id = Number(b.closest('[data-id]').dataset.id);
      const item = pending.all().find((x) => x.id === id);
      if (!item) return renderPending();
      if (b.dataset.act === 'drop') {
        if (confirm(`《${item.body.title}》的歌词会被删掉，确定不要了吗？`)) { pending.remove(id); renderPending(); }
        return;
      }
      b.disabled = true;
      try {
        const job = await api('/api/jobs', { method: 'POST', body: item.body });
        pending.remove(id);
        ownerKeys.set(job.code, job.ownerKey);
        rememberSong(job.code);
        go(`/song/${job.code}?new`);
      } catch (err) {
        b.disabled = false;
        toast(err.limit ? err.message : err.busy ? `${MAKER}还在忙，过一会儿再试` : err.message);
      }
    };
  }

  async function loadSquare(box, limit) {
    box.innerHTML = '<div class="empty on-felt" style="grid-column:1/-1">正在打开…</div>';
    try {
      const { songs } = await api('/api/square');
      const list = limit ? songs.slice(0, limit) : songs;
      box.innerHTML = list.length
        ? list.map((j) => `<a class="song-card paper" href="#/square/${j.id}">${songCardInner(j, false)}</a>`).join('')
        : '<div class="paper empty" style="grid-column:1/-1">还没有人公开歌。做好的歌可以选择「公开给大家听」。</div>';
    } catch (e) {
      box.innerHTML = `<div class="paper empty" style="grid-column:1/-1">${esc(e.message)}</div>`;
    }
  }

  function renderSquare() {
    view.innerHTML = `
      <a class="back" href="#/">${ICON.left}首页</a>
      <h1 class="on-felt">大家的歌</h1>
      <p class="on-felt" style="margin-top:0">这些是大家愿意公开的歌。</p>
      <div class="songs" id="square"></div>`;
    loadSquare($('#square'));
  }

  async function loadMySongs() {
    const box = $('#songs');
    const codes = mySongs();
    if (!codes.length) {
      box.innerHTML = `<div class="paper empty" style="grid-column:1/-1">还没有歌。点上面任意一个开始做第一首吧。</div>`;
      return;
    }
    box.innerHTML = codes.map((c) => `<a class="song-card paper" href="#/song/${c}" data-code="${c}"><div class="cover"><img class="dog" src="${dogSrc(store.get('profile').dog)}" alt=""></div><div class="t">号码 ${c}</div><div class="n">正在打开…</div></a>`).join('');
    await Promise.all(codes.map(async (c) => {
      const el = box.querySelector(`[data-code="${c}"]`);
      try {
        const j = await api(`/api/songs/${c}`);
        if (el) el.innerHTML = songCardInner(j, true);
      } catch (e) {
        if (el) el.remove();
        store.set('mysongs', mySongs().filter((x) => x !== c));
      }
    }));
    if (!box.children.length) loadMySongs();
  }

  function coverHtml(j) {
    if (j.hasCover) return `<img class="photo" src="${fileUrl(j, 'cover')}${j.coverVer ? '&v=' + j.coverVer : ''}" alt="封面">`;
    if (j.hasDrawing) return `<img ${j.kind === 'photo' ? 'class="photo" ' : ''}src="${fileUrl(j, 'drawing')}" alt="${esc(j.name)}${j.kind === 'photo' ? '的照片' : '画的画'}">`;
    return `<img class="dog" src="${dogSrc(j.dog)}" alt="">`;
  }
  function statusChip(j) {
    return j.status === 'done'
      ? '<span class="chip-status done">可以听了</span>'
      : '<span class="chip-status queued">还在做</span>';
  }
  function songCardInner(j, mine) {
    return `<div class="cover">${coverHtml(j)}${mine ? `<span class="badge">${statusChip(j)}</span>` : ''}</div>
      <div class="t">${esc(j.title)}</div><div class="n">${mine ? `号码 ${j.code}${j.public ? ' · 已公开' : ''}` : esc(j.name)}</div>`;
  }

  function chipsHtml(name, opts, current, front = opts.length) {
    const chip = ([id, l]) => `<button type="button" class="chip" data-v="${id}" aria-pressed="${id === current}">${l}</button>`;
    const open = opts.findIndex(([id]) => id === current) >= front;
    const more = opts.length > front
      ? `<span class="more" ${open ? '' : 'hidden'}>${opts.slice(front).map(chip).join('')}</span><button type="button" class="chip ghost" data-more ${open ? 'hidden' : ''}>更多风格…</button>`
      : '';
    return `<div class="chips" data-name="${name}">${opts.slice(0, front).map(chip).join('')}${more}</div>`;
  }
  function bindChips(root, state) {
    root.querySelectorAll('.chips').forEach((box) => box.addEventListener('click', (e) => {
      const b = e.target.closest('.chip');
      if (!b) return;
      if (b.hasAttribute('data-more')) { b.hidden = true; box.querySelector('.more').hidden = false; return; }
      state[box.dataset.name] = b.dataset.v;
      store.set('pref.' + box.dataset.name, b.dataset.v);
      box.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', x === b));
    }));
  }
  function styleCardHtml(state) {
    const cur = SG.styles.find((x) => x.id === state.style) || SG.styles[0];
    const cat = cur.cats[0];
    return `<section class="paper card">
      <h2>想要什么样的歌？</h2>
      <div class="style-tabs" role="tablist">${SG.cats.map(([id, l]) => `<button type="button" role="tab" data-cat="${id}" aria-selected="${id === cat}">${l}</button>`).join('')}</div>
      <div class="style-grid" id="style-grid">${styleChips(cat, state.style)}</div>
      <div class="voice-row"><span>谁来唱</span>${chipsHtml('voice', VOICES, state.voice)}</div>
    </section>`;
  }
  function styleChips(cat, current) {
    return SG.styles.map((x, i) => (x.cats.includes(cat)
      ? `<button type="button" class="style-chip" data-style="${x.id}" style="--c:${CHIP_COLORS[i % CHIP_COLORS.length]}" aria-pressed="${x.id === current}">${esc(x.label)}</button>`
      : '')).join('');
  }
  function bindStyles(root, state) {
    const grid = root.querySelector('#style-grid');
    root.querySelector('.style-tabs').addEventListener('click', (e) => {
      const t = e.target.closest('[data-cat]');
      if (!t) return;
      root.querySelectorAll('.style-tabs [data-cat]').forEach((x) => x.setAttribute('aria-selected', x === t));
      grid.innerHTML = styleChips(t.dataset.cat, state.style);
    });
    grid.addEventListener('click', (e) => {
      const b = e.target.closest('[data-style]');
      if (!b) return;
      state.style = b.dataset.style;
      store.set('pref.style', state.style);
      grid.querySelectorAll('[data-style]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    });
  }

  // ---------- story ----------
  const draft = { story: '', words: '', lyrics: '', title: '', ...store.get('draft', {}) };
  const saveDraft = () => store.set('draft', draft);

  // Songs that could not be handed in (no answer from the server). Kept on this device until sent.
  const pending = {
    all: () => store.get('pending', []),
    add(body, why) {
      const item = { id: Date.now(), body, why };
      store.set('pending', [item, ...pending.all()]);
      if (!pending.all().some((x) => x.id === item.id)) {
        // Probably out of space because of the drawing: keep the words at least.
        store.set('pending', [{ id: item.id, why, body: { ...body, image: undefined } }, ...pending.all()]);
      }
    },
    remove(id) { store.set('pending', pending.all().filter((x) => x.id !== id)); },
  };

  function renderStory() {
    const state = { style: store.get('pref.style', 'nostalgic'), voice: store.get('pref.voice', 'any') };
    view.innerHTML = `
      <a class="back" href="#/">${ICON.left}首页</a>
      <section class="paper card">
        <h1>讲一个故事</h1>
        <p class="hint">像聊天一样写下来就行。比如：今天发生的一件事、家里的小狗、很久以前的老房子。不想打字的话，点键盘上的话筒也能说话。</p>
        <div class="talk">
          <textarea id="story" placeholder="顺着薄扶林道看下去，能看到纸片楼的缝隙里的紫色晚霞，和远处一点点海">${esc(draft.story)}</textarea>
        </div>
      </section>
      ${styleCardHtml(state)}
      <button class="btn primary big block" id="write">${ICON.music} 讲完了，帮我写歌词</button>
      <div id="result"></div>`;
    const ta = $('#story');
    ta.addEventListener('input', () => { draft.story = ta.value; });
    const sync = setInterval(() => { draft.story = ta.value; saveDraft(); }, 800);
    cleanup = () => clearInterval(sync);
    bindChips(view, state);
    bindStyles(view, state);
    $('#write').addEventListener('click', () => {
      draft.story = ta.value.trim();
      if (draft.story.length < 6) return toast('再多说几句，歌词会写得更好');
      writeLyrics({ kind: 'story', story: draft.story, ...state }, $('#write'));
    });
  }

  // ---------- own lyrics ----------
  function renderWrite() {
    const state = { style: store.get('pref.style', 'nostalgic'), voice: store.get('pref.voice', 'any') };
    view.innerHTML = `
      <a class="back" href="#/">${ICON.left}首页</a>
      <section class="paper card">
        <h1>写下你的歌词</h1>
        <p class="hint">整首都写好了，就一字不改直接做成歌；只写了几句，就保留你的句子，帮你接着写完。</p>
        <input type="text" id="own-title" class="title-input" maxlength="20" placeholder="歌名（不填就帮你起一个）" value="${esc(draft.title)}" autocomplete="off">
        <textarea id="own" style="min-height:300px" placeholder="一句一行，比如：\n门前一棵大树\n夏天知了叫不停">${esc(draft.lyrics)}</textarea>
      </section>
      ${styleCardHtml(state)}
      <button class="btn primary big block" id="write">${ICON.music} 写好了，下一步</button>
      <div id="result"></div>`;
    const ta = $('#own');
    ta.addEventListener('input', () => { draft.lyrics = ta.value; });
    const sync = setInterval(() => { draft.lyrics = ta.value; saveDraft(); }, 800);
    cleanup = () => clearInterval(sync);
    bindChips(view, state);
    bindStyles(view, state);
    $('#write').addEventListener('click', () => {
      draft.lyrics = ta.value.trim();
      if (draft.lyrics.length < 4) return toast('先写几句歌词吧');
      draft.title = $('#own-title').value.trim();
      writeLyrics({ kind: 'lyrics', story: draft.lyrics, title: draft.title, ...state }, $('#write'));
    });
  }

  async function writeLyrics(req, btn) {
    const p = store.get('profile');
    const out = $('#result');
    btn.disabled = true;
    const doing = req.kind === 'lyrics' ? '正在看你的歌词' : req.kind === 'photo' ? '正在看你的照片、写歌词' : '正在写歌词';
    out.innerHTML = `<div class="paper card loading"><img src="${dogSrc(p.dog)}" alt="">${esc(dogName(p.dog))}${doing}，大约半分钟，请稍等…</div>`;
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      const r = await api('/api/lyrics', { method: 'POST', body: { ...req, name: p.name } });
      showLyrics(r, req, btn);
    } catch (e) {
      saveDraft();
      out.innerHTML = e.busy
        ? `<div class="paper card busy"><img src="${dogSrc(p.dog)}" alt=""><div><b>${e.limit ? '今天写歌词的次数用完了' : `${esc(MAKER)}正在忙！`}</b><br>你写的内容已经存在这台设备上了，不会丢。${e.limit ? '明天' : '过一会儿'}再点一次上面的按钮就行。</div></div>`
        : '';
      if (!e.busy) toast(e.message);
    } finally {
      btn.disabled = false;
    }
  }

  function lyricsHtml(text) {
    const names = { verse: '段落', 'verse 1': '第一段', 'verse 2': '第二段', 'verse 3': '第三段', chorus: '副歌（反复唱）', bridge: '转折', outro: '结尾', intro: '开头', 'pre-chorus': '副歌前' };
    return esc(text).replace(/\[([^\]]+)\]\n?/g, (_, t) => `<span class="tag">${names[t.toLowerCase()] || esc(t)}</span>\n`);
  }

  function showLyrics(r, req, btn) {
    const out = $('#result');
    out.innerHTML = `
      <section class="paper card lyrics-card">
        ${r.picture ? `<div class="saw">${req.kind === 'photo' ? '照片里有' : '你画的是'}：${esc(r.picture)}</div>` : ''}
        ${req.kind === 'lyrics' ? `<div class="saw">${r.kept ? '你的歌词很完整，一个字没改，只标上了哪段是主歌、哪段是副歌。' : '你写的句子都留着，帮你接着写成了一整首。'}</div>` : ''}
        <label class="title-edit">
          <span>歌名</span>
          <input type="text" id="song-title" maxlength="20" value="${esc(r.title)}" autocomplete="off">
          ${ICON.pen}
        </label>
        ${req.title ? '' : '<p class="hint" style="margin:4px 0 0">歌名是帮你起的，点一下就能改成你想要的。</p>'}
        <div class="lyrics">${lyricsHtml(r.lyrics)}</div>
        <label class="share"><input type="checkbox" id="pub"><span class="switch"></span><span>做好后公开到「大家的歌」，让别人也能听</span></label>
        <div class="row">
          <button class="btn primary big" id="ok">这首好，做成歌</button>
          <button class="btn" id="again">${req.kind === 'lyrics' && r.kept ? '再看一遍' : '不满意，重新写'}</button>
        </div>
      </section>`;
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#again').addEventListener('click', () => writeLyrics(req, btn));
    $('#ok').addEventListener('click', async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      const p = store.get('profile');
      const body = { name: p.name, dog: p.dog, kind: req.kind, story: req.story || '', image: req.image, title: $('#song-title').value.trim() || r.title, lyrics: r.lyrics, tags: r.tags, public: $('#pub').checked };
      const clearDraft = () => {
        if (req.kind === 'story') draft.story = '';
        else if (req.kind === 'lyrics') { draft.lyrics = ''; draft.title = ''; }
        else if (req.kind === 'photo') { draft.photoWords = ''; photo.image = ''; }
        else { draft.words = ''; pad.clear(); }
        saveDraft();
      };
      try {
        const job = await api('/api/jobs', { method: 'POST', body });
        ownerKeys.set(job.code, job.ownerKey);
        rememberSong(job.code);
        clearDraft();
        go(`/song/${job.code}?new`);
      } catch (err) {
        if (err.busy) {
          pending.add(body, err.limit ? 'limit' : 'busy');
          clearDraft();
          go('/');
          toast(err.limit ? err.message : `${MAKER}正在忙！歌词和风格已经存好`);
        } else {
          b.disabled = false;
          toast(err.message);
        }
      }
    });
  }

  // ---------- photo ----------
  const photo = { image: '' }; // kept in memory so the choice survives going back and forth

  function renderPhoto() {
    const state = { style: store.get('pref.style', 'nostalgic'), voice: store.get('pref.voice', 'any') };
    view.innerHTML = `
      <a class="back" href="#/">${ICON.left}首页</a>
      <section class="paper card">
        <h1>选一张照片</h1>
        <p class="hint">老照片、今天拍的、一家人的合影都可以。我们会看看照片里有什么，帮你写成一首歌，照片会当作这首歌的封面。</p>
        <div class="photo-box" id="photo-box"></div>
        <label class="btn primary big block photo-pick">${ICON.image}<span id="pick-label">选照片</span><input type="file" accept="image/*" id="photo-file" hidden></label>
      </section>
      <section class="paper card">
        <h2>这张照片是什么？</h2>
        <p class="hint">可以不说。说一句是谁、在哪里、什么时候，歌词会写得更贴切。</p>
        <textarea id="photo-words" style="min-height:120px">${esc(draft.photoWords || '')}</textarea>
      </section>
      ${styleCardHtml(state)}
      <button class="btn primary big block" id="write">${ICON.music} 选好了，帮我写歌词</button>
      <div id="result"></div>`;
    const box = $('#photo-box');
    const show = () => {
      box.innerHTML = photo.image ? `<img src="${photo.image}" alt="你选的照片">` : '';
      box.hidden = !photo.image;
      $('#pick-label').textContent = photo.image ? '换一张' : '选照片';
    };
    show();
    $('#photo-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try { photo.image = await shrinkImage(file, 1200); show(); }
      catch (err) { toast(err.message || '这张照片用不了，换一张试试'); }
      e.target.value = '';
    });
    const ta = $('#photo-words');
    ta.addEventListener('input', () => { draft.photoWords = ta.value; });
    const sync = setInterval(() => { draft.photoWords = ta.value; saveDraft(); }, 800);
    cleanup = () => clearInterval(sync);
    bindChips(view, state);
    bindStyles(view, state);
    $('#write').addEventListener('click', () => {
      if (!photo.image) return toast('先选一张照片吧');
      draft.photoWords = ta.value.trim();
      writeLyrics({ kind: 'photo', story: draft.photoWords, image: photo.image, ...state }, $('#write'));
    });
  }

  // ---------- drawing pad ----------
  const pad = (() => {
    const W = 1200, H = 900, BG = '#fffaf0';
    const strokes = [];
    let canvas = null, ctx = null, color = COLORS[0], size = 14, erasing = false, current = null;

    function mount(el) {
      canvas = el;
      canvas.width = W; canvas.height = H;
      ctx = canvas.getContext('2d');
      redraw();
      canvas.addEventListener('pointerdown', down);
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerup', up);
      canvas.addEventListener('pointercancel', up);
      canvas.addEventListener('pointerleave', up);
    }
    function pt(e) {
      const r = canvas.getBoundingClientRect();
      const p = e.pointerType === 'pen' ? (e.pressure || 0.5) : 0.5;
      return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height, p];
    }
    function down(e) {
      if (current) return;
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      current = { color: erasing ? BG : color, size: erasing ? size * 2.5 : size, pen: e.pointerType === 'pen', points: [pt(e)], id: e.pointerId };
      strokes.push(current);
      drawStroke(current, true);
    }
    function move(e) {
      if (!current || e.pointerId !== current.id) return;
      e.preventDefault();
      let evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      if (!evs.length) evs = [e];
      for (const ev of evs) current.points.push(pt(ev));
      drawStroke(current, false);
    }
    function up(e) { if (current && e.pointerId === current.id) current = null; }
    function width(s, p) { return s.pen ? s.size * (0.35 + p * 1.3) : s.size; }
    // Each segment is painted exactly once, so a full redraw (undo) matches what was drawn live.
    function drawStroke(s, fromStart) {
      ctx.strokeStyle = ctx.fillStyle = s.color;
      ctx.lineCap = ctx.lineJoin = 'round';
      const pts = s.points;
      if (fromStart) {
        ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], width(s, pts[0][2]) / 2, 0, Math.PI * 2); ctx.fill();
        s.drawn = 1;
      }
      for (let i = s.drawn; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        ctx.lineWidth = width(s, b[2]);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      s.drawn = pts.length;
    }
    function redraw() {
      ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
      for (const s of strokes) drawStroke(s, true);
    }
    return {
      mount,
      setColor(c) { color = c; erasing = false; },
      setSize(s) { size = s; },
      setEraser(on) { erasing = on; },
      undo() { strokes.pop(); if (ctx) redraw(); },
      clear() { strokes.length = 0; if (ctx) redraw(); },
      isEmpty: () => strokes.length === 0,
      get color() { return color; }, get size() { return size; }, get erasing() { return erasing; },
      toDataUrl: () => canvas.toDataURL('image/jpeg', 0.85),
    };
  })();

  function renderDraw() {
    const state = { style: store.get('pref.style', 'cheerful'), voice: store.get('pref.voice', 'any') };
    const sizes = [[6, '细'], [14, '中'], [30, '粗']];
    view.innerHTML = `
      <a class="back" href="#/">${ICON.left}首页</a>
      <h1 class="on-felt">画一幅画</h1>
      <div class="draw-layout">
        <div class="paper pad-frame"><canvas id="pad" aria-label="画板"></canvas></div>
        <div class="paper tools" id="tools">
          <div class="palette">
            ${COLORS.map((c) => `<button class="swatch" data-color="${c}" style="background:${c}" aria-label="颜色" aria-pressed="${!pad.erasing && pad.color === c}"></button>`).join('')}
          </div>
          <div class="tool-row">
            <div class="seg" role="group" aria-label="笔的粗细">
              ${sizes.map(([sz, l]) => `<button data-size="${sz}" aria-label="${l}" aria-pressed="${pad.size === sz}"><span class="dot" style="width:${Math.max(6, sz * 0.7)}px;height:${Math.max(6, sz * 0.7)}px"></span></button>`).join('')}
            </div>
            <div class="acts">
              <button class="act" data-act="eraser" aria-pressed="${pad.erasing}">${ICON.eraser}<span>橡皮</span></button>
              <button class="act" data-act="undo">${ICON.undo}<span>退一步</span></button>
              <button class="act" data-act="clear">${ICON.trash}<span>全擦掉</span></button>
            </div>
          </div>
        </div>
      </div>
      <section class="paper card">
        <h2>你画的是什么？</h2>
        <p class="hint">可以不说，我们会自己看你的画。说一句，歌词会写得更贴切。</p>
        <div class="talk">
          <textarea id="words" style="min-height:120px">${esc(draft.words)}</textarea>
        </div>
      </section>
      ${styleCardHtml(state)}
      <button class="btn primary big block" id="write">${ICON.music} 画好了，帮我写歌词</button>
      <div id="result"></div>`;
    pad.mount($('#pad'));
    const tools = $('#tools');
    const refresh = () => {
      tools.querySelectorAll('.swatch').forEach((b) => b.setAttribute('aria-pressed', !pad.erasing && b.dataset.color === pad.color));
      tools.querySelectorAll('[data-size]').forEach((b) => b.setAttribute('aria-pressed', Number(b.dataset.size) === pad.size));
      tools.querySelector('[data-act=eraser]').setAttribute('aria-pressed', pad.erasing);
    };
    tools.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.color) pad.setColor(b.dataset.color);
      else if (b.dataset.size) pad.setSize(Number(b.dataset.size));
      else if (b.dataset.act === 'eraser') pad.setEraser(!pad.erasing);
      else if (b.dataset.act === 'undo') pad.undo();
      else if (b.dataset.act === 'clear') { if (!pad.isEmpty() && confirm('整幅画都会擦掉，确定重画吗？')) pad.clear(); }
      refresh();
    });
    const ta = $('#words');
    ta.addEventListener('input', () => { draft.words = ta.value; });
    const sync = setInterval(() => { draft.words = ta.value; saveDraft(); }, 800);
    cleanup = () => clearInterval(sync);
    bindChips(view, state);
    bindStyles(view, state);
    $('#write').addEventListener('click', () => {
      if (pad.isEmpty()) return toast('先在白纸上画点东西吧');
      draft.words = ta.value.trim();
      writeLyrics({ kind: 'drawing', story: draft.words, image: pad.toDataUrl(), ...state }, $('#write'));
    });
  }

  // ---------- song page ----------
  function renderSong(key, shared) {
    const isNew = location.hash.includes('?new');
    const back = `<a class="back" href="#${shared ? '/square' : '/'}">${ICON.left}${shared ? '大家的歌' : '首页'}</a>`;
    view.innerHTML = `${back}<div class="paper card loading"><img src="${dogSrc('pug')}" alt="">正在打开…</div>`;
    let timer = null, alive = true;
    cleanup = () => { alive = false; clearTimeout(timer); };

    const load = async () => {
      let j;
      try { j = await api(shared ? `/api/square/${key}` : `/api/songs/${key}`, shared ? {} : { headers: asOwner(key) }); } catch (e) {
        if (!alive) return;
        view.innerHTML = `${back}<div class="paper card empty">${esc(e.message)}</div>`;
        return;
      }
      if (!alive) return;
      if (!shared) rememberSong(j.code);
      const done = j.status === 'done' && j.hasAudio;
      const who = j.kind === 'photo' ? `${esc(j.name)}的照片` : `${esc(j.name)}${({ drawing: '画', lyrics: '写' })[j.kind] || '讲'}的`;
      view.innerHTML = `
        ${back}
        <section class="paper song-hero">
          <div>
            <div class="cover" id="cover">${coverHtml(j)}</div>
            ${!j.canEdit ? '' : `<label class="cover-btn">${ICON.image}<span>${j.hasCover ? '换一张封面' : '用照片当封面'}</span><input type="file" accept="image/*" id="cover-file" hidden></label>`}
          </div>
          <div>
            ${shared ? '' : `<div class="song-no">取歌号码 <b>${j.code}</b></div>`}
            <h1>《${esc(j.title)}》</h1>
            <p class="hint">${who}</p>
            ${done ? `
              <div class="row">
                <button class="btn primary big" id="play">${ICON.play} 播放</button>
                <a class="btn dark big" href="${fileUrl(j, 'audio', true)}">${ICON.down} 存到这台设备</a>
              </div>
              ${shared ? '' : '<p class="hint" style="margin:12px 0 0">喜欢的歌记得存下来：这里放不下太多，最早的歌以后会被清掉。</p>'}` : `
              ${isNew ? `<p style="margin:6px 0">交上去了！记住你的取歌号码，以后输入它就能找到这首歌：</p><div class="big-no">${j.code}</div>` : ''}
              <div class="waiting"><img src="${dogSrc(j.dog)}" alt=""><div><b>${esc(MAKER)}正在忙！</b><br>你的歌词和风格已经存好了，轮到这首就开始做，一般当天就好。做好以后，在首页「我的歌」里点它就能听。</div></div>`}
            ${!j.canEdit ? '' : `<label class="share"><input type="checkbox" id="pub" ${j.public ? 'checked' : ''}><span class="switch"></span><span>公开到「大家的歌」${done ? '' : '（做好后才会出现）'}</span></label>`}
          </div>
        </section>
        <section class="paper card"><h2>歌词</h2><div class="lyrics">${lyricsHtml(j.lyrics)}</div></section>`;
      if (done) $('#play').addEventListener('click', () => player.play(j));
      else timer = setTimeout(load, 30000);
      if (!j.canEdit) return;

      $('#pub').addEventListener('change', async (e) => {
        const box = e.currentTarget;
        try {
          j = await api(`/api/songs/${j.code}/public`, { method: 'POST', body: { public: box.checked }, headers: asOwner(j.code) });
          toast(j.public ? '已公开，大家都能听到了' : '已取消公开，只有你能听');
        } catch (err) { box.checked = !box.checked; toast(err.message); }
      });
      $('#cover-file').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          toast('正在上传封面…');
          const image = await shrinkImage(file, 900);
          j = await api(`/api/songs/${j.code}/cover`, { method: 'POST', body: { image }, headers: asOwner(j.code) });
          j.coverVer = Date.now();
          $('#cover').innerHTML = coverHtml(j);
          toast('封面换好了');
        } catch (err) { toast(err.message || '这张图片用不了，换一张试试'); }
      });
    };
    load();
  }

  // Photos from a phone can be 5MB+; scale down to a square-ish JPEG before sending.
  function shrinkImage(file, max) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('这张图片打不开，换一张试试'));
      img.src = URL.createObjectURL(file);
    });
  }

  // ---------- player dock ----------
  const player = (() => {
    const audio = $('#audio'), bar = $('#player'), pp = $('#pl-pp'), seek = $('#pl-seek');
    const fmt = (s) => (isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');
    const sync = () => { pp.innerHTML = audio.paused ? ICON.play : ICON.pause; };
    audio.addEventListener('play', sync);
    audio.addEventListener('pause', sync);
    audio.addEventListener('timeupdate', () => {
      $('#pl-cur').textContent = fmt(audio.currentTime);
      $('#pl-dur').textContent = fmt(audio.duration);
      if (audio.duration) seek.value = Math.round(audio.currentTime / audio.duration * 1000);
    });
    audio.addEventListener('error', () => toast('这首歌现在放不了，请过一会儿再试'));
    seek.addEventListener('input', () => { if (audio.duration) audio.currentTime = seek.value / 1000 * audio.duration; });
    pp.addEventListener('click', () => (audio.paused ? audio.play() : audio.pause()));
    sync();
    return {
      play(j) {
        const src = fileUrl(j, 'audio');
        if (audio.dataset.src !== src) {
          audio.src = src;
          audio.dataset.src = src;
          $('#pl-title').textContent = `《${j.title}》`;
          $('#pl-thumb').innerHTML = coverHtml(j);
        }
        bar.classList.add('show');
        audio.play().catch(() => {});
      },
    };
  })();

  render();
})();
