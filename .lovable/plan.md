# Plano: Detecção de duplicatas e agrupamento por CPF+nome

## 1. Migration SQL (tabela `casos`)

```sql
ALTER TABLE public.casos
  ADD COLUMN mesclado_em uuid NULL REFERENCES public.casos(id) ON DELETE SET NULL,
  ADD COLUMN possivel_duplicata_de uuid NULL REFERENCES public.casos(id) ON DELETE SET NULL,
  ADD COLUMN cliente_recorrente_ref uuid NULL REFERENCES public.casos(id) ON DELETE SET NULL,
  ADD COLUMN mesclado_at timestamptz NULL,
  ADD COLUMN cpf_pre_extraido text NULL,
  ADD COLUMN nome_pre_extraido text NULL;

CREATE INDEX idx_casos_cpf_pre_extraido ON public.casos(cpf_pre_extraido);
CREATE INDEX idx_casos_mesclado_em ON public.casos(mesclado_em);
```
Sem mudanças de RLS (políticas atuais já cobrem `authenticated`).

## 2. Nova Edge Function: `pre-extract-cpf`

Arquivo: `supabase/functions/pre-extract-cpf/index.ts` (`verify_jwt = false` no `config.toml`).

Fluxo:
1. Recebe `{ caso_id }`.
2. Baixa arquivos de `casos-arquivos` (apenas imagens + 1ª página de PDFs se for trivial — caso contrário envia tudo; é leve).
3. Chama Lovable AI Gateway com **`google/gemini-2.5-flash-lite`** (mais barato e rápido; suporta visão). Tool call único `registrar_cpf_nome({ cpf, nome })` com `cpf` no formato `00000000000` (só dígitos) ou null.
4. Persiste `cpf_pre_extraido` (normalizado, só dígitos, validação módulo-11) e `nome_pre_extraido`.
5. Executa **matching** (ver seção 4) e seta flags / faz mescla.
6. Retorna `{ acao: 'isolado' | 'mesclado_auto' | 'sugerido' | 'recorrente', ref_id? }`.

Prompt do sistema:
```
Você analisa documentos brasileiros (RG, CPF, comprovante, contracheque).
Sua ÚNICA tarefa: identificar o CPF e o nome completo do titular principal.
- CPF: 11 dígitos, apenas números, sem pontuação. Se não tiver certeza, retorne null.
- Nome: completo, como aparece no documento de identidade. Se múltiplos nomes, escolha o titular do RG/CPF (não dependentes, não emissor).
- Em caso de dúvida, prefira null a chutar.
Retorne SEMPRE via tool call registrar_cpf_nome.
```

## 3. Custo estimado da pré-extração

- Modelo: `google/gemini-2.5-flash-lite` (visão).
- Input típico: 2-4 imagens (~1–3 MB cada) ≈ 1.500–4.000 tokens de imagem + ~150 de prompt.
- Output: ~30 tokens (só CPF+nome).
- Custo aproximado por caso: **~US$ 0,0005 – 0,002** (sub-centavo de dólar). Para 1.000 casos/mês: ~US$ 0,50–2,00.
- Comparativo: extração completa atual (Gemini 2.5 Pro/Flash) custa ~10–30× mais por caso.

## 4. Algoritmo de matching

Passos depois da pré-extração:

1. **Normalizar CPF**: só dígitos, validar dígito verificador. Se inválido → caso fica isolado.
2. **Buscar candidatos**: `SELECT * FROM casos WHERE (cpf_pre_extraido = X OR cpf = X) AND id != caso_atual ORDER BY created_at DESC`.
3. Para cada candidato, classificar:
   - `status IN ('concluido','cancelado')` → **cliente recorrente** (pega o mais recente concluído; cancelado ignora).
   - `status` ativo (`novo`, `em_analise`, `aguardando_confirmacao`, `aguardando_pasta`):
     - Calcular similaridade de nome.
     - `>= 0.90` → **mescla automática**.
     - `< 0.90` ou nome ausente em algum dos lados → **sugere mesclagem**.
4. Aplicar primeira regra que casar (ativo tem prioridade sobre concluído).

### Similaridade de nome (≥90%)
- Normalização: lowercase, remover acentos (`NFD` + strip diacríticos), remover pontuação, colapsar espaços, remover partículas comuns (`de`, `da`, `do`, `dos`, `das`).
- Algoritmo: **token set ratio** baseado em Levenshtein normalizado.
  - Tokeniza ambos, calcula interseção/união de tokens + similaridade Levenshtein no restante.
  - Implementação inline em TS (~40 linhas), sem dependência externa.
- Threshold: `score >= 0.90` → automática.
- Fallback simples para casos limites: se um dos nomes é prefixo/subset completo do outro (ex.: "João Silva" vs "João da Silva Santos"), conta como ≥0.90.

## 5. Ação de mescla automática

Dentro da função `pre-extract-cpf` (transação lógica):
1. `UPDATE arquivos SET caso_id = original WHERE caso_id = novo`.
2. `UPDATE casos SET mesclado_em = original, mesclado_at = now(), status = 'cancelado' WHERE id = novo`.
3. Não move storage paths (continuam em `<novo_id>/...`); apenas reapontamos `caso_id`. Tela do caso original lista tudo via `caso_id`.

