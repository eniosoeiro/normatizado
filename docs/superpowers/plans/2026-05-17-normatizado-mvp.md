# Normatizado MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lançar normatizado.com.br — fórum técnico de engenharia com Discourse self-hosted no VPS Hostinger, landing Astro no Cloudflare Pages, e proxy `/forum/*` via CF Pages Function.

**Architecture:** Discourse Docker no VPS Hostinger (Traefik existente) serve o fórum em `/forum`. CF Pages Function em `functions/forum/[[all]].ts` proxia todas requisições `/forum/*` do edge para o VPS. Landing Astro SSG no CF Pages serve `/`, `/normas/*`, `/especialistas`. Auth via Discourse nativo (SSO Discourse Connect = Fase 2).

**Tech Stack:** Discourse 3.x (Docker), Astro 5 (SSG), Tailwind CSS, TypeScript, Cloudflare Pages + Functions, Amazon SES (SMTP), Backblaze B2, Traefik 2.x (existente no VPS).

---

## Mapa de Arquivos

### Novos (Discourse)
- `discourse/app.yml` — configuração Docker do Discourse

### Novos (Astro landing)
- `astro/astro.config.mjs`
- `astro/tailwind.config.ts`
- `astro/package.json`
- `astro/src/layouts/BaseLayout.astro`
- `astro/src/lib/discourse.ts` — wrapper API pública Discourse
- `astro/src/data/normas.ts` — 20 normas com metadata
- `astro/src/components/Nav.astro`
- `astro/src/components/Hero.astro`
- `astro/src/components/CategoryGrid.astro`
- `astro/src/components/ThreadFeed.astro`
- `astro/src/components/Sidebar.astro`
- `astro/src/components/StatsBar.astro`
- `astro/src/pages/index.astro`
- `astro/src/pages/normas/index.astro`
- `astro/src/pages/normas/[slug].astro`
- `astro/src/pages/especialistas.astro`
- `astro/src/pages/sobre.astro`
- `astro/functions/forum/[[all]].ts` — CF Pages Function proxy

### Novos (config)
- `.gitignore`
- `astro/public/_headers` — Cache-Control para CF Pages

---

## FASE 1 — Infrastructure (Semana 1-2)

### Task 1: Registrar domínio + Cloudflare

**Pré-requisitos:** Conta Registro.br, zona Cloudflare já configurada para outros domínios.

- [ ] **1.1** Registrar `normatizado.com.br` em registro.br (Enio, manual)

- [ ] **1.2** No painel Cloudflare → Add Site → `normatizado.com.br` → Free plan

- [ ] **1.3** Nos nameservers do Registro.br, apontar para os nameservers do Cloudflare fornecidos

- [ ] **1.4** No Cloudflare DNS, adicionar registro temporário para verificar propagação:
```
Tipo: A
Nome: @
Valor: 192.0.2.1   ← placeholder, será atualizado no Task 3
Proxy: DNS only (nuvem cinza)
TTL: Auto
```

- [ ] **1.5** Verificar propagação (aguardar até 24h):
```bash
dig normatizado.com.br NS +short
# Deve retornar nameservers do Cloudflare
```

---

### Task 2: Instalar Discourse via Docker no VPS

**Pré-requisito:** SSH root access ao VPS Hostinger. VPS deve ter mínimo 2GB RAM livre. Traefik já rodando.

- [ ] **2.1** SSH no VPS e verificar memória disponível:
```bash
ssh root@VPS_IP
free -h
# Garantir pelo menos 2GB RAM livre
df -h /var/lib/docker
# Garantir pelo menos 20GB livre
```

- [ ] **2.2** Instalar Docker se não instalado:
```bash
curl -fsSL https://get.docker.com | sh
systemctl enable docker && systemctl start docker
```

- [ ] **2.3** Clonar discourse_docker:
```bash
git clone https://github.com/discourse/discourse_docker.git /var/discourse
cd /var/discourse
chmod 700 containers
```

- [ ] **2.4** Criar arquivo de config (ver Task 3 para configuração completa):
```bash
cp samples/standalone.yml containers/app.yml
```

---

### Task 3: Configurar app.yml do Discourse

**Arquivo:** `discourse/app.yml` (mantido no repo para referência — NÃO commitar com senhas reais)

- [ ] **3.1** Criar `discourse/app.yml` no repo como template:
```yaml
# discourse/app.yml — template (substituir valores em MAIÚSCULO)
templates:
  - "templates/postgres.template.yml"
  - "templates/redis.template.yml"
  - "templates/web.template.yml"
  - "templates/web.ratelimited.template.yml"

## Discourse config
expose:
  - "127.0.0.1:8080:80"   # expõe só para localhost; Traefik faz o roteamento

params:
  db_default_text_search_config: "pg_catalog.portuguese"
  db_shared_buffers: "256MB"
  db_work_mem: "40MB"

env:
  LC_ALL: en_US.UTF-8
  LANG: en_US.UTF-8
  LANGUAGE: en_US.UTF-8
  DISCOURSE_DEFAULT_LOCALE: pt_BR

  DISCOURSE_HOSTNAME: normatizado.com.br
  DISCOURSE_RELATIVE_URL_ROOT: /forum

  DISCOURSE_DEVELOPER_EMAILS: "eniosoeiro@gmail.com"

  # Amazon SES SMTP
  DISCOURSE_SMTP_ADDRESS: "email-smtp.us-east-1.amazonaws.com"
  DISCOURSE_SMTP_PORT: 587
  DISCOURSE_SMTP_USER_NAME: "SES_SMTP_KEY_ID"           # substituir
  DISCOURSE_SMTP_PASSWORD: "SES_SMTP_SECRET"             # substituir
  DISCOURSE_SMTP_ENABLE_START_TLS: true
  DISCOURSE_SMTP_DOMAIN: "normatizado.com.br"
  DISCOURSE_NOTIFICATION_EMAIL: "noreply@normatizado.com.br"

  DISCOURSE_CDN_URL: "https://normatizado.com.br"

  # Backblaze B2 backup (S3-compatible)
  DISCOURSE_S3_BACKUP_BUCKET: "normatizado-backups"
  DISCOURSE_S3_REGION: "us-west-004"                     # ajustar para região do bucket
  DISCOURSE_S3_ACCESS_KEY_ID: "B2_KEY_ID"                # substituir
  DISCOURSE_S3_SECRET_ACCESS_KEY: "B2_APP_KEY"           # substituir
  DISCOURSE_S3_ENDPOINT: "https://s3.us-west-004.backblazeb2.com"
  DISCOURSE_BACKUP_LOCATION: "s3"

hooks:
  after_code:
    - exec:
        cd: $home/plugins
        cmd:
          - git clone https://github.com/discourse/discourse-solved.git
          - git clone https://github.com/discourse/discourse-math.git
          - git clone https://github.com/discourse/discourse-akismet.git
          - git clone https://github.com/discourse/discourse-data-explorer.git
          - git clone https://github.com/discourse/discourse-checklist.git

volumes:
  - volume:
      host: /var/discourse/shared/standalone
      guest: /shared
  - volume:
      host: /var/discourse/shared/standalone/log/var-log
      guest: /var/log

run:
  - exec: echo "Beginning of custom commands"
  - exec: rails runner "SiteSetting.force_https = true"
```

- [ ] **3.2** Copiar app.yml para o VPS (substituindo valores reais):
```bash
# No VPS — editar /var/discourse/containers/app.yml com valores reais
nano /var/discourse/containers/app.yml
```

- [ ] **3.3** Bootstrap (primeira instalação, ~10-15min):
```bash
cd /var/discourse
./launcher bootstrap app
# Aguardar conclusão sem erros
```

- [ ] **3.4** Iniciar Discourse:
```bash
./launcher start app
# Verificar logs:
./launcher logs app
# Esperar linha: "INFO -- : worker=0 ready"
```

- [ ] **3.5** Testar que Discourse responde localmente:
```bash
curl -I http://127.0.0.1:8080/forum
# Deve retornar: HTTP/1.1 200 OK  (ou 301 redirect)
```

---

### Task 4: Configurar Traefik para normatizado.com.br

**Pré-requisito:** Traefik 2.x já rodando no VPS com docker-compose ou config estática.

- [ ] **4.1** No arquivo `docker-compose.yml` do Traefik (ou arquivo de config dinâmica), adicionar router para Discourse:

Se usando Traefik com Docker labels, criar `docker-compose.normatizado.yml`:
```yaml
version: "3.8"
services:
  discourse-normatizado:
    image: nginx:alpine          # proxy local apenas para Traefik rotear
    volumes:
      - /var/discourse/shared/standalone:/shared:ro
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.normatizado-forum.rule=Host(`normatizado.com.br`) && PathPrefix(`/forum`)"
      - "traefik.http.routers.normatizado-forum.entrypoints=websecure"
      - "traefik.http.routers.normatizado-forum.tls.certresolver=letsencrypt"
      - "traefik.http.services.normatizado-forum.loadbalancer.server.port=8080"
      - "traefik.http.services.normatizado-forum.loadbalancer.server.url=http://127.0.0.1:8080"
```

