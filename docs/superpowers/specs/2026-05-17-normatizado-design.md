# Normatizado — Design Spec

**Data:** 2026-05-17  
**Produto:** Normatizado — Fórum Técnico de Engenharia  
**Domínio:** normatizado.com.br  
**Status:** Aprovado para implementação

---

## 1. Visão

Stack Overflow das normas técnicas brasileiras e internacionais. Engenheiros, técnicos e profissionais de SST debatem, tiram dúvidas e constroem o maior repositório colaborativo de interpretação normativa do Brasil.

---

## 2. Abordagem

**Discourse self-hosted + landing Astro customizada + SSO via Discourse Connect.**

- Discourse: motor do fórum (reputação, badges, votação, Markdown+LaTeX, busca, moderação — nativo)
- Astro: landing page SSG com SEO máximo, feed de threads ao vivo, páginas por norma
- Cloudflare Pages Function: proxy transparente `/forum/*` → VPS (arquivo `functions/forum/[[all]].ts` dentro do projeto Astro)
- Discourse Connect: SSO unificado, preparado para integração futura com outros SaaS

---

## 3. Arquitetura

```
Internet → Cloudflare DNS (normatizado.com.br)
           │
           ├── /              → Cloudflare Pages (Astro SSG)
           ├── /normas/*      → Cloudflare Pages (Astro SSG)
           ├── /especialistas → Cloudflare Pages (Astro SSG)
           │
           └── /forum/*       → CF Pages Function (functions/forum/[[all]].ts)
                                    ↓
                                 VPS Hostinger (Traefik existente)
                                    ↓
                                 Discourse Docker container
                                 (Rails + Sidekiq + Redis + Postgres 15)
```

### 3.1 CF Pages Function — forum-proxy

Arquivo: `astro/functions/forum/[[all]].ts` — intercepta `/forum/*` no edge antes do Astro.

```typescript
// functions/forum/[[all]].ts
export async function onRequest(context: EventContext<any, any, any>) {
  const url = new URL(context.request.url);
  // VPS_DISCOURSE_ORIGIN configurado como CF Pages secret (ex: http://123.456.789.0)
  const target = new URL(url.pathname + url.search, context.env.VPS_DISCOURSE_ORIGIN);
  return fetch(new Request(target, context.request));
}
```

`VPS_DISCOURSE_ORIGIN` = secret do CF Pages, configurado durante setup com IP do VPS Hostinger.

### 3.2 Discourse — app.yml crítico

```yaml
DISCOURSE_HOSTNAME: normatizado.com.br
DISCOURSE_RELATIVE_URL_ROOT: /forum
DISCOURSE_SMTP_ADDRESS: email-smtp.us-east-1.amazonaws.com
DISCOURSE_SMTP_PORT: 587
DISCOURSE_SMTP_USER_NAME: SES_SMTP_ACCESS_KEY_ID  # IAM user com permissão ses:SendRawEmail
DISCOURSE_CDN_URL: https://normatizado.com.br
```

---

## 4. Identidade Visual

| Token | Valor |
|---|---|
| Azul primário | `#1E40AF` |
| Grafite | `#1F2937` |
| Âmbar (accent) | `#F59E0B` |
| Fundo claro | `#F9FAFB` |
| Borda | `#E5E7EB` |

Logo: `[ NORMATIZADO ]` — brackets em âmbar, texto branco, fundo azul primário.

Mockup da landing aprovado (arquivo: `.superpowers/brainstorm/*/content/layout-azul.html`).

---

## 5. Landing Astro — Estrutura

```
astro/
├── src/
│   ├── pages/
│   │   ├── index.astro              ← landing principal
│   │   ├── normas/
│   │   │   ├── index.astro          ← hub de categorias
│   │   │   └── [slug].astro         ← página SEO por norma
│   │   ├── especialistas.astro      ← top contributors
│   │   └── sobre.astro
│   ├── components/
│   │   ├── ThreadFeed.astro         ← top threads via Discourse API
│   │   ├── CategoryGrid.astro
│   │   ├── StatsBar.astro           ← stats ao vivo
│   │   └── Sidebar.astro
│   └── lib/
│       └── discourse.ts             ← wrapper GET /forum/top.json etc.
└── public/
```

### 5.1 Seções da homepage (ordem)

1. **Nav** — logo + links (Normas, Discussões, Especialistas, Wiki) + busca + ENTRAR
2. **Hero** — headline + CTA "Começar a Discutir" + carrossel de desenhos técnicos
3. **Disciplinas Normativas** — grid 5 categorias horizontal
4. **Tópicos em Destaque** — feed threads votados/recentes + sidebar (top contributors, Norma da Semana, tags)
5. **Stats Bar** — engenheiros, discussões, respostas, taxa de solução

### 5.2 Dados dinâmicos

- `ThreadFeed`: `GET /forum/top.json?period=weekly` — sem auth, API pública Discourse
- `StatsBar`: `GET /forum/about.json` (stats do site)
- Revalidação: `Cache-Control: s-maxage=3600` via CF Pages headers

### 5.3 Páginas `/normas/[slug]`

20 páginas SEO estáticas geradas no build (uma por norma principal). Cada página contém:
- Descrição da norma
- Scope de aplicação
- Link para threads da tag correspondente no fórum
- Glossário básico de termos

