-- =====================================================================
-- Painel Comercial CGLUB — banco (Supabase / Postgres)
-- Schema privado `cglub` (sem GRANT para a API). Acesso só pelas funções
-- public.cglub_* (SECURITY DEFINER), que exigem um token de sessão.
--
-- Segurança:
--  • senhas: bcrypt (pgcrypto crypt/gen_salt('bf', 10)); nunca em texto
--  • sessões: token aleatório de 256 bits; no banco fica só o SHA-256
--  • bloqueio progressivo por usuário (5 erros) e limite de falhas por IP
--    (cf-connecting-ip — x-forwarded-for pode ser forjado)
--  • escopo por perfil aplicado AQUI: o consultor só recebe as linhas do SAP
--    do vendedor vinculado; o supervisor só as dos canais dele
--  • primeiro administrador só com código de instalação de uso único
-- Idempotente: pode ser reaplicado.
-- =====================================================================

create schema if not exists cglub;
revoke all on schema cglub from public, anon, authenticated;

create table if not exists cglub.usuarios (
  id            uuid primary key default extensions.gen_random_uuid(),
  login         text not null unique check (login = lower(btrim(login)) and length(login) between 3 and 120),
  nome          text not null check (length(nome) between 1 and 120),
  perfil        text not null check (perfil in ('admin', 'supervisor', 'consultor')),
  vendedor      text not null default '',
  canais        text[] not null default '{}',
  telefone      text not null default '',
  ativo         boolean not null default true,
  senha_hash    text not null,
  trocar_senha  boolean not null default false,
  falhas        int not null default 0,
  bloqueado_ate timestamptz,
  criado_em     timestamptz not null default now(),
  criado_por    uuid,
  ultimo_acesso timestamptz,
  permissoes    jsonb not null default '{}'::jsonb   -- exceções às regras do perfil
);
alter table cglub.usuarios add column if not exists permissoes jsonb not null default '{}'::jsonb;

create table if not exists cglub.sessoes (
  token_hash bytea primary key,
  usuario_id uuid not null references cglub.usuarios(id) on delete cascade,
  criado_em  timestamptz not null default now(),
  expira_em  timestamptz not null,
  ultimo_uso timestamptz not null default now(),
  ip         text
);
create index if not exists sessoes_usuario_idx on cglub.sessoes(usuario_id);

create table if not exists cglub.falhas_ip (
  ip text not null,
  em timestamptz not null default now()
);
create index if not exists falhas_ip_idx on cglub.falhas_ip(ip, em);

create table if not exists cglub.config (
  chave          text primary key,
  valor          jsonb not null,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid
);

-- Linhas da aba Dados_SAP (colunas A:Y, na ordem original)
create table if not exists cglub.sap (
  id            bigserial primary key,
  mes           text not null check (mes ~ '^\d{4}-\d{2}$'),
  chave         text not null unique,           -- Fatura|Item|Código do Produto
  vendedor_sap  text not null,
  cliente       text not null,
  linha         jsonb not null check (jsonb_typeof(linha) = 'array' and jsonb_array_length(linha) = 25),
  importacao_id bigint
);
create index if not exists sap_mes_idx on cglub.sap(mes);
create index if not exists sap_vend_idx on cglub.sap(vendedor_sap);

create table if not exists cglub.importacoes (
  id       bigserial primary key,
  em       timestamptz not null default now(),
  arquivo  text,
  modo     text,
  linhas   int,
  meses    text[],
  por      uuid,
  por_nome text
);

create table if not exists cglub.clientes (
  codigo              text primary key check (length(codigo) between 1 and 40),
  dados               jsonb not null,
  criado_por          uuid,
  criado_em           timestamptz not null default now(),
  atualizado_por      uuid,
  atualizado_por_nome text,
  atualizado_em       timestamptz not null default now()
);

create table if not exists cglub.visitas (
  id              text primary key check (id ~ '^[A-Za-z0-9_-]{3,40}$'),
  dados           jsonb not null,
  consultor       text not null default '',
  cliente         text not null default '',
  data            date,
  criado_por      uuid,
  criado_por_nome text,
  salvo_em        timestamptz not null default now()
);
create index if not exists visitas_consultor_idx on cglub.visitas(consultor);

create table if not exists cglub.audit (
  id         bigserial primary key,
  em         timestamptz not null default now(),
  usuario_id uuid,
  nome       text,
  acao       text
);

alter table cglub.usuarios    enable row level security;
alter table cglub.sessoes     enable row level security;
alter table cglub.falhas_ip   enable row level security;
alter table cglub.config      enable row level security;
alter table cglub.sap         enable row level security;
alter table cglub.importacoes enable row level security;
alter table cglub.clientes    enable row level security;
alter table cglub.visitas     enable row level security;
alter table cglub.audit       enable row level security;
revoke all on all tables in schema cglub from public, anon, authenticated;
revoke all on all sequences in schema cglub from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Funções internas (não expostas)
-- ---------------------------------------------------------------------
create or replace function cglub.ip() returns text
language sql stable set search_path = '' as $$
  select coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'cf-connecting-ip', 'local');
$$;

