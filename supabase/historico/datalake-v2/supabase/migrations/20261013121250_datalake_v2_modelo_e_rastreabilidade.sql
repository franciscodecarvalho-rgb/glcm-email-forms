-- Base nova, privada. Nenhum objeto ou dado da base legada é alterado.
begin;
create schema datalake_v2;

create function datalake_v2.normalizar(text) returns text
language sql immutable strict parallel safe set search_path = pg_catalog
as $$ select lower(regexp_replace(btrim($1), '\s+', ' ', 'g')) $$;

create function datalake_v2.cpf_valido(text) returns boolean
language plpgsql immutable strict set search_path = pg_catalog as $$
declare s integer; d integer; j integer;
begin
  if $1 !~ '^[0-9]{11}$' or $1 ~ '^([0-9])\1{10}$' then return false; end if;
  for j in 10..11 loop
    s := 0;
    for k in 1..j-1 loop s := s + substr($1,k,1)::integer * (j+1-k); end loop;
    d := (s*10)%11; if d = 10 then d := 0; end if;
    if d <> substr($1,j,1)::integer then return false; end if;
  end loop;
  return true;
end $$;

create table datalake_v2.lotes (
  id uuid primary key, chave_origem text not null unique,
  parser_versao text not null, manifesto_sha256 text not null check (manifesto_sha256 ~ '^[a-f0-9]{64}$'),
  estado text not null check (estado in ('parcial','concluido')),
  esperado_contracheques integer not null check (esperado_contracheques >= 0),
  esperado_itens integer not null check (esperado_itens >= 0),
  criado_em timestamptz not null default now()
);
create table datalake_v2.pessoas (
  id uuid primary key, chave_origem text not null unique,
  nome_original text not null check (btrim(nome_original) <> ''),
  cpf text check (cpf is null or datalake_v2.cpf_valido(cpf)),
  criado_em timestamptz not null default now()
);
create index pessoas_cpf_idx on datalake_v2.pessoas(cpf) where cpf is not null;

create table datalake_v2.empresas (
  id uuid primary key, chave_origem text not null unique, nome_original text not null,
  cnpj text check (cnpj is null or cnpj ~ '^[0-9]{14}$'),
  identidade_confirmada boolean not null default false,
  criado_em timestamptz not null default now()
);
create table datalake_v2.vinculos (
  id uuid primary key, chave_origem text not null unique,
  pessoa_id uuid not null references datalake_v2.pessoas(id),
  empresa_id uuid not null references datalake_v2.empresas(id),
  matricula_original text, criado_em timestamptz not null default now()
);
create index vinculos_pessoa_idx on datalake_v2.vinculos(pessoa_id);
create index vinculos_empresa_idx on datalake_v2.vinculos(empresa_id);

create table datalake_v2.arquivos (
  id uuid primary key, sha256 text not null unique check (sha256 ~ '^[a-f0-9]{64}$'),
  tamanho_bytes bigint not null check (tamanho_bytes >= 0), tipo_midia text not null,
  paginas integer check (paginas > 0),
  storage_estado text not null default 'local' check (storage_estado in ('local','enviado')),
  storage_bucket text, storage_objeto text,
  check ((storage_estado = 'local' and storage_bucket is null and storage_objeto is null)
      or (storage_estado = 'enviado' and storage_bucket is not null and storage_objeto is not null)),
  criado_em timestamptz not null default now()
);
create table datalake_v2.arquivo_ocorrencias (
  id uuid primary key, lote_id uuid not null references datalake_v2.lotes(id),
  arquivo_id uuid not null references datalake_v2.arquivos(id),
  caminho_relativo text not null, origem_pasta text not null,
  arquivo_compactador_id uuid references datalake_v2.arquivos(id),
  unique (lote_id,caminho_relativo)
);
create index ocorrencias_arquivo_idx on datalake_v2.arquivo_ocorrencias(arquivo_id);
create index ocorrencias_compactador_idx on datalake_v2.arquivo_ocorrencias(arquivo_compactador_id);

