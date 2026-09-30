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

## Registro mínimo da entrega

- SHA de origem e SHA reconhecido pelo Lovable;
- resultado de testes/build;
- migrations aplicadas e Edge Functions publicadas, quando aplicável;
- status final do deploy e URL publicada;
- pendências ou divergências entre local, Git e Lovable.

Não presumir que o Lovable publicou apenas porque houve push, que `is_published` garante
que o commit mais recente está no ar, ou que uma mensagem de publicação solicitada
equivale à confirmação do deploy.