create or replace function cglub.senha_erro(p text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p is null or length(p) < 8 then 'A senha precisa ter pelo menos 8 caracteres.'
    when length(p) > 128 then 'Senha longa demais.'
    when p !~ '[A-Za-z]' or p !~ '[0-9]' then 'Use letras e números na senha.'
    else null end;
$$;

create or replace function cglub.hash_senha(p text) returns text
language sql volatile set search_path = '' as $$
  select extensions.crypt(p, extensions.gen_salt('bf', 10));
$$;

-- ---------------------------------------------------------------------
-- Regras de acesso: padrão do perfil (código) < ajuste do perfil (config
-- "regrasPerfis", editável pelo admin) < exceção do usuário (usuarios.permissoes).
--   escopo: proprio (vendedor vinculado) | canais (canais do usuário) | todos
-- O administrador sempre tem tudo (não dá para trancar o sistema).
-- ---------------------------------------------------------------------
create or replace function cglub.regras_padrao() returns jsonb
language sql immutable set search_path = '' as $$
  select '{
    "admin":      {"escopo":"todos",  "ver_valores":true, "ver_ranking_equipe":true,  "ver_analises":true,  "ver_central_gestor":true,  "ver_notas":true,
                   "registrar_visitas":true, "cadastrar_clientes":true, "importar_clientes":true,  "exportar":true,  "importar_sap":true,  "editar_cadastros":true},
    "supervisor": {"escopo":"canais", "ver_valores":true, "ver_ranking_equipe":true,  "ver_analises":true,  "ver_central_gestor":true,  "ver_notas":true,
                   "registrar_visitas":true, "cadastrar_clientes":true, "importar_clientes":true,  "exportar":true,  "importar_sap":false, "editar_cadastros":false},
    "consultor":  {"escopo":"proprio","ver_valores":true, "ver_ranking_equipe":false, "ver_analises":false, "ver_central_gestor":false, "ver_notas":false,
                   "registrar_visitas":true, "cadastrar_clientes":true, "importar_clientes":false, "exportar":false, "importar_sap":false, "editar_cadastros":false}
  }'::jsonb;
$$;

-- Mantém só chaves conhecidas com o tipo certo
create or replace function cglub.regras_validas(p jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
  from jsonb_each(case when jsonb_typeof(p) = 'object' then p else '{}'::jsonb end) e(k, v)
  where (k = 'escopo' and v #>> '{}' in ('proprio', 'canais', 'todos'))
     or (k in ('ver_valores', 'ver_ranking_equipe', 'ver_analises', 'ver_central_gestor', 'ver_notas', 'registrar_visitas',
               'cadastrar_clientes', 'importar_clientes', 'exportar', 'importar_sap', 'editar_cadastros') and jsonb_typeof(v) = 'boolean');
$$;

create or replace function cglub.regras(u cglub.usuarios) returns jsonb
language plpgsql stable set search_path = '' as $$
declare r jsonb;
begin
  if u.perfil = 'admin' then return cglub.regras_padrao() -> 'admin'; end if;
  r := (cglub.regras_padrao() -> u.perfil)
       || cglub.regras_validas((select c.valor -> u.perfil from cglub.config c where c.chave = 'regrasPerfis'))
       || cglub.regras_validas(u.permissoes);
  -- travas: vendedor nunca importa SAP, edita cadastros gerais nem vê a base inteira
  if u.perfil = 'consultor' then
    r := r || '{"importar_sap": false, "editar_cadastros": false}'::jsonb;
    if r ->> 'escopo' = 'todos' then r := r || '{"escopo": "canais"}'::jsonb; end if;
  end if;
  return r;
end $$;

create or replace function cglub.pode(u cglub.usuarios, p_regra text) returns boolean
language sql stable set search_path = '' as $$
  select coalesce((cglub.regras(u) ->> p_regra)::boolean, false);
$$;

create or replace function cglub.exigir(u cglub.usuarios, p_regra text) returns void
language plpgsql stable set search_path = '' as $$
begin
  if not cglub.pode(u, p_regra) then raise exception 'sem_permissao'; end if;
end $$;

-- Escopo efetivo: "canais" sem canais definidos vira "todos" (gestor) ou "proprio" (vendedor)
create or replace function cglub.escopo(u cglub.usuarios) returns text
language sql stable set search_path = '' as $$
  select case
    when e = 'canais' and cardinality(u.canais) = 0 then case when u.perfil = 'consultor' then 'proprio' else 'todos' end
    else e end
  from (select cglub.regras(u) ->> 'escopo' as e) x;
$$;

create or replace function cglub.usuario_json(u cglub.usuarios) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', u.id, 'login', u.login, 'nome', u.nome, 'perfil', u.perfil, 'vendedor', u.vendedor,
    'canais', to_jsonb(u.canais), 'telefone', u.telefone, 'ativo', u.ativo, 'trocarSenha', u.trocar_senha,
    'ultimoAcesso', u.ultimo_acesso, 'criadoEm', u.criado_em,
    'bloqueado', coalesce(u.bloqueado_ate > now(), false),
    'permissoes', u.permissoes, 'regras', cglub.regras(u), 'escopo', cglub.escopo(u));
$$;

create or replace function cglub.registrar(p_uid uuid, p_nome text, p_acao text) returns void
language sql volatile set search_path = '' as $$
  insert into cglub.audit(usuario_id, nome, acao) values (p_uid, p_nome, left(coalesce(p_acao, ''), 300));
$$;

create or replace function cglub.criar_sessao(p_uid uuid, p_lembrar boolean) returns text
language plpgsql volatile set search_path = '' as $$
declare v_tok text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  insert into cglub.sessoes(token_hash, usuario_id, expira_em, ip)
  values (extensions.digest(v_tok, 'sha256'), p_uid,
          now() + case when p_lembrar then interval '30 days' else interval '12 hours' end, cglub.ip());
  return v_tok;
end $$;

-- Valida o token e devolve o usuário (ou erro "nao_autenticado")
create or replace function cglub.sessao(p_token text) returns cglub.usuarios
language plpgsql volatile set search_path = '' as $$
declare s cglub.sessoes; u cglub.usuarios;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'nao_autenticado';
  end if;
  select * into s from cglub.sessoes where token_hash = extensions.digest(p_token, 'sha256');
  if not found or s.expira_em < now() or s.ultimo_uso < now() - interval '7 days' then
    raise exception 'nao_autenticado';
  end if;
  select * into u from cglub.usuarios where id = s.usuario_id;
  if not found or not u.ativo then
    raise exception 'nao_autenticado';
  end if;
  if s.ultimo_uso < now() - interval '5 minutes' then
    update cglub.sessoes set ultimo_uso = now() where token_hash = s.token_hash;
  end if;
  return u;
end $$;

create or replace function cglub.exigir_admin(u cglub.usuarios) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if u.perfil <> 'admin' then raise exception 'sem_permissao'; end if;
end $$;

create or replace function cglub.ve_tudo(u cglub.usuarios) returns boolean
language sql stable set search_path = '' as $$
  select cglub.escopo(u) = 'todos';
$$;

-- Filtra uma tabela de metas [[canal, colaborador, vol, cli, mix], ...] pelo escopo
create or replace function cglub.filtra_metas(p jsonb, u cglub.usuarios) returns jsonb
language sql stable set search_path = '' as $$
  select case when x.e = 'todos' then coalesce(p, '[]'::jsonb) else
    coalesce((select jsonb_agg(m) from jsonb_array_elements(coalesce(p, '[]'::jsonb)) m
      where (x.e = 'proprio' and btrim(m ->> 1) = btrim(u.vendedor))
         or (x.e = 'canais' and ((m ->> 0) = any(u.canais) or btrim(m ->> 1) = btrim(u.vendedor)))), '[]'::jsonb) end
  from (select cglub.escopo(u) as e) x;
$$;

-- Nomes de colaborador (como nas Metas) visíveis para o usuário
create or replace function cglub.nomes_visiveis(u cglub.usuarios) returns text[]
language sql stable set search_path = '' as $$
  select case when cglub.escopo(u) = 'proprio' then array[btrim(u.vendedor)] else array[btrim(u.vendedor)] ||
    coalesce(array(
      select distinct btrim(e ->> 1)
      from cglub.config c
      cross join lateral (
        select x from jsonb_array_elements(case when c.chave = 'metasVigentes' then c.valor else '[]'::jsonb end) x
        union all
        select x from jsonb_each(case when c.chave = 'metasPorMes' then c.valor else '{}'::jsonb end) m,
                      jsonb_array_elements(m.value) x
        union all
        select jsonb_build_array(d ->> 2, d ->> 1) from jsonb_array_elements(case when c.chave = 'deParaVendedores' then c.valor else '[]'::jsonb end) d
      ) t(e)
      where c.chave in ('metasVigentes', 'metasPorMes', 'deParaVendedores') and (e ->> 0) = any(u.canais)), '{}') end;
$$;

-- Nomes como aparecem no SAP (Nome Vendedor) visíveis para o usuário
create or replace function cglub.nomes_sap_visiveis(u cglub.usuarios) returns text[]
language sql stable set search_path = '' as $$
  select coalesce(array(
    select distinct btrim(d ->> 0)
    from cglub.config c, jsonb_array_elements(c.valor) d
    where c.chave = 'deParaVendedores'
      and (btrim(d ->> 1) = btrim(u.vendedor)
        or (cglub.escopo(u) = 'canais' and (d ->> 2) = any(u.canais)))), '{}');
$$;

create or replace function cglub.limpa_texto(p jsonb, p_campos text[], p_max int) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(k, left(btrim(p ->> k), p_max)), '{}'::jsonb)
  from unnest(p_campos) k
  where p ? k and jsonb_typeof(p -> k) in ('string', 'number') and btrim(p ->> k) <> '';