create table datalake_v2.extracoes (
  id uuid primary key, lote_id uuid not null references datalake_v2.lotes(id),
  arquivo_id uuid not null references datalake_v2.arquivos(id),
  parser_versao text not null, metodo text not null check (metodo in ('texto','ocr_local','inventario')),
  estado text not null check (estado in ('validada','pendente','diverso','quarentena','compactado')),
  dados_brutos jsonb not null, criado_em timestamptz not null default now(),
  unique (arquivo_id,parser_versao,metodo)
);
create index extracoes_lote_idx on datalake_v2.extracoes(lote_id);

create table datalake_v2.rubricas (
  id uuid primary key, empresa_id uuid not null references datalake_v2.empresas(id),
  modelo text not null, codigo_original text, descricao_original text not null,
  descricao_normalizada text generated always as (datalake_v2.normalizar(descricao_original)) stored,
  tipo text not null check (tipo in ('provento','desconto','informativo')),
  unique nulls not distinct (empresa_id,modelo,codigo_original,descricao_original,tipo)
);
create index rubricas_empresa_idx on datalake_v2.rubricas(empresa_id);
-- pg_trgm já está instalado em public no projeto histórico.
create index rubricas_descricao_idx on datalake_v2.rubricas using gin(descricao_normalizada public.gin_trgm_ops);

create table datalake_v2.contracheques (
  id uuid primary key, lote_id uuid not null references datalake_v2.lotes(id),
  vinculo_id uuid not null references datalake_v2.vinculos(id),
  competencia date not null check (extract(day from competencia) = 1),
  tipo_folha text not null, fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  total_proventos_centavos bigint not null, total_descontos_centavos bigint not null,
  liquido_centavos bigint not null,
  estado text not null check (estado in ('validado','substituido')),
  dados_extraidos jsonb not null,
  check (total_proventos_centavos - total_descontos_centavos = liquido_centavos),
  unique (vinculo_id,fingerprint)
);
create index contracheques_vinculo_competencia_idx on datalake_v2.contracheques(vinculo_id,competencia,id);
create index contracheques_lote_idx on datalake_v2.contracheques(lote_id);
create table datalake_v2.itens_contracheque (
  id uuid primary key, contracheque_id uuid not null references datalake_v2.contracheques(id),
  rubrica_id uuid not null references datalake_v2.rubricas(id),
  ordem integer not null check (ordem > 0), valor_centavos bigint not null,
  referencia_original text, pagina integer not null check (pagina > 0),
  linha_original text not null, posicao_vertical numeric,
  unique (contracheque_id,ordem)
);
create index itens_rubrica_contracheque_idx on datalake_v2.itens_contracheque(rubrica_id,contracheque_id);
create table datalake_v2.contracheque_fontes (
  id uuid primary key, contracheque_id uuid not null references datalake_v2.contracheques(id),
  ocorrencia_id uuid not null references datalake_v2.arquivo_ocorrencias(id),
  extracao_id uuid not null references datalake_v2.extracoes(id),
  paginas integer[] not null check (cardinality(paginas)>0 and array_position(paginas,null) is null and 0 < all(paginas)),
  principal boolean not null default false,
  unique (contracheque_id,ocorrencia_id)
);
create unique index fontes_principal_idx on datalake_v2.contracheque_fontes(contracheque_id) where principal;
create index fontes_ocorrencia_idx on datalake_v2.contracheque_fontes(ocorrencia_id);
create index fontes_extracao_idx on datalake_v2.contracheque_fontes(extracao_id);
create table datalake_v2.pendencias (
  id uuid primary key, lote_id uuid not null references datalake_v2.lotes(id),
  ocorrencia_id uuid not null references datalake_v2.arquivo_ocorrencias(id),
  categoria text not null check (categoria in ('ocr','identidade','extracao','conferencia')),
  motivo text not null, estado text not null default 'aberta' check (estado in ('aberta','resolvida')),
  evidencias jsonb not null default '{}', criado_em timestamptz not null default now(),
  unique (lote_id,ocorrencia_id,categoria)
);
create index pendencias_lote_estado_idx on datalake_v2.pendencias(lote_id,estado);
create index pendencias_ocorrencia_idx on datalake_v2.pendencias(ocorrencia_id);

