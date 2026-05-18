# Fórum Normatizando — Finalização Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finalizar configuração do fórum Discourse em normatizando.com.br/forum — bot moderador OpenClaw, rebuild com chave B2 restrita, OAuth em produção.

**Architecture:** Operações de infraestrutura no VPS via SSH + rails runner para criar bot Discourse. Rebuild Docker aplica nova credencial B2. Google Cloud Console para publicar OAuth.

**Tech Stack:** Discourse (Rails/Ruby), Docker, Backblaze B2 API, Cloudflare, Google Cloud Console, SSH (id_ed25519_hostinger → root@vps.normatizando.com.br)

---

## Task 1: Rebuild Discourse com Chave B2 Restrita

**Contexto:** VPS app.yml já tem `DISCOURSE_S3_ACCESS_KEY_ID: "004ec317dff16df000000000c"` e `DISCOURSE_S3_SECRET_ACCESS_KEY: "K0043Qi8qWH4ikNb/p6fyTU3Y+TNGpc"`. Rebuild bake essas env vars no container.

**Aviso:** Discourse ficará offline ~15 minutos.

**Files:**
- No code changes — operação de infraestrutura

- [ ] **Step 1: Verificar app.yml no VPS tem credenciais corretas**

```bash
ssh -i ~/.ssh/id_ed25519_hostinger root@vps.normatizando.com.br \
  "grep 'S3_ACCESS\|S3_SECRET' /var/discourse/containers/app.yml"
```

Expected output:
```
  DISCOURSE_S3_ACCESS_KEY_ID: "004ec317dff16df000000000c"
  DISCOURSE_S3_SECRET_ACCESS_KEY: "K0043Qi8qWH4ikNb/p6fyTU3Y+TNGpc"
```

Se diferente, atualizar manualmente antes de continuar.

- [ ] **Step 2: Executar rebuild**

```bash
ssh -i ~/.ssh/id_ed25519_hostinger root@vps.normatizando.com.br \
  "cd /var/discourse && ./launcher rebuild app 2>&1 | tee /tmp/rebuild.log"
```

Aguardar ~15 minutos. Output final esperado:
```
...
Pups::ExecError: ...
...
Successfully bootstrapped...
```

- [ ] **Step 3: Verificar Discourse voltou**

```bash
ssh -i ~/.ssh/id_ed25519_hostinger root@vps.normatizando.com.br \
  "curl -s -o /dev/null -w '%{http_code}' http://localhost:9001/forum/"
```

Expected: `200`

- [ ] **Step 4: Verificar chave B2 restrita ativa**

Criar `/tmp/verify_b2.rb`:
```ruby
puts "key_id: #{GlobalSetting.s3_access_key_id}"
puts "use_s3: #{GlobalSetting.use_s3?}"
puts "bucket: #{GlobalSetting.s3_bucket}"
```

```bash
scp -i ~/.ssh/id_ed25519_hostinger /tmp/verify_b2.rb root@vps.normatizando.com.br:/tmp/verify_b2.rb
ssh -i ~/.ssh/id_ed25519_hostinger root@vps.normatizando.com.br \
  "docker cp /tmp/verify_b2.rb app:/tmp/verify_b2.rb && \
   docker exec app /bin/bash -c 'cd /var/www/discourse && RAILS_ENV=production rails runner /tmp/verify_b2.rb' 2>&1 | grep -v 'from \|bundler'"
```

Expected:
```
key_id: 004ec317dff16df000000000c
use_s3: true
bucket: normatizado-uploads
```

- [ ] **Step 5: Commit confirmação**

```bash
git commit --allow-empty -m "ops: rebuilt discourse with restricted B2 key 004ec317dff16df000000000c"
```

---

## Task 2: OpenClaw Bot Moderador

**Contexto:** Criar usuário `openclaw` com role moderator + API key para automação. SSH: `ssh -i ~/.ssh/id_ed25519_hostinger root@vps.normatizando.com.br`

**Files:**
- Create: `docs/openclaw-api-key.txt` (local, não commitar — gitignore)
- Create: `/tmp/create_openclaw.rb` (script temporário no VPS)

- [ ] **Step 1: Criar script de criação do bot**

