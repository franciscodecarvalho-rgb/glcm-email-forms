# Achados críticos de Segurança — transcrição e correção mínima proposta

## Origem
Todos vêm do scanner de banco (`lov_pgscan`) do **banco principal do app (kaopnizsbkzxqdzmocwa)**. Nenhum vem da base histórica `pcquefluiltrvwjpndvw`: ela não é escaneada por este projeto.
A consulta retornou **9** críticos ativos, não 8. Provavelmente o painel foi gerado antes do último scan. Controles: `LOV.DB.RLS_TAUTOLOGY_PERMISSIVE.V1` (7 tabelas) e `LOV.DB.STORAGE_OBJECTS_OWNER_UNBOUND.V1` (2 buckets).

## Achados

| # | ID interno (sufixo) | Objeto | Role | Policy/condição atual | Impacto | Menor correção compatível |
|---|---|---|---|---|---|---|
| 1 | `..._5993babc75ae0f4e` | tabela `casos` | authenticated | read/insert/update/delete com `USING(true)` / `WITH CHECK(true)` | Qualquer usuário altera ou apaga qualquer caso | Manter SELECT `true` (requisito). Manter INSERT/UPDATE para autenticados. Restringir DELETE a `has_role(auth.uid(),'admin')` |
| 2 | `..._0cc251992fd059e4` | tabela `arquivos` | authenticated | CRUD `true` | Metadados de documentos apagados/alterados por qualquer um | SELECT/INSERT mantidos. UPDATE/DELETE só para admin |
| 3 | `..._34ef069f6bc2c704` | tabela `contracheques` | authenticated | CRUD `true` | Pode apagar ou alterar dados de cálculo | Leitura mantida. Escrita e exclusão só para admin, pois as Edge Functions gravam com service role* |
| 4 | `..._c88f712070afba42` | tabela `itens_contracheque` | authenticated | CRUD `true` | Mesmo impacto do item 3 (rubricas) | Mesma correção do item 3* |
| 5 | `..._0eccdcc0f33badca` | tabela `lotes_extracao` | authenticated | CRUD `true` | Lotes de extração podem ser adulterados | Leitura mantida. Escrita só por service role/admin* |
| 6 | `..._7a2029d7f15241b8` | tabela `lotes_contracheques` | authenticated | só SELECT `true` (escrita já negada) | Leitura ampla do andamento/erros dos lotes | Compatível com "casos legíveis por todos": aceitar como intencional. Não exige mudança |
| 7 | `..._112ed133939c156c` | tabela `templates` | authenticated | CRUD `true` | Qualquer usuário troca ou apaga modelos de peças | Leitura mantida. INSERT/UPDATE/DELETE só para admin |
| 8 | `..._6f7170a09a1d1fe1` | bucket `casos-arquivos` (storage.objects) | authenticated | policy "auth read casos-arquivos" sem vínculo a `auth.uid()` | Qualquer autenticado baixa documentos de qualquer cliente | Coerente com leitura global de casos: manter leitura. Revisar e restringir escrita/exclusão do bucket (estado não verificado) |
| 9 | `..._9caa9f9476c5ceab` | bucket `casos-documentos` | authenticated | policy "auth read casos-documentos" sem vínculo ao dono | Qualquer autenticado baixa peças geradas | Igual ao item 8 |

*Antes de aplicar, é preciso confirmar no código quais telas gravam direto pelo navegador, como `Caso.tsx`, `NovoCaso.tsx` e `Templates.tsx`. Onde houver gravação feita pelo navegador, a restrição deve permitir o usuário comum. Nesses casos, fica só a limitação de DELETE.

## Evidência
Os dados vêm do resultado do scan (`get_scan_results`, 30/09/2026) e das policies atuais listadas no schema do projeto. Para os buckets, o scan cita apenas as policies de leitura. As policies de escrita do storage não foram consultadas e seguem **não verificadas**.

## Próximos passos (só com autorização)
1. Consultar em modo leitura as policies de `storage.objects` e mapear as gravações feitas pelo navegador.
2. Criar uma nova migration restringindo UPDATE/DELETE conforme a tabela acima, com SELECT de `casos` inalterado.
3. Rodar o scan de novo. Os itens 6, 8 e 9 continuariam como decisão de negócio (leitura global intencional). Só o usuário pode aceitá-los; nada será ignorado automaticamente.

Nada foi alterado, ignorado ou publicado.
