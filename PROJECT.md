# PROJECT.md — GLCM

## Propósito atual

O GLCM é um sistema interno para um escritório jurídico. Ele recebe casos e seus
documentos, extrai dados de documentos brasileiros, permite revisão humana, calcula
valores relacionados ao caso e gera peças e uma planilha para download.

## Problema que resolve

O sistema centraliza o fluxo operacional de cadastro, análise documental, extração
assistida por IA, conferência e geração de documentos de casos jurídicos. A motivação
histórica completa não está comprovada no repositório e permanece UNKNOWN.

## Usuários identificáveis

- usuários autenticados do sistema;
- usuários com papel `admin`, que acessam a administração de usuários;
- equipe interna do escritório jurídico, conforme a finalidade da aplicação.

Não há evidência suficiente para afirmar a quantidade de usuários, perfis além de
`admin`/`user`, ou a existência de acesso externo de clientes.

## Capacidades atuais observáveis

- autenticação por e-mail e senha;
- dashboard de casos e atualização em tempo real de `casos`;
- criação manual de caso e upload de documentos;
- entrada por webhook do n8n e por e-mail inbound do Resend;
- pré-extração de CPF/nome e identificação de possível duplicidade;
- extração de dados pessoais e de contracheques, com processamento em lotes;
- persistência relacional de contracheques e rubricas;
- revisão humana dos dados extraídos;
- cálculo e revisão de valores do caso;
- geração de documentos `.docx` e planilha `.xlsx`;
- gerenciamento de templates `.docx`;
- cancelamento, mesclagem e limpeza de casos cancelados;
- administração de usuários por função protegida.

## Stack resumida

- React 18, TypeScript, Vite e React Router;
- TanStack Query, Tailwind CSS e componentes Radix/shadcn;
- Vitest, Testing Library e jsdom;
- Supabase: PostgreSQL, Auth, Storage, Realtime e Edge Functions;
- processamento de PDF no frontend e nas Edge Functions;
- Docxtemplater/PizZip para documentos e geração própria de XLSX;
- gateway de IA da Lovable usando modelo configurado como `google/gemini-2.5-pro`.

## Status no marco zero

Baseline SDD estabelecido em 2026-09-28, no commit
`9617a48175f615e0f735ef238b4860cd9d843d52`. O working tree já continha alterações
de implementação e um arquivo não rastreado antes deste retrofit; essas alterações
foram preservadas e não fazem parte do baseline documental criado nesta tarefa.
Consulte `docs/STATE.md` para a situação de validação e os limites conhecidos.

## Fontes e limites

Este documento foi consolidado a partir do código, migrations, tipos Supabase,
configurações, testes, documentação existente em `context/` e estado do Git. Quando
uma afirmação não puder ser comprovada por essas fontes, ela está marcada como
UNKNOWN ou INFERENCE nos documentos específicos.