```bash
cat > /tmp/create_openclaw.rb << 'EOF'
# Criar usuário openclaw se não existir
user = User.find_by(username: 'openclaw')
if user
  puts "usuario ja existe: #{user.id}"
else
  user = User.create!(
    username: 'openclaw',
    email: 'openclaw@normatizando.com.br',
    name: 'OpenClaw Bot',
    password: SecureRandom.hex(32),
    active: true,
    approved: true,
    trust_level: TrustLevel[4]
  )
  puts "usuario criado: #{user.id}"
end

# Garantir que é moderador
unless user.moderator?
  user.grant_moderation!
  puts "moderacao concedida"
else
  puts "ja e moderador"
end

# Criar API key se não existir
existing_key = ApiKey.find_by(user: user)
if existing_key
  puts "api_key ja existe: #{existing_key.key}"
else
  api_key = ApiKey.create!(
    user: user,
    description: 'OpenClaw bot moderador',
    created_by: User.find_by(username: 'enio')
  )
  puts "api_key criada: #{api_key.key}"
end
EOF
```

- [ ] **Step 2: Copiar e executar script no container**

```bash
scp -i ~/.ssh/id_ed25519_hostinger /tmp/create_openclaw.rb root@vps.normatizando.com.br:/tmp/create_openclaw.rb
ssh -i ~/.ssh/id_ed25519_hostinger root@vps.normatizando.com.br \
  "docker cp /tmp/create_openclaw.rb app:/tmp/create_openclaw.rb && \
   docker exec app /bin/bash -c 'cd /var/www/discourse && RAILS_ENV=production rails runner /tmp/create_openclaw.rb' 2>&1 | grep -v 'from \|bundler'"
```

Expected output (primeira execução):
```
usuario criado: 4
moderacao concedida
api_key criada: <chave-hex-longa>
```

- [ ] **Step 3: Salvar API key localmente (não commitar)**

```bash
# Criar arquivo local com a key (substituir <chave> pelo valor do output acima)
echo "OPENCLAW_DISCOURSE_API_KEY=<chave>" > /Volumes/ssd_mac/ProjetosGit/normatizado/.openclaw-secrets
echo ".openclaw-secrets" >> /Volumes/ssd_mac/ProjetosGit/normatizado/.gitignore
```

- [ ] **Step 4: Verificar bot como moderador**

```bash
cat > /tmp/verify_openclaw.rb << 'EOF'
user = User.find_by(username: 'openclaw')
puts "username: #{user.username}"
puts "moderator: #{user.moderator?}"
puts "trust_level: #{user.trust_level}"
puts "active: #{user.active?}"
puts "api_keys: #{ApiKey.where(user: user).count}"
EOF
scp -i ~/.ssh/id_ed25519_hostinger /tmp/verify_openclaw.rb root@vps.normatizando.com.br:/tmp/verify_openclaw.rb
ssh -i ~/.ssh/id_ed25519_hostinger root@vps.normatizando.com.br \
  "docker cp /tmp/verify_openclaw.rb app:/tmp/verify_openclaw.rb && \
   docker exec app /bin/bash -c 'cd /var/www/discourse && RAILS_ENV=production rails runner /tmp/verify_openclaw.rb' 2>&1 | grep -v 'from \|bundler'"
```

Expected:
```
username: openclaw
moderator: true
trust_level: 4
active: true
api_keys: 1
```

- [ ] **Step 5: Testar API key funciona**

```bash
# Substituir <API_KEY> pela chave salva no step 3
curl -s "https://normatizando.com.br/forum/session/current.json" \
  -H "Api-Key: <API_KEY>" \
  -H "Api-Username: openclaw" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('current_user',{}).get('username','ERRO'))"
```

Expected: `openclaw`

- [ ] **Step 6: Commit**

```bash
git add .gitignore
git commit -m "feat: add openclaw bot moderator to Discourse forum"
```

---

## Task 3: Publicar OAuth Consent Screen (Google Cloud)

**Contexto:** Google OAuth está em modo "Testing" — limita a 100 usuários de teste. Precisa publicar para produção. Operação manual no browser.