Alternativa mais simples — adicionar arquivo de configuração dinâmica Traefik em `/etc/traefik/dynamic/normatizado.yml`:
```yaml
http:
  routers:
    normatizado-forum:
      rule: "Host(`normatizado.com.br`) && PathPrefix(`/forum`)"
      entryPoints:
        - websecure
      tls:
        certResolver: letsencrypt
      service: discourse

  services:
    discourse:
      loadBalancer:
        servers:
          - url: "http://127.0.0.1:8080"
```

- [ ] **4.2** No Cloudflare DNS, atualizar registro A com IP real do VPS:
```
Tipo: A
Nome: @
Valor: IP_DO_VPS_HOSTINGER
Proxy: Proxied (nuvem laranja)
```

- [ ] **4.3** Verificar SSL e rota /forum:
```bash
curl -I https://normatizado.com.br/forum
# Esperado: HTTP/2 200 (ou redirect para /forum/)
```

- [ ] **4.4** Acessar no browser: `https://normatizado.com.br/forum`
— deve aparecer tela de setup inicial do Discourse.

- [ ] **4.5** Completar setup inicial do Discourse (wizard no browser):
  - Nome do site: `Normatizado`
  - Idioma: Português (Brasil)
  - Email do admin: `eniosoeiro@gmail.com`
  - Criar senha admin

- [ ] **4.6** Commit do template app.yml (sem senhas):
```bash
cd /Volumes/ssd_mac/ProjetosGit/normatizado
git add discourse/app.yml
git commit -m "chore: discourse app.yml template (sem secrets)"
```

---

### Task 5: Configurar Amazon SES

- [ ] **5.1** No AWS Console → SES → Verified identities → Create identity:
  - Type: Domain
  - Domain: `normatizado.com.br`
  - Habilitar DKIM

- [ ] **5.2** Adicionar registros DNS no Cloudflare (SES fornece os valores):
  - 3 registros CNAME para DKIM (ex: `abc123._domainkey.normatizado.com.br`)
  - 1 registro TXT para verificação de domínio
  - Aguardar verificação (até 72h)

- [ ] **5.3** Criar IAM user para SMTP:
```
AWS Console → IAM → Users → Create user
Nome: normatizado-ses-smtp
Permissions: AmazonSESFullAccess (ou política custom com ses:SendRawEmail)
```

- [ ] **5.4** Gerar SMTP credentials:
```
IAM → Users → normatizado-ses-smtp → Security credentials
→ Create access key → Other → Download .csv
→ Converter para SMTP credentials via AWS CLI:
```
```bash
# SMTP password é derivada da secret key (não é a secret key diretamente)
# Usar ferramenta em: https://docs.aws.amazon.com/ses/latest/dg/smtp-credentials.html
# Ou usar script Python da AWS:
python3 -c "
import hmac, hashlib, base64
date = '11111111'
service = 'ses'
region = 'us-east-1'
message = 'SendRawEmail'
key = ('AWS4' + 'SUA_SECRET_KEY_AQUI').encode('utf-8')
for item in [date, region, service, 'aws4_request', message]:
    key = hmac.new(key, item.encode('utf-8'), hashlib.sha256).digest()
print(base64.b64encode(key).decode('utf-8'))
"
```

- [ ] **5.5** Solicitar saída do sandbox SES:
```
AWS Console → SES → Account dashboard → Request production access
Preencher: caso de uso (notificações de fórum técnico), volume esperado (~1k/mês)
Aguardar aprovação AWS (1-3 dias úteis)
```

- [ ] **5.6** Testar envio de email pelo Discourse:
```
Admin → Settings → Email → Send test email to: eniosoeiro@gmail.com
Verificar recebimento
```

---

### Task 6: Configurar Backblaze B2

- [ ] **6.1** No painel Backblaze → Buckets → Create bucket:
  - Nome: `normatizado-backups`
  - Files: Private
  - Versioning: desabilitado

- [ ] **6.2** Criar Application Key com acesso ao bucket:
```
Account → App Keys → Add a New Application Key
Name: normatizado-discourse
Buckets: normatizado-backups
Permissions: Read and Write
```

- [ ] **6.3** Anotar `keyID` e `applicationKey` — atualizar app.yml no VPS com esses valores e rebuild:
```bash
cd /var/discourse
./launcher rebuild app
```

- [ ] **6.4** Testar backup manual via Discourse admin:
```
Admin → Backups → Backup Now
Verificar no painel B2 que o arquivo apareceu
```

---

## FASE 2 — Discourse Configuration (Semana 3-4)

### Task 7: Configurar categorias e subcategorias

Todas as operações via Discourse Admin UI (`https://normatizado.com.br/forum/admin/categories`).

- [ ] **7.1** Criar categoria: **Mecânica e Pressão** (cor: `#1E40AF`, ícone: ⚙️)
  - Subcategoria: `NR-13 — Caldeiras e Vasos`
  - Subcategoria: `ASME VIII — Vasos de Pressão`
  - Subcategoria: `API 510 / 570 / 653`
  - Subcategoria: `Tubulações e Dutos`
  - Subcategoria: `Equipamentos Rotativos`

- [ ] **7.2** Criar categoria: **Elétrica e ATEX** (cor: `#F59E0B`, ícone: ⚡)
  - Subcategoria: `NR-10 — Instalações Elétricas`
  - Subcategoria: `ABNT NBR 5410`
  - Subcategoria: `IEC 60364`
  - Subcategoria: `Zonas ATEX / NR-20`

- [ ] **7.3** Criar categoria: **Civil e Estrutural** (cor: `#6B7280`, ícone: 🏗️)
  - Subcategoria: `ABNT NBR 6118 — Concreto`
  - Subcategoria: `ABNT NBR 8800 — Aço`
  - Subcategoria: `NR-18 — Construção Civil`
  - Subcategoria: `ABNT NBR 15575 — Desempenho`

- [ ] **7.4** Criar categoria: **SST e Segurança de Máquinas** (cor: `#DC2626`, ícone: 🦺)
  - Subcategoria: `NR-12 — Máquinas e Equipamentos`
  - Subcategoria: `NR-1 / PGR — Gestão de Riscos`
  - Subcategoria: `NR-35 — Trabalho em Altura`
  - Subcategoria: `NR-33 — Espaço Confinado`
  - Subcategoria: `ISO 13849 / IEC 62061`

- [ ] **7.5** Criar categoria: **Instrumentação e Automação** (cor: `#059669`, ícone: 📡)
  - Subcategoria: `ISA-84 / IEC 61511 — SIS/SIL`
  - Subcategoria: `IEC 61508 — Functional Safety`
  - Subcategoria: `NR-20 — Inflamáveis`

---

### Task 8: Criar tags por norma

Via `Admin → Tags → New Tag Group` para cada grupo.

- [ ] **8.1** Criar tag group **NRs Brasileiras**:
  ```
  Tags: nr-12, nr-13, nr-10, nr-35, nr-1, nr-6, nr-18, nr-33, nr-20, nr-11, nr-23
  ```

- [ ] **8.2** Criar tag group **Normas ABNT**:
  ```
  Tags: abnt-nbr-5410, abnt-nbr-6118, abnt-nbr-8800, abnt-nbr-15575, abnt-nbr-13534
  ```

- [ ] **8.3** Criar tag group **Normas Internacionais**:
  ```
  Tags: asme-viii, api-510, api-570, api-653, iso-13849, iec-60364, iec-61508, iec-61511, isa-84, nfpa-70
  ```

- [ ] **8.4** Criar tag group **Tipo de Post**:
  ```
  Tags: interpretacao, calculo, laudo, auditoria, caso-pratico, duvida, discussao
  ```

---

### Task 9: Criar badges customizadas

Via `Admin → Badges → New Badge`. Cada badge usa SQL query para trigger automático.

- [ ] **9.1** Badge "Pioneiro" (ouro) — primeiros 100 membros:
```sql
-- Badge trigger query
SELECT u.id user_id, u.created_at granted_at
FROM users u
WHERE u.id > 0
  AND (SELECT COUNT(*) FROM users u2 WHERE u2.id <= u.id AND u2.id > 0) <= 100
```
Configuração: Nome `Pioneiro 🏅`, Ícone `fa-flag`, Cor `#F59E0B`, Nível `Gold`

- [ ] **9.2** Badge "Especialista NR-12" (prata) — 10+ respostas aceitas em categoria NR-12:
```sql
SELECT pa.user_id, MIN(pa.created_at) granted_at
FROM post_actions pa
JOIN posts p ON p.id = pa.post_id
JOIN topics t ON t.id = p.topic_id
JOIN categories c ON c.id = t.category_id
WHERE pa.post_action_type_id = 4  -- accepted answer
  AND (c.name ILIKE '%NR-12%' OR c.parent_category_id IN (
    SELECT id FROM categories WHERE name ILIKE '%NR-12%'
  ))
GROUP BY pa.user_id
HAVING COUNT(*) >= 10
```
Nome: `Especialista NR-12`, Ícone: `fa-cog`, Nível: `Silver`

- [ ] **9.3** Badge "Especialista NR-13" (prata) — mesmo padrão, categoria NR-13

