# MEMORY.md — Memória do GLCM

## Uso

Memória persistente de regras confirmadas do projeto. Não registrar tarefas temporárias,
hipóteses, credenciais, dados de clientes ou propostas ainda não aprovadas.

## Preferências de Nodley

- Executar somente o que foi solicitado.
- Não concordar automaticamente; avaliar com evidências.
- Preservar estrutura e comportamento existentes fora do escopo.
- Entregar arquivos completos e funcionais quando solicitado.
- Validar antes de afirmar que algo foi concluído.
- Separar claramente implementação atual, proposta e hipótese.
- A cada solicitação, sugerir uma melhor aplicação; a sugestão é apresentada
  separadamente e só é implementada com autorização explícita.
- Ao alterar o MEMORY.md, sincronizar automaticamente o `.claude/CLAUDE.md`
  (cópia espelho), sem solicitar permissão.

## Regras confirmadas do projeto

- O GLCM é um sistema interno para escritório jurídico.
- O frontend usa React, Vite, TypeScript, Tailwind e shadcn/Radix.
- O backend usa Supabase para PostgreSQL, autenticação, Storage e Edge Functions.
- `casos` é a entidade central do fluxo.
- Arquivos físicos ficam no Storage; a tabela `arquivos` guarda metadados.
- A extração por IA usa lotes e consolidação controlada.
- Contracheques também possuem persistência estruturada.
- Templates `.docx` e planilha gerada são mecanismos distintos.
- O fluxo implementado termina em `concluido` após geração dos documentos.
- O deploy do projeto será realizado pelo Lovable.

## Divergências conhecidas

- O código de extração utiliza `arquivos.processado`, mas a coluna não aparece no
  esquema tipado/migrations inspecionados.
- O banco publicado pelo Lovable pode conter alterações feitas diretamente na nuvem.
- Antes de mudanças no banco, comparar migrations, tipos e esquema remoto autorizado.

## Integrações propostas, não confirmadas como implementadas

- Google Drive;
- Legal One;
- ZapSign;
- WhatsApp;
- análise automática de viabilidade jurídica.

Não apresentar esses itens como prontos sem evidência no código e validação funcional.

## Registro de novos aprendizados

### 2026-08 — Operação do Legal One

**Regra confirmada:** A etapa do Legal One será executada manualmente enquanto não houver acesso à API.
**Origem:** Definição de Nodley durante o mapeamento das etapas do processo.
**Aplicação:** Tratar cadastro do contato, criação da pasta/processo e obtenção de dados do Legal One como tarefas humanas, com posterior registro manual na Intranet quando solicitado.
**Evitar:** Implementar, simular ou apresentar integração automática com o Legal One como disponível.

### 2026-08 — Limite de viabilidade por caso

**Regra confirmada:** O usuário define no formulário de criação do caso o limite monetário usado na análise de viabilidade; o valor inicial é R$ 15.000,00.
**Origem:** Definição de Nodley para as solicitações de Ana.
**Aplicação:** Persistir o limite no próprio caso para uso posterior na comparação com os valores das rubricas definidas pelo escritório.
**Evitar:** Tratar R$ 15.000,00 como limite global imutável ou como resultado automático da análise.

### 2026-08 — Publicação pelo Lovable

**Regra confirmada:** O ambiente escolhido para realizar o deploy do projeto é o Lovable.
**Origem:** Definição de Nodley durante a preparação do projeto.
**Aplicação:** Preparar alterações, migrations e validações locais considerando o fluxo de publicação do Lovable.
**Evitar:** Executar deploy por outra plataforma ou aplicar mudanças remotas sem autorização explícita.

### 2026-08 — Tipos de ação cadastráveis

**Regra confirmada:** O formulário de criação de casos oferece IR sobre HRA (Tema 306), Horas Extras, Supressão de Folgas e Contribuição extraordinária.
**Origem:** Definição de Nodley para o cadastro de casos.
**Aplicação:** Persistir em `casos.tipo_acao`, respectivamente, os identificadores `ir_sobre_hra`, `horas_extras`, `supressao_folgas` e `contribuicao_extraordinaria`.
**Evitar:** Presumir que geração de documentos ou cálculos específicos dos três novos tipos já estejam implementados.

