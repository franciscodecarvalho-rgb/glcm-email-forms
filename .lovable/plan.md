# Diagnóstico: `process-contracheques-pdf` retornando 500

## Evidências coletadas (somente leitura)

Invocações registradas logo após 2026-08-16 14:40 UTC:

```text
14:40:03.418Z  OPTIONS | 200
14:40:04.627Z  POST    | 500
14:40:37.556Z  OPTIONS | 200
14:40:37.730Z  POST    | 500
```

Logs de execução da função no mesmo intervalo contêm apenas linhas de ciclo de vida
(`booted (time: 33ms)`, `booted (time: 35ms)`, `shutdown`). **Não há BootFailure** e
não há mais qualquer referência ao import `extractTextItems` — a correção do commit
anterior segue válida.

Contagens do caso manual mais recente (sem exposição de identificadores):

| Métrica | Valor |
| --- | --- |
| PDFs `tipo = contracheque` | 1 |
| Linhas em `contracheques` | 0 |
| Linhas em `itens_contracheque` | 0 |

## Mensagem técnica exata: indisponível

A função encerra em `catch` devolvendo `{ error: <mensagem> }` com status 500, mas
**não escreve a mensagem em log** antes de responder. Como o corpo da resposta não é
capturado pela plataforma, os logs registram apenas `POST | 500`. Portanto a mensagem
técnica exata e a instrução/coluna que falhou **não podem ser afirmadas com os dados
disponíveis** — declarar uma causa agora seria especulação.

O que as contagens permitem afirmar com segurança: como `contracheques` está em 0 e o
bloco de escrita só é alcançado quando há extração bem-sucedida, a falha ocorreu em
algum ponto entre o download do PDF e a gravação — sem distinguir qual, pois um erro
de download, de parsing ou de `insert` produz exatamente o mesmo 500 silencioso.

## Passo proposto para obter a evidência

Alteração mínima e única no bloco `catch` da Edge Function
`process-contracheques-pdf`: registrar em `console.error` o nome do erro, a mensagem e
o stack antes de responder 500 — sem qualquer dado de cliente, arquivo ou chave. Em
seguida, republicar apenas essa função (mantendo `verify_jwt = false`), pedir um único
reprocessamento pelo app autenticado e ler o log resultante para identificar a
instrução/coluna real.

Nada de schema, migrations, RLS, dados ou outras funções é tocado.

## Detalhes técnicos

- Arquivo: `supabase/functions/process-contracheques-pdf/index.ts`, linha final do
  `Deno.serve` (bloco `catch`).
- Ponto atual: `catch(e){ return json({error: ...}, 500) }` — sem logging.
- Para erros do PostgREST, logar também `code`, `details` e `hint`, que nomeiam
  diretamente a coluna/constraint em falha.
