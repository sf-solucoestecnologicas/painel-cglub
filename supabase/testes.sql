-- Testes do schema cglub. Rode com:  node tools/sql.js supabase/testes.sql --testar
-- Tudo acontece dentro de uma transação desfeita no final (nada fica no banco).
do $$
declare
  r jsonb; t_admin text; t_cons text; t_sup text; t_x text;
  id_cons uuid; id_sup uuid; n int; ok boolean;
  falhou int := 0;
  procedure_ok text;
begin
  -- ambiente limpo dentro da transação
  delete from cglub.sessoes; delete from cglub.usuarios; delete from cglub.sap; delete from cglub.config;
  delete from cglub.clientes; delete from cglub.visitas; delete from cglub.falhas_ip;

  -- 1. instalação exige código válido
  insert into cglub.config(chave, valor) values ('instalacao', jsonb_build_object('hash', encode(extensions.digest('CODIGO-TESTE-123', 'sha256'), 'hex'), 'expira', now() + interval '1 day'));
  r := public.cglub_instalar('errado', 'Admin', 'admin@teste', 'Senha1234');
  if (r ->> 'ok')::boolean then raise exception 'T1: instalou com código errado'; end if;
  r := public.cglub_instalar('CODIGO-TESTE-123', 'Admin Teste', 'Admin@Teste', 'Senha1234');
  if not (r ->> 'ok')::boolean then raise exception 'T1: não instalou: %', r; end if;
  t_admin := r ->> 'token';
  if (r -> 'usuario' ->> 'login') <> 'admin@teste' then raise exception 'T1: login não normalizado'; end if;
  r := public.cglub_instalar('CODIGO-TESTE-123', 'Outro', 'outro@teste', 'Senha1234');
  if (r ->> 'ok')::boolean then raise exception 'T1: instalou duas vezes'; end if;
  raise notice 'ok 1 instalação';

  -- dados de exemplo: 2 vendedores em canais diferentes + remessa
  perform public.cglub_config_salvar(t_admin, 'deParaVendedores', '[["Ana SAP","Ana","Varejo Postos","Exata",""],["Beto SAP","Beto","Extra Rede","Exata",""],["Caio SAP","Caio","Varejo Postos","Exata",""]]');
  perform public.cglub_config_salvar(t_admin, 'metasVigentes', '[["Varejo Postos","Ana",1000,10,0.1],["Extra Rede","Beto",2000,10,0.1],["Varejo Postos","Caio",500,5,0.1]]');
  r := public.cglub_importar_sap(t_admin, '[
    ["CG01","111","2026-09-02",9001,10,"10000095","OLEO A",5,"BBN",20,"L",100,"L",900,100,1000,"BRL","CG01",1,"Ana SAP",1,"28 DIAS",null,null,null],
    ["CG01","222","2026-09-03",9002,10,"10000095","OLEO A",10,"BBN",20,"L",200,"L",1800,200,2000,"BRL","CG01",2,"Beto SAP",1,"28 DIAS",null,null,null],
    ["CG01","333","2026-09-04",9003,10,"10000095","OLEO A",20,"BBN",20,"L",400,"L",3600,400,4000,"BRL","CG01",3,"Caio SAP",1,"28 DIAS",null,null,null],
    ["CG01","999","2026-09-04",9004,10,"10000095","OLEO A",50,"BBN",20,"L",1000,"L",9000,1000,10000,"BRL","CG01",0,"Ana SAP",1,"SIMPLES REMESSA",null,null,null]
  ]'::jsonb, 'meses', 'teste.xlsx');
  if (r ->> 'inseridas')::int <> 4 then raise exception 'T2: importação %', r; end if;
  -- reimportar o mesmo mês não duplica
  r := public.cglub_importar_sap(t_admin, '[["CG01","111","2026-09-02",9001,10,"10000095","OLEO A",5,"BBN",20,"L",100,"L",900,100,1000,"BRL","CG01",1,"Ana SAP",1,"28 DIAS",null,null,null]]'::jsonb, 'acrescentar', 't.xlsx');
  if (r ->> 'inseridas')::int <> 0 then raise exception 'T2: duplicou %', r; end if;
  begin
    perform public.cglub_importar_sap(t_admin, '[["x"]]'::jsonb, 'meses', 'ruim.xlsx');
    raise exception 'T2: aceitou linha inválida';
  exception when others then if sqlerrm not like '%linha_invalida%' then raise; end if;
  end;
  raise notice 'ok 2 importação SAP (dedup + validação)';

  -- 3. usuários criados pelo admin com senha temporária
  r := public.cglub_usuario_salvar(t_admin, '{"login":"ana@teste","nome":"Ana","perfil":"consultor","vendedor":"Ana"}', 'Temp1234');
  id_cons := (r -> 'usuario' ->> 'id')::uuid;
  if not (r -> 'usuario' ->> 'trocarSenha')::boolean then raise exception 'T3: não marcou troca de senha'; end if;
  r := public.cglub_usuario_salvar(t_admin, '{"login":"sup@teste","nome":"Sup","perfil":"supervisor","canais":["Extra Rede"]}', 'Temp1234');
  id_sup := (r -> 'usuario' ->> 'id')::uuid;
  r := public.cglub_usuario_salvar(t_admin, '{"login":"x@teste","nome":"X","perfil":"consultor"}', 'Temp1234');
  if (r ->> 'ok')::boolean then raise exception 'T3: consultor sem vínculo aceito'; end if;
  r := public.cglub_usuario_salvar(t_admin, '{"login":"y@teste","nome":"Y","perfil":"consultor","vendedor":"Caio"}', '123');
  if (r ->> 'ok')::boolean then raise exception 'T3: senha fraca aceita'; end if;
  raise notice 'ok 3 cadastro de usuários';

  -- 4. login: senha errada, bloqueio, sucesso
  r := public.cglub_entrar('ana@teste', 'errada99', false);
  if (r ->> 'ok')::boolean then raise exception 'T4: entrou com senha errada'; end if;
  r := public.cglub_entrar(' ANA@teste ', 'Temp1234', true);
  if not (r ->> 'ok')::boolean then raise exception 'T4: não entrou: %', r; end if;
  t_cons := r ->> 'token';
  for n in 1..5 loop r := public.cglub_entrar('sup@teste', 'errada99', false); end loop;
  r := public.cglub_entrar('sup@teste', 'Temp1234', false);
  if (r ->> 'ok')::boolean or r ->> 'erro' not like 'Muitas tentativas%' then raise exception 'T4: não bloqueou após 5 erros: %', r; end if;
  update cglub.usuarios set bloqueado_ate = null, falhas = 0 where id = id_sup;
  t_sup := public.cglub_entrar('sup@teste', 'Temp1234', false) ->> 'token';
  -- troca obrigatória
  r := public.cglub_definir_senha(t_cons, 'Temp1234');
  if (r ->> 'ok')::boolean then raise exception 'T4: aceitou a mesma senha temporária'; end if;
  r := public.cglub_definir_senha(t_cons, 'NovaSenha9');
  if not (r ->> 'ok')::boolean then raise exception 'T4: não definiu senha: %', r; end if;
  raise notice 'ok 4 login, bloqueio e troca de senha';

  -- 5. escopo: vendedora só recebe as próprias linhas, sem metas de colegas
  r := public.cglub_carregar(t_cons);
  if jsonb_array_length(r -> 'sap') <> 2 then raise exception 'T5: consultor recebeu % linhas', jsonb_array_length(r -> 'sap'); end if;
  if exists (select 1 from jsonb_array_elements(r -> 'sap') e where e ->> 19 <> 'Ana SAP') then raise exception 'T5: vazou linha de outro vendedor'; end if;
  if jsonb_array_length(r -> 'config' -> 'metasVigentes') <> 1 then raise exception 'T5: vazou meta de colega'; end if;
  if jsonb_array_length(r -> 'config' -> 'deParaVendedores') <> 1 then raise exception 'T5: vazou de-para'; end if;
  if jsonb_array_length(r -> 'ranking') <> 0 then raise exception 'T5: ranking sem permissão'; end if;
  if (r -> 'usuario' -> 'regras' ->> 'ver_analises')::boolean then raise exception 'T5: regra padrão errada'; end if;
  raise notice 'ok 5 escopo do vendedor';

  -- 6. supervisor de "Extra Rede" vê só o canal dele
  r := public.cglub_carregar(t_sup);
  if jsonb_array_length(r -> 'sap') <> 1 or (r -> 'sap' -> 0 ->> 19) <> 'Beto SAP' then raise exception 'T6: supervisor viu %', r -> 'sap'; end if;
  raise notice 'ok 6 escopo do gestor por canal';

  -- 7. regras por usuário: ranking ligado, valores escondidos
  r := public.cglub_usuario_salvar(t_admin, jsonb_build_object('id', id_cons, 'nome', 'Ana', 'perfil', 'consultor', 'vendedor', 'Ana',
         'permissoes', '{"ver_ranking_equipe": true, "ver_valores": false, "importar_sap": true, "lixo": 1}'::jsonb), null);
  if r -> 'usuario' -> 'permissoes' ? 'lixo' then raise exception 'T7: aceitou regra desconhecida'; end if;
  r := public.cglub_carregar(t_cons);
  if (r -> 'sap' -> 0 ->> 15) is not null then raise exception 'T7: valores não foram escondidos'; end if;
  if (r -> 'sap' -> 0 ->> 11) is null then raise exception 'T7: escondeu volume junto'; end if;
  -- ranking: só colegas do mesmo canal (Ana e Caio), sem a remessa
  if jsonb_array_length(r -> 'ranking') <> 2 then raise exception 'T7: ranking %', r -> 'ranking'; end if;
  if (select (e ->> 'pct')::numeric from jsonb_array_elements(r -> 'ranking') e where e ->> 'nome' = 'Ana') <> 0.1 then raise exception 'T7: pct da Ana errado (remessa contou?) %', r -> 'ranking'; end if;
  if (r -> 'ranking' -> 0 ->> 'nome') <> 'Caio' then raise exception 'T7: ordem do ranking'; end if;
  -- trava: vendedor nunca importa SAP, mesmo com exceção
  begin
    perform public.cglub_importar_sap(t_cons, '[]'::jsonb, 'meses', 'x');
    raise exception 'T7: vendedor importou';
  exception when others then if sqlerrm not like '%sem_permissao%' then raise; end if;
  end;
  raise notice 'ok 7 regras por usuário';

  -- 8. regras por perfil (config): gestor deixa de ver valores
  perform public.cglub_config_salvar(t_admin, 'regrasPerfis', '{"supervisor": {"ver_valores": false, "escopo": "xyz"}}');
  r := public.cglub_carregar(t_sup);
  if (r -> 'sap' -> 0 ->> 15) is not null then raise exception 'T8: regra do perfil não aplicada'; end if;
  if r -> 'usuario' -> 'regras' ->> 'escopo' <> 'canais' then raise exception 'T8: escopo inválido aceito'; end if;
  begin
    perform public.cglub_config_salvar(t_sup, 'metasVigentes', '[]');
    raise exception 'T8: gestor editou metas sem regra';
  exception when others then if sqlerrm not like '%sem_permissao%' then raise; end if;
  end;
  raise notice 'ok 8 regras por perfil';

  -- 9. visitas: vendedora registra; gestor de outro canal não vê; admin vê
  r := public.cglub_visita_salvar(t_cons, '{"id":"vteste1","data":"2026-09-10","cliente":"111","consultor":"Beto","q1":{}}');
  if (select consultor from cglub.visitas where id = 'vteste1') <> 'Ana' then raise exception 'T9: vendedora registrou em nome de outro'; end if;
  if jsonb_array_length(public.cglub_carregar(t_sup) -> 'visitas') <> 0 then raise exception 'T9: gestor de outro canal viu visita'; end if;
  if jsonb_array_length(public.cglub_carregar(t_admin) -> 'visitas') <> 1 then raise exception 'T9: admin não viu visita'; end if;
  begin
    perform public.cglub_visita_excluir(t_sup, 'vteste1');
    raise exception 'T9: gestor excluiu visita alheia';
  exception when others then if sqlerrm not like '%sem_permissao%' then raise; end if;
  end;
  raise notice 'ok 9 visitas';

  -- 10. clientes: vendedora cadastra o seu; não edita cliente de outro vendedor
  r := public.cglub_cliente_salvar(t_cons, '{"codigo":"111","fantasia":"Posto A","uf":"BA","campo_estranho":"x"}');
  if r ? 'campo_estranho' then raise exception 'T10: aceitou campo desconhecido'; end if;
  perform public.cglub_cliente_salvar(t_admin, '{"codigo":"222","fantasia":"Posto B","vendedor":"Beto"}');
  begin
    perform public.cglub_cliente_salvar(t_cons, '{"codigo":"222","fantasia":"Hackeado"}');
    raise exception 'T10: vendedora editou cliente de outro';
  exception when others then if sqlerrm not like '%sem_permissao%' then raise; end if;
  end;
  if (public.cglub_carregar(t_cons) -> 'clientes') ? '222' then raise exception 'T10: vendedora viu cliente de outro'; end if;
  raise notice 'ok 10 clientes';

  -- 11. sessão: token inválido, logout e usuário desativado
  begin
    perform public.cglub_carregar(repeat('0', 64));
    raise exception 'T11: token falso aceito';
  exception when others then if sqlerrm not like '%nao_autenticado%' then raise; end if;
  end;
  perform public.cglub_sair(t_sup);
  begin
    perform public.cglub_carregar(t_sup);
    raise exception 'T11: sessão continuou após sair';
  exception when others then if sqlerrm not like '%nao_autenticado%' then raise; end if;
  end;
  r := public.cglub_usuario_salvar(t_admin, jsonb_build_object('id', id_cons, 'nome', 'Ana', 'perfil', 'consultor', 'vendedor', 'Ana', 'ativo', false), null);
  begin
    perform public.cglub_carregar(t_cons);
    raise exception 'T11: usuário desativado continuou entrando';
  exception when others then if sqlerrm not like '%nao_autenticado%' then raise; end if;
  end;
  r := public.cglub_usuario_salvar(t_admin, jsonb_build_object('id', (select id from cglub.usuarios where login = 'admin@teste'), 'nome', 'A', 'perfil', 'consultor', 'vendedor', 'Ana'), null);
  if (r ->> 'ok')::boolean then raise exception 'T11: admin rebaixou a si mesmo'; end if;
  raise notice 'ok 11 sessão e desativação';

  -- 12. a API não enxerga as tabelas diretamente
  if has_schema_privilege('anon', 'cglub', 'usage') or has_table_privilege('anon', 'cglub.usuarios', 'select') then
    raise exception 'T12: anon tem acesso ao schema';
  end if;
  if not has_function_privilege('anon', 'public.cglub_entrar(text,text,boolean)', 'execute') then raise exception 'T12: anon sem acesso à API'; end if;
  if has_function_privilege('anon', 'cglub.hash_senha(text)', 'execute') then raise exception 'T12: função interna exposta'; end if;
  raise notice 'ok 12 permissões da API';

  raise notice 'TODOS OS TESTES PASSARAM';
end $$;