### 2026-08 — Categorias de upload na criação do caso

**Regra confirmada:** O formulário de criação separa o envio de Contracheques e Comprovantes de informações pessoais, exigindo pelo menos um arquivo em cada grupo.
**Origem:** Definição de Nodley para o cadastro de casos.
**Aplicação:** Gravar em `arquivos.tipo` os identificadores `contracheque` e `informacoes_pessoais`, respectivamente.
**Evitar:** Misturar visualmente as duas categorias ou permitir a criação manual sem um dos dois grupos.

### 2026-08 — Extração determinística de contracheques PDF

**Regra confirmada:** Contracheques em PDF devem ser lidos deterministicamente pela camada de texto, sem IA generativa.
**Origem:** Definição de Nodley após revisão do tratamento anterior dos contracheques.
**Aplicação:** Extrair competência, código, descrição e valor e persistir em `contracheques` e `itens_contracheque`; PDFs sem texto estruturado seguem para revisão manual.
**Evitar:** Inventar rubricas ausentes, aplicar OCR ou enviar contracheques à IA sem nova decisão explícita.

### 2026-08 — Variações dos modelos de contracheque

**Regra confirmada:** Os modelos recebidos exigem leitura posicional por colunas, aceitam códigos numéricos, alfanuméricos e iniciados por `/`, e podem apresentar páginas continuadas ou repetidas.
**Origem:** Inspeção visual dos PDFs de referência Acelen, BASF, Braskem, Petrobras e Termomacaé fornecidos por Nodley.
**Aplicação:** Armazenar a origem do layout e a referência/quantidade da rubrica; no Acelen, tratar `BASE / OUTROS` como informativo; no Petrobras, determinar provento/desconto pela seção; no Termomacaé, consolidar continuações e eliminar duplicatas.
**Evitar:** Classificar toda quantia pela última coluna, somar bases informativas ou criar mais de um registro para páginas do mesmo contracheque.

### 2026-08 — Perfis Elekeiroz, Termo Bahia e Unigel

**Regra confirmada:** O extrator deve aceitar rubricas sem código no Elekeiroz, ignorar a cópia espelhada do Termo Bahia e classificar o bloco `CUSTO EMPRESA-INFORMATIVO` da Unigel como informativo.
**Origem:** Autorização de Nodley após inspeção visual dos três modelos adicionais.
**Aplicação:** Consolidar as páginas do Elekeiroz pela competência; processar somente a metade esquerda do Termo Bahia; no Unigel, alternar a natureza das rubricas pelos totais de vencimentos, descontos e início do bloco informativo.
**Evitar:** Inventar códigos para o Elekeiroz, duplicar o Termo Bahia ou incluir custos informativos da Unigel nos totais financeiros.

### 2026-08 — Leitura posicional dos PDFs na Edge Function

**Regra confirmada:** A função `process-contracheques-pdf` obtém texto e coordenadas por página com `PDFPageProxy.getTextContent()`; `unpdf@1.4.0` não exporta `extractTextItems`.
**Origem:** Correção do `BootFailure` observado no primeiro teste remoto com múltiplos contracheques.
**Aplicação:** Manter o mapeamento de `str`, `transform`, `width` e `height` antes de executar os parsers posicionais.
**Evitar:** Reintroduzir importações inexistentes do `unpdf` ou trocar a leitura por texto linear, que perde as colunas do contracheque.

### 2026-08 — Extração determinística de documentos pessoais

**Regra confirmada:** CNH, RG e CIN em PDF devem ser classificados e extraídos deterministicamente, sem IA generativa.
**Origem:** Solicitação de Nodley para implementar a feature de extração dos comprovantes de informações pessoais.
**Aplicação:** Usar texto e coordenadas do PDF, validar CPF e persistir os dados consolidados no caso; documentos sem camada de texto ou não reconhecidos seguem para revisão manual.
**Evitar:** Inventar campos ausentes, bloquear indefinidamente o caso ou enviar esses documentos para análise generativa no fluxo manual.

