# Google OAuth Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Google OAuth ("Conectar com o Google") no fórum Normatizado, preservando Set-Cookie headers durante redirects no Cloudflare Worker proxy.

**Architecture:** Um arquivo modificado (`astro/functions/forum/[[all]].ts`) — intercept respostas 3xx, reconstruir com Set-Cookie explícito. Pré-requisito manual no Google Cloud Console.

**Tech Stack:** Cloudflare Pages Functions (TypeScript), Discourse (Rails/Docker no VPS), Google OAuth2 via OmniAuth.

---

## File Map

- **Modify:** `astro/functions/forum/[[all]].ts` (único arquivo alterado — linhas 24-31)
- **No new files needed**

---

### Task 1: Manual Prerequisite — Google Cloud Console

**Files:**
- None (manual action)

- [ ] **Step 1: Acessar Google Cloud Console**

Navegar para: console.cloud.google.com → APIs & Services → Credentials

- [ ] **Step 2: Editar OAuth 2.0 Client ID do Normatizado**

Em "OAuth 2.0 Client IDs", clicar no client usado pelo Discourse (nome provavelmente contém "Normatizado" ou "Discourse").

- [ ] **Step 3: Verificar/adicionar Authorized Redirect URI**

Em "Authorized redirect URIs", verificar se existe:
```
https://normatizando.com.br/forum/auth/google_oauth2/callback
```
Se não existir, adicionar e salvar.

> **Nota:** Sem este URI autorizado, Google retorna `redirect_uri_mismatch` independente do fix no Worker.

---

### Task 2: Patch Worker — Preservar Set-Cookie em Redirects

**Files:**
- Modify: `astro/functions/forum/[[all]].ts`

- [ ] **Step 1: Ler o arquivo atual**

```
astro/functions/forum/[[all]].ts
```

Estado atual (linhas 24-31):
```typescript
const proxied = new Request(targetUrl.toString(), {
  method: request.method,
  headers,
  body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
  redirect: 'manual',
});

return fetch(proxied);
```

- [ ] **Step 2: Aplicar o patch**

Substituir `return fetch(proxied);` pelo bloco completo abaixo:

```typescript
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
```

O arquivo completo resultante deve ser:

```typescript
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
```

- [ ] **Step 3: Verificar TypeScript — sem erros de tipo**

```bash
cd astro && npx tsc --noEmit 2>&1 | head -20
```

Expected: sem output (ou somente warnings não relacionados a `[[all]].ts`).

- [ ] **Step 4: Commit**

```bash
git add astro/functions/forum/[[all]].ts
git commit -m "fix: preserve Set-Cookie headers in Worker redirect responses for OAuth"
```

- [ ] **Step 5: Deploy**

```bash
cd astro && npx wrangler pages deploy dist --project-name normatizado
```

Ou: push para branch main (se CI/CD via Cloudflare Pages Git integration ativo).

---

### Task 3: Verificar Fix via Browser DevTools

**Files:**
- None (teste manual)

- [ ] **Step 1: Abrir DevTools → Network**

Chrome/Firefox: F12 → aba "Network" → marcar "Preserve log".

- [ ] **Step 2: Navegar para `/forum/login`**

URL: `https://normatizando.com.br/forum/login`

- [ ] **Step 3: Clicar "Conectar com o Google"**

Na aba Network, localizar a requisição `GET /forum/auth/google_oauth2`.

- [ ] **Step 4: Verificar response headers**

Response da requisição `GET /forum/auth/google_oauth2` deve ter:
```
Status: 302
Location: https://accounts.google.com/o/oauth2/auth?state=xxx&...
Set-Cookie: _forum_session=...; SameSite=Lax; Secure; HttpOnly
```

Se `Set-Cookie` ausente → fix não chegou ao browser (cache ou deploy pendente).

- [ ] **Step 5: Completar fluxo Google**

Selecionar conta Google → autorizar → verificar redirect para `/forum`.

Expected: login bem-sucedido, redirecionado para `https://normatizando.com.br/forum`.

- [ ] **Step 6: Confirmar sucesso**

Verificar que sessão está ativa: `https://normatizando.com.br/forum/my/preferences` deve mostrar perfil logado.
