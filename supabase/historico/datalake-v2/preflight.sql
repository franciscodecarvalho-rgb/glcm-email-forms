select current_database() as banco, current_user as usuario,
       current_setting('server_version') as versao;
select nspname from pg_namespace where nspname in ('datalake_v2', 'public', 'extensions');
select table_schema, table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name in ('funcionarios', 'empresas', 'contracheques', 'itens_contracheque')
order by table_name, ordinal_position;
select e.extname, n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace
where e.extname in ('pg_trgm', 'pgcrypto');
select rolname, rolbypassrls from pg_roles where rolname in ('anon', 'authenticated', 'service_role');
