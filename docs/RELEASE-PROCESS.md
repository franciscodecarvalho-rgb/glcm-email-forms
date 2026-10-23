# Processo obrigatório de release

## Regra

Uma demanda com alteração destinada à produção só está concluída quando o commit
correspondente estiver publicado no Lovable e houver confirmação do deploy. Commit,
push, sincronização do repositório e deploy são estados diferentes; um não comprova
automaticamente o seguinte.

## Checklist por demanda

1. **Verificar o ponto de partida:** conferir branch, `git status`, `HEAD`, `origin/main`
   e o último commit reconhecido pelo projeto Lovable. Preservar alterações locais do
   usuário e nunca sincronizar por cima de um working tree sujo sem planejar a integração.
2. **Implementar e validar:** rodar os testes, build e demais verificações pertinentes.
   Corrigir ou registrar bloqueios antes do push.
3. **Commit e push:** enviar somente os arquivos da demanda e registrar o SHA efetivamente
   enviado. Não incluir alterações não relacionadas.
4. **Encaminhar ao Lovable:** informar o SHA exato e solicitar a publicação do frontend
   e, quando aplicável, das Edge Functions e migrations. Aplicar migrations antes de
   publicar código que dependa delas.
5. **Confirmar:** verificar separadamente o commit sincronizado, o resultado das
   migrations/funções e o status/URL da aplicação publicada. Registrar qualquer mudança
   extra feita pela plataforma e validar que não incluiu escopo indevido.
6. **Fechar a demanda:** só marcar como concluída depois da confirmação de produção.
   Se houver falha ou estado pendente, registrar a demanda como **deploy pendente** com
   SHA, evidência, motivo e próxima ação; continuar o acompanhamento até resolver.

## Reconciliação local, Git e Lovable

O Lovable pode criar ou sincronizar commits durante a análise, aplicação de migrations
ou publicação. Um push bem-sucedido não garante que `origin/main` continuará apontando
para o SHA enviado pelo agente.

1. Antes de iniciar o fluxo no Lovable, registre `git rev-parse HEAD`, atualize as
   referências com `git fetch origin` e registre `git rev-parse origin/main` e o SHA
   reconhecido pelo Lovable.
2. Depois de cada interação do Lovable que possa alterar/sincronizar o projeto, execute
   novamente `git fetch origin` e compare `HEAD`, `origin/main` e o SHA do Lovable.
3. Se `origin/main` avançou, inspecione os commits (`git log --oneline HEAD..origin/main`)
   e o diff antes de prosseguir. Não presuma que commits automáticos são inofensivos.
4. Se as alterações remotas forem esperadas e a árvore de trabalho estiver preservada,
   sincronize por fast-forward (`git pull --ff-only origin main`) e confirme que
   `HEAD` e `origin/main` apontam para o mesmo SHA. Se houver mudanças locais, conflito,
   commit inesperado ou divergência não compreendida, pare e resolva/registre a situação
   antes de editar, fazer novo push ou publicar.
5. Nunca use `git reset --hard`, force-push ou sobrescrita para esconder divergências.
   Preserve arquivos locais não rastreados e alterações do usuário; não os apague para
   obter uma árvore limpa.
6. Antes de declarar o deploy concluído, confirme qual SHA está publicado e registre
   juntos os SHAs local, remoto, reconhecido pelo Lovable e publicado. Se não forem o
   mesmo commit (ou não houver evidência da equivalência), relate a diferença e deixe a
   demanda pendente.

Comandos mínimos de conferência:

```powershell
git status -sb
git rev-parse HEAD
git fetch origin
git rev-parse origin/main
git log --oneline HEAD..origin/main
```

Só execute `git pull --ff-only origin main` depois de revisar o log/diff e confirmar que
preservará o trabalho local.

## Registro mínimo da entrega

- SHA de origem e SHA reconhecido pelo Lovable;
- resultado de testes/build;
- migrations aplicadas e Edge Functions publicadas, quando aplicável;
- status final do deploy e URL publicada;
- pendências ou divergências entre local, Git e Lovable.

Não presumir que o Lovable publicou apenas porque houve push, que `is_published` garante
que o commit mais recente está no ar, ou que uma mensagem de publicação solicitada
equivale à confirmação do deploy.