### 2026-08 — Revisão dos contracheques persistidos

**Regra confirmada:** A confirmação do caso deve mostrar somente os contracheques e rubricas efetivamente extraídos dos PDFs e inseridos nas tabelas relacionais.
**Origem:** Solicitação de Nodley durante a validação dos contracheques.
**Aplicação:** Consultar `contracheques` e `itens_contracheque` e exibir os valores persistidos, sem criar linhas manuais nessa seção.
**Evitar:** Usar o JSON legado de `casos.contracheques` como evidência de que a extração foi gravada no banco.

### 2026-08 — Separação entre extração completa e correção manual

**Regra confirmada:** A página editável de confirmação só deve aparecer quando nome, CPF, RG ou rubricas de contracheque esperados não tiverem sido persistidos.
**Origem:** Solicitação de Nodley durante a validação da tela de confirmação.
**Aplicação:** Quando a identificação e ao menos uma rubrica estiverem gravadas, mostrar uma página somente leitura com os dados extraídos dos PDFs; caso contrário, abrir a correção manual.
**Evitar:** Apresentar campos vazios para edição como se a extração tivesse sido concluída com sucesso.

### 2026-08 — Ambiente de teste da extração pessoal

**Regra confirmada:** A extração de CNH, RG e CIN deve poder ser validada isoladamente, sem criar caso ou persistir o PDF.
**Origem:** Solicitação de Nodley para finalizar a feature de dados pessoais.
**Aplicação:** O teste envia um PDF autenticado à função em modo diagnóstico, processa em memória e retorna modelo, campos extraídos, ausências e motivo de revisão.
**Evitar:** Criar registros ou conservar documentos usados apenas para diagnóstico do extrator.

### 2026-08 — Extração pessoal isolada por IA

**Regra confirmada:** Documentos pessoais voltam a ser extraídos pela IA já integrada ao Lovable; contracheques permanecem na rotina determinística.
**Origem:** OCR local não reconheceu adequadamente CNH e identidade em PDF durante a validação.
**Aplicação:** Enviar à IA somente arquivos classificados como informações pessoais e persistir apenas os campos desse domínio.
**Evitar:** Reprocessar contracheques pela IA ou depender de OCR local para documentos pessoais.

### 2026-08 — Número do contrato

**Regra confirmada:** O número exibido no contrato é o número da pasta do processo.
**Origem:** Definição de Nodley para a etapa de geração de documentos.
**Aplicação:** Preencher `{NUMERO_CONTRATO}` com `casos.numero_pasta` ao gerar o contrato.
**Evitar:** Criar ou depender de um campo separado `numero_contrato` para essa finalidade.

### 2026-08 — Natureza e modelos dos documentos

**Regra confirmada:** IR sobre HRA, Contribuição Extraordinária e Tema 324 são ações tributárias; Horas Extras e Supressão de Folgas são trabalhistas.
**Origem:** Definição de Nodley para a geração dos documentos por tipo de ação.
**Aplicação:** Selecionar a petição específica da ação; usar o contrato HRA nas ações tributárias, o contrato Reflexo de Hora Extra nas trabalhistas e escolher a procuração pela natureza e pelo escritório.
**Evitar:** Alterar os Termos existentes ou selecionar contrato e procuração sem considerar a natureza da ação.

### 2026-08 — Quantidade de PDFs e páginas de contracheques

**Regra confirmada:** Um caso pode receber vários arquivos PDF de contracheques, e cada PDF pode conter vários contracheques distribuídos em qualquer quantidade de páginas.
**Origem:** Solicitação de Nodley durante a validação do upload de contracheques.
**Aplicação:** Acumular arquivos escolhidos em seleções sucessivas e consolidar páginas por competência e modelo, eliminando rubricas repetidas.
**Evitar:** Substituir a seleção anterior por um novo arquivo ou impor um limite fixo de páginas no extrator.

### 2026-08 — IA como último recurso nos contracheques

