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

## Como Revogar Moderação

1. Acessa `https://normatizando.com.br/forum/admin/users/{username}`
2. Seção "Permissions" → **"Revoke Moderation"**

## Poderes do Moderador

- Fechar/abrir tópicos
- Mover posts entre categorias
- Silenciar/suspender usuários
- Aprovar posts sinalizados
- Editar títulos de tópicos
- Ver fila de sinalizações em `/forum/review`

## OpenClaw Bot Moderador

Usuário `@openclaw` é moderador automatizado (Trust Level 4).

- API key armazenada em `.openclaw-secrets` (não está no git — nunca commitar)
- Para revogar: Admin → `/forum/admin/users/openclaw` → Revoke Moderation → Delete API Keys
- Bot acessa: `POST /forum/posts/{id}/flag`, `PUT /forum/admin/users/{id}/silence`, `PUT /forum/t/{id}`

## Trust Levels — Referência Rápida

| Level | Nome | Requisitos automáticos | Poderes extras |
|---|---|---|---|
| TL0 | New | Registro | 1 imagem/post, sem links |
| TL1 | Basic | 5 tópicos lidos, 10 posts, 5 min | Upload anexos (até 25MB), links |
| TL2 | Member | 15 dias, 3 meses ativo | Convidar usuários, re-categorizar |
| TL3 | Regular | Uso consistente prolongado | Fechar tópicos, acesso a lounge |
| TL4 | Leader | Promoção manual pelo admin | Moderação global |

## Google OAuth — Nota

OAuth consent screen está em modo **Testing** (máx 100 usuários de teste).
Para publicar para produção (fazer quando fórum tiver usuários reais acima de 100):
1. [console.cloud.google.com](https://console.cloud.google.com) → projeto Gemini API
2. **APIs & Services** → **OAuth consent screen**
3. Clica **"Publish App"** → confirma

## Anti-Spam

- **Akismet** ativo — posts de TL0/TL1 verificados automaticamente
- Posts sinalizados aparecem em `/forum/review`

## Extensões de Upload Permitidas

`jpg|jpeg|png|gif|heic|heif|webp|avif|svg|jxl|pdf|doc|docx|xls|xlsx|ppt|pptx|dwg|dxf|zip`

Bloqueadas: `.exe`, `.bat`, `.sh`, `.php`, `.js`, `.py`
