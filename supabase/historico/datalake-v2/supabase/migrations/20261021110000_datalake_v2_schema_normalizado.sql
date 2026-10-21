-- =====================================================================
-- Migration: Alinhamento do Schema datalake_v2
-- Destino: Projeto Supabase Histórico (pcquefluiltrvwjpndvw)
-- Base de dados estruturada normalizada (6 tabelas)
-- =====================================================================

begin;

-- Assegurar extensão pg_trgm
create extension if not exists pg_trgm with schema extensions;

-- Criar ou limpar schema datalake_v2 de forma segura
create schema if not exists datalake_v2;

-- Dropar tabelas anteriores do datalake_v2 (todas com 0 linhas confirmadas no preflight)
drop view if exists datalake_v2.vw_lancamentos cascade;
drop view if exists datalake_v2.itens_validados cascade;
drop function if exists datalake_v2.resumo_pessoas cascade;
drop table if exists datalake_v2.contracheque_fontes cascade;
drop table if exists datalake_v2.pendencias cascade;
drop table if exists datalake_v2.extracoes cascade;
drop table if exists datalake_v2.arquivo_ocorrencias cascade;
drop table if exists datalake_v2.arquivos cascade;
drop table if exists datalake_v2.lotes cascade;
drop table if exists datalake_v2.itens_contracheque cascade;
drop table if exists datalake_v2.contracheques cascade;
drop table if exists datalake_v2.rubricas cascade;
drop table if exists datalake_v2.vinculos cascade;
drop table if exists datalake_v2.empresas cascade;
drop table if exists datalake_v2.pessoas cascade;

-- 1. Pessoas
create table datalake_v2.pessoas (
  id uuid primary key,
  nome text not null check (btrim(nome) <> ''),
  cpf text,
  criado_em timestamptz not null default now()
);
create index idx_v2_pessoas_cpf on datalake_v2.pessoas(cpf) where cpf is not null;
create index idx_v2_pessoas_nome on datalake_v2.pessoas(nome);

-- 2. Empresas
create table datalake_v2.empresas (
  id uuid primary key,
  nome text not null check (btrim(nome) <> ''),
  cnpj text,
  criado_em timestamptz not null default now()
);
create index idx_v2_empresas_cnpj on datalake_v2.empresas(cnpj) where cnpj is not null;
create index idx_v2_empresas_nome on datalake_v2.empresas(nome);

-- 3. Vínculos
create table datalake_v2.vinculos (
  id uuid primary key,
  pessoa_id uuid not null references datalake_v2.pessoas(id) on delete cascade,
  empresa_id uuid not null references datalake_v2.empresas(id) on delete cascade,
  matricula text,
  cargo text,
  criado_em timestamptz not null default now()
);
create index idx_v2_vinculos_pessoa on datalake_v2.vinculos(pessoa_id);
create index idx_v2_vinculos_empresa on datalake_v2.vinculos(empresa_id);

-- 4. Rubricas
create table datalake_v2.rubricas (
  id uuid primary key,
  empresa_id uuid not null references datalake_v2.empresas(id) on delete cascade,
  modelo text,
  codigo text,
  descricao text not null,
  descricao_normalizada text generated always as (lower(regexp_replace(btrim(descricao), '\s+', ' ', 'g'))) stored,
  tipo text not null check (tipo in ('provento', 'desconto', 'informativo'))
);
create index idx_v2_rubricas_empresa on datalake_v2.rubricas(empresa_id);
create index idx_v2_rubricas_codigo on datalake_v2.rubricas(codigo);
create index idx_v2_rubricas_tipo on datalake_v2.rubricas(tipo);
create index idx_v2_rubricas_trgm on datalake_v2.rubricas using gin(descricao_normalizada public.gin_trgm_ops);

-- 5. Contracheques
create table datalake_v2.contracheques (
  id uuid primary key,
  vinculo_id uuid not null references datalake_v2.vinculos(id) on delete cascade,
  competencia date not null,
  tipo_folha text not null,
  total_proventos_centavos bigint not null default 0,
  total_descontos_centavos bigint not null default 0,
  liquido_centavos bigint not null default 0,
  criado_em timestamptz not null default now()
);
create index idx_v2_contracheques_vinculo on datalake_v2.contracheques(vinculo_id);
create index idx_v2_contracheques_competencia on datalake_v2.contracheques(competencia);
create index idx_v2_contracheques_vinculo_comp on datalake_v2.contracheques(vinculo_id, competencia);

-- 6. Itens de Contracheque
create table datalake_v2.itens_contracheque (
  id uuid primary key,
  contracheque_id uuid not null references datalake_v2.contracheques(id) on delete cascade,
  rubrica_id uuid not null references datalake_v2.rubricas(id) on delete cascade,
  ordem integer,
  referencia text,
  valor_centavos bigint not null default 0
);
create index idx_v2_itens_contracheque_id on datalake_v2.itens_contracheque(contracheque_id);
create index idx_v2_itens_rubrica_id on datalake_v2.itens_contracheque(rubrica_id);
create index idx_v2_itens_rubrica_cc on datalake_v2.itens_contracheque(rubrica_id, contracheque_id);

