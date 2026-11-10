// apiBase: where the backend lives. Empty on a local dev host (the dev server serves both).
// maker: the name shown when songs are waiting ("小高正在忙！").
window.GG_CONFIG = {
  // Same address as the page on a local dev host and on Cloudflare Pages (which forwards /api/ itself);
  // the Worker's own address when the page is served from GitHub Pages.
  apiBase: /^(localhost|127\.0\.0\.1|\[::1\])$|\.pages\.dev$/.test(location.hostname) ? '' : 'https://guaigou-songs.guaigou.workers.dev',
  maker: '小高',
  // mirror: the address that also works in mainland China; offered when this one cannot reach the backend.
  mirror: 'https://guaigou-songs.pages.dev/',
  // gate: true asks visitors for a passphrase. Turn it on together with
  // REQUIRE_FAMILY_KEY = "1" in worker/wrangler.toml (then redeploy the Worker).
  gate: false,
};
