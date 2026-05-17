interface Env {
  VPS_DISCOURSE_ORIGIN: string;
}

export async function onRequest(
  context: EventContext<Env, string, Record<string, unknown>>
): Promise<Response> {
  const { request, env } = context;
  const origin = env.VPS_DISCOURSE_ORIGIN;

  if (!origin) {
    return new Response('VPS_DISCOURSE_ORIGIN not configured', { status: 503 });
  }

  const url = new URL(request.url);
  const targetUrl = new URL(url.pathname + url.search, origin);

  const headers = new Headers(request.headers);
  headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') ?? '');
  headers.set('X-Forwarded-Proto', 'https');
  headers.delete('Host');

  const proxied = new Request(targetUrl.toString(), {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'manual',
  });

  return fetch(proxied);
}
