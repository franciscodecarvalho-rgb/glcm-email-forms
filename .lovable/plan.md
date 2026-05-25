# Plano: Resend Inbound + Outbound em `glcm.app` (raiz)

Substitui o fluxo via n8n por **Resend** no domínio raiz. Recebimento de documentos em `documentos@glcm.app` e envio de notificações de `notificacoes@glcm.app`.

## 1. Configuração no painel da Resend (você faz)

**a) Adicionar domínio**
- Resend → **Domains** → **Add Domain** → `glcm.app` (raiz, sem subdomínio) → região `us-east-1`
- A Resend mostra ~4 registros DNS (MX, SPF TXT, DKIM TXT, DMARC TXT) — copia tudo

**b) Adicionar registros DNS no seu registrador**
- Você adiciona MX/SPF/DKIM/DMARC no painel onde o `glcm.app` está hospedado (mesmo lugar do A record que aponta pro Lovable: 185.158.133.1)
- Os A records do site **não são afetados** — coexistem
- Volta na Resend → **Verify DNS Records** (leva 5–30 min)

**c) Criar API Key**
- Resend → **API Keys** → `lovable-glcm` (full access) → copia o valor

**d) Configurar Inbound (depois do domínio verificado)**
- Resend → **Inbound** → **Add Address**
- Endereço: `documentos@glcm.app`
- Webhook URL: `https://kaopnizsbkzxqdzmocwa.supabase.co/functions/v1/resend-inbound`
- Copia o **signing secret** que a Resend gera

## 2. Conectar Resend no Lovable (eu faço)

Uso o conector nativo Resend do Lovable → você seleciona a conta Resend → secrets `RESEND_API_KEY` ficam disponíveis automaticamente nas edge functions.

Adiciono também o secret `RESEND_WEBHOOK_SECRET` (valor copiado no passo 1d).

## 3. Código — edge functions (eu faço)

### `resend-inbound` (substitui `webhook-n8n`)
Recebe POST JSON da Resend com payload do email:
- Valida header `svix-signature` com `RESEND_WEBHOOK_SECRET` (HMAC)
- Idempotência por `message_id` (header `svix-id` ou `headers.message-id` do email)
- Cria registro em `casos` com `status=novo`, `origem=email`, `nome_cliente` = nome do remetente, `message_id`
- Para cada anexo (`attachments[]`): baixa via `content_url` ou decodifica base64 do `content`
- Valida tipo (PDF/JPG/PNG/WEBP/HEIC), tamanho (≤10MB/arquivo, ≤50MB total, ≤20 anexos)
- Upload para bucket `casos-arquivos` (mesmo path pattern `{caso_id}/{uuid}-{nome}`)
- Insere em `arquivos`
- Atualiza `casos.status=em_analise` e invoca `extract-case-data` (mesma lógica do n8n)
- `verify_jwt = false` no `config.toml` (Resend não envia JWT)

### `send-email` (novo, para enviar notificações)
- `verify_jwt = true` (só usuários autenticados podem disparar)
- Body: `{ to, subject, html, attachments? }` validado com Zod
- Envia via gateway: `POST https://connector-gateway.lovable.dev/resend/emails` com `from: "GLCM <notificacoes@glcm.app>"`
- Headers: `Authorization: Bearer ${LOVABLE_API_KEY}` + `X-Connection-Api-Key: ${RESEND_API_KEY}`
- Retorna o `id` da Resend

## 4. Cleanup (eu faço)

- Deletar `supabase/functions/webhook-n8n/`
- Deletar a função no Supabase via `delete_edge_functions`
- Remover secret `N8N_WEBHOOK_SECRET`
- Atualizar textos da UI que falavam de n8n (se existirem) para "email"

## 5. Não muda

- Tabelas `casos`, `arquivos`, `templates` e suas RLS
- Buckets `casos-arquivos`, `casos-documentos`, `templates`
- Função `extract-case-data` (continua sendo invocada igual)
- Função `generate-documents`
- Dashboard, Realtime, telas de upload manual, screens 1/2/download

## 6. Ordem de execução

```text
VOCÊ                                     EU
─────                                    ──
1a. Add domínio glcm.app na Resend
1b. Adicionar DNS records no registrador
    → aguardar verificação (5–30 min)
1c. Criar API Key                ──→
                                         2. Conectar Resend no Lovable
                                         3. Criar resend-inbound + send-email
1d. Add inbound documentos@glcm.app  ──→
                                         (configurar RESEND_WEBHOOK_SECRET)
                                         4. Testar com curl + email real
                                         5. Cleanup webhook-n8n
```

## Aviso importante sobre o domínio raiz

- Como MX vai no raiz, qualquer email para `*@glcm.app` cai no Resend (hoje você não tem nada, então OK)
- Se um dia quiser usar `@glcm.app` em outro provedor (Google Workspace, Lovable Email), vai precisar consolidar SPF e talvez mover pra subdomínio
- Recomendação: criar uma única caixa "catch-all" no Resend ou só usar `documentos@` mesmo

## Pergunta para começar

Confirma o plano? Se sim, próximo passo é **você fazer 1a + 1b na Resend** e me avisar o registrador (Registro.br, Cloudflare, etc.) caso queira ajuda com os DNS records.
