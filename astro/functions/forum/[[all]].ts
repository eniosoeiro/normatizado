interface Env {
  VPS_DISCOURSE_ORIGIN: string;
}

export async function onRequest(
  context: EventContext<Env, string, Record<string, unknown>>
): Promise<Response> {
  const { request, env } = context;
  const origin = env.VPS_DISCOURSE_ORIGIN;

  const url = new URL(request.url);

  if (url.pathname === '/forum/_debug') {
    return new Response(JSON.stringify({ origin: origin ?? null, path: url.pathname }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  if (!origin) {
    return new Response('VPS_DISCOURSE_ORIGIN not configured', { status: 503 });
  }

  const targetUrl = new URL(url.pathname + url.search, origin);
  const host = new URL(request.url).hostname;

  const headers = new Headers(request.headers);
  headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') ?? '');
  headers.set('X-Forwarded-Proto', 'https');
  headers.set('Host', host);

  if (url.pathname === '/forum/_debug2') {
    const resp = await fetch(new Request(targetUrl.toString(), { method: 'GET', headers, redirect: 'manual' }));
    return new Response(JSON.stringify({
      targetUrl: targetUrl.toString(),
      host,
      vpsStatus: resp.status,
      vpsContentType: resp.headers.get('content-type'),
      vpsLocation: resp.headers.get('location'),
    }), { headers: { 'content-type': 'application/json' } });
  }

  const proxied = new Request(targetUrl.toString(), {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'manual',
  });

  return fetch(proxied);
}
