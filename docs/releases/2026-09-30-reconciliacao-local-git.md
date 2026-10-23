# Reconciliação do checkout local com o Git — 30/09/2026

## Estado encontrado

- checkout local `main`: `a8e2423` (`fix: label case number as contract number`);
- `origin/main`: `35cc96c` (`Publicou migration e Edge Function`), 14 commits à
  frente do checkout local;
- havia mudanças locais não commitadas em extração pessoal, testes e documentação,
  além do arquivo não rastreado `estrutura-joins-temas.html`;
- antes da integração, todo o estado local foi guardado em um stash de segurança
  (`safety before sync to origin/main 35cc96c`). O stash foi mantido após a
  reaplicação para recuperação adicional.

## O que já estava no Git remoto e não deve ser refeito

- classificação HRA CETREL/P368 e VOPAK/2000: já em `origin/main`, commit
  `0604de3`; a publicação da Edge Function foi confirmada pelo Lovable;
- captura de endereço por comprovante: já havia sido publicada em `06e7564`;
- recibos retificados BASF, migration e detecção no processamento: commit
  `e290804` está contido em `origin/main`; a migration e a Edge Function foram
  confirmadas como aplicadas/publicadas pelo Lovable;
- scaffolding Drizzle criado na atividade da migration: já está no histórico remoto
  (`35cc96c`) e não foi recriado nesta reconciliação.

## Trabalho local reaplicado para validar e publicar agora

- refinamento da extração determinística do endereço completo de faturas/notas de
  energia com texto linearizado, delimitando o trecho pelo CEP e cidade/UF e
  preservando fallback compatível;
- aplicação da mesma regra no helper frontend, na função `extract-case-data` e na
  função `process-documentos-pessoais-pdf`;
- teste de regressão com texto de DANFE/fatura, endereço completo e texto posterior
  ao endereço;
- testes explícitos das classificações HRA CETREL/VOPAK, sem modificar sua regra
  funcional já existente;
- regra de release em `AGENTS.md` e checklist em `docs/RELEASE-PROCESS.md`.

O arquivo `estrutura-joins-temas.html` foi preservado localmente e deliberadamente
excluído do release por não fazer parte desses ajustes confirmados. Nenhum outro
trabalho fora do escopo será incluído no commit.

## Entrega desta reconciliação

- `npx eslint` nos três arquivos TS/TSX alterados: passou após remover quatro escapes
  desnecessários em regex no helper determinístico;
- `npm run test`: 274 testes passaram em 30 arquivos;
- `npm run build`: passou; permanecem avisos não bloqueantes de Browserslist desatualizado
  e bundle acima de 500 KB;
- `npm run lint` completo: permanece bloqueado por erros legados já existentes no
  repositório; não foram ampliados nem tratados nesta demanda;
- `git diff --cached --check`: passou;
- não há migration nova nesta entrega; as Edge Functions envolvidas são
  `extract-case-data` e `process-documentos-pessoais-pdf`;
- o commit desta reconciliação foi enviado a `origin/main`; seu SHA exato e a
  confirmação do deploy são registrados na entrega desta demanda, evitando um SHA
  autorreferente dentro do próprio commit.

Não marcar esta entrega como concluída enquanto o deploy estiver pendente.
