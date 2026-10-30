// Points the React app's fetch at the real Express app (through supertest, with a cookie
// jar), so a jsdom test exercises UI, routes, services and PostgreSQL together.
import request from 'supertest';
import { vi } from 'vitest';

export function proxyFetchTo(app) {
  const agent = request.agent(app);
  vi.stubGlobal('fetch', async (url, init = {}) => {
    let req = agent[(init.method ?? 'GET').toLowerCase()](url);
    if (init.body) req = req.set('content-type', 'application/json').send(init.body);
    const res = await req;
    return new Response(res.status === 204 ? null : JSON.stringify(res.body), {
      status: res.status,
      headers: { 'content-type': 'application/json' },
    });
  });
  return agent;
}
