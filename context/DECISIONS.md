# DECISIONS.md — Registro de decisões

Registre somente decisões arquiteturais ou de negócio aprovadas. Não use como diário.

## Decisões vigentes

### D-001 — Mudança mínima

**Status:** aprovado

Toda implementação deve limitar-se ao pedido explícito e aos requisitos técnicos
indispensáveis. Melhorias adjacentes ficam como sugestão não implementada.

### D-002 — Supabase como plataforma de dados

**Status:** vigente

PostgreSQL, Auth, Storage, Realtime e Edge Functions são a infraestrutura atual.
Mudança de plataforma exige decisão específica.

### D-003 — Revisão humana dos dados extraídos

**Status:** vigente

Dados produzidos por IA passam por confirmação antes de avançar para geração final.

### D-004 — Templates e planilha são mecanismos distintos

**Status:** vigente

Peças usam templates `.docx`; a planilha de cálculo é gerada como `.xlsx` com fórmulas.

## Modelo para nova decisão

```markdown
### D-XXX — Título

**Data:** AAAA-MM-DD
**Status:** proposta | aprovada | substituída
**Contexto:**
**Decisão:**
**Consequências:**
**Alternativas rejeitadas:**
```
