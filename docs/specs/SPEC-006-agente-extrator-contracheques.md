# SPEC-006 — Agente de extração assistida de contracheques

## Objetivo

Dar contexto especializado e memória temporária ao fallback de IA dos
contracheques, com uma conferência independente quando a soma das rubricas não
coincidir com os totais impressos.

## Escopo

- A extração determinística/OCR continua sendo a primeira opção.
- A IA só é chamada nos lotes em que essa leitura não produziu dados estruturados.
- O prompt especializado aplica regras aprovadas de leitura, integridade e modelos
  (incluindo Acelen, Dow, Ecolab, Moeve e Oxiteno).
- A memória é temporária e limitada à execução/arquivo em processamento. Ela contém
  apenas modelo, competência e hash SHA-256 de assinaturas de extrações do mesmo
  arquivo para orientar continuidade e deduplicação; valores não são enviados nessa
  memória e ela nunca serve para preencher informação ausente.
- Se as somas de proventos/descontos ou o cálculo do líquido divergirem dos valores
  impressos, o agente relê uma vez o mesmo PDF com os dados anteriores e as
  divergências. Se a segunda leitura ainda divergir, o lote falha e fica para revisão;
  não se persiste a extração como concluída.
- Preservar os totais impressos, inclusive o líquido. Não ajustar números extraídos
  para forçar reconciliação.

## Fora do escopo

- Usar IA para lotes que a extração determinística/OCR já resolveu.
- Memória entre casos, clientes ou arquivos, base vetorial ou reaproveitamento de
  valores históricos.
- Alteração de layout, schema/migration, contrato de persistência, regras de HRA
  fora dos perfis já aprovados, modelo/provedor de IA, ou deploy remoto.
- Garantir a classificação correta quando as evidências visuais do próprio PDF forem
  ambíguas; nesses casos o resultado deve permanecer pendente para revisão humana.

## Critérios de aceitação

1. O primeiro passo do fluxo continua sendo a leitura determinística/OCR.
2. O fallback recebe instruções de agente especializado e contexto específico dos
   modelos aprovados, além de memória efêmera somente do mesmo arquivo.
3. O contexto nunca autoriza copiar competência, rubrica ou valor ausente do PDF.
4. Uma divergência aritmética causa no máximo uma segunda leitura de revisão.
5. Divergência persistente sinaliza erro/revisão e impede concluir o lote ou gravar
   aquele resultado como válido.
6. Totais impressos não são alterados para coincidir com as somas extraídas.
7. Não há mudança no schema ou no layout de planilhas/documentos.

## Implementação

Implementação local na Edge Function `process-contracheques-pdf`. O estado validado
do release e as limitações de verificação ficam em `docs/STATE.md` e
`docs/WORKLOG.md`.