- [ ] **9.4** Badge "Mestre ASME VIII" (ouro) — 10+ respostas aceitas em categoria ASME VIII:
```sql
SELECT pa.user_id, MIN(pa.created_at) granted_at
FROM post_actions pa
JOIN posts p ON p.id = pa.post_id
JOIN topics t ON t.id = p.topic_id
JOIN categories c ON c.id = t.category_id
WHERE pa.post_action_type_id = 4
  AND (c.name ILIKE '%ASME%' OR c.parent_category_id IN (
    SELECT id FROM categories WHERE name ILIKE '%ASME%'
  ))
GROUP BY pa.user_id
HAVING COUNT(*) >= 10
```
Nome: `Mestre ASME VIII`, Ícone: `fa-star`, Nível: `Gold`

---

### Task 10: Criar e instalar tema Azul Engenharia

- [ ] **10.1** Via Discourse admin → `Customize → Themes → New → Blank Theme`
  Nome: `Normatizado Azul Engenharia`

- [ ] **10.2** Na aba CSS do tema, adicionar:
```css
:root {
  --d-brand-primary: #1E40AF;
  --d-header-background: #1E40AF;
  --d-header-primary: #FFFFFF;
  --d-link-color: #1E40AF;
  --d-accent: #F59E0B;
}

/* Header — logo [ NORMATIZADO ] */
#site-logo {
  font-weight: 800;
  font-size: 16px;
  letter-spacing: 2px;
  color: white !important;
  font-family: 'Inter', system-ui, sans-serif;
}
#site-logo::before { content: "[ "; color: #F59E0B; }
#site-logo::after  { content: " ]"; color: #F59E0B; }

/* Botão primário */
.btn-primary {
  background: #1E40AF !important;
  color: white !important;
}
.btn-primary:hover { background: #1E3A8A !important; }

/* Accepted answer badge */
.topic-status .solved { color: #1E40AF; }

/* Category colors override */
.badge-category { border-radius: 3px; }
```

- [ ] **10.3** Ativar tema como padrão:
```
Admin → Customize → Themes → Normatizado Azul Engenharia → Set as default
```

- [ ] **10.4** Configurar site settings via Admin → Settings:
```
Site title: Normatizado
Site description: O fórum técnico das normas brasileiras e internacionais
Contact email: contato@normatizado.com.br
Logo URL: (fazer upload de logo no passo seguinte)
Favicon: (fazer upload)
```

- [ ] **10.5** Criar logo SVG e fazer upload:

Arquivo `public/logo-normatizado.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 40" width="200" height="40">
  <rect width="200" height="40" fill="#1E40AF" rx="4"/>
  <text x="12" y="27" font-family="Inter,system-ui,sans-serif" font-weight="800"
        font-size="16" letter-spacing="2" fill="#F59E0B">[ </text>
  <text x="32" y="27" font-family="Inter,system-ui,sans-serif" font-weight="800"
        font-size="16" letter-spacing="2" fill="white">NORMATIZADO</text>
  <text x="175" y="27" font-family="Inter,system-ui,sans-serif" font-weight="800"
        font-size="16" fill="#F59E0B"> ]</text>
</svg>
```

---

## FASE 3 — Astro Landing (Semana 5)

### Task 11: Criar projeto Astro

- [ ] **11.1** Criar projeto:
```bash
cd /Volumes/ssd_mac/ProjetosGit/normatizado
npm create astro@latest astro -- --template minimal --typescript strict --no-git --no-install
cd astro
```

- [ ] **11.2** Instalar dependências:
```bash
npm install
npx astro add tailwind
npx astro add cloudflare
```

- [ ] **11.3** Configurar `astro/astro.config.mjs`:
```javascript
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'static',
  adapter: cloudflare(),
  integrations: [tailwind()],
  trailingSlash: 'never',
  site: 'https://normatizado.com.br',
});
```

- [ ] **11.4** Configurar `astro/tailwind.config.ts`:
```typescript
import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        blue:   { DEFAULT: '#1E40AF', dark: '#1E3A8A', light: '#EFF6FF' },
        grafite: '#1F2937',
        amber:   { DEFAULT: '#F59E0B', light: '#FFFBEB' },
        border:  '#E5E7EB',
        bg:      '#F9FAFB',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
} satisfies Config;
```

- [ ] **11.5** Verificar que Astro builda sem erros:
```bash
cd astro && npm run build
# Esperado: build exitcode 0, dist/ criado
```

- [ ] **11.6** Commit:
```bash
cd /Volumes/ssd_mac/ProjetosGit/normatizado
git add astro/
git commit -m "chore: scaffold astro project com tailwind + cloudflare adapter"
```

---

### Task 12: Criar lib Discourse API

**Arquivo:** `astro/src/lib/discourse.ts`

- [ ] **12.1** Criar `astro/src/lib/discourse.ts`:
```typescript
const DISCOURSE_BASE = 'https://normatizado.com.br/forum';

export interface DiscourseThread {
  id: number;
  title: string;
  slug: string;
  posts_count: number;
  views: number;
  like_count: number;
  tags: string[];
  category_id: number;
  created_at: string;
  excerpt?: string;
}

export interface DiscourseSiteStats {
  topic_count: number;
  post_count: number;
  user_count: number;
  active_users_30_days: number;
}

export interface DiscourseUser {
  id: number;
  username: string;
  name: string;
  trust_level: number;
  post_count: number;
  like_count: number;
}

export async function getTopThreads(period: 'weekly' | 'monthly' = 'weekly', limit = 10): Promise<DiscourseThread[]> {
  try {
    const res = await fetch(`${DISCOURSE_BASE}/top.json?period=${period}`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return getMockThreads();
    const data = await res.json();
    return (data.topic_list?.topics ?? []).slice(0, limit);
  } catch {
    return getMockThreads();
  }
}

export async function getSiteStats(): Promise<DiscourseSiteStats> {
  try {
    const res = await fetch(`${DISCOURSE_BASE}/about.json`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return getMockStats();
    const data = await res.json();
    return {
      topic_count: data.about?.stats?.topic_count ?? 0,
      post_count: data.about?.stats?.post_count ?? 0,
      user_count: data.about?.stats?.user_count ?? 0,
      active_users_30_days: data.about?.stats?.users_30_days ?? 0,
    };
  } catch {
    return getMockStats();
  }
}

export async function getTopUsers(limit = 5): Promise<DiscourseUser[]> {
  try {
    const res = await fetch(`${DISCOURSE_BASE}/directory_items.json?period=monthly&order=post_count`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return getMockUsers();
    const data = await res.json();
    return (data.directory_items ?? []).slice(0, limit).map((item: any) => ({
      id: item.user.id,
      username: item.user.username,
      name: item.user.name,
      trust_level: item.user.trust_level,
      post_count: item.post_count,
      like_count: item.likes_received,
    }));
  } catch {
    return getMockUsers();
  }
}

// Mock data para dev local (quando Discourse ainda não está no ar)
function getMockThreads(): DiscourseThread[] {
  return [
    { id: 1, title: 'Interpretação do item 13.5.1.2 para vasos de categoria IV', slug: 'vasos-categoria-iv', posts_count: 8, views: 420, like_count: 42, tags: ['nr-13', 'vasos-pressao'], category_id: 1, created_at: new Date().toISOString(), excerpt: 'Alguém já enfrentou auditorias onde o fiscal exigiu prontuário reconstruído mesmo com a placa de identificação original legível?' },
    { id: 2, title: 'Cálculo de PLr para prensa hidráulica com comando bimanual tipo IIIC', slug: 'plr-prensa-hidraulica', posts_count: 6, views: 280, like_count: 28, tags: ['nr-12', 'iso-13849'], category_id: 4, created_at: new Date().toISOString(), excerpt: 'Dificuldade em validar o MTTFd dos componentes pneumáticos.' },
    { id: 3, title: 'Dimensionamento de malha de terra em subestação de 13,8 kV', slug: 'malha-terra-subestacao', posts_count: 3, views: 190, like_count: 17, tags: ['abnt-nbr-5418', 'aterramento'], category_id: 2, created_at: new Date().toISOString(), excerpt: 'Pela NBR 15751 o cálculo de tensão de passo é direto, mas a resistividade da medida única apresentou três camadas.' },
  ];
}

function getMockStats(): DiscourseSiteStats {
  return { topic_count: 0, post_count: 0, user_count: 0, active_users_30_days: 0 };
}

function getMockUsers(): DiscourseUser[] {
  return [];
}
```

- [ ] **12.2** Verificar tipos compilam:
```bash
cd astro && npx tsc --noEmit
# Esperado: sem erros
```

- [ ] **12.3** Commit:
```bash
git add astro/src/lib/discourse.ts
git commit -m "feat: discourse API wrapper com mock fallback"
```

---

### Task 13: Criar data de normas

**Arquivo:** `astro/src/data/normas.ts`