**Lista inicial de slugs:** `nr-12`, `nr-13`, `nr-10`, `nr-35`, `nr-1`, `nr-6`, `nr-18`, `nr-33`, `asme-viii`, `api-510`, `api-570`, `abnt-nbr-5410`, `abnt-nbr-6118`, `abnt-nbr-8800`, `iso-13849`, `iec-60364`, `iec-61508`, `isa-84`, `abnt-nbr-15575`, `nfpa-70`

---

## 6. Discourse — Configuração

### 6.1 Plugins

| Plugin | Repositório | Função |
|---|---|---|
| discourse-solved | discourse/discourse-solved | Resposta aceita ✓ |
| discourse-math | discourse/discourse-math | LaTeX/MathJax |
| discourse-akismet | discourse/discourse-akismet | Anti-spam |
| discourse-data-explorer | discourse/discourse-data-explorer | Queries SQL admin |
| discourse-checklist | discourse/discourse-checklist | Checklists em posts |

### 6.2 Categorias e subcategorias

```
Mecânica e Pressão
  ├── NR-13 — Caldeiras e Vasos
  ├── ASME VIII — Vasos de Pressão
  ├── API 510/570/653
  ├── Tubulações e Dutos
  └── Equipamentos Rotativos

Elétrica e ATEX
  ├── NR-10 — Instalações Elétricas
  ├── ABNT NBR 5410
  ├── IEC 60364
  └── Zonas ATEX / NR-20

Civil e Estrutural
  ├── ABNT NBR 6118 — Concreto
  ├── ABNT NBR 8800 — Aço
  ├── NR-18 — Construção Civil
  └── ABNT NBR 15575 — Desempenho

SST e Segurança de Máquinas
  ├── NR-12 — Máquinas e Equipamentos
  ├── NR-1 / PGR
  ├── NR-35 — Trabalho em Altura
  ├── NR-33 — Espaço Confinado
  └── ISO 13849 / IEC 62061

Instrumentação e Automação
  ├── ISA-84 / IEC 61511 — SIS/SIL
  ├── IEC 61508 — Functional Safety
  └── NR-20 — Inflamáveis
```

### 6.3 Sistema de reputação e badges

Conforme PRD seção 3.5. Configurado via Discourse nativo (trust levels + badges personalizadas).

Badges temáticas customizadas por norma: "Especialista NR-12", "Mestre ASME VIII" — via Discourse admin SQL badge queries.

### 6.4 Tema custom

Discourse Theme Component com:
- CSS variables da paleta Azul Engenharia
- Header com logo `[ NORMATIZADO ]`
- Sidebar de categorias com ícones
- Modo escuro respeitando paleta

---

## 7. SSO — Discourse Connect

Fluxo:
1. Usuário clica "Entrar" na landing → redireciona para `/forum/session/sso`
2. Discourse gera nonce + redirect para landing `/sso` endpoint
3. Landing valida + retorna payload assinado com `DISCOURSE_SSO_SECRET`
4. Discourse cria/autentica usuário, redireciona para `/forum`

Preparado para SSO reverso (Discourse como provider para outros SaaS) na Fase 2.

---

## 8. Infraestrutura

| Componente | Onde | Custo |
|---|---|---|
| Landing Astro | Cloudflare Pages | R$ 0 |
| CF Pages Function /forum proxy | Cloudflare Pages (incluído) | R$ 0 |
| Discourse + Postgres + Redis | VPS Hostinger (existente) | R$ 0 adicional |
| Domínio normatizado.com.br | Registro.br | ~R$ 8/mês |
| Email transacional | Amazon SES | ~R$ 3/mês (10k emails) |
| Backup | Backblaze B2 (existente) | ~R$ 10/mês |
| **Total adicional** | | **~R$ 21/mês** |

---

## 9. MVP Scope

### Incluído (Fase 0-2, 6 semanas)

- Discourse instalado, configurado, com tema custom
- 5 categorias + subcategorias completas
- Todos 5 plugins instalados
- Landing Astro com mockup aprovado
- Cloudflare Worker proxy /forum
- 20 páginas SEO /normas/[slug]
- Email transacional Postmark
- Backup Backblaze B2
- 30-50 threads seed antes do lançamento público

### Excluído do MVP

- Verificação CREA via API
- Wiki colaborativa
- Plano Premium / monetização
- IA assistente
- App mobile
- Marketplace
- SSO cross-SaaS (Fase 2)
- Bounty system

---

## 10. Roadmap

| Semana | Entregável |
|---|---|
| 1-2 | VPS + Docker + Discourse + domínio + SSL + CF Worker |
| 3-4 | Tema custom + categorias + tags + badges + plugins |
| 5 | Landing Astro + páginas /normas/[slug] |
| 6 | Seed: 30-50 threads (Enio + convidados) |
| 7-8 | Beta fechado (50-100 engenheiros) |
| 9 | Lançamento público |

---

## 11. Decisões registradas

| Decisão | Escolha | Motivo |
|---|---|---|
| Motor do fórum | Discourse self-hosted | Reputação, badges, LaTeX, busca — tudo nativo |
| Landing | Astro SSG | Core Web Vitals, deploy CF Pages já funcionando |
| URL Discourse | /forum (subdiretório) | Melhor SEO (domain authority unificada) |
| Integração | CF Pages Function proxy | Astro e Discourse independentes, tudo no mesmo projeto CF Pages |
| Paleta | Azul Engenharia | Autoridade técnica, confiança, público 35-55 anos |
| Domínio | normatizado.com.br | Confirmado pelo autor |
| VPS | Hostinger (existente) | Custo zero adicional, Traefik já configurado |
