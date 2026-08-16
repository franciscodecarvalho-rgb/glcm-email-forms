# PROJECT.md — Visão do GLCM

## Propósito

Sistema interno de escritório jurídico para receber casos, armazenar documentos,
extrair dados com IA, revisar informações, calcular valores e gerar peças.

## Stack atual

- React 18 + TypeScript;
- Vite;
- React Router;
- TanStack Query;
- Tailwind CSS;
- shadcn/Radix;
- Supabase PostgreSQL, Auth, Storage, Realtime e Edge Functions;
- Vitest.

## Superfícies do frontend

- `/login`: autenticação;
- `/`: dashboard dos casos;
- `/casos/novo`: criação manual;
- `/casos/:id`: execução do fluxo do caso;
- `/templates`: gestão dos modelos;
- `/usuarios`: administração de usuários.

## Núcleo funcional

1. Entrada manual, e-mail ou webhook.
2. Upload e registro de arquivos.
3. Pré-extração de CPF/nome e análise de duplicidade.
4. Extração por IA em lotes.
5. Revisão humana dos dados.
6. Cálculos e número da pasta.
7. Geração e armazenamento dos documentos.
8. Download e conclusão.

## Buckets conhecidos

- `casos-arquivos`: documentos recebidos;
- `templates`: modelos de documentos;
- `casos-documentos`: documentos gerados.

## Edge Functions conhecidas

- `webhook-resend-inbound`;
- `webhook-n8n`;
- `pre-extract-cpf`;
- `extract-case-data`;
- `merge-casos`;
- `generate-documents`;
- `send-email`;
- `admin-users`.

## Fontes de verdade

1. pedido atual de Nodley;
2. migrations versionadas;
3. tipos gerados em `src/integrations/supabase/types.ts`;
4. código em execução;
5. documentação de contexto;
6. README e comentários.

Quando essas fontes divergirem, não escolher silenciosamente: documentar a diferença.
