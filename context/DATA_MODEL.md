# DATA_MODEL.md — Modelo de dados do GLCM

## Relações principais

```text
auth.users 1 ─── N user_roles
casos      1 ─── N arquivos
casos      1 ─── N lotes_extracao
casos      1 ─── 0..1 finalizacoes_extracao
casos      1 ─── N contracheques
contracheques 1 ─── N itens_contracheque
```

## Tabelas

| Tabela | Responsabilidade | Não confundir com |
|---|---|---|
| `casos` | Caso, cliente, estado do fluxo e resultados consolidados | Arquivo físico |
| `arquivos` | Metadados dos documentos recebidos | Conteúdo no Storage |
| `lotes_extracao` | Fila e resultados parciais da IA | Resultado final do caso |
| `finalizacoes_extracao` | Trava de consolidação por caso | Histórico permanente |
| `contracheques` | Um holerite estruturado | JSON agregado em `casos` |
| `itens_contracheque` | Rubricas de um holerite | Totais do holerite |
| `templates` | Metadados dos modelos `.docx` | Documento final gerado |
| `user_roles` | Papéis `admin` e `user` | Sessão do Supabase Auth |

## Estrutura de contracheques

- `contracheques`: `caso_id`, `competencia`, `total_proventos`,
  `total_descontos`, `liquido`, `arquivo_origem` e `modelo_origem`.
- `itens_contracheque`: `contracheque_id`, `codigo`, `descricao`,
  `referencia`, `valor`, `tipo` e `familia_hra`.
- `tipo` distingue `provento`, `desconto` e `informativo`; itens informativos
  não compõem os totais financeiros.
- Um PDF com páginas continuadas produz um único contracheque. Repetições
  idênticas dentro do mesmo PDF são descartadas.
- Os perfis de origem reconhecidos incluem Acelen, BASF, Braskem, Petrobras,
  Termomacaé, Elekeiroz, Termo Bahia e Unigel.
- Quando o documento não fornece código de rubrica, `codigo` permanece vazio;
  a descrição original continua sendo armazenada sem código inventado.

## Campos críticos de `casos`

- Identidade: `nome_cliente`, `cpf`, `rg`, `endereco`, `qualificacao`.
- Processo: `tipo_acao`, `numero_pasta`, `valor_causa`, `status`.
- Escritório: `escritorios`, `honorarios_pct`.
- Extração: `empregadores`, `contracheques`, `erro_processamento`.
- Duplicidade: `cpf_pre_extraido`, `possivel_duplicata_de`,
  `cliente_recorrente_ref`, `mesclado_em`, `mesclado_at`.
- Saída: `documentos_gerados`.
- Auditoria: `created_by`, `created_at`, `updated_at`, `origem`, `message_id`.

## Regras de alteração

- Toda mudança de esquema deve ter migration nova e reversão avaliada.
- Atualizar tipos gerados depois que a migration existir.
- Verificar RLS para toda tabela acessada pelo frontend.
- Preservar integridade referencial e idempotência.
- Não usar JSON quando a consulta exige estrutura relacional sem decisão explícita.
- Não duplicar a mesma fonte de verdade em campos diferentes sem regra de sincronização.
- Nunca inferir que o esquema remoto corresponde ao repositório.

## Divergência aberta

`arquivos.processado` é usado por código, mas não consta no esquema versionado
inspecionado. Tratar como pendência a validar, não como coluna garantida.
