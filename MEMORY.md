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

```markdown
### AAAA-MM — Título

**Regra confirmada:**
**Origem:**
**Aplicação:**
**Evitar:**
```
