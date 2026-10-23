# SCOPE — Escopo do estado atual

## Dentro do sistema atual

- aplicação web autenticada para equipe interna;
- cadastro, consulta, atualização, cancelamento e mesclagem de casos;
- armazenamento de metadados de arquivos e conteúdo nos buckets do Supabase;
- extração de dados pessoais e de contracheques;
- revisão de dados, cálculos, geração de `.docx`/`.xlsx` e download;
- gestão de templates e de usuários administrativos;
- webhooks n8n/Resend e envio de e-mail pela função presente;
- migrations e Edge Functions versionadas neste repositório.

## Limites conhecidos

- não há evidência de uma API pública separada do frontend;
- a autorização de dados nas migrations usa policies amplas para usuários
  autenticados em várias tabelas; o efeito desejado de isolamento por usuário ou
  escritório é UNKNOWN;
- o schema remoto não foi consultado nesta análise; migrations e tipos descrevem
  somente o estado versionado/conhecido localmente;
- o repositório contém documentação operacional de deploy, mas este retrofit não
  executa nem valida deploy, publicação ou migrations remotas;
- o fluxo de produção e o histórico anterior ao commit do marco zero não foram
  reconstruídos.

## Fora do sistema atual / não comprovado como implementado

Os itens abaixo aparecem como propostas ou referências na documentação existente, mas
não foram encontrados como fluxo integrado no código analisado:

- Google Drive;
- Legal One;
- ZapSign ou assinatura eletrônica;
- WhatsApp;
- lembretes e notificações de acompanhamento;
- portal ou autosserviço para clientes externos.

Esses itens não devem ser tratados como requisitos existentes sem uma nova decisão e
uma SPEC.

## Pendências de definição

- escopo e prioridade da próxima mudança;
- contrato formal de cada tipo de ação e seus documentos;
- política de autorização/RLS e segregação de dados;
- fonte canônica para a divergência de `arquivos.processado`;
- estratégia para o conjunto de migrations duplicadas ou idempotentes de
  `lotes_contracheques`;
- política de qualidade, observabilidade e operação das Edge Functions.
