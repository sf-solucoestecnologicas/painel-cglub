/* Gera o código de instalação (uso único, 7 dias) para criar o primeiro administrador.
   O banco guarda só o SHA-256 do código. Só funciona enquanto não houver nenhum usuário.

   uso:  node tools/codigo-instalacao.js
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

const ENV = process.env.CGLUB_ENV || path.join(__dirname, '..', '..', 'crm', '.env');
const senha = () => process.env.SUPABASE_DB_PASSWORD || fs.readFileSync(ENV, 'utf8').split(/\r?\n/)
  .find((l) => l.startsWith('SUPABASE_DB_PASSWORD=')).slice(21).trim().replace(/^["']|["']$/g, '');

(async () => {
  const c = new Client({ host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432, database: 'postgres', user: 'postgres.vsjidlibxhsxhivuzyqk', password: senha(), ssl: { rejectUnauthorized: false }, application_name: 'cglub-instalacao' });
  await c.connect();
  try {
    const n = (await c.query('select count(*)::int n from cglub.usuarios')).rows[0].n;
    if (n) { console.log(`O painel já tem ${n} usuário(s): a instalação não é mais necessária.`); return; }
    const alfa = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.randomBytes(16);
    const codigo = [0, 1, 2, 3].map((g) => [...bytes.subarray(g * 4, g * 4 + 4)].map((b) => alfa[b % alfa.length]).join('')).join('-');
    const hash = crypto.createHash('sha256').update(codigo).digest('hex');
    const expira = new Date(Date.now() + 7 * 864e5).toISOString();
    await c.query(`insert into cglub.config(chave, valor) values ('instalacao', $1::jsonb)
                   on conflict (chave) do update set valor = excluded.valor, atualizado_em = now()`, [JSON.stringify({ hash, expira })]);
    console.log(`Código de instalação: ${codigo}\nVálido até: ${expira.slice(0, 10)} (uso único)`);
  } finally { await c.end(); }
})().catch((e) => { console.error('ERRO:', e.message); process.exitCode = 1; });