**Regra confirmada:** A IA pode processar um contracheque somente quando a extração automática/OCR não produzir dados estruturados.
**Origem:** Autorização de Nodley após definir o fluxo para PDFs sem camada de texto.
**Aplicação:** Manter a extração determinística como primeira opção e chamar a IA individualmente apenas para os arquivos que falharem, validando a resposta antes de persistir.
**Evitar:** Enviar à IA contracheques que já foram extraídos ou aceitar rubricas vazias e valores inválidos.

### 2026-08 — Unificação dos contracheques no upload

**Regra confirmada:** Os PDFs de contracheques selecionados em um caso devem ser unidos, em ordem cronológica de competência (MM/AAAA crescente), em um único PDF antes do upload.
**Origem:** Solicitação de Nodley durante o teste do processamento com múltiplos arquivos; a ordenação cronológica foi definida depois da unificação já funcionar.
**Aplicação:** Armazenar e processar um arquivo `contracheques-unificados.pdf`, exibindo o progresso das etapas ao usuário; `src/lib/unificar-pdfs.ts` extrai a competência de cada PDF com pdf.js (`competenciaDoArquivo`) e ordena os arquivos antes de juntar (`ordenarPorCompetencia`), preservando a ordem relativa dos arquivos sem competência reconhecida ao final.
**Evitar:** Unificar os documentos pessoais com os contracheques, perder páginas durante a junção ou confiar na ordem de seleção dos arquivos.

### 2026-08 — Contratos específicos por tipo de ação

**Regra confirmada:** Contribuição Extraordinária e Supressão de Folgas possuem modelos próprios de contrato.
**Origem:** Definição de Nodley ao adicionar os dois novos modelos contratuais.
**Aplicação:** Selecionar `contrato_contribuicao_extraordinaria` e `contrato_supressao_folgas` para esses tipos de ação, preservando integralmente a formatação dos modelos e substituindo somente variáveis externas.
**Evitar:** Reutilizar os contratos tributário HRA ou trabalhista de Horas Extras nesses dois tipos de ação, ou reformatar o conteúdo jurídico fixo durante a geração.

### 2026-08 — Dados variáveis nos contratos

**Regra confirmada:** Todos os contratos devem preencher com os dados do caso a qualificação do cliente, o endereço, o número da pasta no campo `CONTRATO:` e o nome do contratante na assinatura.
**Origem:** Correção solicitada por Nodley após validação dos documentos gerados.
**Aplicação:** Manter nos quatro modelos de contrato os marcadores de nome, nacionalidade, estado civil, profissão, CPF, endereço, número do contrato, local, data e nome na assinatura.
**Evitar:** Publicar modelos com dados de clientes de exemplo fixados no preâmbulo ou na assinatura.

### 2026-08 — PDFs criptografados na unificação de contracheques

**Regra confirmada:** A unificação dos contracheques deve aceitar PDFs marcados como criptografados quando a biblioteca conseguir processá-los sem senha.
**Origem:** Erro de carregamento observado no upload de PDF criptografado.
**Aplicação:** Detectar a criptografia com `ignoreEncryption: true`, descriptografar localmente com QPDF/WASM e somente então copiar as páginas para o arquivo unificado.
**Evitar:** Tratar `ignoreEncryption: true` como descriptografia, rejeitar antecipadamente o arquivo apenas pela marcação de criptografia ou alterar o processamento dos documentos pessoais.

### 2026-08 — Declaração de Pobreza por tipo de ação

**Regra confirmada:** A Declaração de Pobreza é gerada somente nas ações trabalhistas (Horas Extras e Supressão de Folgas).
**Origem:** Definição de Nodley ao revisar os documentos gerados por tipo de ação.
**Aplicação:** Em `selecionarPecas` da função `generate-documents`, incluir `declaracao_pobreza` apenas quando a natureza da ação for `trabalhista`, preservando a ordem das demais peças.
**Evitar:** Gerar a Declaração de Pobreza nas ações tributárias (IR sobre HRA, Tema 324 e Contribuição Extraordinária) ou remover o template `declaracao_pobreza` da página Templates.

### 2026-08 — Planilha IR sobre HRA

