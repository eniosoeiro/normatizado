# Google OAuth Fix — Cloudflare Worker Proxy Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix Google OAuth ("Conectar com o Google") no fórum Normatizado, que falha com "tempo para autorização esgotou" devido a `Set-Cookie` sendo descartado pelo Cloudflare Worker proxy durante o redirect OAuth.

**Architecture:** Dois componentes: (1) pré-requisito manual no Google Cloud Console; (2) patch no Cloudflare Worker `[[all]].ts` para reconstruir respostas 3xx explicitamente com `Set-Cookie` preservado.

**Tech Stack:** Cloudflare Pages Functions (TypeScript), Discourse (Rails/Docker no VPS), Google OAuth2 via OmniAuth.

---

## Diagnóstico

### Root Cause

O Worker em `astro/functions/forum/[[all]].ts` usa `redirect: 'manual'` no `fetch()` interno. Quando o VPS Discourse responde ao GET `/forum/auth/google_oauth2` com:

```
HTTP/1.1 302 Found
Location: https://accounts.google.com/o/oauth2/auth?state=xxx&...
Set-Cookie: _forum_session=...; SameSite=Lax; Secure; HttpOnly
```

O Worker obtém uma **opaqueredirect response**. Ao retorná-la com `return fetch(proxied)`, o Cloudflare converte para um redirect válido — mas **descarta os `Set-Cookie` headers**. O browser nunca armazena o `_forum_session` com o OAuth state.

Quando o Google redireciona de volta para `/forum/auth/google_oauth2/callback?state=xxx&code=yyy`, o browser não envia o `_forum_session`, e o Discourse não encontra o state armazenado → erro "tempo para autorização esgotou".

### Fluxo Atual (quebrado)

```
1. Browser → GET /forum/auth/google_oauth2
2. Worker → VPS: GET /forum/auth/google_oauth2
3. VPS → Worker: 302 + Set-Cookie: _forum_session=STATE
4. Worker → Browser: 302 (Set-Cookie DESCARTADO ❌)
5. Browser → Google (sem session cookie)
6. Google → Browser: callback /forum/auth/google_oauth2/callback?state=xxx
7. Browser → Worker → VPS: callback SEM _forum_session
8. VPS: state não encontrado → ERRO ❌
```

### Fluxo Esperado (após fix)

```
1. Browser → GET /forum/auth/google_oauth2
2. Worker → VPS: GET /forum/auth/google_oauth2
3. VPS → Worker: 302 + Set-Cookie: _forum_session=STATE
4. Worker → Browser: 302 + Set-Cookie: _forum_session=STATE ✓
5. Browser armazena _forum_session, segue para Google
6. Google → Browser: callback /forum/auth/google_oauth2/callback?state=xxx
7. Browser → Worker → VPS: callback COM _forum_session
8. VPS: valida state → cria sessão → login ✓
```

---

## Componentes

### Arquivo modificado

- `astro/functions/forum/[[all]].ts` — único arquivo alterado

### Lógica do patch

```typescript
const response = await fetch(proxied);

// Reconstruct redirect responses to preserve Set-Cookie headers
// (Cloudflare silently drops Set-Cookie from opaqueredirect responses)
if (response.status >= 300 && response.status < 400) {
  const newHeaders = new Headers();

  // Copy all non-set-cookie headers normally
  response.headers.forEach((value, name) => {
    if (name.toLowerCase() !== 'set-cookie') {
      newHeaders.set(name, value);
    }
  });

  // Set-Cookie requires explicit handling — CF Workers supports getAll()
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

**Comportamento:**
- Respostas 3xx: reconstruídas com headers explícitos
- Respostas 2xx/4xx/5xx: passam sem modificação (comportamento atual mantido)
- Múltiplos cookies: `getAll()` garante que todos sejam copiados

---

## Pré-requisito Manual (Google Cloud Console)

Antes de qualquer código, verificar/adicionar o Authorized Redirect URI:

```
https://normatizando.com.br/forum/auth/google_oauth2/callback
```

**Caminho:** console.cloud.google.com → APIs & Services → Credentials → OAuth 2.0 Client IDs → editar o client do Normatizado → Authorized redirect URIs.

Sem isso, Google rejeita o callback com `redirect_uri_mismatch` independente do Worker fix.

---

## Testes

1. Abrir DevTools → Network tab
2. Ir para `/forum/login`
3. Clicar "Conectar com o Google"
4. Na aba Network, verificar a requisição `GET /forum/auth/google_oauth2`:
   - Response deve ter `Set-Cookie: _forum_session=...`
   - Status deve ser 302 com `Location: https://accounts.google.com/...`
5. Completar login no Google
6. Verificar redirect bem-sucedido para `/forum`

---

## Não está no escopo

- Mudanças em outras partes do Worker (comportamento para 2xx/4xx inalterado)
- Configuração de Redis ou session store alternativo
- Modificações no Discourse ou VPS
