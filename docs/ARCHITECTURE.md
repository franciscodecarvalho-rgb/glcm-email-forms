# ARCHITECTURE — Arquitetura real no marco zero

## Visão geral

```text
Usuário autenticado ── React/Vite ── Supabase client ──┬─ PostgreSQL/Auth/Realtime
                                                       ├─ Storage
                                                       └─ Edge Functions

n8n ─────────────── webhook-n8n ───────────────┐
Resend inbound ─── webhook-resend-inbound ─────┤
                                                v
                                               casos + arquivos + Storage
                                                |
                 pré-extração / extração em lotes / revisão humana
                                                |
                         cálculos e generate-documents
                                                v
                                  documentos .docx/.xlsx + download
```

O diagrama descreve os limites encontrados no código, não uma arquitetura-alvo.

## Frontend

- entrada em `src/main.tsx` e composição em `src/App.tsx`;
- React 18 com Vite, TypeScript, React Router, TanStack Query, Tailwind e
  Radix/shadcn;
- cliente tipado em `src/integrations/supabase/client.ts` usando variáveis `VITE_*`;
- autenticação e proteção de rotas em `src/hooks/useAuth.tsx` e
  `src/components/ProtectedRoute.tsx`;
- páginas: login, dashboard, novo caso, detalhe do caso, templates, usuários, teste
  de extração e 404;
- componentes do caso dividem o fluxo em processamento, dados extraídos,
  confirmação, cálculos e download;
- funções puras e adaptadores de PDF/XLSX ficam principalmente em `src/lib` e têm
  testes Vitest correspondentes.
- a preparação de contracheques mantém a camada de texto como primeira opção e
  pode criar uma camada OCR local com PDF.js/Tesseract.js somente em páginas sem
  texto extraível; o documento original é preservado quando o OCR falha.

## Backend e limites de execução

O backend é Supabase. As funções abaixo estão presentes em
`supabase/functions/*/index.ts`:

| Função | Responsabilidade observada |
|---|---|
| `webhook-n8n` | recebe casos e arquivos via n8n, valida segredo/tamanho/tipos e grava no Supabase |
| `webhook-resend-inbound` | recebe e-mail inbound Resend, valida assinatura e arquivos, e cria caso |
| `pre-extract-cpf` | extrai/normaliza CPF e nome e procura possível duplicidade |
| `process-documentos-pessoais-pdf` | extrai dados pessoais de documentos, com gateway de IA |
| `process-contracheques-pdf` | lê PDFs, divide em lotes de páginas, persiste contracheques e usa fallback de IA |
| `extract-case-data` | coordena extração de arquivos de um caso por lotes e consolida o resultado |
| `merge-casos` | mescla casos e arquivos conforme estados/regras presentes no código |
| `generate-documents` | preenche `.docx`, gera planilha e grava saídas no Storage |
| `send-email` | envia e-mail por gateway Resend após validação/autorização |
| `admin-users` | lista/cria/atualiza usuários e papéis administrativos |
| `excluir-casos-cancelados` | remove arquivos e casos cancelados conforme política da função |

As funções usam `@supabase/supabase-js` via `esm.sh`. As funções de IA chamam
`ai.gateway.lovable.dev`; `send-email` usa o gateway Resend da Lovable; o inbound
também consulta a API Resend. Segredos e valores de ambiente não são reproduzidos
neste documento.

## Dados versionados

As migrations locais definem ou alteram estas tabelas públicas:

- `casos`: entidade central, dados do cliente, estado, origem, resultado e referências
  de duplicidade;
- `arquivos`: metadados e caminho dos documentos recebidos;
- `templates`: tipo, nome e caminho dos modelos;
- `user_roles`: papéis `admin`/`user` ligados a `auth.users`;
- `contracheques` e `itens_contracheque`: contracheques estruturados e rubricas;
- `lotes_extracao` e `finalizacoes_extracao`: fan-out/consolidação da extração;
- `lotes_contracheques`: lotes de páginas, estado de saída, erro, status de IA e
  caminho temporário/associado.

Relações principais:

```text
auth.users 1──N user_roles
casos 1──N arquivos
casos 1──N lotes_extracao
casos 1──1 finalizacoes_extracao
casos 1──N contracheques 1──N itens_contracheque
casos 1──N lotes_contracheques
```

As tabelas possuem RLS nas migrations. Muitas policies permitem acesso amplo a
qualquer usuário `authenticated`; `user_roles` tem leitura própria/admin e funções
de administração. `casos` está na publicação Realtime.

## Storage

Os buckets versionados são privados:

- `casos-arquivos`: uploads recebidos;
- `casos-documentos`: documentos e planilhas gerados;
- `templates`: modelos `.docx`.

O acesso é feito por caminhos persistidos nas tabelas correspondentes. O estado
remoto dos buckets e suas policies não foi verificado e é UNKNOWN.

## Fluxo de dados observado

1. Uma sessão autenticada cria o caso manualmente, ou um webhook o cria usando a
   service role.
2. Os arquivos entram no bucket `casos-arquivos` e seus metadados em `arquivos`.
3. Pré-extração e análise de duplicidade podem atualizar CPF/nome preliminares e
   referências entre casos.
4. Extração pessoal e de contracheques atualiza o caso e as tabelas de lotes/resultado.
5. O usuário revisa os dados e confirma os campos necessários.
6. O frontend calcula/revisa valores e chama `generate-documents`.
7. A função lê templates e dados, grava documentos gerados no Storage e o frontend
   disponibiliza o download.

## Configuração e dependências relevantes

- scripts npm: `dev`, `build`, `build:dev`, `lint`, `preview`, `test` e `test:watch`;
- `vite.config.ts` expõe o servidor na porta 8080 e o alias `@` para `src`;
- Vitest usa jsdom e `src/test/setup.ts`;
- `supabase/config.toml` aponta para o projeto configurado e define `verify_jwt = false`
  para as funções listadas; os handlers fazem validações próprias em vários casos;
- há `package-lock.json`, `bun.lock` e `bun.lockb`; o comando validado neste baseline
  foi npm.

## Divergências, riscos e dívida técnica

- **Divergência comprovada:** o código de `extract-case-data` atualiza e consulta
  `arquivos.processado`, mas a migration/tipo local inspecionado não declara essa
  coluna. O schema remoto pode ter sido alterado fora do repositório; não foi
  verificado.
- **Divergência documental:** `context/PROJECT.md` lista somente parte das Edge
  Functions; a árvore atual contém 11. Este documento lista a árvore encontrada.
- **Risco de segurança:** várias policies RLS concedem CRUD amplo a usuários
  autenticados. A adequação ao isolamento esperado pelo negócio é UNKNOWN e não foi
  alterada.
- **Dívida de qualidade:** `npm run lint` falha no estado atual por erros existentes,
  incluindo `any` explícito, regras de importação e padrões no código/funções; o
  comando também percorre `.tmp-main-deploy`.
- **Dívida de consistência:** há migrations idempotentes repetidas para
  `lotes_contracheques` e `ia_status`; não foi feita limpeza para não alterar o
  histórico do schema.
- **Risco operacional:** o repositório não comprova o estado publicado no Lovable ou
  o schema efetivo dos projetos Supabase; deploy e consulta remota estão fora deste
  baseline.