-- 7. View Consolidada de Lançamentos
create or replace view datalake_v2.vw_lancamentos as
select
  c.id as contracheque_id,
  p.id as pessoa_id,
  p.nome as pessoa_nome,
  p.cpf as pessoa_cpf,
  e.id as empresa_id,
  e.nome as empresa_nome,
  e.cnpj as empresa_cnpj,
  v.matricula,
  v.cargo,
  c.competencia,
  to_char(c.competencia, 'MM/YYYY') as competencia_exibicao,
  c.tipo_folha,
  i.id as item_id,
  r.id as rubrica_id,
  r.codigo as rubrica_codigo,
  r.descricao as rubrica_descricao,
  r.tipo as rubrica_tipo,
  i.valor_centavos,
  (i.valor_centavos / 100.0)::numeric(12,2) as valor,
  i.referencia,
  i.ordem
from datalake_v2.itens_contracheque i
join datalake_v2.contracheques c on c.id = i.contracheque_id
join datalake_v2.vinculos v on v.id = c.vinculo_id
join datalake_v2.pessoas p on p.id = v.pessoa_id
join datalake_v2.empresas e on e.id = v.empresa_id
join datalake_v2.rubricas r on r.id = i.rubrica_id;

-- 8. Função RPC de Agregação por Temas (Cursor / Paginação)
create or replace function datalake_v2.resumo_pessoas(
  p_termos text[] default null,
  p_empresa uuid default null,
  p_inicio date default null,
  p_fim date default null,
  p_apos uuid default null,
  p_limite integer default 50
) returns table(
  pessoa_id uuid,
  nome text,
  cpf text,
  empresas text[],
  meses bigint,
  contracheques bigint,
  proventos_centavos numeric,
  descontos_centavos numeric,
  liquido_centavos numeric,
  total_pessoas bigint
)
language sql stable set search_path = pg_catalog, datalake_v2 as $$
with rubricas_filtradas as materialized (
  select r.id, r.tipo
  from datalake_v2.rubricas r
  where r.tipo in ('provento', 'desconto')
    and (p_empresa is null or r.empresa_id = p_empresa)
    and (
      p_termos is null
      or exists(
        select 1 from unnest(p_termos) t
        where btrim(t) <> ''
          and r.descricao_normalizada like '%' || lower(regexp_replace(btrim(t), '\s+', ' ', 'g')) || '%'
      )
    )
),
folhas_filtradas as (
  select
    v.pessoa_id,
    v.empresa_id,
    c.id as contracheque_id,
    c.competencia,
    coalesce(sum(i.valor_centavos) filter (where r.tipo = 'provento'), 0) as p,
    coalesce(sum(i.valor_centavos) filter (where r.tipo = 'desconto'), 0) as d
  from datalake_v2.contracheques c
  join datalake_v2.vinculos v on v.id = c.vinculo_id
  join datalake_v2.itens_contracheque i on i.contracheque_id = c.id
  join rubricas_filtradas r on r.id = i.rubrica_id
  where (p_inicio is null or c.competencia >= p_inicio)
    and (p_fim is null or c.competencia <= p_fim)
  group by v.pessoa_id, v.empresa_id, c.id, c.competencia
),
agregado as (
  select
    f.pessoa_id,
    p.nome,
    p.cpf,
    array_agg(distinct e.nome order by e.nome) as empresas,
    count(distinct f.competencia) as meses,
    count(distinct f.contracheque_id) as contracheques,
    sum(f.p) as proventos_centavos,
    sum(f.d) as descontos_centavos,
    sum(f.p - f.d) as liquido_centavos
  from folhas_filtradas f
  join datalake_v2.pessoas p on p.id = f.pessoa_id
  join datalake_v2.empresas e on e.id = f.empresa_id
  group by f.pessoa_id, p.nome, p.cpf
),
contado as (
  select a.*, count(*) over() as total_pessoas
  from agregado a
)
select * from contado
where p_apos is null or contado.pessoa_id > p_apos
order by pessoa_id
limit least(greatest(coalesce(p_limite, 50), 1), 200);
$$;

-- 9. Segurança & Permissões (RLS restrito a service_role)
do $$ declare t record; begin
  for t in select tablename from pg_catalog.pg_tables where schemaname = 'datalake_v2' loop
    execute format('alter table datalake_v2.%I enable row level security', t.tablename);
  end loop;
end $$;

revoke all on schema datalake_v2 from public, anon, authenticated;
revoke all on all tables in schema datalake_v2 from public, anon, authenticated;
revoke all on all functions in schema datalake_v2 from public, anon, authenticated;

alter default privileges in schema datalake_v2 revoke all on tables from public, anon, authenticated;
alter default privileges in schema datalake_v2 revoke execute on functions from public, anon, authenticated;

grant usage on schema datalake_v2 to service_role;
grant select, insert, update, delete on all tables in schema datalake_v2 to service_role;
grant execute on all functions in schema datalake_v2 to service_role;

comment on schema datalake_v2 is 'DataLake 2.0 estruturado e normalizado: 6 tabelas, índices GIN trgm, RLS fechado para service_role.';

commit;
