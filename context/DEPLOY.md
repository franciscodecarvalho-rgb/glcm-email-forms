# DEPLOY.md — Publicação (PC Local → GitHub → Lovable → Supabase)

Procedimento oficial de publicação. Para publicar qualquer alteração, chame este
documento: "publicar seguindo `context/DEPLOY.md`".

## Regra-mãe

Deploy efetivo = **push na `main` do GitHub + Publish no Lovable** (botão ou prompt
no chat). Merge no GitHub, sozinho, não publica nada — não existe CI/CD no
repositório. Não executar deploy, migration remota ou mudança de produção sem
autorização explícita de Nodley.

## Mapa de ambientes

| Ambiente | Identificação | Papel |
|---|---|---|
| PC Local | `glcm-email-forms-main` (working dir) | Código, testes, migrations versionadas |
| GitHub | `github.com/franciscodecarvalho-rgb/glcm-email-forms` | Ponte de sincronização com o Lovable |
| Lovable | projeto conectado ao repo | Build do frontend + deploy das Edge Functions |
| Supabase dev | `pcquefluiltrvwjpndvw` | Único projeto acessível pelo token local da CLI |
| Supabase prod | `kaopnizsbkzxqdzmocwa` (`supabase/config.toml`) | Destino efetivo; exige convite à org ou token da conta dona |

## Checklist de publicação

### 1. Validação local (agente executa)

```bash
npm run test    # obrigatório; inclui o guarda do espelho src/lib ↔ Edge Function
npm run build   # valida tipos e compilação
npm run lint    # quando aplicável
git status      # árvore limpa, somente arquivos do escopo
```

### 2. Subir para o GitHub (agente executa somente com confirmação)

- Commit com mensagem no padrão do histórico (`feat: ...`, `fix: ...`), sem segredos;
- Push direto na `main` ou via branch + PR (ambos convivem no histórico);
- Reprocessamento não é deploy: após o merge, aguardar o passo 3.

### 3. Publish no Lovable (Nodley executa)

- Botão **Publish** ou prompt no chat do Lovable;
- O Lovable puxa a `main`, builda o frontend e faz o deploy das Edge Functions no
  projeto Supabase conectado;
- Configurações de `supabase/config.toml` (ex.: `verify_jwt = false` por função)
  devem permanecer preservadas.

### 4. Validação em produção (Nodley executa)

- Validar gerando documentos em **caso novo** — casos `concluido` nunca regeram;
- Conferir o comportamento alterado na plataforma publicada antes de encerrar.

## Por tipo de mudança

| Tipo | Passo extra obrigatório |
|---|---|
| Frontend (`src/`) | Nenhum; segue o checklist padrão |
| `generate-documents` | Editar primeiro a fonte canônica em `src/lib`, sincronizar a cópia inline na função e confirmar que `espelho-edge-function.test.ts` passa |
| Demais Edge Functions | Arquivo único (sem imports de `_shared`); validar a função específica após o Publish |
| Banco (migration) | Criar migration nova (nunca alterar antiga); aplicação remota somente com autorização explícita |

## Restrições permanentes

- O banco publicado pode divergir do esquema versionado: antes de mexer no banco,
  comparar migrations, tipos gerados e esquema remoto autorizado, e declarar a
  divergência — nunca presumir que uma coluna existe porque o código a usa;
- Não publicar por outra plataforma nem aplicar mudanças remotas fora do Publish
  do Lovable;
- Não expor chaves, tokens ou dados de clientes em commits ou logs.

## Rotina de publicação via PR (Lovable só faz o deploy)

Fluxo recomendado para que o Lovable **somente execute o Publish**, sem trocar de
branch nem gerenciar código:

1. **Agente** faz a correção em uma branch (ex.: `fix/<descricao>`), valida
   (test/build/lint) e envia a branch para o GitHub;
2. **Agente** abre o PR da branch para `main` com `gh pr create`;
3. **Nodley** (ou o agente com confirmação) faz o merge do PR na `main`
   (`gh pr merge <numero> --merge --delete-branch`). Merge **não** é deploy;
4. **Lovable** já sincronizado com a `main` puxa os commits automaticamente;
5. **Nodley** no Lovable clica em **Publish** (ou envia o prompt de deploy
   pontual abaixo) e valida em caso novo.

Regras que mantêm essa rotina segura:

- Manter sempre o espelho `src/lib` ↔ Edge Function sincronizado
  (`espelho-edge-function.test.ts` precisa passar antes do merge);
- Casos `concluido` nunca regeram: validar sempre em caso novo;
- Nenhuma configuração de `supabase/config.toml` pode mudar durante o Publish.

## Prompt de deploy pontual (Lovable)

```text
Sincronize a branch main no commit 763d154. Não altere nenhum arquivo, banco, migration, RLS, dados, templates ou outras funções. Publique o frontend e as Edge Functions (build completo) exatamente como estão nesse commit. Ao finalizar, confirme separadamente o commit sincronizado e a publicação do frontend e das Edge Functions.
```

## Fontes deste procedimento

- `MEMORY.md` — "Publicação pelo Lovable", "Publicação de Edge Functions",
  "Divergências conhecidas";
- `supabase/config.toml` — `project_id` de produção e `verify_jwt` por função;
- `.lovable/plan/redeploy-da-edge-function-process-documentos-pessoais-pdf-2026-08-16.md`
  — exemplo de deploy de função única executado pelo Lovable.
