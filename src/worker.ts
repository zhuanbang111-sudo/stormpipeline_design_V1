import { onRequestGet, onRequestPost, onRequestDelete } from '../functions/api/scenarios';

export interface Env {
  DB: any;
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    const url = new URL(request.url);

    // Intercept scenario cloud API endpoints
    if (url.pathname === '/api/scenarios' || url.pathname.startsWith('/api/scenarios/')) {
      const context = { request, env: env as any };
      try {
        if (request.method === 'GET') {
          return await onRequestGet(context);
        } else if (request.method === 'POST') {
          return await onRequestPost(context);
        } else if (request.method === 'DELETE') {
          return await onRequestDelete(context);
        } else {
          return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
            status: 405,
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message || String(err) }), {
          status: 500,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
    }

    // Pass through all other asset traffic (HTML, JS, CSS, assets) securely to Static Assets router
    if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      return await env.ASSETS.fetch(request);
    }

    return new Response("Asset Router Offline. Please check your wrangler.toml setting.", { status: 503 });
  }
};
