# Como converter os modelos do escritório em templates do sistema

Os modelos do escritório usam rótulos entre colchetes (ex.: `[NOME COMPLETO DO CLIENTE]`).
O sistema preenche placeholders entre **chaves** (ex.: `{NOME_CLIENTE}`). A conversão é
feita **uma única vez, à mão, no Word** — o script automático antigo
(`scripts/converter-templates.mjs`) está aposentado: ele quebrava quando o Word fatiava
um rótulo internamente e não alcançava cabeçalho/rodapé.

## Passo a passo (no Word, para cada modelo)

1. Abra o modelo original e **salve uma cópia** com o nome do template (ex.: `peticao.docx`).
2. Use **Substituir Tudo** (`Ctrl+U` / `Ctrl+H`) para trocar cada rótulo pela variável da
   tabela abaixo. Exemplo: substituir `[NOME COMPLETO DO CLIENTE]` por `{NOME_CLIENTE}`.
3. **Repita a substituição dentro do cabeçalho e do rodapé**: dê dois cliques no
   cabeçalho/rodapé para entrar nele e rode o Substituir Tudo de novo — a busca feita a
   partir do corpo do documento **não** entra nessas áreas.
4. Onde o modelo tiver blocos "OPÇÃO A / OPÇÃO B" (procuração e termo LGPD têm um bloco
   por escritório), **apague o bloco que não vale** para aquele template e as linhas de
   instrução ("Preencha entre colchetes" etc.).
5. Salve e suba na página **Templates** do sistema. A página valida o arquivo na hora e
   avisa se sobrou `[colchete]` sem converter ou se alguma `{VARIAVEL}` está com o nome
   errado (variável desconhecida sai **em branco** no documento gerado — sem erro).

## Tabela de variáveis (lista canônica)

| Variável | Conteúdo | Origem |
|---|---|---|
| `{NOME_CLIENTE}` | Nome completo do cliente | Extração IA + revisão |
| `{CPF}` / `{RG}` | Documentos do cliente | Extração IA + revisão |
| `{NACIONALIDADE}` | Ex.: "brasileiro(a)" (default se vazio) | Tela de confirmação |
| `{ESTADO_CIVIL}` / `{PROFISSAO}` | Qualificação | Digitação manual na confirmação |
| `{ENDERECO_COMPLETO}` | Logradouro, nº, bairro, cidade/UF, CEP | Extração IA + revisão |
| `{CIDADE_UF}` | Cidade/UF do cliente (foro/vara da petição) | Extração IA + revisão |
| `{CEP}` | CEP do cliente | Extração IA + revisão |
| `{LOCAL_ASSINATURA}` | Fixo: Salvador/BA | Sistema |
| `{DATA}` / `{ANO}` | Data da geração do documento | Sistema |
| `{NUMERO_PASTA}` | Nº da pasta | Tela de cálculos |
| `{NUMERO_CONTRATO}` | Nº do contrato | Tela de confirmação* |
| `{HONORARIOS_PCT}` / `{HONORARIOS_EXTENSO}` | Ex.: "20" / "vinte" | Novo caso |
| `{VALOR_CAUSA}` / `{VALOR_CAUSA_EXTENSO}` | Valor calculado (IR sobre HRA) | Motor de cálculo |
| `{ENDERECO_PFN}` | Endereço da PFN da comarca | Revisão manual na peça |
| `{EMAIL_CLIENTE}` / `{TELEFONE_CLIENTE}` | Contato do cliente | Tela de confirmação* |

\* Os campos de nº do contrato / e-mail / telefone dependem do PR de campos novos; até
lá, saem em branco.

## Avisos esperados na validação

- `[Insira ementas de decisões...]` (petição): **proposital** — é ponto de inserção
  manual de jurisprudência. Pode ignorar o aviso.
- Qualquer outro `[colchete]` listado no aviso: voltou do Word sem converter — corrija e
  suba de novo.