- [ ] **13.1** Criar `astro/src/data/normas.ts`:
```typescript
export interface Norma {
  slug: string;
  nome: string;
  sigla: string;
  categoria: 'mecanica' | 'eletrica' | 'civil' | 'sst' | 'instrumentacao';
  descricao: string;
  scope: string[];
  orgao: string;
  discourseTag: string;
}

export const normas: Norma[] = [
  {
    slug: 'nr-12',
    sigla: 'NR-12',
    nome: 'Segurança no Trabalho em Máquinas e Equipamentos',
    categoria: 'sst',
    descricao: 'Norma Regulamentadora 12 estabelece referências técnicas, princípios fundamentais e medidas de proteção para garantir a saúde e integridade física dos trabalhadores na instalação, operação, manutenção e inspeção de máquinas e equipamentos.',
    scope: ['Proteção de máquinas', 'Análise de risco (APR/HRN)', 'Categorias de segurança ISO 13849-1', 'Dispositivos de intertravamento', 'Sinalização e distâncias de segurança'],
    orgao: 'Ministério do Trabalho e Emprego (MTE)',
    discourseTag: 'nr-12',
  },
  {
    slug: 'nr-13',
    sigla: 'NR-13',
    nome: 'Caldeiras, Vasos de Pressão, Tubulações e Tanques Metálicos',
    categoria: 'mecanica',
    descricao: 'NR-13 estabelece requisitos mínimos para gestão da integridade de caldeiras a vapor, vasos de pressão, tubulações de fluidos e tanques metálicos de armazenamento.',
    scope: ['Prontuários de equipamentos', 'PMIE — Plano de manutenção e inspeção', 'Teste hidrostático', 'Categorias de vasos (I a IV)', 'Profissional Habilitado (PH) e Credenciado (PC)'],
    orgao: 'Ministério do Trabalho e Emprego (MTE)',
    discourseTag: 'nr-13',
  },
  {
    slug: 'nr-10',
    sigla: 'NR-10',
    nome: 'Segurança em Instalações e Serviços em Eletricidade',
    categoria: 'eletrica',
    descricao: 'NR-10 estabelece os requisitos e condições mínimas objetivando a implementação de medidas de controle e sistemas preventivos para garantir a segurança e a saúde dos trabalhadores que interagem com instalações elétricas e serviços com eletricidade.',
    scope: ['Prontuário das instalações elétricas', 'Zona controlada e de risco', 'EPIs elétricos', 'Permissão de trabalho (PT)', 'SPDA — Para-raios'],
    orgao: 'Ministério do Trabalho e Emprego (MTE)',
    discourseTag: 'nr-10',
  },
  {
    slug: 'nr-35',
    sigla: 'NR-35',
    nome: 'Trabalho em Altura',
    categoria: 'sst',
    descricao: 'NR-35 estabelece os requisitos mínimos e as medidas de proteção para o trabalho em altura, garantindo a segurança e a saúde dos trabalhadores envolvidos direta ou indiretamente nessa atividade.',
    scope: ['Permissão de trabalho em altura (PT-AT)', 'Plano de resgate', 'Análise de risco (APR)', 'EPI — Cinto de segurança, trava-quedas', 'Capacitação e treinamento'],
    orgao: 'Ministério do Trabalho e Emprego (MTE)',
    discourseTag: 'nr-35',
  },
  {
    slug: 'nr-1',
    sigla: 'NR-1',
    nome: 'Disposições Gerais e Gerenciamento de Riscos Ocupacionais',
    categoria: 'sst',
    descricao: 'NR-1 atualizada em 2019 instituiu o Programa de Gerenciamento de Riscos (PGR) como documento central para gestão de SST, englobando inventário de riscos e plano de ação.',
    scope: ['PGR — Programa de Gerenciamento de Riscos', 'Inventário de riscos', 'GRO — Gerenciamento de riscos ocupacionais', 'PCMSO integrado', 'Comunicação de riscos'],
    orgao: 'Ministério do Trabalho e Emprego (MTE)',
    discourseTag: 'nr-1',
  },
  {
    slug: 'nr-6',
    sigla: 'NR-6',
    nome: 'Equipamentos de Proteção Individual',
    categoria: 'sst',
    descricao: 'NR-6 define EPI, obrigações do empregador e empregado, e estabelece os equipamentos de proteção individual de uso obrigatório.',
    scope: ['CA — Certificado de Aprovação', 'Seleção de EPI por risco', 'Higienização e guarda', 'Treinamento de uso'],
    orgao: 'Ministério do Trabalho e Emprego (MTE)',
    discourseTag: 'nr-6',
  },
  {
    slug: 'nr-18',
    sigla: 'NR-18',
    nome: 'Condições e Meio Ambiente de Trabalho na Indústria da Construção',
    categoria: 'civil',
    descricao: 'NR-18 estabelece diretrizes de ordem administrativa, de planejamento e de organização, que objetivam a implementação de medidas de controle e sistemas preventivos de segurança nos processos, nas condições e no meio ambiente de trabalho na indústria da construção civil.',
    scope: ['PCMAT', 'Proteções coletivas em andaimes', 'Escavações e fundações', 'Instalações elétricas temporárias', 'Máquinas e equipamentos de construção'],
    orgao: 'Ministério do Trabalho e Emprego (MTE)',
    discourseTag: 'nr-18',
  },
  {
    slug: 'nr-33',
    sigla: 'NR-33',
    nome: 'Segurança e Saúde nos Trabalhos em Espaços Confinados',
    categoria: 'sst',
    descricao: 'NR-33 visa estabelecer os requisitos mínimos para identificação de espaços confinados e o reconhecimento, avaliação, monitoramento e controle dos riscos existentes.',
    scope: ['Permissão de entrada e trabalho (PET)', 'Vigia e supervisor de entrada', 'Monitoramento atmosférico', 'Plano de resgate', 'Bloquio e etiquetagem (LOTO)'],
    orgao: 'Ministério do Trabalho e Emprego (MTE)',
    discourseTag: 'nr-33',
  },
  {
    slug: 'asme-viii',
    sigla: 'ASME VIII',
    nome: 'ASME Boiler and Pressure Vessel Code — Division 1',
    categoria: 'mecanica',
    descricao: 'ASME Section VIII Division 1 estabelece requisitos mínimos para o projeto, fabricação, inspeção e certificação de vasos de pressão operando acima de 15 psi (103 kPa).',
    scope: ['MAWP — Maximum Allowable Working Pressure', 'Cálculo de espessura de casco e tampos', 'Aberturas e reforços', 'Junta soldada — eficiência e PWHT', 'Estampa U — National Board'],
    orgao: 'American Society of Mechanical Engineers (ASME)',
    discourseTag: 'asme-viii',
  },
  {
    slug: 'api-510',
    sigla: 'API 510',
    nome: 'Pressure Vessel Inspection Code',
    categoria: 'mecanica',
    descricao: 'API 510 cobre inspeção em serviço, avaliação de condição, reparo e alteração de vasos de pressão.',
    scope: ['RBI — Risk-Based Inspection', 'Taxa de corrosão e life assessment', 'MAWP reduzido por desgaste', 'Reparo sem tirar de serviço', 'Autorização NR (Authorized Inspector)'],
    orgao: 'American Petroleum Institute (API)',
    discourseTag: 'api-510',
  },
  {
    slug: 'api-570',
    sigla: 'API 570',
    nome: 'Piping Inspection Code',
    categoria: 'mecanica',
    descricao: 'API 570 abrange inspeção, avaliação, reparo e alteração de sistemas de tubulação em serviço.',
    scope: ['Circuitos de corrosão', 'MLAs — Minimum Local Areas', 'CML — Corrosion Monitoring Location', 'API RP 574', 'P-F Curve'],
    orgao: 'American Petroleum Institute (API)',
    discourseTag: 'api-570',
  },
  {
    slug: 'abnt-nbr-5410',
    sigla: 'ABNT NBR 5410',
    nome: 'Instalações Elétricas de Baixa Tensão',
    categoria: 'eletrica',
    descricao: 'NBR 5410 estabelece as condições a que devem satisfazer as instalações elétricas de baixa tensão, para garantir a segurança de pessoas e animais, o funcionamento correto da instalação e a conservação dos bens.',
    scope: ['Sistemas TN, TT, IT', 'Proteção contra choques elétricos', 'Dimensionamento de condutores', 'Proteção por disjuntores e fusíveis', 'Aterramento e equipotencialização'],
    orgao: 'Associação Brasileira de Normas Técnicas (ABNT)',
    discourseTag: 'abnt-nbr-5410',
  },
  {
    slug: 'abnt-nbr-6118',
    sigla: 'ABNT NBR 6118',
    nome: 'Projeto de Estruturas de Concreto — Procedimento',
    categoria: 'civil',
    descricao: 'NBR 6118 estabelece os requisitos básicos exigíveis para projeto de estruturas de concreto simples, armado e protendido.',
    scope: ['ELU e ELS', 'Cobrimento de armaduras', 'Pilares e vigas', 'Fundações rasas e profundas via NBR 6122', 'Armadura de cisalhamento'],
    orgao: 'Associação Brasileira de Normas Técnicas (ABNT)',
    discourseTag: 'abnt-nbr-6118',
  },
  {
    slug: 'abnt-nbr-8800',
    sigla: 'ABNT NBR 8800',
    nome: 'Projeto de Estruturas de Aço e de Estruturas Mistas de Aço e Concreto',
    categoria: 'civil',
    descricao: 'NBR 8800 define os requisitos para projeto de estruturas de aço e mistas, incluindo ligações e elementos especiais.',
    scope: ['Perfis laminados e soldados', 'Ligações parafusadas e soldadas', 'Flambagem local e global', 'Estruturas mistas', 'Estados limites últimos e de serviço'],
    orgao: 'Associação Brasileira de Normas Técnicas (ABNT)',
    discourseTag: 'abnt-nbr-8800',
  },
  {
    slug: 'iso-13849',
    sigla: 'ISO 13849-1',
    nome: 'Safety of Machinery — Safety-Related Parts of Control Systems',
    categoria: 'sst',
    descricao: 'ISO 13849-1 fornece requisitos de segurança e orientações sobre os princípios para o projeto e integração de partes relacionadas à segurança de sistemas de controle (SRP/CS).',
    scope: ['Performance Level (PLr)', 'Categorias B, 1, 2, 3, 4', 'MTTFd, DCavg, CCF', 'SISTEMA software SISTEMA', 'Arquitetura redundante'],
    orgao: 'International Organization for Standardization (ISO)',
    discourseTag: 'iso-13849',
  },
  {
    slug: 'iec-60364',
    sigla: 'IEC 60364',
    nome: 'Low-Voltage Electrical Installations',
    categoria: 'eletrica',
    descricao: 'IEC 60364 é a norma internacional para instalações elétricas de baixa tensão, base da ABNT NBR 5410.',
    scope: ['Parte 4: Proteção para segurança', 'Parte 5: Seleção e instalação', 'Parte 6: Verificação', 'Sistemas de aterramento', 'Proteção diferencial (RCD)'],
    orgao: 'International Electrotechnical Commission (IEC)',
    discourseTag: 'iec-60364',
  },
  {
    slug: 'iec-61508',
    sigla: 'IEC 61508',
    nome: 'Functional Safety of E/E/PE Safety-Related Systems',
    categoria: 'instrumentacao',
    descricao: 'IEC 61508 é o padrão fundamental de segurança funcional, cobrindo o ciclo de vida completo de sistemas elétricos/eletrônicos/programáveis relacionados à segurança.',
    scope: ['SIL 1 a 4', 'PFDavg e PFH', 'Ciclo de vida de segurança', 'Hardware e software de segurança', 'Base para IEC 61511, IEC 62061, ISO 13849'],
    orgao: 'International Electrotechnical Commission (IEC)',
    discourseTag: 'iec-61508',
  },
  {
    slug: 'isa-84',
    sigla: 'ISA-84 / IEC 61511',
    nome: 'Functional Safety — Safety Instrumented Systems (SIS)',
    categoria: 'instrumentacao',
    descricao: 'ISA-84 (equivalente à IEC 61511) define os requisitos para o ciclo de vida de Safety Instrumented Systems (SIS) aplicados ao setor de processo.',
    scope: ['HAZOP e SIL Assessment', 'SIL Verification', 'SIF — Safety Instrumented Function', 'Arquitetura de SIS', 'Management of Functional Safety'],
    orgao: 'ISA / International Electrotechnical Commission (IEC)',
    discourseTag: 'isa-84',
  },
  {
    slug: 'abnt-nbr-15575',
    sigla: 'ABNT NBR 15575',
    nome: 'Edificações Habitacionais — Desempenho',
    categoria: 'civil',
    descricao: 'NBR 15575 estabelece critérios mínimos de desempenho para edificações habitacionais, avaliando durabilidade, conforto, segurança e sustentabilidade.',
    scope: ['Vida útil de projeto (VUP)', 'Desempenho térmico e acústico', 'Estanqueidade', 'Segurança estrutural em uso', 'Responsabilidade do construtor e incorporador'],
    orgao: 'Associação Brasileira de Normas Técnicas (ABNT)',
    discourseTag: 'abnt-nbr-15575',
  },
  {
    slug: 'nfpa-70',
    sigla: 'NFPA 70 (NEC)',
    nome: 'National Electrical Code',
    categoria: 'eletrica',
    descricao: 'National Electrical Code (NEC) é o código elétrico norte-americano, amplamente referenciado em instalações industriais no Brasil com equipamentos importados.',
    scope: ['Article 500 — Hazardous Locations', 'Article 430 — Motors', 'Article 700 — Emergency Systems', 'Grounding e bonding', 'Instalações em zonas classificadas'],
    orgao: 'National Fire Protection Association (NFPA)',
    discourseTag: 'nfpa-70',
  },
];

export function getNormaBySlug(slug: string): Norma | undefined {
  return normas.find(n => n.slug === slug);
}

export function getNormasByCategoria(categoria: Norma['categoria']): Norma[] {
  return normas.filter(n => n.categoria === categoria);
}
```