**Files:** Nenhum arquivo de código — operação no Google Cloud Console.

- [ ] **Step 1: Acessar OAuth consent screen**

No browser:
1. Acessa [console.cloud.google.com](https://console.cloud.google.com)
2. Seleciona projeto **Gemini API** (onde criaste as credenciais)
3. Menu: **APIs & Services** → **OAuth consent screen**

- [ ] **Step 2: Verificar domínio autorizado**

Na seção "Authorized domains", confirmar que `normatizando.com.br` está listado.

Se não estiver: clica **Edit App** → seção "Authorized domains" → adiciona `normatizando.com.br` → Save.

- [ ] **Step 3: Publicar para produção**

Clica botão **"Publish App"** → confirma no modal.

Status muda de `Testing` para `In production`.

- [ ] **Step 4: Verificar login Google no fórum**

Acessa `https://normatizando.com.br/forum` em aba anônima → clica "Login" → verifica botão "Continue with Google" presente → testa o fluxo com conta Google diferente da admin.

Expected: login funciona, conta criada automaticamente no fórum.

---

## Task 4: Documentar Processo de Moderação Humana

**Files:**
- Create: `docs/moderacao-guia.md`

- [ ] **Step 1: Criar guia de moderação**

```bash
cat > /Volumes/ssd_mac/ProjetosGit/normatizado/docs/moderacao-guia.md << 'EOF'
# Guia de Moderação — Fórum Normatizando

## Critérios para Promover Usuário a Moderador

- Trust Level 3 ou superior (Leader)
- Mínimo 3 meses de atividade consistente
- Sem histórico de violações de CoC
- Aprovação pelo admin (@enio)

## Como Promover via Admin Panel

1. Acessa `https://normatizando.com.br/forum/admin/users`
2. Busca pelo username do usuário
3. Na página do usuário → seção "Permissions"
4. Clica **"Grant Moderation"**
5. Usuário recebe email automático de notificação

## Poderes do Moderador

- Fechar/abrir tópicos
- Mover posts entre categorias
- Silenciar/suspender usuários
- Aprovar posts sinalizados
- Editar títulos de tópicos
- Ver fila de sinalizações em `/forum/review`

## OpenClaw Bot

Usuário `@openclaw` é moderador automatizado. API key armazenada em `.openclaw-secrets` (não está no git).

Para revogar acesso do bot:
1. Admin → `/forum/admin/users/openclaw`
2. Revoke Moderation → Delete API Keys

## Trust Levels — Referência Rápida

| Level | Nome | Requisitos | Poderes |
|---|---|---|---|
| TL0 | New | Registro | 1 imagem/post, sem links |
| TL1 | Basic | 5 tópicos, 10 posts, 5 min | Upload de anexos, links |
| TL2 | Member | 15 dias, 3 meses | Convidar usuários, re-categorizar |
| TL3 | Regular | Uso consistente por meses | Fechar tópicos, acesso a lounge |
| TL4 | Leader | Nomeação manual | Moderação global |
EOF
```

- [ ] **Step 2: Verificar arquivo criado**

```bash
cat /Volumes/ssd_mac/ProjetosGit/normatizado/docs/moderacao-guia.md | head -5
```

Expected: primeiras linhas do guia.

- [ ] **Step 3: Commit**

```bash
git add docs/moderacao-guia.md
git commit -m "docs: add moderacao guide with promotion criteria and openclaw bot docs"
```

---

## Verificação Final

- [ ] **Checklist pós-implementação**

```bash
ssh -i ~/.ssh/id_ed25519_hostinger root@vps.normatizando.com.br \
  "curl -s -o /dev/null -w 'forum: %{http_code}\n' http://localhost:9001/forum/"
```

Verificar manualmente:
- [ ] `normatizando.com.br/forum` → 200, botão "Login with Google" visível
- [ ] Upload de PDF em post de teste → vai para B2 (verificar bucket `normatizado-uploads`)
- [ ] `GlobalSetting.s3_access_key_id` == `004ec317dff16df000000000c` (chave restrita)
- [ ] Usuário `@openclaw` existe como moderador em `/forum/admin/users/openclaw`
- [ ] Google OAuth consent screen status = "In production"
