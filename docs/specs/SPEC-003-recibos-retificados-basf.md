# SPEC-003 — Recibos retificados da BASF no cálculo HRA

## Objetivo

Evitar que um recibo BASF retificado seja somado ao recibo original da mesma
competência no cálculo HRA e na planilha do caso, mantendo os dois registros
extraídos para consulta e auditoria.

## Regra confirmada

No modelo BASF, o valor do campo `Pagamento Referente a` iniciado por `R` antes
do mês identifica um recibo retificado (por exemplo, `R Setembro 202`). Quando
um caso possui um recibo BASF retificado e um não retificado da mesma competência,
somente o retificado compõe a revisão e o cálculo HRA/AHRA. A regra não se aplica
a outras empresas/modelos.

## Escopo

- detectar o marcador `R` na leitura determinística dos modelos de frontend e Edge;
- persistir `contracheques.retificado`, com valor inicial `false` para registros
  existentes;
- selecionar a versão retificada na consolidação das competências usada na
  revisão e na planilha do caso;
- manter os recibos original e retificado persistidos, sem apagar ou sobrescrever
  rubricas;
- reconhecer o mesmo marcador no fallback de IA da Edge Function.

## Critérios de aceitação

1. BASF com `Pagamento Referente a: R <mês>` é persistido com `retificado=true`.
2. BASF sem esse prefixo e outros modelos não são marcados como retificados.
3. Se existirem BASF original e retificado na mesma competência, a soma HRA/AHRA
   usa somente os recibos retificados BASF daquela competência.
4. Competências BASF sem recibo retificado e empresas diferentes mantêm o cálculo
   atual.
5. Os recibos e itens originais permanecem no banco e disponíveis na tela de
   extração.
6. A identidade da retificação participa da deduplicação idempotente dos lotes.
7. Testes cobrem detecção, substituição no cálculo e preservação das outras
   empresas.

## Fora do escopo

- backfill/reprocessamento de casos já extraídos;
- alteração de alertas ou relatórios históricos que exibem os recibos brutos;
- qualquer mudança em regras de HRA de outras empresas.

## Operação de publicação

Aplicar primeiro a migration que cria a coluna `retificado`; depois publicar a
Edge Function e o frontend. Casos já processados precisam ser reprocessados para
que o novo marcador seja persistido.

## Implementação

Implementada localmente. Publicação e aplicação remota da migration pendentes.
