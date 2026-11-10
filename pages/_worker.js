// Cloudflare Pages entry: serves the site and passes /api/* straight to the song Worker
// through a service binding, so visitors only ever talk to one address (the Pages one).
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return env.API.fetch(request);
    return env.ASSETS.fetch(request);
  },
};
