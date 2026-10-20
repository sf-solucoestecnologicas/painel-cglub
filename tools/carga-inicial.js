/* Carga inicial do banco com a planilha Painel_Comercial_CGLUB.xlsx.
   Lê o arquivo local dados.js (gerado da planilha; NÃO vai para o GitHub) e grava
   no schema cglub: linhas do SAP + metas, de-para, região, classificação e feriados.

   uso:  node tools/carga-inicial.js            (só grava o que ainda não existe)
         node tools/carga-inicial.js --forcar   (substitui cadastros já gravados)
*/
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ENV = process.env.CGLUB_ENV || path.join(__dirname, '..', '..', 'crm', '.env');
const PROJ = 'vsjidlibxhsxhivuzyqk';
const senha = () => process.env.SUPABASE_DB_PASSWORD || fs.readFileSync(ENV, 'utf8').split(/\r?\n/)
  .find((l) => l.startsWith('SUPABASE_DB_PASSWORD=')).slice(21).trim().replace(/^["']|["']$/g, '');

// feriados nacionais + 2 de julho (Bahia). Editáveis no app em Cadastros → Feriados.
const FERIADOS = [
  ['2026-01-01', 'Confraternização Universal'], ['2026-04-03', 'Sexta-feira Santa'], ['2026-04-21', 'Tiradentes'],
  ['2026-05-01', 'Dia do Trabalho'], ['2026-06-04', 'Corpus Christi'], ['2026-07-02', 'Independência da Bahia'],
  ['2026-09-07', 'Independência do Brasil'], ['2026-10-12', 'Nossa Senhora Aparecida'], ['2026-11-02', 'Finados'],
  ['2026-11-15', 'Proclamação da República'], ['2026-11-20', 'Consciência Negra'], ['2026-12-25', 'Natal'],
  ['2027-01-01', 'Confraternização Universal'], ['2027-03-26', 'Sexta-feira Santa'], ['2027-04-21', 'Tiradentes'],
  ['2027-05-01', 'Dia do Trabalho'], ['2027-05-27', 'Corpus Christi'], ['2027-07-02', 'Independência da Bahia'],
  ['2027-09-07', 'Independência do Brasil'], ['2027-10-12', 'Nossa Senhora Aparecida'], ['2027-11-02', 'Finados'],
  ['2027-11-15', 'Proclamação da República'], ['2027-11-20', 'Consciência Negra'], ['2027-12-25', 'Natal'],
].map(([data, nome]) => ({ data, nome }));

async function main() {
  const forcar = process.argv.includes('--forcar');
  global.window = {};
  require(path.join(__dirname, '..', 'dados.js'));
  const D = global.window.DADOS_PLANILHA;
  if (!D || !Array.isArray(D.sap)) throw new Error('dados.js não encontrado ou inválido');

  const c = new Client({ host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432, database: 'postgres', user: `postgres.${PROJ}`, password: senha(), ssl: { rejectUnauthorized: false }, application_name: 'cglub-carga' });
  await c.connect();
  try {
    await c.query('begin');
    const cfg = {
      metasVigentes: D.metasColaborador, metasSupervisor: D.metasSupervisor, deParaVendedores: D.deParaVendedores,
      deParaRegiao: D.deParaRegiao, classificacaoPlanilha: D.classificacao, feriados: FERIADOS,
    };
    for (const [k, v] of Object.entries(cfg)) {
      await c.query(`insert into cglub.config(chave, valor) values ($1, $2::jsonb)
                     on conflict (chave) do ${forcar ? 'update set valor = excluded.valor, atualizado_em = now()' : 'nothing'}`, [k, JSON.stringify(v)]);
    }
    const jaTem = (await c.query('select count(*)::int n from cglub.sap')).rows[0].n;
    let inseridas = 0;
    if (jaTem && !forcar) {
      console.log(`SAP já tem ${jaTem} linhas — mantidas (use --forcar para recarregar).`);
    } else {
      const meses = [...new Set(D.sap.map((r) => String(r[2]).slice(0, 7)))];
      const imp = (await c.query(`insert into cglub.importacoes(arquivo, modo, linhas, meses, por_nome)
                                  values ($1, 'meses', $2, $3, 'Carga inicial') returning id`, [D.fonte, D.sap.length, meses])).rows[0].id;
      await c.query('delete from cglub.sap where mes = any($1)', [meses]);
      const r = await c.query(`insert into cglub.sap(mes, chave, vendedor_sap, cliente, linha, importacao_id)
        select left(e ->> 2, 7), concat_ws('|', e ->> 3, coalesce(e ->> 4, ''), e ->> 5),
               coalesce(nullif(btrim(e ->> 19), ''), 'Não encontrado'), e ->> 1, e, $2
        from jsonb_array_elements($1::jsonb) e on conflict (chave) do nothing`, [JSON.stringify(D.sap), imp]);
      inseridas = r.rowCount;
    }
    await c.query('commit');
    const tot = (await c.query(`select count(*)::int n, sum((linha->>15)::numeric)::numeric(14,2) fat, sum((linha->>11)::numeric)::int vol from cglub.sap`)).rows[0];
    console.log(`ok: ${inseridas} linhas inseridas; banco tem ${tot.n} linhas, R$ ${tot.fat}, ${tot.vol} L; cadastros: ${Object.keys(cfg).join(', ')}`);
  } catch (e) {
    await c.query('rollback').catch(() => {});
    console.error('ERRO:', e.message);
    process.exitCode = 1;
  } finally { await c.end(); }
}
main();