**Regra confirmada:** A planilha .xlsx gerada lista as competências em ordem cronológica crescente e não possui a coluna SUBTOTAL; o VALOR (HISTÓRICO) referencia HRA+AHRA diretamente.
**Origem:** Lista de ajustes de Nodley após a validação dos documentos gerados.
**Aplicação:** Ordenar as linhas por MM/AAAA em `montarArquivosPlanilhaXlsx`; rótulos fora do padrão (ex.: legado "Contracheque 1") vão ao fim, preservando a ordem relativa.
**Evitar:** Reintroduzir a coluna SUBTOTAL ou depender da ordem de seleção/extração dos contracheques.

### 2026-08 — Fontes canônicas testadas em src/lib

**Regra confirmada:** As lógicas puras de `generate-documents` (seleção de peças e planilha xlsx) têm fonte canônica em `src/lib` com cobertura vitest; a Edge Function mantém cópias inline por exigência do deploy de arquivo único.
**Origem:** Proposta aceita por Nodley após validações com scripts descartáveis.
**Aplicação:** Alterar primeiro `src/lib/modelos-documentos.ts` (`selecionarPecas`) ou `src/lib/planilha-xlsx.ts` e sincronizar a cópia na função; a paridade é garantida automaticamente pelo teste de guarda `src/lib/espelho-edge-function.test.ts` (falha quando as versões divergem).
**Evitar:** Editar somente a cópia inline da função ou deixar as duas versões divergirem.

### 2026-08 — Publicação de Edge Functions

**Regra confirmada:** O deploy efetivo acontece por push na `main` do GitHub + **Publish no Lovable** (botão ou prompt no chat); a validação usa geração de documentos em caso novo, pois casos `concluido` nunca regeram.
**Origem:** Deploy do PR #36 (18/08/2026) e validação de Nodley na plataforma.
**Aplicação:** Após merge, orientar o Publish no Lovable e a validação em caso novo. A CLI do Supabase está instalada, mas o token de Nodley só acessa o projeto `pcquefluiltrvwjpndvw`; a produção (`kaopnizsbkzxqdzmocwa`) exige convite à org ou token da conta dona.
**Evitar:** Assumir que merge no GitHub publica a função automaticamente ou validar em caso já concluído.

### 2026-08 — Modelos de contrato do escritório

**Regra confirmada:** Os `.docx` originais usam MERGEFIELDs (`<#[id]-Campo>`, resultado em cache ex.: Vitor Pereira), o bloco de aviso fica no cabeçalho com `⚠️` e as listas usam marcadores nativos do Word.
**Origem:** Inspeção dos modelos durante o diagnóstico dos contratos gerados.
**Aplicação:** Ao converter/gerar templates, preservar triângulos ⚠, listas nativas e endereço sem duplicidade; dados de exemplo visíveis no Word são cache de merge, não texto fixo.
**Evitar:** Substituir listas nativas por `•` literal em fonte Symbol (vira □ fora do Word) ou mover o aviso do cabeçalho para o corpo.

### 2026-08 — Alerta de rubricas monitoradas

**Regra confirmada:** A página do caso sinaliza quando os contracheques contêm rubricas com os códigos 1059, 1513 ou 6050, agrupando as competências por código.
**Origem:** Redefinição de Nodley sobre as solicitações de Ana: o relatório de totais 1513/6050 (item 1.1) e a sugestão de viabilidade pela média (item 1.2) foram removidos do escopo, restando somente o alerta unificado.
**Aplicação:** `encontrarRubricasAlerta` em `src/lib/alertas-rubricas.ts` filtra `itens_contracheque` pelos códigos; o componente `AlertaRubricas` exibe o aviso na página do caso em todos os status.
**Evitar:** Recriar o relatório de totais 1513/6050 ou a sugestão de viabilidade sem nova solicitação explícita.

### 2026-08 — Planilha de códigos 1513/6050