- [ ] **13.2** Verificar tipos:
```bash
cd astro && npx tsc --noEmit
# Esperado: sem erros
```

- [ ] **13.3** Commit:
```bash
git add astro/src/data/normas.ts
git commit -m "feat: data de 20 normas técnicas com metadata"
```

---

### Task 14: Criar BaseLayout + componentes base

**Arquivo:** `astro/src/layouts/BaseLayout.astro`

- [ ] **14.1** Criar `astro/src/layouts/BaseLayout.astro`:
```astro
---
interface Props {
  title: string;
  description: string;
  canonical?: string;
  ogImage?: string;
}
const { title, description, canonical, ogImage } = Astro.props;
const SITE = 'https://normatizado.com.br';
const fullTitle = `${title} | Normatizado`;
---
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{fullTitle}</title>
  <meta name="description" content={description} />
  {canonical && <link rel="canonical" href={`${SITE}${canonical}`} />}
  <meta property="og:title" content={fullTitle} />
  <meta property="og:description" content={description} />
  <meta property="og:type" content="website" />
  {ogImage && <meta property="og:image" content={`${SITE}${ogImage}`} />}
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" />
</head>
<body class="font-sans bg-bg text-grafite antialiased">
  <slot />
</body>
</html>
```

- [ ] **14.2** Criar `astro/src/components/Nav.astro`:
```astro
---
const links = [
  { href: '/normas', label: 'Normas' },
  { href: '/forum/latest', label: 'Discussões' },
  { href: '/especialistas', label: 'Especialistas' },
  { href: '/forum/tags', label: 'Tags' },
];
---
<nav class="bg-blue h-14 flex items-center justify-between px-8">
  <a href="/" class="font-mono font-black text-base tracking-widest text-white border-2 border-white/40 px-3 py-1 rounded">
    <span class="text-amber">[</span> NORMATIZADO <span class="text-amber">]</span>
  </a>
  <div class="hidden md:flex gap-7">
    {links.map(l => (
      <a href={l.href} class="text-white/80 hover:text-white text-sm font-medium transition-colors">{l.label}</a>
    ))}
  </div>
  <div class="flex items-center gap-3">
    <a href="/forum/search" class="text-white/60 text-sm hidden md:block">🔍 Buscar normas...</a>
    <a href="/forum/login" class="bg-amber text-grafite font-bold text-sm px-4 py-2 rounded hover:bg-amber-400 transition-colors">
      ENTRAR
    </a>
  </div>
</nav>
```

- [ ] **14.3** Criar `astro/src/components/StatsBar.astro`:
```astro
---
import type { DiscourseSiteStats } from '../lib/discourse';
interface Props { stats: DiscourseSiteStats; }
const { stats } = Astro.props;

const items = [
  { num: stats.user_count > 0 ? stats.user_count.toLocaleString('pt-BR') : '—', label: 'Engenheiros' },
  { num: stats.topic_count > 0 ? stats.topic_count.toLocaleString('pt-BR') : '—', label: 'Discussões' },
  { num: stats.post_count > 0 ? stats.post_count.toLocaleString('pt-BR') : '—', label: 'Respostas' },
  { num: '82%', label: 'Taxa de Solução' },
];
---
<div class="bg-grafite grid grid-cols-4 py-7">
  {items.map(item => (
    <div class="text-center">
      <div class="text-amber font-black text-3xl">{item.num}</div>
      <div class="text-white/50 text-xs tracking-widest uppercase mt-1">{item.label}</div>
    </div>
  ))}
</div>
```

- [ ] **14.4** Commit:
```bash
git add astro/src/layouts/ astro/src/components/Nav.astro astro/src/components/StatsBar.astro
git commit -m "feat: BaseLayout, Nav e StatsBar components"
```

---

### Task 15: Criar homepage

**Arquivo:** `astro/src/pages/index.astro`

