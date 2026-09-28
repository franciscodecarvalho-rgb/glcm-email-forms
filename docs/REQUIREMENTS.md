# REQUIREMENTS — Requisitos observáveis

Este documento registra o que pode ser comprovado no estado atual. Comportamentos
observados no código não são tratados automaticamente como requisitos de negócio;
quando a intenção não é explícita, a classificação é INFERENCE.

## Requisitos comprováveis pela implementação

### Acesso e administração

- **REQ-001:** o frontend possui login por e-mail e senha via Supabase Auth.
  Evidência: `src/pages/Login.tsx`, `src/hooks/useAuth.tsx`.
- **REQ-002:** as rotas da aplicação, exceto login e fallback 404, exigem sessão.
  Evidência: `src/App.tsx`, `src/components/ProtectedRoute.tsx`.
- **REQ-003:** papéis `admin` e `user` existem no schema; a administração de usuários
  usa a Edge Function `admin-users`. Evidência: migration de `app_role`/`user_roles`,
  `src/hooks/useIsAdmin.tsx`, `src/pages/Usuarios.tsx`.

### Casos e documentos

- **REQ-004:** usuários autenticados podem criar e consultar casos, anexar arquivos e
  acompanhar o processamento. Evidência: `src/pages/NovoCaso.tsx`, `Dashboard.tsx`,
  `Caso.tsx` e tabelas `casos`/`arquivos`.
- **REQ-005:** o caso suporta as ações `ir_sobre_hra`, `horas_extras`,
  `supressao_folgas`, `contribuicao_extraordinaria` e `tema_324` no schema atual.
- **REQ-006:** a aplicação aceita documentos pessoais e contracheques como categorias
  distintas de arquivo no cadastro manual.
- **REQ-007:** os documentos recebidos podem entrar por webhook do n8n ou por e-mail
  inbound do Resend, sujeitos às validações e segredos configurados nas funções.
- **REQ-008:** documentos pessoais podem ser processados por extração de dados; CPF e
  nome pré-extraídos participam da análise de possível duplicidade.
- **REQ-009:** contracheques podem ser lidos por parser determinístico de PDF e por
  fallback de IA; os resultados são persistidos em `contracheques` e
  `itens_contracheque`.
- **REQ-010:** o processamento de extração usa lotes e registra estados em
  `lotes_extracao` e `lotes_contracheques`.
- **REQ-011:** dados extraídos são apresentados para confirmação humana antes do
  avanço do fluxo, conforme o caminho implementado em `Caso.tsx`.
- **REQ-012:** o sistema permite calcular/revisar valor do caso e número da pasta,
  gerar documentos a partir de templates e disponibilizar os arquivos para download.
- **REQ-013:** templates `.docx` são cadastrados por tipo na tabela `templates` e no
  bucket `templates`; documentos gerados e arquivos recebidos usam buckets separados.

### Estado e manutenção

- **REQ-014:** o fluxo de caso implementa os estados `novo`, `em_analise`,
  `aguardando_confirmacao`, `aguardando_pasta`, `concluido` e `cancelado`.
  A sequência completa é uma INFERENCE derivada das transições encontradas.
- **REQ-015:** casos podem ser cancelados e casos cancelados podem ser tratados pela
  Edge Function `excluir-casos-cancelados`.
- **REQ-016:** a aplicação mantém uma tela de teste isolada para extração de dados
  pessoais em `/teste-extracao-pdfs`.

## Regras de negócio identificadas

- O código usa revisão humana antes da geração final; a intenção de negócio formal é
  INFERENCE, apoiada pelo fluxo de telas e pelo `context/WORKFLOW.md`.
- A coluna `limite_viabilidade` tem default versionado de 15000 e restrição para
  valores não negativos. A interpretação jurídica e a regra de bloqueio completa são
  UNKNOWN.
- A função de geração seleciona peças por tipo de ação e escritório. A lista exata de
  peças e seus critérios deve ser tratada como contrato de cada SPEC futura.
- A deduplicação/mesclagem possui regras de estados finais e janela de desfazer no
  código, mas a política de negócio aprovada não está documentada de forma completa.

## Requisitos desconhecidos

- critérios formais de aceite e qualidade de cada documento gerado;
- regras jurídicas completas para cada tipo de ação, cálculo, rubrica e alíquota;
- perfis, permissões e segregação por escritório além do que as policies atuais
  permitem;
- limites operacionais oficiais de arquivos, páginas, lotes e tempo de processamento;
- comportamento esperado quando o schema remoto diverge das migrations;
- requisitos de auditoria, retenção e exclusão de documentos;
- contrato público e versionamento dos webhooks n8n/Resend;
- requisitos de disponibilidade, observabilidade e recuperação.
