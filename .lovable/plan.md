# Auditoria — caso a5af56d1-7c9a-4442-80cf-dcd90d6a1e01

## Estado real no banco (leitura)

| ordem | páginas | status | ia_status | atualizado_em |
|---|---|---|---|---|
| 0 | 1–15 | concluido | concluido | 02:58:52 |
| 1 | 16–30 | concluido | concluido | 03:01:23 |
| 2 | 31–45 | pendente | — | 02:56:57 (criação) |
| 3 | 46–60 | pendente | — | 02:56:57 |
| 4 | 61–75 | pendente | — | 02:56:57 |
| 5 | 76–90 | pendente | — | 02:56:57 |
| 6 | 91–99 | pendente | — | 02:56:57 |

O lote 2 (ordem 1) **não ficou travado**: ele concluiu às `03:01:23+00`, depois do horário observado pelo usuário. Os lotes 3 a 7 seguem `pendente` e nunca foram invocados.

## Causa técnica

Logs da Edge Function `process-contracheques-pdf`:

```text
02:58:52 / 02:58:53  booted
03:00:13 / 03:00:15 / 03:00:17  shutdown
03:01:23  ERROR Http: connection closed before message completed
```

- A invocação do lote ordem 1 começou às 02:58:52 e só terminou às 03:01:23 — cerca de **150 segundos**.
- O cliente (fetch do `supabase.functions.invoke` no navegador, via gateway) **encerrou a conexão antes da resposta**: `Http: connection closed before message completed`. Ou seja, timeout de rede do lado do chamador, não erro da IA e não erro de banco.
- A função concluiu o trabalho e persistiu `status = concluido` mesmo assim (por isso o banco está consistente para esse lote).
- Como o `invoke` no frontend recebeu erro de rede, o **loop sequencial de `processar_lote` foi interrompido** — não há nenhum `booted` após 02:58:53, confirmando que os lotes 3–7 nunca chegaram a ser chamados.

Não há registro de erro da IA (Gemini), nem status HTTP 4xx/5xx da função: a resposta simplesmente não teve para quem ser entregue.

## Conclusão

Falha de duração: um lote de 15 páginas com fallback de IA leva ~2,5 min, acima do limite de espera do `functions.invoke`. O sintoma "segundo lote parado em processando" é o efeito colateral de o cliente perder a conexão e abandonar a fila.

## Correções possíveis (não implementadas — apenas para decisão)

1. Reduzir `TAMANHO_LOTE_PAGINAS` (por exemplo de 15 para 5) para manter cada invocação bem abaixo do timeout.
2. Tornar a fila retomável no frontend: em erro de rede, reconsultar `lotes_contracheques` e continuar a partir do primeiro lote não concluído, em vez de abortar.
3. Marcar `processando` com carimbo de início e permitir reprocessar lote preso após um tempo limite.

Nenhuma alteração de código, banco, template ou deploy foi feita nesta auditoria.