- [ ] **15.1** Criar `astro/src/components/Hero.astro`:
```astro
---
---
<section class="bg-grafite py-12 px-8 grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
  <div>
    <p class="text-amber font-mono text-xs tracking-[3px] uppercase mb-4">// Repositório Técnico Colaborativo</p>
    <h1 class="text-white font-black text-4xl md:text-5xl leading-tight mb-5">
      A autoridade técnica para a Engenharia <span class="text-amber">Nacional.</span>
    </h1>
    <p class="text-white/65 text-base leading-relaxed mb-8 max-w-lg">
      O fórum definitivo para interpretação de NRs, normas ABNT e códigos internacionais.
      Segurança jurídica e precisão técnica para quem assina a ART.
    </p>
    <div class="flex gap-3 flex-wrap">
      <a href="/forum/signup" class="bg-amber text-grafite font-bold px-6 py-3 rounded text-sm tracking-wide hover:bg-yellow-400 transition-colors">
        COMEÇAR A DISCUTIR
      </a>
      <a href="/normas" class="border-2 border-white/30 text-white font-semibold px-6 py-3 rounded text-sm hover:border-white/60 transition-colors">
        EXPLORAR NORMAS
      </a>
    </div>
  </div>
  <div class="hidden md:block bg-white/5 border border-white/10 rounded-lg p-5 relative">
    <span class="absolute -top-3 left-3 bg-amber text-grafite text-xs font-bold px-2 py-1 rounded tracking-wider">PROJ_003</span>
    <div class="h-44 bg-white/5 border border-dashed border-white/15 rounded flex items-center justify-center text-white/30 text-sm">
      [ Desenhos técnicos em destaque — NBR 6118 / ASME VIII ]
    </div>
    <div class="flex justify-center gap-2 mt-4">
      {[0,1,2,3,4].map((i) => (
        <div class={`h-1 rounded-sm ${i === 1 ? 'w-6 bg-amber' : 'w-4 bg-white/20'}`}></div>
      ))}
    </div>
    <p class="text-right text-white/30 text-xs mt-2 tracking-wider">NBR 6118 &nbsp; 03 / 05</p>
  </div>
</section>
```

- [ ] **15.2** Criar `astro/src/components/CategoryGrid.astro`:
```astro
---
const categories = [
  { num: '01', code: 'MEC', name: 'Mecânica e Pressão', desc: 'NR-13, ASME VIII, Tubulações e Caldeiras.', href: '/forum/c/mecanica-pressao' },
  { num: '02', code: 'ELE', name: 'Elétrica e ATEX',   desc: 'NR-10, NBR 5410, Atmosferas Explosivas.',  href: '/forum/c/eletrica-atex' },
  { num: '03', code: 'SST', name: 'SST e Seg. Máquinas', desc: 'NR-12, NR-35, PGR, Gestão de Riscos.',  href: '/forum/c/sst-maquinas', highlight: true },
  { num: '04', code: 'CIV', name: 'Civil e Estrutural', desc: 'NBR 6118, NBR 8800, NR-18, Fundações.',   href: '/forum/c/civil-estrutural' },
  { num: '05', code: 'INST', name: 'Instrumentação',   desc: 'ISA-84, SIL, IEC 61511, Automação.',       href: '/forum/c/instrumentacao' },
];
---
<section class="px-8 py-9">
  <div class="flex justify-between items-end mb-5">
    <div>
      <h2 class="text-xl font-bold text-grafite">Disciplinas Normativas</h2>
      <p class="text-sm text-gray-500 mt-1">Navegue por áreas específicas de atuação técnica.</p>
    </div>
    <span class="text-amber text-sm font-semibold">01/05 ›</span>
  </div>
  <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
    {categories.map(cat => (
      <a href={cat.href}
         class={`block border rounded-md p-4 transition-all hover:shadow-md
           ${cat.highlight
             ? 'border-t-4 border-t-amber bg-amber/5 border-x-border border-b-border'
             : 'border-t-4 border-t-border bg-white hover:border-t-blue'}`}>
        <p class="text-gray-400 text-xs tracking-widest font-semibold mb-2">{cat.num}. {cat.code}</p>
        <h3 class="text-sm font-bold text-grafite mb-1">{cat.name}</h3>
        <p class="text-xs text-gray-500 leading-snug">{cat.desc}</p>
      </a>
    ))}
  </div>
</section>
```

- [ ] **15.3** Criar `astro/src/components/ThreadFeed.astro`:
```astro
---
import type { DiscourseThread, DiscourseUser } from '../lib/discourse';
interface Props {
  threads: DiscourseThread[];
  topUsers: DiscourseUser[];
}
const { threads, topUsers } = Astro.props;

const tagColors: Record<string, string> = {
  'nr-13': 'bg-blue-light text-blue',
  'nr-12': 'bg-blue-light text-blue',
  'nr-10': 'bg-blue-light text-blue',
  'iso-13849': 'bg-blue-light text-blue',
  'asme-viii': 'bg-blue-light text-blue',
};
---
<section class="px-8 pb-10">
  <div class="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-7">

    <!-- Feed -->
    <div>
      <div class="flex justify-between items-center mb-5">
        <h2 class="text-xl font-bold text-grafite">Tópicos em Destaque</h2>
        <div class="flex gap-1">
          <a href="/forum/top?period=weekly" class="px-3 py-1.5 text-xs font-semibold rounded bg-blue text-white">VOTADOS</a>
          <a href="/forum/latest" class="px-3 py-1.5 text-xs font-semibold rounded bg-gray-100 text-gray-500 hover:bg-gray-200">RECENTES</a>
        </div>
      </div>

      {threads.length === 0 && (
        <div class="bg-white border border-border rounded-lg p-8 text-center text-gray-400 text-sm">
          Fórum em breve. Seja um dos primeiros membros!
          <br/><a href="/forum/signup" class="text-blue font-semibold mt-2 inline-block">Criar conta →</a>
        </div>
      )}

      {threads.map(thread => (
        <a href={`/forum/t/${thread.slug}/${thread.id}`}
           class="block bg-white border border-border rounded-lg p-4 mb-3 grid grid-cols-[52px_1fr] gap-4 hover:border-blue hover:shadow-sm transition-all">
          <div class="flex flex-col items-center gap-1">
            <span class="text-xl font-black text-blue">{thread.like_count}</span>
            <span class="text-[9px] text-gray-400 tracking-widest uppercase">votos</span>
            {thread.posts_count > 1 && (
              <span class="bg-green-100 text-green-800 text-[10px] font-bold px-2 py-0.5 rounded">✓ {thread.posts_count - 1}</span>
            )}
          </div>
          <div>
            <div class="flex gap-1.5 flex-wrap mb-2">
              {thread.tags.slice(0, 3).map(tag => (
                <span class={`text-[9px] font-semibold px-2 py-0.5 rounded uppercase tracking-wide ${tagColors[tag] ?? 'bg-gray-100 text-gray-600'}`}>
                  {tag}
                </span>
              ))}
            </div>
            <h3 class="text-sm font-semibold text-grafite leading-snug mb-1.5">{thread.title}</h3>
            {thread.excerpt && <p class="text-xs text-gray-500 leading-relaxed line-clamp-2">{thread.excerpt}</p>}
          </div>
        </a>
      ))}

      <a href="/forum/top" class="block text-center text-blue text-sm font-semibold mt-4 hover:underline">
        Ver todos os tópicos →
      </a>
    </div>

    <!-- Sidebar -->
    <div>
      <!-- Top Contributors -->
      <div class="bg-white border border-border rounded-lg p-5 mb-4">
        <h3 class="text-xs font-bold text-grafite tracking-widest uppercase mb-4">Principais Colaboradores</h3>
        {topUsers.length === 0 && (
          <p class="text-xs text-gray-400">Seja o primeiro a contribuir!</p>
        )}
        {topUsers.map((user, i) => (
          <a href={`/forum/u/${user.username}`} class="flex items-center gap-3 mb-3 group">
            <div class={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0
              ${i === 0 ? 'bg-blue' : i === 1 ? 'bg-green-700' : 'bg-purple-600'}`}>
              {(user.name || user.username).slice(0, 2).toUpperCase()}
            </div>
            <div class="min-w-0">
              <p class="text-sm font-semibold text-grafite group-hover:text-blue truncate">{user.name || user.username}</p>
              <p class="text-xs text-gray-400">{user.post_count} respostas</p>
            </div>
            <span class="text-blue text-xs font-bold ml-auto">+{user.like_count}</span>
          </a>
        ))}
      </div>

      <!-- Norma da Semana -->
      <div class="bg-blue rounded-lg p-5 mb-4">
        <p class="text-amber text-xs font-bold tracking-widest uppercase mb-2">Norma da Semana</p>
        <p class="text-white/85 text-sm leading-relaxed">
          Discussão aberta: o que muda no PGR para 2026 com a nova revisão da NR-1?
        </p>
        <a href="/forum/c/sst-maquinas" class="block bg-amber text-grafite text-center text-xs font-bold py-2 rounded mt-4 hover:bg-yellow-400 transition-colors">
          PARTICIPAR
        </a>
      </div>

      <!-- Tags populares -->
      <div class="bg-white border border-border rounded-lg p-5">
        <h3 class="text-xs font-bold text-grafite tracking-widest uppercase mb-4">Tags Populares</h3>
        <div class="flex flex-wrap gap-2">
          {['nr-12','nr-13','abnt-nbr-5410','asme-viii','laudo-tecnico','nr-35','iso-13849'].map(tag => (
            <a href={`/forum/tag/${tag}`} class="bg-blue-light text-blue text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-blue hover:text-white transition-colors">
              #{tag}
            </a>
          ))}
        </div>
      </div>
    </div>
  </div>
