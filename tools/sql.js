/* Aplica SQL no Supabase do projeto (mesmo banco do CRM/BiCiclo/Flora/Ciao).
   A senha vem de lub/crm/.env (SUPABASE_DB_PASSWORD) e nunca é impressa.

   uso:
     node sql.js arquivo.sql              aplica o arquivo (uma transação)
     node sql.js arquivo.sql --testar     roda e desfaz (ROLLBACK) — para conferir
     node sql.js -e "select 1"            consulta rápida (imprime o resultado)
*/
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ENV = process.env.CGLUB_ENV || path.join(__dirname, '..', '..', 'crm', '.env');
const PROJ = 'vsjidlibxhsxhivuzyqk';

function senha() {
  if (process.env.SUPABASE_DB_PASSWORD) return process.env.SUPABASE_DB_PASSWORD;
  const linha = fs.readFileSync(ENV, 'utf8').split(/\r?\n/).find((l) => l.startsWith('SUPABASE_DB_PASSWORD='));
  if (!linha) throw new Error('SUPABASE_DB_PASSWORD não encontrado em ' + ENV);
  return linha.slice('SUPABASE_DB_PASSWORD='.length).trim().replace(/^["']|["']$/g, '');
}

async function main() {
  const args = process.argv.slice(2);
  const client = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432, database: 'postgres',
    user: `postgres.${PROJ}`, password: senha(), ssl: { rejectUnauthorized: false },
    application_name: 'cglub-tools',
  });
  await client.connect();
  client.on('notice', (m) => console.log('  ·', m.message));
  try {
    if (args[0] === '-e') {
      const r = await client.query(args[1]);
      const rs = Array.isArray(r) ? r : [r];
      for (const x of rs) if (x.rows && x.rows.length) console.log(JSON.stringify(x.rows, null, 1));
      return;
    }
    const arq = args[0];
    if (!arq) throw new Error('informe o arquivo .sql');
    const sql = fs.readFileSync(arq, 'utf8');
    const testar = args.includes('--testar');
    await client.query('begin');
    const r = await client.query(sql);
    const rs = Array.isArray(r) ? r : [r];
    const comLinhas = rs.filter((x) => x.rows && x.rows.length);
    for (const x of comLinhas) console.log(JSON.stringify(x.rows, null, 1));
    await client.query(testar ? 'rollback' : 'commit');
    console.log(testar ? `ok (testado e desfeito): ${path.basename(arq)}` : `ok (aplicado): ${path.basename(arq)}`);
  } catch (e) {
    try { await client.query('rollback'); } catch { /* conexão já caiu */ }
    console.error('ERRO:', e.message, e.where ? '\n' + e.where : '', e.position ? `(posição ${e.position})` : '');
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
main();
