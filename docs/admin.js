(() => {
  'use strict';
  const API = ((window.GG_CONFIG || {}).apiBase || '').replace(/\/$/, '');
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const view = $('#view');
  const get = (k) => { try { return localStorage.getItem('gg.admin.' + k) || ''; } catch { return ''; } };
  const set = (k, v) => { try { localStorage.setItem('gg.admin.' + k, v); } catch {} };

  let token = get('token');
  let tab = get('tab') || 'queued';
  let jobs = [];

  let tt;
  function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2600); }

  async function api(path, opts = {}) {
    const res = await fetch(API + path, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
    let data = {};
    try { data = await res.json(); } catch {}
    if (res.status === 401) { token = ''; set('token', ''); render(); }
    if (!res.ok) throw new Error(data.error || `出错了 (${res.status})`);
    return data;
  }

  function login() {
    $('#logout').hidden = true;
    view.innerHTML = `<section class="paper card" style="max-width:520px;margin:40px auto">
      <h1>管理口令</h1><p class="hint">就是 Worker 里设置的 ADMIN_TOKEN。</p>
      <form id="f"><input type="password" id="t" autocomplete="current-password"><div style="margin-top:14px"><button class="btn primary block">进入</button></div></form></section>`;
    $('#f').addEventListener('submit', (e) => { e.preventDefault(); token = $('#t').value.trim(); set('token', token); render(); });
  }

  async function render() {
    if (!token) return login();
    $('#logout').hidden = false;
    let max = 100;
    try { const d = await api('/api/admin/jobs'); jobs = d.jobs; max = d.max || max; } catch (e) { if (token) toast(e.message); return; }
    const q = jobs.filter((j) => j.status === 'queued');
    const shown = tab === 'all' ? jobs : jobs.filter((j) => j.status === tab);
    view.innerHTML = `
      <div class="tabs">
        ${[['queued', `待做 ${q.length}`], ['done', `已完成 ${jobs.length - q.length}`], ['all', '全部']].map(([k, l]) => `<button class="chip" data-tab="${k}" aria-pressed="${tab === k}">${l}</button>`).join('')}
        <button class="btn mini" id="refresh">刷新</button>
        <span class="on-felt" style="margin-left:auto;font-size:15px">共 ${jobs.length} / ${max} 首，满了会自动删掉最早做好的</span>
      </div>
      <label class="drop" id="drop">
        <b>批量上传：</b>把 mp3 一起拖到这里，文件名以编号开头就行（比如 <code>12.mp3</code>、<code>12号 院子里的光.mp3</code>）。
        <input type="file" id="bulk" accept="audio/*" multiple hidden>
      </label>
      ${shown.length ? shown.map(jobHtml).join('') : '<div class="paper empty">这里空空的 🐶</div>'}`;
    bind();
  }

  function jobHtml(j) {
    const t = encodeURIComponent(token);
    const cover = j.hasCover ? `<img src="${API}/api/admin/jobs/${j.id}/cover?t=${t}" alt="">` : j.hasDrawing ? `<img src="${API}/api/admin/jobs/${j.id}/drawing?t=${t}" alt="">` : `<img class="dog" src="assets/dogs/${esc(j.dog)}.webp" alt="">`;
    const when = new Date(j.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `<article class="paper job" data-id="${j.id}">
      <div><div class="cover">${cover}</div></div>
      <div>
        <div class="row" style="justify-content:space-between">
          <h3>${j.id} ·《${esc(j.title)}》</h3>
          <span class="chip-status ${j.status}">${j.status === 'done' ? '已完成' : '待做'}</span>
        </div>
        <div class="meta-line">取歌号码 <b>${esc(j.code || '—')}</b> · ${j.public ? '已公开' : '不公开'} · ${esc(j.name)} · ${({ drawing: '画', lyrics: '自己写的词' })[j.kind] || '故事'} · ${when}</div>
        ${field('歌名 Title', j.title, 'title')}
        ${field('风格 Style of Music', j.tags, 'tags')}
        ${field('歌词 Lyrics', j.lyrics, 'lyrics')}
        ${j.story ? `<details><summary>原始故事</summary><pre style="white-space:pre-wrap">${esc(j.story)}</pre></details>` : ''}
        ${j.hasAudio ? `<audio controls preload="none" src="${API}/api/admin/jobs/${j.id}/audio?t=${t}"></audio>` : ''}
        <div class="row" style="margin-top:8px">
          <button class="btn primary mini" data-act="upload">${j.hasAudio ? '重新上传' : '上传 mp3'}</button>
          ${j.hasAudio ? '<button class="btn mini" data-act="unset">撤回音频</button>' : ''}
          <button class="btn mini" data-act="link">复制取歌链接</button>
          <button class="btn mini" data-act="delete" style="margin-left:auto">删除</button>
        </div>
        <div class="progress" hidden><i></i></div>
      </div>
    </article>`;
  }
  function field(label, value, key) {
    return `<div class="field"><div class="lab">${label}<button class="btn mini" data-copy="${key}">复制</button></div><pre>${esc(value)}</pre></div>`;
  }

  function bind() {
    view.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; set('tab', tab); render(); }));
    $('#refresh').addEventListener('click', render);
    const drop = $('#drop');
    $('#bulk').addEventListener('change', (e) => bulk([...e.target.files]));
    dnd(drop, (files) => bulk(files));

    view.querySelectorAll('.job').forEach((card) => {
      const id = Number(card.dataset.id);
      const j = jobs.find((x) => x.id === id);
      dnd(card, (files) => files[0] && upload(id, files[0], card));
      card.addEventListener('click', async (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.copy) {
          try { await navigator.clipboard.writeText(j[b.dataset.copy] || ''); toast('已复制'); } catch { toast('复制失败，手动选一下'); }
        } else if (b.dataset.act === 'upload') {
          const inp = Object.assign(document.createElement('input'), { type: 'file', accept: 'audio/*' });
          inp.onchange = () => inp.files[0] && upload(id, inp.files[0], card);
          inp.click();
        } else if (b.dataset.act === 'unset') {
          if (confirm(`撤回 ${id} 号的音频？`)) { await api(`/api/admin/jobs/${id}/audio`, { method: 'DELETE' }); render(); }
        } else if (b.dataset.act === 'delete') {
          if (confirm(`彻底删除 ${id} 号（歌词、画、音频）？删了找不回来。`)) { await api(`/api/admin/jobs/${id}`, { method: 'DELETE' }); render(); }
        } else if (b.dataset.act === 'link') {
          const url = new URL('./', location.href).href + `#/song/${j.code}`;
          try { await navigator.clipboard.writeText(url); toast('取歌链接已复制'); } catch { prompt('复制这个链接', url); }
        }
      });
    });
  }

  function dnd(el, onFiles) {
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('over'); });
    el.addEventListener('dragleave', () => el.classList.remove('over'));
    el.addEventListener('drop', (e) => {
      e.preventDefault(); e.stopPropagation(); el.classList.remove('over');
      onFiles([...e.dataTransfer.files].filter((f) => f.type.startsWith('audio/') || /\.(mp3|m4a|wav)$/i.test(f.name)));
    });
  }

  async function bulk(files) {
    let ok = 0;
    for (const f of files) {
      const m = f.name.match(/^\s*(\d+)/);
      const card = m && view.querySelector(`.job[data-id="${Number(m[1])}"]`);
      if (!m || !jobs.some((j) => j.id === Number(m[1]))) { toast(`${f.name}：找不到编号`); continue; }
      if (await upload(Number(m[1]), f, card, true)) ok++;
    }
    if (ok) { toast(`上传好了 ${ok} 首`); render(); }
  }

  function upload(id, file, card, quiet) {
    const type = file.type || (/\.m4a$/i.test(file.name) ? 'audio/mp4' : /\.wav$/i.test(file.name) ? 'audio/wav' : 'audio/mpeg');
    const prog = card && card.querySelector('.progress');
    if (prog) prog.hidden = false;
    return new Promise((resolve) => {
      const x = new XMLHttpRequest();
      x.open('PUT', `${API}/api/admin/jobs/${id}/audio`);
      x.setRequestHeader('Authorization', `Bearer ${token}`);
      x.setRequestHeader('Content-Type', type);
      x.upload.onprogress = (e) => { if (prog && e.lengthComputable) prog.firstElementChild.style.width = `${e.loaded / e.total * 100}%`; };
      x.onload = () => {
        if (x.status < 300) { if (!quiet) { toast(`${id} 号上传好了`); render(); } resolve(true); }
        else { let msg = '上传失败'; try { msg = JSON.parse(x.responseText).error || msg; } catch {} toast(`${id} 号：${msg}`); resolve(false); }
      };
      x.onerror = () => { toast(`${id} 号：网络错误`); resolve(false); };
      x.send(file);
    });
  }

  $('#logout').addEventListener('click', () => { token = ''; set('token', ''); render(); });
  // Re-render only when the song list actually changed (one tiny request every 30s).
  let lastPulse = null;
  setInterval(async () => {
    if (!token || document.hidden || view.querySelector('.over')) return;
    try {
      const { pulse } = await api('/api/admin/pulse');
      if (lastPulse !== null && pulse !== lastPulse) render();
      lastPulse = pulse;
    } catch {}
  }, 30000);
  render();
})();
