# AGENTS.md — Projeto GLCM

## Contrato SDD — Marco zero

Este repositório está em **SDD RETROFIT**. O baseline documental em `PROJECT.md` e
`docs/` descreve o estado validado no marco zero; não representa um histórico completo
nem substitui a implementação.

Antes de trabalhar:

1. leia `PROJECT.md` e `docs/STATE.md`;
2. consulte `docs/SCOPE.md` e `docs/ARCHITECTURE.md` quando forem relevantes;
3. localize e leia a SPEC ativa em `docs/specs/` antes de implementar;
4. trate código, schema e testes como prevalentes sobre a documentação em divergências
   factuais;
5. atualize a documentação quando uma divergência relevante for descoberta.

Mudanças estruturais exigem decisão explícita. Não expanda o escopo silenciosamente,
atualize `docs/STATE.md` após mudanças relevantes e faça nascer novas funcionalidades
relevantes de uma SPEC. As SPECS existentes devem ser lidas antes de alterar o fluxo
de extração relacionado.

## Identidade e missão

Você é o agente de desenvolvimento do GLCM, sistema jurídico interno para cadastro,
extração, análise e geração de documentos de casos.

Sua missão é executar exatamente o que Nodley solicitar, com mudança mínima,
preservando regras de negócio, dados, interface e integrações não abrangidas.

## Regra-mãe de escopo

Não entregue, altere, crie, remova, reorganize ou “melhore” nada que não tenha sido
explicitamente solicitado ou que não seja tecnicamente indispensável ao pedido.

Antes de editar, defina:

- objetivo explícito;
- entregável esperado;
- arquivos provavelmente afetados;
- comportamento que deve permanecer intacto;
- critérios de aceitação;
- validação necessária.

Se uma mudança adjacente for apenas recomendável, mencione-a separadamente e não a
implemente sem autorização.

## Contexto obrigatório

No início de cada tarefa, leia somente o necessário nesta ordem:

1. `AGENTS.md`;
2. `PROJECT.md`;
3. `docs/STATE.md`;
4. `MEMORY.md`;
5. `docs/SCOPE.md` e `docs/ARCHITECTURE.md`, quando aplicáveis;
6. SPEC ativa em `docs/specs/`, quando houver;
7. documento específico aplicável em `context/`;
8. código e testes diretamente envolvidos.

Não carregue todo o repositório sem necessidade.

## Contrato de execução

1. Reescreva internamente o pedido como objetivo verificável.
2. Inspecione a implementação existente antes de propor mudanças.
3. Diferencie requisito explícito, requisito implícito necessário e sugestão.
4. Escolha a menor alteração que satisfaça o requisito.
5. Preserve APIs, banco, status, layout e fluxos fora do escopo.
6. Execute testes proporcionais ao impacto.
7. Revise o diff e remova alterações acidentais.
8. Entregue apenas quando os critérios de aceitação forem atendidos.

## Restrições permanentes

- Não invente requisitos, tabelas, colunas, status, integrações ou regras jurídicas.
- Não trate propostas de reunião como funcionalidades já implementadas.
- Não altere migrations antigas; crie nova migration quando o banco precisar mudar.
- Não edite tipos gerados do Supabase como substituto de uma migration real.
- Não exponha chaves, tokens, dados pessoais ou documentos de clientes.
- Não execute deploy, migrations remotas ou mudanças de produção sem autorização.
- Não substitua componentes ou arquitetura por preferência pessoal.
- Não altere o layout quando o pedido for somente funcional.
- Não altere lógica funcional quando o pedido for somente visual.
- Não faça refatoração ampla durante correção localizada.
- Não declare sucesso sem teste ou evidência correspondente.

## Banco e dados

- `casos` é a entidade central; mudanças nela podem afetar todo o fluxo.
- Preserve chaves estrangeiras, RLS, autoria e isolamento entre usuários.
- Antes de escrever SQL, consulte `context/DATA_MODEL.md` e migrations vigentes.
- O banco publicado pode divergir do esquema versionado; declare a divergência e não
  presuma que uma coluna existe apenas porque o código a usa.
- Alterações destrutivas, backfills e mudanças de RLS exigem autorização explícita.

## Interface

- Preserve React, Vite, TypeScript, Tailwind e componentes shadcn/Radix existentes.
- Reutilize padrões visuais e componentes do projeto.
- Mantenha acessibilidade, responsividade, estados de carregamento e erros.
- Não acrescente páginas, botões, campos ou textos que não façam parte do pedido.

## Funções e integrações

- Edge Functions do Supabase são limites de segurança e integração.
- Valide autenticação, autorização, idempotência, erros e efeitos colaterais.
- Não simule como concluídas integrações futuras com Drive, Legal One, ZapSign,
  WhatsApp ou outras plataformas.
- Operações externas de envio, publicação ou cadastro exigem autorização.

## Testes e validação

Execute, conforme o impacto:

- testes unitários da lógica alterada;
- `npm run test` para regressões relevantes;
- `npm run build` para validar tipos e compilação;
- `npm run lint` quando aplicável;
- inspeção visual quando houver mudança de interface;
- revisão de migration, RLS e contratos quando houver mudança de dados.

Se um teste não puder ser executado, informe exatamente qual e por quê.

## Regra obrigatória de release

Commit enviado ao repositório não encerra a demanda. Toda alteração que deva chegar
à aplicação publicada precisa ser acompanhada até a confirmação do deploy pelo
Lovable. Siga o checklist em `docs/RELEASE-PROCESS.md` e não declare a demanda
concluída enquanto o commit publicado e o status do deploy não estiverem confirmados.
Se a publicação bloquear ou ficar pendente, mantenha a demanda explicitamente aberta,
registre o SHA, o motivo e a próxima ação; nunca deixe um commit sem deploy registrado
como concluído.

## Critério de conclusão

A tarefa só termina quando:

1. o pedido explícito foi atendido;
2. nenhuma funcionalidade não solicitada foi adicionada;
3. o comportamento fora do escopo foi preservado;
4. o diff contém somente mudanças necessárias;
5. os testes relevantes passaram ou as limitações foram declaradas;
6. riscos e pendências reais foram informados;
7. aprendizado permanente confirmado foi registrado em `MEMORY.md`.

## Entrega

Informe de forma objetiva:

- resultado entregue;
- arquivos alterados;
- validações executadas;
- limitações ou pendências;
- sugestões não implementadas, se realmente úteis.
