# SPEC-005 — Importação validada antes de concluir um caso

## Objetivo

Impedir que uma importação manual apareça como Caso operacional antes de todos
os arquivos serem enviados, as extrações serem persistidas e os dados serem
confirmados.

## Fluxo

1. O upload cria um registro provisório técnico (`importacao_concluida = false`)
   para que Storage, metadados e Edge Functions possam usar o mesmo `caso_id`.
2. O registro provisório não aparece no Dashboard enquanto o usuário não concluir
   a revisão.
3. O frontend envia comprovantes pessoais e contracheques, processa todos os
   lotes, executa a extração pessoal e valida os dados persistidos.
4. A confirmação de dados (automática completa ou manual) é a única etapa que
   promove o registro a Caso (`importacao_concluida = true`).
5. Uma trigger valida CPF, nome, RG, logradouro, metadados dos dois tipos de PDF,
   rubricas e conclusão de todos os lotes. O banco rejeita a promoção se faltar
   qualquer requisito.
6. Em caso de falha de rede, o frontend informa a etapa correta e permite repetir
   o envio usando o mesmo registro provisório e caminhos de Storage, sem duplicar
   os metadados.

## Critérios de aceitação

- Um envio iniciado não surge como Caso no Dashboard antes da confirmação final.
- Nenhum registro manual pode ser promovido sem comprovante pessoal e
  contracheque anexados, dados pessoais válidos e rubricas persistidas.
- A promoção é recusada se algum lote ainda estiver pendente, processando ou em
  erro.
- Uma extração pessoal incompleta conserva os PDFs e permite preenchimento
  manual; a confirmação não conclui enquanto campos ou rubricas estiverem
  ausentes.
- A importação repetida usa caminhos estáveis e não cria metadados duplicados.
- A mensagem de falha inclui a etapa atual, sem depender de estado React antigo.
- Casos legados e entradas não manuais permanecem compatíveis.

## Estado

Implementação local em validação. A migration ainda precisa ser aplicada no
Supabase e o frontend publicado pelo fluxo Lovable; nada foi enviado nem aplicado
remotamente nesta alteração.
