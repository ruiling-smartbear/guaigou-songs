// apiBase: where the backend lives. Empty on a local dev host (the dev server serves both).
// maker: the name shown when songs are waiting ("小高正在忙！").
window.GG_CONFIG = {
  apiBase: /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) ? '' : 'https://guaigou-songs.guaigou.workers.dev',
  maker: '小高',
  // gate: true asks visitors for a passphrase. Turn it on together with
  // REQUIRE_FAMILY_KEY = "1" in worker/wrangler.toml (then redeploy the Worker).
  gate: false,
};