-- Conferência diferida: a folha e seus itens entram na mesma transação.
create function datalake_v2.conferir_folha(p_id uuid) returns void
language plpgsql set search_path = pg_catalog,datalake_v2 as $$
declare c datalake_v2.contracheques; p numeric; d numeric; n integer;
begin
  select * into c from datalake_v2.contracheques where id=p_id;
  if not found then return; end if;
  select coalesce(sum(i.valor_centavos) filter(where r.tipo='provento'),0),
         coalesce(sum(i.valor_centavos) filter(where r.tipo='desconto'),0),count(*)
    into p,d,n from datalake_v2.itens_contracheque i
    join datalake_v2.rubricas r on r.id=i.rubrica_id where i.contracheque_id=p_id;
  if n=0 or p<>c.total_proventos_centavos or d<>c.total_descontos_centavos then
    raise exception 'Somas das rubricas divergem do contracheque %',p_id using errcode='23514';
  end if;
  if exists(select 1 from datalake_v2.itens_contracheque i
    join datalake_v2.rubricas r on r.id=i.rubrica_id
    join datalake_v2.vinculos v on v.id=c.vinculo_id
    where i.contracheque_id=p_id and r.empresa_id<>v.empresa_id) then
    raise exception 'Rubrica pertence a outra empresa' using errcode='23514';
  end if;
  if not exists(select 1 from datalake_v2.contracheque_fontes f
     join datalake_v2.arquivo_ocorrencias o on o.id=f.ocorrencia_id
     join datalake_v2.extracoes e on e.id=f.extracao_id
     where f.contracheque_id=p_id and f.principal and e.estado='validada'
       and e.arquivo_id=o.arquivo_id) then
    raise exception 'Folha sem fonte principal validada' using errcode='23514';
  end if;
end $$;
create function datalake_v2.conferir_folha_trigger() returns trigger
language plpgsql set search_path = pg_catalog,datalake_v2 as $$
begin
  if tg_table_name='contracheques' then
    if tg_op<>'DELETE' then perform datalake_v2.conferir_folha(new.id); end if;
  else
    if tg_op<>'DELETE' then perform datalake_v2.conferir_folha(new.contracheque_id); end if;
    if tg_op<>'INSERT' then perform datalake_v2.conferir_folha(old.contracheque_id); end if;
  end if;
  return null;
end $$;
create constraint trigger conferir_cabecalho after insert or update on datalake_v2.contracheques
  deferrable initially deferred for each row execute function datalake_v2.conferir_folha_trigger();
create constraint trigger conferir_itens after insert or update or delete on datalake_v2.itens_contracheque
  deferrable initially deferred for each row execute function datalake_v2.conferir_folha_trigger();
create constraint trigger conferir_fontes after insert or update or delete on datalake_v2.contracheque_fontes
  deferrable initially deferred for each row execute function datalake_v2.conferir_folha_trigger();

-- A identidade do catálogo e do vínculo não pode alterar silenciosamente folhas existentes.
create function datalake_v2.proteger_identidade() returns trigger
language plpgsql set search_path=pg_catalog as $$
begin
  if to_jsonb(new)<>to_jsonb(old) then raise exception 'Identidade imutável; registre nova versão e revise as associações'; end if;
  return new;
end $$;
create trigger proteger_rubrica before update on datalake_v2.rubricas
  for each row execute function datalake_v2.proteger_identidade();
create trigger proteger_vinculo before update on datalake_v2.vinculos
  for each row execute function datalake_v2.proteger_identidade();

create view datalake_v2.vw_lancamentos with (security_invoker=true) as
select c.id contracheque_id,v.pessoa_id,p.nome_original,p.cpf,v.empresa_id,e.nome_original empresa,
  c.competencia,to_char(c.competencia,'MM/YYYY') competencia_exibicao,c.tipo_folha,
  i.id item_id,r.id rubrica_id,r.codigo_original,r.descricao_original,r.tipo,
  i.valor_centavos,i.valor_centavos/100::numeric valor,i.referencia_original,i.pagina,i.ordem
