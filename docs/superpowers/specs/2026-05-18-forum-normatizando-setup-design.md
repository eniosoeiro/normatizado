# Design: Fórum Normatizando — Configuração Completa

**Data:** 2026-05-18  
**Status:** Aprovado

## Contexto

Fórum técnico de normas de engenharia (NR-12, NR-13, ASME VIII, ABNT, IEC etc.) rodando em Discourse no VPS via `normatizando.com.br/forum`. Público-alvo: engenheiros e técnicos brasileiros.

Stack atual:
- Discourse (VPS Hostinger, Docker, porta 9001)
- Astro + Cloudflare Workers (site público)
- Backblaze B2 (uploads + backups — configurado em 2026-05-18)
- Amazon SES (email)
- Cloudflare CDN (cdn.normatizando.com.br → B2)

## O que foi configurado (2026-05-18)

| Item | Configuração |
|---|---|
| B2 bucket uploads | `normatizado-uploads` (público, CORS) |
| B2 bucket backups | `normatizado-backups` (privado) |
| CDN | CNAME `cdn.normatizando.com.br → f004.backblazeb2.com` (proxied CF) |
| Akismet | API key ativa, anti-spam habilitado |
| Google OAuth | Client ID configurado, login com Google ativo |
| Extensões de upload | jpg/png/gif/pdf/doc/docx/xls/xlsx/dwg/dxf/zip (sem exe/bat/sh) |
| Trust Level TL0→TL1 | 5 tópicos lidos, 10 posts, 5 min — automático |
| Tamanho máximo anexo | 25MB |
| Tamanho máximo imagem | 10MB |
| Backup frequency | 7 dias, 5 cópias |

## O que falta implementar

### 1. OpenClaw Bot Moderador

**Objetivo:** conta de bot com role `moderator` no Discourse para automação de moderação.

**Arquitetura:**
- Usuário Discourse: `openclaw` (email: bot@normatizando.com.br ou similar)
- Role: moderator
- API key gerada com escopo completo para o usuário `openclaw`
- Bot acessa endpoints REST: flagging, silencing, moving topics, approving posts

**Endpoints relevantes:**
- `POST /posts/{id}/flag` — sinalizar post
- `PUT /admin/users/{id}/silence` — silenciar usuário
- `PUT /t/{id}` — editar/mover tópico
- `PUT /admin/users/{id}/grant_moderation` — promover a moderador

### 2. Processo de Moderação Humana

**Critérios para promover usuário a moderador:**
- Trust Level 3 ou superior
- Mínimo 3 meses de atividade
- Sem histórico de violações
- Aprovação pelo admin

**Processo:**
1. Admin acessa `/admin/users/{username}`
2. Clica "Grant Moderation"
3. Moderador recebe email de notificação

### 3. Rebuild com Chave B2 Restrita

**Problema atual:** Discourse usa Master Application Key B2 (acesso total à conta).

**Solução:** chave restrita já criada (`004ec317dff16df000000000c`) com capabilities limitadas: `listBuckets`, `listFiles`, `readFiles`, `writeFiles`, `deleteFiles`.

**Ação:** `./launcher rebuild app` no VPS (~15 min downtime) para aplicar env var atualizada.

### 4. Rate Limiting de Uploads

Configurar via admin panel (`/admin/site_settings`):
- `max_attachment_size_kb`: 25600 (25MB) — já aplicado
- Revisar `newuser_max_attachments` (padrão: 1 para TL0, suficiente)
- Considerar plugin de rate limit se necessário

### 5. Tela de Consentimento OAuth (Google Cloud)

OAuth consent screen está em modo "Testing" — limita a 100 usuários de teste. Publicar para produção em Google Cloud Console → APIs & Services → OAuth consent screen → "Publish App".

## Segurança

- Extensões perigosas bloqueadas por padrão (`.exe`, `.bat`, `.sh`, `.php`, `.js` não estão em `authorized_extensions`)
- Akismet filtra spam em TL0/TL1
- Rate limiting nativo do Discourse (web.ratelimited template ativo no app.yml)
- B2 chave mestre em uso — substituir por chave restrita no próximo rebuild

## Pendências Fora do Escopo Deste Plano

- Social login adicional (GitHub, LinkedIn) — opcional para engenheiros
- Discourse AI moderação automática (plugin instalado, requer OpenAI key)
- Reply by email — requer configuração de mailbox de entrada no SES