</section>
```

- [ ] **15.4** Criar `astro/src/pages/index.astro`:
```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import Nav from '../components/Nav.astro';
import Hero from '../components/Hero.astro';
import CategoryGrid from '../components/CategoryGrid.astro';
import ThreadFeed from '../components/ThreadFeed.astro';
import StatsBar from '../components/StatsBar.astro';
import { getTopThreads, getSiteStats, getTopUsers } from '../lib/discourse';

const [threads, stats, topUsers] = await Promise.all([
  getTopThreads('weekly', 5),
  getSiteStats(),
  getTopUsers(3),
]);
---
<BaseLayout
  title="O fórum técnico das normas brasileiras e internacionais"
  description="Fórum colaborativo para engenheiros e técnicos: NR-12, NR-13, ASME VIII, ABNT, IEC e muito mais. Tire dúvidas, compartilhe conhecimento, construa reputação."
  canonical="/"
>
  <Nav />
  <Hero />
  <CategoryGrid />
  <div class="h-px bg-border mx-8"></div>
  <ThreadFeed threads={threads} topUsers={topUsers} />
  <StatsBar stats={stats} />
</BaseLayout>
```

- [ ] **15.5** Build local:
```bash
cd astro && npm run build
# Esperado: build OK, dist/index.html gerado
```

- [ ] **15.6** Preview:
```bash
npm run preview
# Abrir http://localhost:4321 e verificar layout
```

- [ ] **15.7** Commit:
```bash
git add astro/src/
git commit -m "feat: homepage completa — Hero, CategoryGrid, ThreadFeed, StatsBar"
```

---

### Task 16: Criar páginas /normas

- [ ] **16.1** Criar `astro/src/pages/normas/index.astro`:
```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import Nav from '../../components/Nav.astro';
import { normas } from '../../data/normas';

const byCategoria = {
  mecanica:       normas.filter(n => n.categoria === 'mecanica'),
  eletrica:       normas.filter(n => n.categoria === 'eletrica'),
  civil:          normas.filter(n => n.categoria === 'civil'),
  sst:            normas.filter(n => n.categoria === 'sst'),
  instrumentacao: normas.filter(n => n.categoria === 'instrumentacao'),
};

const categoriaLabels: Record<string, string> = {
  mecanica: '⚙️ Mecânica e Pressão',
  eletrica: '⚡ Elétrica e ATEX',
  civil: '🏗️ Civil e Estrutural',
  sst: '🦺 SST e Seg. Máquinas',
  instrumentacao: '📡 Instrumentação',
};
---
<BaseLayout
  title="Normas Técnicas"
  description="Guia completo de normas técnicas brasileiras e internacionais: NRs, ABNT NBR, ASME, API, ISO, IEC. Discussões e interpretações no fórum Normatizado."
  canonical="/normas"
>
  <Nav />
  <main class="max-w-5xl mx-auto px-8 py-12">
    <h1 class="text-3xl font-black text-grafite mb-2">Normas Técnicas</h1>
    <p class="text-gray-500 mb-10">Base de conhecimento colaborativo por norma — discussões, interpretações e casos práticos.</p>

    {Object.entries(byCategoria).map(([cat, list]) => (
      <section class="mb-10">
        <h2 class="text-lg font-bold text-grafite mb-4 pb-2 border-b border-border">
          {categoriaLabels[cat]}
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          {list.map(norma => (
            <a href={`/normas/${norma.slug}`}
               class="flex gap-4 bg-white border border-border rounded-lg p-4 hover:border-blue hover:shadow-sm transition-all">
              <div class="bg-blue-light text-blue font-black text-xs px-3 py-2 rounded flex-shrink-0 self-start tracking-wide">
                {norma.sigla.replace(' ', '\n')}
              </div>
              <div>
                <h3 class="text-sm font-semibold text-grafite mb-1">{norma.nome}</h3>
                <p class="text-xs text-gray-500 leading-snug line-clamp-2">{norma.descricao}</p>
              </div>
            </a>
          ))}
        </div>
      </section>
    ))}
  </main>
</BaseLayout>
```

- [ ] **16.2** Criar `astro/src/pages/normas/[slug].astro`:
```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import Nav from '../../components/Nav.astro';
import { normas } from '../../data/normas';
import type { GetStaticPaths } from 'astro';

export const getStaticPaths: GetStaticPaths = () =>
  normas.map(n => ({ params: { slug: n.slug }, props: { norma: n } }));

const { norma } = Astro.props;
---
<BaseLayout
  title={`${norma.sigla} — ${norma.nome}`}
  description={norma.descricao}
  canonical={`/normas/${norma.slug}`}
>
  <Nav />
  <main class="max-w-3xl mx-auto px-8 py-12">
    <nav class="text-xs text-gray-400 mb-6">
      <a href="/" class="hover:text-blue">Início</a> /
      <a href="/normas" class="hover:text-blue"> Normas</a> /
      <span class="text-grafite font-semibold"> {norma.sigla}</span>
    </nav>

    <div class="flex items-start gap-5 mb-8">
      <div class="bg-blue text-white font-black text-lg px-5 py-3 rounded flex-shrink-0">
        {norma.sigla}
      </div>
      <div>
        <h1 class="text-2xl font-black text-grafite leading-tight">{norma.nome}</h1>
        <p class="text-sm text-gray-500 mt-1">{norma.orgao}</p>
      </div>
    </div>

    <p class="text-base text-gray-700 leading-relaxed mb-8">{norma.descricao}</p>

    <h2 class="text-lg font-bold text-grafite mb-4">Escopo de aplicação</h2>
    <ul class="space-y-2 mb-10">
      {norma.scope.map(item => (
        <li class="flex gap-3 items-start">
          <span class="text-amber mt-0.5">▸</span>
          <span class="text-sm text-gray-700">{item}</span>
        </li>
      ))}
    </ul>

    <div class="bg-blue-light border border-blue/20 rounded-lg p-6">
      <h3 class="font-bold text-blue mb-2">Discussões sobre {norma.sigla}</h3>
      <p class="text-sm text-gray-600 mb-4">
        Veja perguntas, interpretações e casos práticos discutidos por engenheiros no fórum.
      </p>
      <a href={`/forum/tag/${norma.discourseTag}`}
         class="inline-block bg-blue text-white font-semibold text-sm px-5 py-2 rounded hover:bg-blue-dark transition-colors">
        Ver threads sobre {norma.sigla} →
      </a>
    </div>
  </main>
</BaseLayout>
```

- [ ] **16.3** Build e verificar 20 páginas geradas:
```bash
cd astro && npm run build
ls dist/normas/
# Esperado: 20 diretórios slug + index/
```

- [ ] **16.4** Commit:
```bash
git add astro/src/pages/normas/
git commit -m "feat: páginas SEO /normas/[slug] para 20 normas técnicas"
```

---

### Task 17: CF Pages Function — proxy /forum

**Arquivo:** `astro/functions/forum/[[all]].ts`

- [ ] **17.1** Criar diretório e arquivo:
```bash
mkdir -p /Volumes/ssd_mac/ProjetosGit/normatizado/astro/functions/forum
```

- [ ] **17.2** Criar `astro/functions/forum/[[all]].ts`:
```typescript
interface Env {
  VPS_DISCOURSE_ORIGIN: string; // ex: http://123.456.789.10  (sem trailing slash)
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

  // Preserve original headers, override Host
  const headers = new Headers(request.headers);
  headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') ?? '');
  headers.set('X-Forwarded-Proto', 'https');
  headers.delete('Host'); // Let fetch set Host from targetUrl

  const proxied = new Request(targetUrl.toString(), {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'manual', // Preserve redirects from Discourse
  });

