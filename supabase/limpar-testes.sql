-- Remove o que os testes ponta a ponta criam (usuários *@teste.cglub e o que eles gravaram).
delete from cglub.visitas where criado_por in (select id from cglub.usuarios where login like '%@teste.cglub');
delete from cglub.clientes where criado_por in (select id from cglub.usuarios where login like '%@teste.cglub');
delete from cglub.sap where importacao_id in (select id from cglub.importacoes where arquivo like 'teste%');
delete from cglub.importacoes where arquivo like 'teste%';
delete from cglub.audit where usuario_id in (select id from cglub.usuarios where login like '%@teste.cglub') or nome in ('Admin Teste', 'Tatiane Teste', 'Gestor Postos');
delete from cglub.config where chave = 'regrasPerfis' and atualizado_por in (select id from cglub.usuarios where login like '%@teste.cglub');
delete from cglub.usuarios where login like '%@teste.cglub';
delete from cglub.falhas_ip;
select (select count(*) from cglub.usuarios) usuarios, (select count(*) from cglub.sessoes) sessoes, (select count(*) from cglub.visitas) visitas,
       (select count(*) from cglub.sap) linhas_sap, (select sum((linha->>15)::numeric) from cglub.sap) faturamento,
       (select string_agg(chave, ', ' order by chave) from cglub.config) cadastros, (select count(*) from cglub.audit) audit;
