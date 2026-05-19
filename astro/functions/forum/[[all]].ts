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
  const host = new URL(request.url).hostname;

  const headers = new Headers(request.headers);
  headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') ?? '');
  headers.set('X-Forwarded-Proto', 'https');
  headers.set('Host', host);

  const proxied = new Request(targetUrl.toString(), {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'manual',
  });

  const response = await fetch(proxied);

  // Reconstruct redirect responses to preserve Set-Cookie headers
  // (Cloudflare silently drops Set-Cookie from opaqueredirect responses)
  if (response.status >= 300 && response.status < 400) {
    const newHeaders = new Headers();

    response.headers.forEach((value, name) => {
      if (name.toLowerCase() !== 'set-cookie') {
        newHeaders.set(name, value);
      }
    });

    const setCookieHeader = response.headers.get('set-cookie');
    if (setCookieHeader) {
      // getAll() available in CF Workers for multi-value headers
      const cookies: string[] = (response.headers as any).getAll?.('set-cookie')
        ?? [setCookieHeader];
      cookies.forEach(c => newHeaders.append('set-cookie', c));
    }

    return new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  }

  return response;
}