  return fetch(proxied);
}
```

- [ ] **17.3** Adicionar `VPS_DISCOURSE_ORIGIN` nas variáveis de ambiente do CF Pages:
```
CF Dashboard → normatizado → Settings → Environment Variables
Variable: VPS_DISCOURSE_ORIGIN
Value: http://SEU_IP_VPS  (ex: http://123.456.789.10)
Ambiente: Production
```

- [ ] **17.4** Build local para verificar que a function não causa erro de compilação:
```bash
cd astro && npm run build
# A function é TypeScript — verificar que não há erros
```

- [ ] **17.5** Criar `astro/public/_headers` para cache:
```
/forum/*
  Cache-Control: no-store

/*
  Cache-Control: public, max-age=0, s-maxage=3600, must-revalidate

/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

- [ ] **17.6** Commit:
```bash
git add astro/functions/ astro/public/_headers
git commit -m "feat: CF Pages Function proxy /forum → VPS + cache headers"
```

---

## FASE 4 — Deploy e Integração (Semana 5-6)

### Task 18: Deploy Astro no Cloudflare Pages

- [ ] **18.1** Criar projeto no Cloudflare Pages:
```
CF Dashboard → Pages → Create application → Connect to Git
Repositório: normatizado (GitHub)
Branch: main
Root directory: astro/
Build command: npm run build
Build output: dist/
```

- [ ] **18.2** Adicionar custom domain:
```
CF Pages → normatizado → Custom domains → Add → normatizado.com.br
```

- [ ] **18.3** No CF DNS, garantir que normatizado.com.br aponta para CF Pages:
```
Tipo: CNAME
Nome: @  (ou registrar via CF Pages automaticamente)
Proxy: ON
```

- [ ] **18.4** Adicionar secret de produção:
```
CF Pages → Settings → Environment variables → Production
VPS_DISCOURSE_ORIGIN = http://IP_DO_VPS
```

- [ ] **18.5** Trigger primeiro deploy e verificar:
```bash
git push origin main
# CF Pages faz build automático
# Verificar em: https://normatizado.com.br
```

- [ ] **18.6** Testar proxy:
```bash
curl -I https://normatizado.com.br/forum
# Deve retornar: HTTP/2 200 (Discourse)
curl -I https://normatizado.com.br/
# Deve retornar: HTTP/2 200 (Astro landing)
```

---

### Task 19: Páginas adicionais + sitemap

- [ ] **19.1** Criar `astro/src/pages/especialistas.astro`:
```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import Nav from '../components/Nav.astro';
import { getTopUsers } from '../lib/discourse';
const topUsers = await getTopUsers(20);
---
<BaseLayout title="Especialistas" description="Os engenheiros e técnicos mais ativos no fórum Normatizado." canonical="/especialistas">
  <Nav />
  <main class="max-w-3xl mx-auto px-8 py-12">
    <h1 class="text-3xl font-black text-grafite mb-2">Especialistas</h1>
    <p class="text-gray-500 mb-8">Membros com maior contribuição técnica no fórum.</p>
    {topUsers.length === 0 && (
      <p class="text-gray-400 text-sm">Seja um dos primeiros especialistas. <a href="/forum/signup" class="text-blue hover:underline">Criar conta →</a></p>
    )}
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      {topUsers.map((user, i) => (
        <a href={`/forum/u/${user.username}`}
           class="flex items-center gap-4 bg-white border border-border rounded-lg p-4 hover:border-blue transition-colors">
          <div class={`w-12 h-12 rounded-full flex items-center justify-center text-white font-black text-sm flex-shrink-0
            ${i < 3 ? 'bg-blue' : 'bg-gray-400'}`}>
            {(user.name || user.username).slice(0, 2).toUpperCase()}
          </div>
          <div class="min-w-0">
            <p class="font-semibold text-grafite truncate">{user.name || user.username}</p>
            <p class="text-xs text-gray-500">{user.post_count} respostas · {user.like_count} likes</p>
          </div>
          {i < 3 && <span class="ml-auto text-amber font-black text-lg">{['🥇','🥈','🥉'][i]}</span>}
        </a>
      ))}
    </div>
  </main>
</BaseLayout>
```

- [ ] **19.2** Criar `astro/src/pages/sobre.astro`:
```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import Nav from '../components/Nav.astro';
---
<BaseLayout title="Sobre" description="Normatizado — o fórum técnico colaborativo das normas de engenharia no Brasil." canonical="/sobre">
  <Nav />
  <main class="max-w-2xl mx-auto px-8 py-16">
    <h1 class="text-3xl font-black text-grafite mb-6">Sobre o Normatizado</h1>
    <p class="text-base text-gray-700 leading-relaxed mb-4">
      Normatizado é o fórum técnico colaborativo dedicado à interpretação, discussão e aplicação de normas
      regulamentadoras, normas ABNT e códigos internacionais de engenharia no Brasil.
    </p>
    <p class="text-base text-gray-700 leading-relaxed mb-4">
      Criado por engenheiros, para engenheiros. Nossa missão é democratizar o conhecimento normativo e construir
      o maior repositório colaborativo de interpretação técnica do país.
    </p>
    <p class="text-sm text-gray-500">
      Iniciativa de <a href="https://esengenharia.com" class="text-blue hover:underline" target="_blank">ES Engenharia</a>.
    </p>
  </main>
</BaseLayout>
```

- [ ] **19.2** Adicionar `@astrojs/sitemap` e configurar:
```bash
cd astro && npx astro add sitemap
```

Atualizar `astro.config.mjs`:
```javascript
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  output: 'static',
  adapter: cloudflare(),
  integrations: [tailwind(), sitemap()],
  trailingSlash: 'never',
  site: 'https://normatizado.com.br',
});
```

- [ ] **19.3** Build e verificar sitemap:
```bash
npm run build
ls dist/sitemap*.xml
# Deve listar sitemap-index.xml + sitemap-0.xml
```

- [ ] **19.4** Commit e push:
```bash
git add .
git commit -m "feat: página sobre + sitemap gerado"
git push origin main
```

---

### Task 20: Configurar Google Search Console + analytics

- [ ] **20.1** Verificar propriedade `normatizado.com.br` no Google Search Console:
```
GSC → Add Property → Domain → normatizado.com.br
Método: DNS (adicionar TXT no Cloudflare)
```

- [ ] **20.2** Submeter sitemap:
```
GSC → Sitemaps → Add: https://normatizado.com.br/sitemap-index.xml
```

- [ ] **20.3** Verificar indexação da homepage:
```
GSC → URL Inspection → https://normatizado.com.br → Request indexing
```

---

## FASE 5 — Seed Content + Launch (Semana 6-9)

### Task 21: Criar 30-50 threads seed

**Objetivo:** Fórum não pode parecer vazio no lançamento. Mínimo 2 threads por subcategoria.

- [ ] **21.1** Login como admin em `normatizado.com.br/forum`

- [ ] **21.2** Criar threads na categoria **NR-13**:
  - "Interpretação do item 13.5.1.2: categoria IV com dano em placa de identificação"
  - "PMIE mínimo para vaso de pressão categoria I — frequência de inspeção"
  - "Cálculo de MAWP reduzido por corrosão — quando retirar de serviço?"

- [ ] **21.3** Criar threads na categoria **NR-12**:
  - "PLr para prensa hidráulica com comando bimanual: Cat 3 ou Cat 4?"
  - "Distância de segurança NBR 13857 — como calcular para puncionadeira CNC"
  - "HRN vs Risk Graph: qual método para APR em torno CNC?"

- [ ] **21.4** Criar threads nas demais categorias (mínimo 4 por categoria):
  - **ASME VIII**: espessura de tampo elipsoidal, eficiência de junta, MAWP de vaso com reparos
  - **NR-10**: prontuário para painel de distribuição, SPDA obrigatório, zona de risco
  - **NBR 5410**: dimensionamento de condutores em banco de dutos, DPS tipo 1/2/3
  - **NR-35**: plano de resgate mínimo, EPI altura, capacitação válida
  - **ISO 13849**: MTTFd de válvula pneumática, CCF em arquitetura redundante

- [ ] **21.5** Pinar thread de boas-vindas na categoria "Geral" (criar categoria extra):
  - Título: "Bem-vindo ao Normatizado — leia antes de postar"
  - Conteúdo: regras, como formatar com LaTeX, como marcar resposta aceita, código de conduta

- [ ] **21.6** Criar "Norma da Semana" pinada em cada categoria

---

### Task 22: Checklist pré-lançamento público

- [ ] **22.1** Testar cadastro de novo usuário (email de confirmação chega via SES)
- [ ] **22.2** Testar post com fórmula LaTeX: `$$P = \frac{2 \cdot S \cdot E \cdot t}{D - 2 \cdot t \cdot y}$$`
- [ ] **22.3** Testar upload de arquivo PDF em post
- [ ] **22.4** Testar votação (upvote em thread)
- [ ] **22.5** Testar "marcar como resolvido" via discourse-solved
- [ ] **22.6** Verificar que busca funciona: procurar "NR-12" e "ASME"
- [ ] **22.7** Testar recebimento de notificação por email ao ser respondido
- [ ] **22.8** Verificar backup automático no Backblaze B2 (Admin → Backups)
- [ ] **22.9** Verificar landing page mobile (320px, 375px, 768px)
- [ ] **22.10** Verificar PageSpeed Insights: `https://pagespeed.web.dev/analysis/https://normatizado.com.br`
  — meta: LCP < 2.5s na landing
- [ ] **22.11** Convidar 3-5 engenheiros da rede de Enio para beta fechado
- [ ] **22.12** Após beta ≥ 1 semana sem problemas críticos → lançar publicamente

---

## Variáveis e Secrets — Referência

| Variável | Onde configurar | Descrição |
|---|---|---|
| `VPS_DISCOURSE_ORIGIN` | CF Pages → Env vars | IP do VPS (ex: `http://123.456.789.10`) |
| `DISCOURSE_SMTP_USER_NAME` | VPS app.yml | SES SMTP Access Key ID |
| `DISCOURSE_SMTP_PASSWORD` | VPS app.yml | SES SMTP Secret (convertido para SMTP password) |
| `DISCOURSE_S3_ACCESS_KEY_ID` | VPS app.yml | Backblaze B2 Key ID |
| `DISCOURSE_S3_SECRET_ACCESS_KEY` | VPS app.yml | Backblaze B2 App Key |

**Nunca commitar app.yml com valores reais.** O arquivo no repo é template com placeholders em MAIÚSCULO.