**Regra confirmada:** Quando as rubricas relacionais do caso contêm os códigos 1513 ou 6050, a geração inclui uma segunda planilha .xlsx (`planilha_codigos`) com o total por código e competência, na mesma estrutura da planilha IR/HRA.
**Origem:** Solicitação de Nodley reaproveitando o item 1.1 de Ana com a estrutura da planilha já validada.
**Aplicação:** `agregarCodigosPorCompetencia` consolida `itens_contracheque` por competência; `montarArquivosPlanilhaCodigosXlsx` gera o arquivo; nada é gerado quando não há ocorrências.
**Evitar:** Gerar a planilha vazia, usar o JSON legado de `casos.contracheques` como fonte ou criar estrutura diferente da planilha IR/HRA validada.

### 2026-08 — PDF unificado de contracheques no pacote final

**Regra confirmada:** A geração de documentos anexa o `contracheques-unificados.pdf` (criado no upload) como peça `contracheques_unificados` do pacote, copiando de `casos-arquivos` para `casos-documentos`.
**Origem:** Definição de Nodley para a etapa de documentos gerados, simplificando a ideia anterior de reordenação cronológica.
**Aplicação:** Localizar o arquivo em `arquivos` (tipo `contracheque`, nome `contracheques-unificados.pdf`) e anexar; casos antigos sem o arquivo unificado não recebem a peça.
**Evitar:** Reunificar os PDFs na geração ou reordenar páginas — o arquivo já vem pronto do upload.

### 2026-08 — CPF: persistência em dígitos e exibição formatada

**Regra confirmada:** `casos.cpf` guarda somente os 11 dígitos (sem pontuação); telas e documentos exibem `XXX.XXX.XXX-XX` via `formatarCpf`; CPF mascarado (ex.: `215.***.***-*0` de comprovantes) ou parcial é tratado como ausente e abre a confirmação manual.
**Origem:** CPF mascarado extraído de comprovante chegou à petição gerada; Nodley definiu o formato obrigatório para os próximos casos (sem update retroativo).
**Aplicação:** `src/lib/cpf.ts` (`normalizarCpf`/`formatarCpf`) é a fonte canônica; `process-documentos-pessoais-pdf` persiste o primeiro CPF válido entre os documentos (`primeiroCpfValido`); `generate-documents` mantém cópia inline de `formatarCpf` sincronizada; `TelaConfirmacao` grava somente dígitos e rejeita CPF que não tenha 11.
**Evitar:** Persistir CPF formatado ou mascarado (a duplicidade do pre-extract-cpf compara dígitos) ou corrigir formato via update no banco em vez da camada de apresentação.

### 2026-08 — Normalização antes da extração de competência na unificação

**Regra confirmada:** Na unificação no cliente, o PDF deve ser normalizado (re-serializado via `pdf-lib`) antes de extrair a competência e de copiar as páginas, para contornar erros de estrutura interna (`PDFDict undefined`) em PDFs descriptografados pelo QPDF.
**Origem:** Caso validado por Nodley onde o PDF unificado saiu em ordem, exceto as páginas de comprovantes RECAP/Ajuste da Petrobras, que ficaram ao final por terem competência não reconhecida no upload; o parser posicional reconhecia essas competências no PDF normalizado.
**Aplicação:** Em `unificarPdfs` (`src/lib/unificar-pdfs.ts`), após ler/descriptografar, executar `origem.save()` e usar esses bytes tanto na extração (`extrairItensPorPagina`) quanto no merge (`copyPages`), preservando os bytes normalizados na estrutura `preparados`.
**Evitar:** Extrair competência dos bytes brutos/descriptografados sem normalizar, ou usar bytes diferentes entre a extração e a junção.

### 2026-08 — Códigos HRA específicos por empresa

**Regra confirmada:** A rubrica de código `3A20` da BASF e a de código `1004` da Braskem pertencem à família HRA.
**Origem:** Validação de Nodley sobre os modelos de contracheque dessas empresas.
**Aplicação:** Em `process-contracheques-pdf`, classificar esses códigos como `hra` somente quando o modelo identificado for, respectivamente, `basf` ou `braskem`.
**Evitar:** Tornar os códigos globais para outras empresas ou modificar as regras existentes dos demais modelos.

```markdown
### AAAA-MM — Título

**Regra confirmada:**
**Origem:**
**Aplicação:**
**Evitar:**
```
