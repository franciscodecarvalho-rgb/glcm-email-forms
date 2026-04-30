
# Sistema Jurídico — Plano de Implementação

## Visão Geral
Sistema web em React + Lovable Cloud (Supabase) para receber documentos jurídicos (manualmente ou via N8N por email), extrair dados com IA (Lovable AI / Gemini com visão), revisar em duas telas e gerar 4 documentos DOCX preenchidos a partir de templates.

## Stack
- **Frontend**: React + Vite + Tailwind + shadcn/ui (já configurado)
- **Backend**: Lovable Cloud (Supabase: Auth, Postgres, Storage, Edge Functions, Realtime)
- **IA**: Lovable AI Gateway (`google/gemini-2.5-pro` para visão em PDFs/imagens)
- **DOCX**: biblioteca `docxtemplater` + `pizzip` (preenche `{{variaveis}}` em templates .docx mantendo formatação)
- **ZIP**: `jszip` para "Baixar Todos"

## Estrutura de Telas / Rotas
```
/login                    → Login (email/senha)
/                         → Dashboard (lista de casos)
/casos/novo               → Upload manual de arquivos → cria caso
/casos/:id                → Roteador interno por status:
                              ├─ Em Análise   → tela de processamento
                              ├─ Aguardando Confirmação → Tela 1
                              ├─ Aguardando Nº da Pasta → Tela 2
                              └─ Concluído    → Tela de Download
/templates                → Admin: upload dos 4 templates .docx
```

## Banco de Dados (migrations)

**casos**
- `id uuid pk`, `created_at`, `user_id uuid` (dono), `status text`, `origem text` ('manual'|'n8n')
- `nome_cliente`, `cpf`, `rg`, `endereco jsonb`
- `contracheques jsonb` — `[{id, label, valor_hra, valor_ahra}]`
- `numero_pasta text`, `documentos_gerados jsonb`

**arquivos**
- `id`, `caso_id fk`, `nome`, `tipo`, `storage_path`, `created_at`

**templates** (1 linha por tipo)
- `id`, `tipo text` ('peticao'|'contrato'|'procuracao'|'termo'), `storage_path`, `updated_at`

**Storage buckets** (privados):
- `casos-arquivos/{caso_id}/...` — uploads de entrada
- `casos-documentos/{caso_id}/...` — DOCX gerados
- `templates/...` — templates .docx

**RLS**: usuários autenticados acessam apenas seus próprios casos/arquivos. Webhook usa `service_role` (Edge Function) para criar casos sem usuário associado (`user_id null` = visível a todos os autenticados, ou atribuído por regra a definir).

## Edge Functions

1. **`webhook-n8n`** (público, `verify_jwt=false`)
   - Recebe `multipart/form-data` (arquivos + opcional metadata)
   - Cria registro em `casos` com status "Novo"
   - Sobe arquivos no bucket `casos-arquivos`
   - URL: `https://<project>.supabase.co/functions/v1/webhook-n8n`

2. **`extract-case-data`** (autenticado)
   - Input: `caso_id`
   - Baixa arquivos, envia para Lovable AI Gateway com prompt estruturado (tool calling) para retornar JSON com nome, CPF, RG, endereço e contracheques (HRA/AHRA)
   - Atualiza caso → status "Aguardando Confirmação"
   - Trata erros 429/402 e devolve mensagens amigáveis

3. **`generate-documents`** (autenticado)
   - Input: `caso_id`
   - Baixa os 4 templates do Storage
   - Usa `docxtemplater` para preencher `{{NOME_CLIENTE}}`, `{{CPF}}`, `{{TOTAL_HRA}}`, etc.
   - Salva 4 .docx em `casos-documentos/{caso_id}/`
   - Atualiza `documentos_gerados` e status → "Concluído"

## Fluxo do Usuário

1. **Login** → Dashboard
2. **Dashboard**: tabela de casos com filtro por status, badges coloridos, ações (abrir, cancelar). Realtime para novos casos do N8N + toast "Novo caso recebido por email — abrir?".
3. **Novo caso (manual)**: upload múltiplo (RG, CPF, comprovante de residência, contracheques) → cria caso "Novo" → dispara `extract-case-data` → tela de processamento ("Em Análise") → Tela 1.
4. **Tela 1 — Confirmação**: formulário editável (nome, CPF, RG, endereço) + tabela editável de contracheques (adicionar/remover linha, editar HRA/AHRA). Botões: Confirmar e Avançar / Cancelar Caso.
5. **Tela 2 — Cálculos**: resumo + soma de HRA, AHRA, total geral, input obrigatório "Número da Pasta". Botões: Gerar Documentos / Voltar / Cancelar.
6. **Geração**: invoca `generate-documents` → tela de Download com 4 botões individuais + "Baixar Todos (ZIP)" (montado no cliente com `jszip`) + Voltar ao Dashboard.

## Templates ({{variáveis}})
Mapeamento direto da spec: `NOME_CLIENTE`, `CPF`, `RG`, `ENDERECO_COMPLETO`, `LOGRADOURO`, `NUMERO`, `BAIRRO`, `CIDADE`, `ESTADO`, `CEP`, `TOTAL_HRA`, `TOTAL_AHRA`, `TOTAL_GERAL`, `NUMERO_PASTA`, `DATA_ATUAL`. Tela `/templates` permite re-upload a qualquer momento.

## Status × Cores (badges via Tailwind tokens semânticos)
- Novo (azul) · Em Análise (amarelo) · Aguardando Confirmação (verde claro) · Aguardando Nº da Pasta (roxo) · Concluído (verde escuro) · Cancelado (vermelho).
Definidos em `index.css` como tokens HSL + variantes de Badge.

## Segurança
- RLS em todas as tabelas e buckets
- Edge Functions validam JWT (exceto webhook)
- Validação Zod no `webhook-n8n` (limite de arquivos/tamanho)
- Sem chamadas diretas ao Lovable AI no cliente
- Inputs validados client + server (Zod)

## Ordem de Implementação
1. Habilitar Lovable Cloud + criar tabelas, buckets, RLS
2. Auth (login) + layout base + design tokens com badges
3. Dashboard (lista, filtro, realtime, badges, ação cancelar)
4. Tela "Novo Caso" (upload manual) + tela `/templates`
5. Edge Function `webhook-n8n` + toast realtime
6. Edge Function `extract-case-data` (Lovable AI com vision)
7. Tela 1 (confirmação) + Tela 2 (cálculos)
8. Edge Function `generate-documents` (docxtemplater)
9. Tela de Download + ZIP

## Pré-requisitos do Usuário
- Após o primeiro deploy: subir os 4 templates `.docx` em `/templates` (com placeholders `{{...}}`).
- Configurar o N8N para fazer POST na URL do webhook (será exibida na tela `/templates` ou em uma aba "Integração").