## 6. Webhook + upload manual

- `webhook-resend-inbound/index.ts`: depois do upload dos anexos, invocar `pre-extract-cpf` via `supabase.functions.invoke` (fire-and-forget com `.catch(console.error)`). Não bloqueia resposta 200 ao Resend.
- `src/pages/NovoCaso.tsx`: depois do `update status='em_analise'` e antes (ou em paralelo) do `extract-case-data`, invocar `pre-extract-cpf`. Decisão: **invocar `pre-extract-cpf` ANTES** e só depois `extract-case-data`, pois se for mescla automática não faz sentido extrair de novo. → ajuste: para upload manual, aguardar resposta de `pre-extract-cpf` e, se `acao === 'mesclado_auto'`, redirecionar para o caso original em vez de `extract-case-data`.

## 7. Frontend

### `src/lib/status.ts`
Adicionar tipos/labels para flags (não são status — são badges adicionais):
```ts
export type CasoFlag = 'mesclado_auto' | 'possivel_duplicata' | 'cliente_recorrente';
```

### `src/components/CasoFlagBadge.tsx` (novo)
Renderiza badge colorido conforme flag.
- `mesclado_auto`: roxo, "Mesclado automaticamente"
- `possivel_duplicata`: laranja, "⚠️ Possível duplicata"
- `cliente_recorrente`: azul, "🔵 Cliente recorrente"

### `src/pages/Dashboard.tsx`
- `select` passa a incluir as 4 novas colunas relevantes (`mesclado_em`, `possivel_duplicata_de`, `cliente_recorrente_ref`, `mesclado_at`).
- Renderiza badges na coluna Status (ou nova coluna "Flags").
- Botões inline quando `possivel_duplicata_de`: "Mesclar com #X" / "Manter separado".
- Botão "Desfazer mesclagem" quando recebeu mescla (linha do caso original) e `mesclado_at` < 7 dias e status não-final.
- Filtra por padrão casos com `mesclado_em IS NULL` (mesclados ficam ocultos exceto se filtro "cancelado" ativo).

### `src/pages/Caso.tsx`
- Bloco no topo (acima do conteúdo de status) quando há flag:
  - Mesclado automaticamente → "Este caso recebeu N arquivos vindos de outro envio. [Desfazer mesclagem]"
  - Possível duplicata → "Este caso pode ser duplicata de #X. [Mesclar] [Manter separado]"
  - Cliente recorrente → "Cliente já teve o caso #X concluído anteriormente."
- Quando o caso atual TEM `mesclado_em`: redireciona para o caso original.

## 8. Nova Edge Function: `merge-casos` (ação manual)

`supabase/functions/merge-casos/index.ts` — usada pelos botões do dashboard:
- `POST { acao: 'mesclar' | 'desfazer' | 'manter_separado', caso_id, alvo_id? }`
- Mesmas operações da seção 5 + revert para "desfazer" (recria caso a partir do `mesclado_em`, move de volta `arquivos` que tinham aquele `caso_id` original — preservamos no campo `arquivos.caso_id_origem` ou usamos `storage_path` que começa com o UUID antigo).

**Decisão técnica para "desfazer":** vou adicionar `arquivos.caso_id_origem uuid NULL` (preenchido no momento da mescla com o id do caso de origem), assim conseguimos reverter precisamente quais arquivos voltam.

### Migration adicional
```sql
ALTER TABLE public.arquivos ADD COLUMN caso_id_origem uuid NULL;
```

## 9. Arquivos criados / editados

**Criar:**
- `supabase/functions/pre-extract-cpf/index.ts`
- `supabase/functions/merge-casos/index.ts`
- `src/components/CasoFlagBadge.tsx`
- `src/components/caso/BlocoDuplicata.tsx` (bloco topo da tela de caso)

**Editar:**
- `supabase/config.toml` (registrar as 2 novas funções com `verify_jwt = false`)
- `supabase/functions/webhook-resend-inbound/index.ts` (invoke `pre-extract-cpf` ao final)
- `src/pages/NovoCaso.tsx` (invoke + redirecionar se mesclado)
- `src/pages/Dashboard.tsx` (badges, filtros, botões inline)
- `src/pages/Caso.tsx` (bloco de flag, redirect se mesclado)
- `src/lib/status.ts` (tipos de flag)

**Migration:** colunas em `casos` + `arquivos.caso_id_origem` + índices.

## 10. Pontos abertos para você confirmar

1. **Modelo da pré-extração:** OK com `google/gemini-2.5-flash-lite`? (alternativa: `google/gemini-3.1-flash-lite-preview`, mais novo mas preview).
2. **Threshold 0.90:** confirma? Posso deixar configurável via constante no topo do arquivo.
3. **Caso novo sem CPF detectado mas com nome:** fica isolado (sem flag) como você definiu, certo? (não tento matching por nome só).
4. **"Manter separado":** ao clicar, limpa `possivel_duplicata_de` e nunca mais sugere para essa combinação? Ou pode sugerir de novo se outro caso aparecer?
5. **Ordem no upload manual:** confirma que devo aguardar pré-extração antes de chamar `extract-case-data`? (adiciona ~3-5s ao fluxo).

Aguardo sua confirmação para implementar.