$$;

-- ---------------------------------------------------------------------
-- API pública (chamada pelo app via /rest/v1/rpc/...)
-- ---------------------------------------------------------------------

-- Instalação: cria o primeiro administrador com o código de uso único
create or replace function public.cglub_instalar(p_codigo text, p_nome text, p_login text, p_senha text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_cfg jsonb; v_erro text; u cglub.usuarios;
begin
  if exists (select 1 from cglub.usuarios) then
    return jsonb_build_object('ok', false, 'erro', 'O painel já foi instalado. Entre com seu login.');
  end if;
  select valor into v_cfg from cglub.config where chave = 'instalacao';
  if v_cfg is null or (v_cfg ->> 'expira')::timestamptz < now()
     or v_cfg ->> 'hash' <> encode(extensions.digest(coalesce(btrim(p_codigo), ''), 'sha256'), 'hex') then
    insert into cglub.falhas_ip(ip) values (cglub.ip());
    return jsonb_build_object('ok', false, 'erro', 'Código de instalação inválido ou expirado.');
  end if;
  v_erro := cglub.senha_erro(p_senha);
  if v_erro is not null then return jsonb_build_object('ok', false, 'erro', v_erro); end if;
  if coalesce(btrim(p_nome), '') = '' or coalesce(btrim(p_login), '') = '' then
    return jsonb_build_object('ok', false, 'erro', 'Informe nome e login.');
  end if;
  insert into cglub.usuarios(login, nome, perfil, senha_hash)
  values (lower(btrim(p_login)), btrim(p_nome), 'admin', cglub.hash_senha(p_senha))
  returning * into u;
  delete from cglub.config where chave = 'instalacao';
  perform cglub.registrar(u.id, u.nome, 'Instalou o painel (primeiro administrador)');
  return jsonb_build_object('ok', true, 'token', cglub.criar_sessao(u.id, false), 'usuario', cglub.usuario_json(u));
end $$;

create or replace function public.cglub_status()
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object('instalado', exists (select 1 from cglub.usuarios));
$$;

create or replace function public.cglub_entrar(p_login text, p_senha text, p_lembrar boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u cglub.usuarios; v_ip text := cglub.ip(); v_espera int;
begin
  delete from cglub.falhas_ip where em < now() - interval '1 day';
  if (select count(*) from cglub.falhas_ip where ip = v_ip and em > now() - interval '15 minutes') >= 30 then
    return jsonb_build_object('ok', false, 'erro', 'Muitas tentativas erradas a partir desta rede. Aguarde 15 minutos.');
  end if;
  select * into u from cglub.usuarios where login = lower(btrim(coalesce(p_login, '')));
  if not found or not u.ativo then
    insert into cglub.falhas_ip(ip) values (v_ip);
    perform pg_sleep(0.25);
    return jsonb_build_object('ok', false, 'erro', 'Login ou senha incorretos.');
  end if;
  if u.bloqueado_ate is not null and u.bloqueado_ate > now() then
    v_espera := ceil(extract(epoch from u.bloqueado_ate - now()));
    return jsonb_build_object('ok', false, 'erro', format('Muitas tentativas. Tente de novo em %s s.', v_espera));
  end if;
  if extensions.crypt(coalesce(p_senha, ''), u.senha_hash) <> u.senha_hash then
    insert into cglub.falhas_ip(ip) values (v_ip);
    update cglub.usuarios set falhas = falhas + 1,
      bloqueado_ate = case when falhas + 1 >= 5 then now() + make_interval(mins => least(15, falhas + 1 - 4)) else bloqueado_ate end
    where id = u.id;
    return jsonb_build_object('ok', false, 'erro', 'Login ou senha incorretos.');
  end if;
  update cglub.usuarios set falhas = 0, bloqueado_ate = null, ultimo_acesso = now() where id = u.id returning * into u;
  delete from cglub.sessoes where expira_em < now() or ultimo_uso < now() - interval '7 days';
  perform cglub.registrar(u.id, u.nome, 'Entrou');
  return jsonb_build_object('ok', true, 'token', cglub.criar_sessao(u.id, coalesce(p_lembrar, false)), 'usuario', cglub.usuario_json(u));
end $$;

create or replace function public.cglub_sair(p_token text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_token ~ '^[0-9a-f]{64}$' then
    delete from cglub.sessoes where token_hash = extensions.digest(p_token, 'sha256');
  end if;
end $$;

create or replace function public.cglub_trocar_senha(p_token text, p_atual text, p_nova text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u cglub.usuarios := cglub.sessao(p_token); v_erro text;
begin
  if extensions.crypt(coalesce(p_atual, ''), u.senha_hash) <> u.senha_hash then
    return jsonb_build_object('ok', false, 'erro', 'Senha atual incorreta.');
  end if;
  v_erro := cglub.senha_erro(p_nova);
  if v_erro is not null then return jsonb_build_object('ok', false, 'erro', v_erro); end if;
  if p_nova = p_atual then return jsonb_build_object('ok', false, 'erro', 'A nova senha precisa ser diferente da atual.'); end if;
  update cglub.usuarios set senha_hash = cglub.hash_senha(p_nova), trocar_senha = false where id = u.id returning * into u;
  -- encerra as outras sessões do usuário
  delete from cglub.sessoes where usuario_id = u.id and token_hash <> extensions.digest(p_token, 'sha256');
  perform cglub.registrar(u.id, u.nome, 'Trocou a senha');
  return jsonb_build_object('ok', true, 'usuario', cglub.usuario_json(u));
end $$;

create or replace function public.cglub_perfil_salvar(p_token text, p_nome text, p_telefone text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u cglub.usuarios := cglub.sessao(p_token);
begin
  update cglub.usuarios set nome = coalesce(nullif(left(btrim(p_nome), 120), ''), nome), telefone = left(coalesce(btrim(p_telefone), ''), 40)
  where id = u.id returning * into u;
  return cglub.usuario_json(u);
end $$;

-- Carrega tudo o que o usuário pode ver
create or replace function public.cglub_carregar(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  u cglub.usuarios := cglub.sessao(p_token);
  v_regras jsonb := cglub.regras(u);
  v_escopo text := cglub.escopo(u);
  v_todos boolean := v_escopo = 'todos';
  v_valores boolean := coalesce((v_regras ->> 'ver_valores')::boolean, false);
  v_sap_nomes text[]; v_nomes text[];
  v_sap jsonb; v_cfg jsonb; v_cli jsonb; v_vis jsonb; v_imp jsonb; v_rank jsonb; v_clientes_sap text[];
begin
  if not v_todos then
    v_sap_nomes := cglub.nomes_sap_visiveis(u);
    v_nomes := cglub.nomes_visiveis(u);
  end if;

  -- linhas do SAP no escopo; sem "ver_valores" as colunas de R$ (N, O, P) vão vazias
  select coalesce(jsonb_agg(case when v_valores then s.linha
           else jsonb_set(jsonb_set(jsonb_set(s.linha, '{13}', 'null'), '{14}', 'null'), '{15}', 'null') end order by s.id), '[]'::jsonb),
         coalesce(array_agg(distinct s.cliente), '{}')
    into v_sap, v_clientes_sap
  from cglub.sap s where v_todos or s.vendedor_sap = any(v_sap_nomes);

  -- ranking da equipe (só % da meta de volume, sem valores), para quem tem a regra e não vê a base toda
  if not v_todos and coalesce((v_regras ->> 'ver_ranking_equipe')::boolean, false) then
    with cfg as (
      select coalesce((select valor from cglub.config where chave = 'metasPorMes'), '{}'::jsonb) as por_mes,
             coalesce((select valor from cglub.config where chave = 'metasVigentes'), '[]'::jsonb) as vigentes,
             coalesce((select valor from cglub.config where chave = 'deParaVendedores'), '[]'::jsonb) as depara,
             coalesce((select valor from cglub.config where chave = 'corrigirVolume'), 'false'::jsonb) = 'true'::jsonb as corrige
    ), dp as (
      select btrim(d ->> 0) as sap, btrim(d ->> 1) as nome from cfg, jsonb_array_elements(cfg.depara) d
    ), vol as (
      select s.mes, dp.nome,
             sum(case when coalesce(nullif(s.linha ->> 11, '')::numeric, 0) > 0 then (s.linha ->> 11)::numeric
                      when cfg.corrige then coalesce(nullif(s.linha ->> 7, '')::numeric, 0) * coalesce(nullif(s.linha ->> 9, '')::numeric, 0)
                      else 0 end) as v
      from cglub.sap s join dp on dp.sap = s.vendedor_sap cross join cfg
      where upper(coalesce(s.linha ->> 21, '')) not like '%SIMPLES REMESSA%'
      group by 1, 2
    ), mt as (
      select m.mes, btrim(e ->> 1) as nome, e ->> 0 as canal, nullif(e ->> 2, '')::numeric as meta
      from (select distinct mes from cglub.sap) m cross join cfg
      cross join lateral jsonb_array_elements(coalesce(cfg.por_mes -> m.mes, cfg.vigentes)) e
      where coalesce(nullif(e ->> 2, '')::numeric, 0) > 0
    )
    select coalesce(jsonb_agg(jsonb_build_object('mes', mt.mes, 'nome', mt.nome, 'canal', mt.canal,
             'pct', round(coalesce(vol.v, 0) / mt.meta, 4), 'eu', mt.nome = btrim(u.vendedor))
             order by mt.mes, coalesce(vol.v, 0) / mt.meta desc), '[]'::jsonb)
      into v_rank
    from mt left join vol on vol.mes = mt.mes and vol.nome = mt.nome
    -- compara com os colegas do mesmo canal (metas de canais diferentes não são comparáveis)
    where mt.canal = any(u.canais) or mt.canal in (select m2.canal from mt m2 where m2.nome = btrim(u.vendedor));
  end if;

  select coalesce(jsonb_object_agg(c.chave,
    case c.chave
      when 'metasVigentes' then cglub.filtra_metas(c.valor, u)
      when 'metasPorMes' then (select coalesce(jsonb_object_agg(m.key, cglub.filtra_metas(m.value, u)), '{}'::jsonb) from jsonb_each(c.valor) m)
      when 'deParaVendedores' then case when v_todos then c.valor else
        (select coalesce(jsonb_agg(d), '[]'::jsonb) from jsonb_array_elements(c.valor) d where btrim(d ->> 0) = any(v_sap_nomes)) end
      when 'deParaRegiao' then case when v_todos then c.valor else
        (select coalesce(jsonb_agg(d), '[]'::jsonb) from jsonb_array_elements(c.valor) d where btrim(d ->> 0) = any(v_nomes)) end
      else c.valor end), '{}'::jsonb)
    into v_cfg
  from cglub.config c
  where c.chave <> 'instalacao' and (c.chave <> 'metasSupervisor' or v_escopo <> 'proprio')
    and (c.chave <> 'regrasPerfis' or u.perfil = 'admin');

  select coalesce(jsonb_object_agg(c.codigo, c.dados || jsonb_build_object('codigo', c.codigo, 'criadoPor', c.criado_por,
           'atualizadoEm', c.atualizado_em, 'atualizadoPorNome', c.atualizado_por_nome)), '{}'::jsonb)
    into v_cli
  from cglub.clientes c
  where v_escopo <> 'proprio' or c.codigo = any(v_clientes_sap) or btrim(c.dados ->> 'vendedor') = btrim(u.vendedor) or c.criado_por = u.id;

  select coalesce(jsonb_agg(v.dados || jsonb_build_object('id', v.id, 'criadoPor', v.criado_por, 'criadoPorNome', v.criado_por_nome, 'salvoEm', v.salvo_em) order by v.data desc nulls last), '[]'::jsonb)
    into v_vis
  from cglub.visitas v
  where v_todos or v.criado_por = u.id or btrim(v.consultor) = any(v_nomes);

  if u.perfil = 'admin' then
    select coalesce(jsonb_agg(jsonb_build_object('t', i.em, 'arquivo', i.arquivo, 'modo', i.modo, 'linhas', i.linhas, 'meses', i.meses, 'por', i.por_nome) order by i.id desc), '[]'::jsonb)
      into v_imp from (select * from cglub.importacoes order by id desc limit 50) i;
  end if;

  return jsonb_build_object('usuario', cglub.usuario_json(u), 'sap', v_sap, 'config', v_cfg,
    'clientes', v_cli, 'visitas', v_vis, 'importacoes', coalesce(v_imp, '[]'::jsonb),
    'ranking', coalesce(v_rank, '[]'::jsonb), 'servidorEm', now());
end $$;

-- Importação SAP (somente administrador)
create or replace function public.cglub_importar_sap(p_token text, p_linhas jsonb, p_modo text, p_arquivo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u cglub.usuarios := cglub.sessao(p_token); v_meses text[]; v_imp bigint; v_ins int; v_total int;
begin
  perform cglub.exigir(u, 'importar_sap');
  if p_modo not in ('meses', 'acrescentar', 'substituir') then raise exception 'modo_invalido'; end if;
  if jsonb_typeof(p_linhas) <> 'array' then raise exception 'linhas_invalidas'; end if;
  v_total := jsonb_array_length(p_linhas);
  if v_total = 0 or v_total > 30000 then raise exception 'quantidade_invalida'; end if;
  if exists (select 1 from jsonb_array_elements(p_linhas) e
             where jsonb_typeof(e) <> 'array' or jsonb_array_length(e) <> 25 or coalesce(e ->> 2, '') !~ '^\d{4}-\d{2}-\d{2}$'
                or coalesce(e ->> 3, '') = '' or coalesce(e ->> 5, '') = '' or coalesce(e ->> 1, '') = '') then
    raise exception 'linha_invalida';
  end if;
  select array_agg(distinct left(e ->> 2, 7)) into v_meses from jsonb_array_elements(p_linhas) e;

  insert into cglub.importacoes(arquivo, modo, linhas, meses, por, por_nome)
  values (left(coalesce(p_arquivo, ''), 200), p_modo, v_total, v_meses, u.id, u.nome) returning id into v_imp;

  if p_modo = 'substituir' then delete from cglub.sap;
  elsif p_modo = 'meses' then delete from cglub.sap where mes = any(v_meses);
  end if;

  insert into cglub.sap(mes, chave, vendedor_sap, cliente, linha, importacao_id)
  select left(e ->> 2, 7),
         concat_ws('|', e ->> 3, coalesce(e ->> 4, ''), e ->> 5),
         coalesce(nullif(btrim(e ->> 19), ''), 'Não encontrado'),
         e ->> 1, e, v_imp
  from jsonb_array_elements(p_linhas) e
  on conflict (chave) do nothing;
  get diagnostics v_ins = row_count;

  perform cglub.registrar(u.id, u.nome, format('Importou SAP %s (%s linhas, %s inseridas, modo %s)', p_arquivo, v_total, v_ins, p_modo));
  return jsonb_build_object('ok', true, 'inseridas', v_ins, 'ignoradas', v_total - v_ins, 'meses', to_jsonb(v_meses));
end $$;

-- Cadastros (metas, de-para, região, premium, feriados, logo…) — somente administrador
create or replace function public.cglub_config_salvar(p_token text, p_chave text, p_valor jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u cglub.usuarios := cglub.sessao(p_token);
begin
  if p_chave not in ('metasPorMes', 'metasVigentes', 'metasSupervisor', 'deParaVendedores', 'deParaRegiao',
                     'premiumOverride', 'corrigirVolume', 'feriados', 'logo', 'classificacaoPlanilha', 'regrasPerfis') then
    raise exception 'chave_invalida';
  end if;
  if p_chave in ('regrasPerfis', 'logo') then perform cglub.exigir_admin(u);
  else perform cglub.exigir(u, 'editar_cadastros'); end if;
  if p_chave = 'regrasPerfis' then
    p_valor := jsonb_build_object('supervisor', cglub.regras_validas(p_valor -> 'supervisor'),
                                  'consultor', cglub.regras_validas(p_valor -> 'consultor'));
  end if;
  if pg_column_size(p_valor) > 1200000 then raise exception 'valor_grande_demais'; end if;
  if p_valor is null or p_valor = 'null'::jsonb then
    delete from cglub.config where chave = p_chave;
  else
    insert into cglub.config(chave, valor, atualizado_por) values (p_chave, p_valor, u.id)
    on conflict (chave) do update set valor = excluded.valor, atualizado_em = now(), atualizado_por = excluded.atualizado_por;
  end if;
  perform cglub.registrar(u.id, u.nome, 'Alterou cadastro: ' || p_chave);
  return jsonb_build_object('ok', true);
end $$;

-- Clientes
create or replace function cglub.pode_editar_cliente(u cglub.usuarios, p_codigo text) returns boolean
language sql stable set search_path = '' as $$
  select cglub.escopo(u) <> 'proprio'
    or not exists (select 1 from cglub.clientes c where c.codigo = p_codigo)
    or exists (select 1 from cglub.clientes c where c.codigo = p_codigo and (c.criado_por = u.id or btrim(c.dados ->> 'vendedor') = btrim(u.vendedor)))
    or exists (select 1 from cglub.sap s where s.cliente = p_codigo and s.vendedor_sap = any(cglub.nomes_sap_visiveis(u)));
$$;

create or replace function cglub.salvar_cliente(u cglub.usuarios, p jsonb, p_origem text) returns text
language plpgsql volatile set search_path = '' as $$
declare v_cod text := left(btrim(coalesce(p ->> 'codigo', '')), 40); v_dados jsonb;
begin
  if v_cod = '' then raise exception 'cliente_sem_codigo'; end if;
  if not cglub.pode_editar_cliente(u, v_cod) then raise exception 'sem_permissao'; end if;
  v_dados := cglub.limpa_texto(p, array['razao', 'fantasia', 'cnpj', 'cidade', 'uf', 'segmento', 'contato', 'telefone', 'email', 'vendedor', 'obs', 'origem'], 300);
  if cglub.escopo(u) = 'proprio' and coalesce(v_dados ->> 'vendedor', '') = '' then
    v_dados := v_dados || jsonb_build_object('vendedor', u.vendedor);
  end if;
  insert into cglub.clientes(codigo, dados, criado_por, atualizado_por, atualizado_por_nome)
  values (v_cod, v_dados, u.id, u.id, u.nome)
  on conflict (codigo) do update set
    dados = case when p_origem = 'importacao' then cglub.clientes.dados || excluded.dados else excluded.dados end,
    atualizado_por = excluded.atualizado_por, atualizado_por_nome = excluded.atualizado_por_nome, atualizado_em = now();
  return v_cod;
end $$;

create or replace function public.cglub_cliente_salvar(p_token text, p_cliente jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u cglub.usuarios := cglub.sessao(p_token); v_cod text;
begin
  perform cglub.exigir(u, 'cadastrar_clientes');
  v_cod := cglub.salvar_cliente(u, p_cliente, 'form');
  perform cglub.registrar(u.id, u.nome, 'Salvou cliente ' || v_cod);
  return (select c.dados || jsonb_build_object('codigo', c.codigo, 'criadoPor', c.criado_por, 'atualizadoEm', c.atualizado_em, 'atualizadoPorNome', c.atualizado_por_nome)
          from cglub.clientes c where c.codigo = v_cod);
end $$;

create or replace function public.cglub_clientes_importar(p_token text, p_lista jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u cglub.usuarios := cglub.sessao(p_token); e jsonb; n int := 0;
begin
  perform cglub.exigir(u, 'importar_clientes');
  if jsonb_typeof(p_lista) <> 'array' or jsonb_array_length(p_lista) > 20000 then raise exception 'lista_invalida'; end if;
  for e in select * from jsonb_array_elements(p_lista) loop
    perform cglub.salvar_cliente(u, e, 'importacao'); n := n + 1;
  end loop;
  perform cglub.registrar(u.id, u.nome, format('Importou %s clientes', n));
  return jsonb_build_object('ok', true, 'clientes', n);
end $$;

create or replace function public.cglub_cliente_excluir(p_token text, p_codigo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u cglub.usuarios := cglub.sessao(p_token);
begin
  perform cglub.exigir_admin(u);
  delete from cglub.clientes where codigo = p_codigo;
  perform cglub.registrar(u.id, u.nome, 'Excluiu cliente ' || p_codigo);
  return jsonb_build_object('ok', true);
end $$;

-- Visitas 5Q3A
create or replace function public.cglub_visita_salvar(p_token text, p_visita jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u cglub.usuarios := cglub.sessao(p_token); v_id text := p_visita ->> 'id'; v_ant cglub.visitas; v_dados jsonb; v_cons text;
begin
  perform cglub.exigir(u, 'registrar_visitas');
  if v_id is null or v_id !~ '^[A-Za-z0-9_-]{3,40}$' then raise exception 'visita_sem_id'; end if;
  if pg_column_size(p_visita) > 65000 then raise exception 'visita_grande_demais'; end if;
  select * into v_ant from cglub.visitas where id = v_id;
  if found and v_ant.criado_por is distinct from u.id and u.perfil <> 'admin' then raise exception 'sem_permissao'; end if;
  v_cons := left(btrim(coalesce(p_visita ->> 'consultor', '')), 120);
  if u.perfil = 'consultor' then v_cons := u.vendedor; end if;
  v_dados := (p_visita - 'id' - 'criadoPor' - 'criadoPorNome' - 'salvoEm') || jsonb_build_object('consultor', v_cons);
  insert into cglub.visitas(id, dados, consultor, cliente, data, criado_por, criado_por_nome)
  values (v_id, v_dados, v_cons, left(coalesce(p_visita ->> 'cliente', ''), 40),
          case when p_visita ->> 'data' ~ '^\d{4}-\d{2}-\d{2}$' then (p_visita ->> 'data')::date end, u.id, u.nome)
  on conflict (id) do update set dados = excluded.dados, consultor = excluded.consultor, cliente = excluded.cliente,
    data = excluded.data, salvo_em = now();
  perform cglub.registrar(u.id, u.nome, 'Registrou visita: cliente ' || coalesce(p_visita ->> 'cliente', ''));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.cglub_visita_retorno(p_token text, p_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u cglub.usuarios := cglub.sessao(p_token);
begin
  update cglub.visitas set dados = dados || '{"retornoFeito": true}'::jsonb
  where id = p_id and (cglub.ve_tudo(u) or criado_por = u.id or btrim(consultor) = any(cglub.nomes_visiveis(u)));
  return jsonb_build_object('ok', found);
end $$;

create or replace function public.cglub_visita_excluir(p_token text, p_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u cglub.usuarios := cglub.sessao(p_token);
begin
  delete from cglub.visitas where id = p_id and (u.perfil = 'admin' or criado_por = u.id);
  if not found then raise exception 'sem_permissao'; end if;
  perform cglub.registrar(u.id, u.nome, 'Excluiu visita ' || p_id);
  return jsonb_build_object('ok', true);
end $$;

-- Usuários (somente administrador)
create or replace function public.cglub_usuarios(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u cglub.usuarios := cglub.sessao(p_token);
begin
  perform cglub.exigir_admin(u);
  return jsonb_build_object(
    'usuarios', (select coalesce(jsonb_agg(cglub.usuario_json(x) order by x.nome), '[]'::jsonb) from cglub.usuarios x),
    'atividade', (select coalesce(jsonb_agg(jsonb_build_object('t', a.em, 'nome', a.nome, 'acao', a.acao) order by a.id desc), '[]'::jsonb)
                  from (select * from cglub.audit order by id desc limit 80) a));
end $$;

create or replace function public.cglub_usuario_salvar(p_token text, p_dados jsonb, p_senha_temp text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u cglub.usuarios := cglub.sessao(p_token); v cglub.usuarios; v_id uuid; v_perfil text; v_erro text; v_canais text[];
begin
  perform cglub.exigir_admin(u);
  v_perfil := coalesce(p_dados ->> 'perfil', 'consultor');
  if v_perfil not in ('admin', 'supervisor', 'consultor') then raise exception 'perfil_invalido'; end if;
  if v_perfil = 'consultor' and coalesce(btrim(p_dados ->> 'vendedor'), '') = '' then
    return jsonb_build_object('ok', false, 'erro', 'Consultor precisa estar vinculado a um vendedor das Metas.');
  end if;
  v_canais := coalesce(array(select left(jsonb_array_elements_text(coalesce(p_dados -> 'canais', '[]'::jsonb)), 80)), '{}');
  v_id := nullif(p_dados ->> 'id', '')::uuid;
  if v_id is null then
    v_erro := cglub.senha_erro(p_senha_temp);
    if v_erro is not null then return jsonb_build_object('ok', false, 'erro', v_erro); end if;
    if coalesce(btrim(p_dados ->> 'login'), '') = '' or coalesce(btrim(p_dados ->> 'nome'), '') = '' then
      return jsonb_build_object('ok', false, 'erro', 'Informe nome e login.');
    end if;
    if exists (select 1 from cglub.usuarios where login = lower(btrim(p_dados ->> 'login'))) then
      return jsonb_build_object('ok', false, 'erro', 'Já existe um usuário com esse login.');
    end if;
    insert into cglub.usuarios(login, nome, perfil, vendedor, canais, telefone, senha_hash, trocar_senha, criado_por, permissoes)
    values (lower(btrim(p_dados ->> 'login')), left(btrim(p_dados ->> 'nome'), 120), v_perfil, left(coalesce(btrim(p_dados ->> 'vendedor'), ''), 120),
            v_canais, left(coalesce(btrim(p_dados ->> 'telefone'), ''), 40), cglub.hash_senha(p_senha_temp), true, u.id,
            cglub.regras_validas(p_dados -> 'permissoes'))
    returning * into v;
    perform cglub.registrar(u.id, u.nome, format('Criou usuário %s (%s)', v.login, v.perfil));
  else
    select * into v from cglub.usuarios where id = v_id;
    if not found then raise exception 'usuario_inexistente'; end if;
    if v.id = u.id and (v_perfil <> 'admin' or coalesce((p_dados ->> 'ativo')::boolean, true) = false) then
      return jsonb_build_object('ok', false, 'erro', 'Você não pode tirar o seu próprio acesso de administrador.');
    end if;
    update cglub.usuarios set
      nome = coalesce(nullif(left(btrim(p_dados ->> 'nome'), 120), ''), nome),
      perfil = v_perfil, vendedor = left(coalesce(btrim(p_dados ->> 'vendedor'), ''), 120), canais = v_canais,
      telefone = left(coalesce(btrim(p_dados ->> 'telefone'), ''), 40),
      ativo = coalesce((p_dados ->> 'ativo')::boolean, ativo),
      permissoes = case when p_dados ? 'permissoes' then cglub.regras_validas(p_dados -> 'permissoes') else permissoes end
    where id = v_id returning * into v;
    if not v.ativo then delete from cglub.sessoes where usuario_id = v.id; end if;
    perform cglub.registrar(u.id, u.nome, 'Atualizou usuário ' || v.login);
  end if;
  return jsonb_build_object('ok', true, 'usuario', cglub.usuario_json(v));
end $$;

create or replace function public.cglub_usuario_redefinir(p_token text, p_id uuid, p_senha_temp text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u cglub.usuarios := cglub.sessao(p_token); v_erro text; v cglub.usuarios;
begin
  perform cglub.exigir_admin(u);
  v_erro := cglub.senha_erro(p_senha_temp);
  if v_erro is not null then return jsonb_build_object('ok', false, 'erro', v_erro); end if;
  update cglub.usuarios set senha_hash = cglub.hash_senha(p_senha_temp), trocar_senha = true, falhas = 0, bloqueado_ate = null
  where id = p_id returning * into v;
  if not found then raise exception 'usuario_inexistente'; end if;
  delete from cglub.sessoes where usuario_id = p_id;
  perform cglub.registrar(u.id, u.nome, 'Redefiniu a senha de ' || v.login);
  return jsonb_build_object('ok', true);
end $$;

-- Senha definitiva no primeiro acesso (sem pedir a temporária de novo)
create or replace function public.cglub_definir_senha(p_token text, p_nova text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u cglub.usuarios := cglub.sessao(p_token); v_erro text;
begin
  if not u.trocar_senha then raise exception 'sem_permissao'; end if;
  v_erro := cglub.senha_erro(p_nova);
  if v_erro is not null then return jsonb_build_object('ok', false, 'erro', v_erro); end if;
  if extensions.crypt(p_nova, u.senha_hash) = u.senha_hash then
    return jsonb_build_object('ok', false, 'erro', 'Escolha uma senha diferente da temporária.');
  end if;
  update cglub.usuarios set senha_hash = cglub.hash_senha(p_nova), trocar_senha = false where id = u.id returning * into u;
  perform cglub.registrar(u.id, u.nome, 'Definiu a senha no primeiro acesso');
  return jsonb_build_object('ok', true, 'usuario', cglub.usuario_json(u));
end $$;

create or replace function public.cglub_registrar(p_token text, p_acao text)
returns void language plpgsql security definer set search_path = '' as $$
declare u cglub.usuarios := cglub.sessao(p_token);
begin
  perform cglub.registrar(u.id, u.nome, p_acao);
end $$;

-- Permissões: só as funções da API são executáveis pelo app
revoke all on all functions in schema cglub from public, anon, authenticated;
do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'cglub\_%' loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;