from datalake_v2.contracheques c join datalake_v2.vinculos v on v.id=c.vinculo_id
join datalake_v2.pessoas p on p.id=v.pessoa_id join datalake_v2.empresas e on e.id=v.empresa_id
join datalake_v2.itens_contracheque i on i.contracheque_id=c.id
join datalake_v2.rubricas r on r.id=i.rubrica_id where c.estado='validado';

-- Termos literais vêm do cadastro único de Temas no aplicativo. NULL = todas as rubricas financeiras.
-- Cursor por UUID, contagem calculada antes da paginação. Nenhum join com cópias dos arquivos.
create function datalake_v2.resumo_pessoas(
  p_termos text[] default null, p_empresa uuid default null,
  p_inicio date default null,p_fim date default null,p_apos uuid default null,p_limite integer default 50
) returns table(pessoa_id uuid,nome text,cpf text,empresas text[],meses bigint,
  contracheques bigint,proventos_centavos numeric,descontos_centavos numeric,total_pessoas bigint)
language sql stable set search_path=pg_catalog,datalake_v2 as $$
with rubricas_filtradas as materialized (
  select r.id,r.tipo from datalake_v2.rubricas r
  where r.tipo in ('provento','desconto') and (p_empresa is null or r.empresa_id=p_empresa)
    and (p_termos is null or exists(select 1 from unnest(p_termos) t
      where btrim(t)<>'' and r.descricao_normalizada like
      '%'||replace(replace(replace(datalake_v2.normalizar(t),'\','\\'),'%','\%'),'_','\_')||'%' escape '\'))
), folhas_filtradas as (
  select v.pessoa_id,v.empresa_id,c.id,c.competencia,
    coalesce(sum(i.valor_centavos) filter(where r.tipo='provento'),0) p,
    coalesce(sum(i.valor_centavos) filter(where r.tipo='desconto'),0) d
  from datalake_v2.contracheques c join datalake_v2.vinculos v on v.id=c.vinculo_id
  join datalake_v2.itens_contracheque i on i.contracheque_id=c.id
  join rubricas_filtradas r on r.id=i.rubrica_id
  where c.estado='validado' and (p_inicio is null or c.competencia>=p_inicio)
    and (p_fim is null or c.competencia<=p_fim)
  group by v.pessoa_id,v.empresa_id,c.id,c.competencia
), agregado as (
  select f.pessoa_id,p.nome_original nome,p.cpf,array_agg(distinct e.nome_original order by e.nome_original) empresas,
    count(distinct f.competencia) meses,count(*) contracheques,sum(f.p) proventos_centavos,sum(f.d) descontos_centavos
  from folhas_filtradas f join datalake_v2.pessoas p on p.id=f.pessoa_id
  join datalake_v2.empresas e on e.id=f.empresa_id group by f.pessoa_id,p.nome_original,p.cpf
), contado as (select a.*,count(*) over() total_pessoas from agregado a)
select * from contado where p_apos is null or contado.pessoa_id>p_apos order by pessoa_id
limit least(greatest(coalesce(p_limite,50),1),200)
$$;

do $$ declare t record; begin
  for t in select tablename from pg_catalog.pg_tables where schemaname='datalake_v2' loop
    execute format('alter table datalake_v2.%I enable row level security',t.tablename);
  end loop;
end $$;
revoke all on schema datalake_v2 from public,anon,authenticated;
revoke all on all tables in schema datalake_v2 from public,anon,authenticated;
revoke all on all functions in schema datalake_v2 from public,anon,authenticated;
alter default privileges in schema datalake_v2 revoke all on tables from public,anon,authenticated;
alter default privileges in schema datalake_v2 revoke execute on functions from public,anon,authenticated;
grant usage on schema datalake_v2 to service_role;
grant select,insert,update on all tables in schema datalake_v2 to service_role;
grant execute on all functions in schema datalake_v2 to service_role;
comment on schema datalake_v2 is 'DataLake reconstruído: dados validados, rastreabilidade e pendências; acesso somente pelo backend.';
commit;
