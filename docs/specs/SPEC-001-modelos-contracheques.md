# SPEC-001 — Modelos de leitura de contracheques

## Objetivo

Permitir a leitura determinística dos modelos de contracheque recebidos em
28/09/2026, preservando o contrato relacional atual de `contracheques` e
`itens_contracheque`.

## Escopo

Adicionar reconhecimento para Birla Carbon, CETREL, DETEN, ECOLAB QUIMICA,
MOEVE, OXITENO e VOPAK. Refinaria de Mataripe deve permanecer coberta como
regressão do perfil ADP/Acelen já existente.

O parser deve suportar:

- layouts ADP com `BASE / OUTROS` informativo;
- códigos numéricos e alfanuméricos, inclusive códigos de um dígito;
- proventos, descontos e colunas informativas posicionais;
- dois contracheques completos na mesma página (DETEN/MOEVE);
- competências por mês escrito, `MM/AAAA`, `REFERENTE A` e `FOLHA MENSAL`;
- continuação e duplicação entre páginas e lotes.

A leitura continua determinística. O fallback de IA existente permanece apenas
para um lote que não produza dados estruturados.

## Perfis

| Perfil | Empresas | Regra especial |
| --- | --- | --- |
| `adp` | ECOLAB, OXITENO, Refinaria de Mataripe | `BASE / OUTROS` é informativo |
| `deten` | DETEN | dois blocos por página |
| `moeve` | MOEVE | dois blocos por página |
| `birla_carbon` | Birla Carbon | rubricas sem código e coluna Informativas |
| `cetrel` | CETREL | prefixos `P`/`D` |
| `vopak` | VOPAK | coluna `OUTROS` informativa |

Rubrica HRA específica da ECOLAB: código `3217` — `Adicional Repouso
Alimentação`, quando estiver na coluna de vencimentos.

Rubrica HRA específica da OXITENO: código `3453` — `HRA-Horas Rep.
Alimentação`, quando estiver na coluna de vencimentos.

O modelo também contém a rubrica `3320 — HRA IR`, igualmente classificada
como HRA para OXITENO, e a rubrica `3331 — HRA-Dif. Dissídio`, que também
deve permanecer na família HRA para esse modelo.

## Critérios de aceitação

1. O detector identifica cada empresa pelo texto do próprio documento.
2. DETEN e MOEVE geram um registro por contracheque, mesmo quando há dois na
   mesma página.
3. ECOLAB, OXITENO e Mataripe não somam bases de `BASE / OUTROS` nos totais.
4. VOPAK não soma a coluna `OUTROS` nos vencimentos ou descontos.
5. CETREL separa proventos e descontos pela coluna e pelo código `P`/`D`.
6. Birla preserva rubricas sem código e classifica a coluna Informativas.
7. Competência, totais e líquido são preservados quando apresentados no PDF.
8. O processamento em lotes continua idempotente, sem duplicar rubricas ou
   contracheques.
9. O parser do frontend e o parser da Edge Function permanecem semanticamente
   equivalentes.
10. Testes unitários cobrem os novos perfis e a regressão dos perfis existentes.

## Fora do escopo

- migração de banco;
- alteração de RLS, Storage ou deploy remoto;
- edição manual de rubricas na interface;
- OCR novo ou substituição do fallback de IA existente;
- correção do lint legado fora dos arquivos alterados.

## Riscos conhecidos

Algumas páginas do PDF da OXITENO são visualmente legíveis, mas não retornam
texto pelo extrator usado na inspeção. Se o `unpdf` da Edge Function também não
produzir itens nessas páginas, o fluxo existente de revisão/fallback continuará
sendo acionado; isso será verificado no ambiente publicado separadamente.

## Implementação

Implementada localmente no parser do frontend e na Edge Function de processamento.
Não houve migration, deploy ou alteração no ambiente remoto.

Validação local: 173 testes passaram e o build passou. O lint permanece bloqueado
por erros preexistentes fora do escopo desta SPEC.
