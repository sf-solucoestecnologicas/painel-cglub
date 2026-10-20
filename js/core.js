// Núcleo: estado, formatação, modelo de dados (equivalente às colunas Z:AH da aba Dados_SAP)
// e componentes visuais compartilhados. As telas ficam em views-*.js.
window.APP = (function () {
  'use strict';
  const A = {};
  const C = window.CARTEIRA;
  A.C = C;

  // ---------- contrato de dados: aba Dados_SAP, colunas A:Y (não alterar a ordem) ----------
  A.COLS_SAP = ['Empresa', 'Cliente', 'Data', 'Fatura', 'Item', 'Código do Produto', 'Descrição do Produto', 'QTD', 'UM', 'Volume Material', 'UM Vol. Mat.', 'Volume Total', 'UM Volume', 'Valor Líquido', 'Valor Imposto', 'Valor Total', 'Moeda', 'Org. Vendas', 'Empregado de Vendas', 'Nome Vendedor', 'Condição Pagto', 'Descrição Condição Pagto', 'NF-e', 'Data NF', 'Nota Fiscal'];
  const S = A.S = { empresa: 0, cli: 1, data: 2, fat: 3, item: 4, cod: 5, desc: 6, qtd: 7, um: 8, volMat: 9, umVolMat: 10, vol: 11, umVol: 12, liq: 13, imp: 14, tot: 15, moeda: 16, org: 17, codVend: 18, vend: 19, condCod: 20, cond: 21, nfe: 22, dataNf: 23, nf: 24 };

  // ---------- estado (vem do servidor; ver A.carregar) ----------
  A.store = { sap: [], config: {}, clientes: {}, visitas: [], importacoes: [], ranking: [] };
  A.ui = { mes: '', dashSort: { key: 'ating', dir: -1 }, dashCanal: '', dashRegiao: '', dashBusca: '', carteiraSeg: 'leve', carteiraBusca: '', visBusca: '', cliBusca: '', cliFiltro: '', cadAba: 'metas', gestorCanal: '' };
  A.sync = { offline: false, desde: null, pendentes: 0 };
  const cfg = () => A.store.config || (A.store.config = {});

  // chamada à API já com o token da sessão
  A.rpc = (fn, args, opcoes) => window.API.rpc(fn, Object.assign({ p_token: window.AUTH.token() }, args || {}), opcoes);

  // registro de atividade (auditoria no servidor); não bloqueia a tela
  A.log = acao => { A.rpc('cglub_registrar', { p_acao: acao }).catch(() => {}); };

  // ---------- carga do servidor + cópia offline ----------
  const chaveCache = () => 'cache:' + ((window.AUTH.usuarioAtual() || {}).id || window.AUTH.uidSalvo() || 'x');
  const chaveFila = () => 'fila:' + ((window.AUTH.usuarioAtual() || {}).id || window.AUTH.uidSalvo() || 'x');

  function aplicar(r) {
    A.store = { sap: r.sap || [], config: r.config || {}, clientes: r.clientes || {}, visitas: r.visitas || [], importacoes: r.importacoes || [], ranking: r.ranking || [] };
    window.AUTH.setUsuario(r.usuario);
  }

  A.carregar = async function () {
    try {
      const r = await A.rpc('cglub_carregar', {}, { timeout: 60000 });
      aplicar(r);
      A.sync.offline = false; A.sync.desde = r.servidorEm;
      window.DB.gravar(chaveCache(), r);
      await A.enviarFila();
      return 'online';
    } catch (e) {
      if (e.codigo !== 'offline') throw e;
      const c = await window.DB.ler(chaveCache());
      if (!c) throw e;
      aplicar(c);
      A.sync.offline = true; A.sync.desde = c.servidorEm;
      A.sync.pendentes = ((await window.DB.ler(chaveFila())) || []).length;
      return 'offline';
    }
  };
  A.limparCache = async () => { await window.DB.apagar(chaveCache()); };

  // gravações feitas sem internet ficam numa fila e são enviadas quando a conexão volta
  A.gravar = async function (fn, args, descricao) {
    try {
      const r = await A.rpc(fn, args);
      A.sync.offline = false;
      return { ok: true, r };
    } catch (e) {
      if (e.codigo !== 'offline' || !['cglub_visita_salvar', 'cglub_cliente_salvar'].includes(fn)) throw e;
      const fila = (await window.DB.ler(chaveFila())) || [];
      fila.push({ fn, args, descricao, em: new Date().toISOString() });
      await window.DB.gravar(chaveFila(), fila);
      A.sync.offline = true; A.sync.pendentes = fila.length;
      return { ok: true, offline: true };
    }
  };
  A.enviarFila = async function () {
    const fila = (await window.DB.ler(chaveFila())) || [];
    if (!fila.length) { A.sync.pendentes = 0; return 0; }
    const resto = [];
    let enviados = 0;
    for (const item of fila) {
      try { await A.rpc(item.fn, item.args); enviados++; }
      catch (e) { if (e.codigo === 'offline') resto.push(item); else console.warn('Item da fila recusado pelo servidor:', item.descricao, e.message); }
    }
    await window.DB.gravar(chaveFila(), resto);
    A.sync.pendentes = resto.length;
    if (enviados) A.toast(`${enviados} registro(s) feitos sem internet foram enviados.`, 'ok');
    return enviados;
  };

  // grava um cadastro (metas, de-para, região, premium, feriados, logo…) no servidor
  A.salvarConfig = async function (chave) {
    try { await A.rpc('cglub_config_salvar', { p_chave: chave, p_valor: cfg()[chave] === undefined ? null : cfg()[chave] }); return true; }
    catch (e) { A.toast('Não foi possível salvar: ' + e.message, 'erro'); return false; }
  };

  // preferência de visualização (por aparelho)
  const pref = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem('cglub.pref.' + k) || 'null'); localStorage.setItem('cglub.pref.' + k, JSON.stringify(v)); } catch (e) { return null; } };
  A.pref = pref;

  A.dados = function () {
    const c = cfg();
    const produtos = {};
    for (const r of A.store.sap) if (r[S.desc]) produtos[r[S.cod]] = String(r[S.desc]);
    const ult = (A.store.importacoes || [])[0];
    return {
      sap: A.store.sap,
      produtos,
      metasSupervisor: c.metasSupervisor || [],
      deParaVendedores: c.deParaVendedores || [],
      deParaRegiao: c.deParaRegiao || [],
      classificacao: c.classificacaoPlanilha || [],
      clientes: A.store.clientes || {},
      fonte: ult ? ult.arquivo : 'Painel_Comercial_CGLUB.xlsx',
    };
  };
  // metas por mês: cada mês pode ter sua tabela; sem tabela própria, vale a vigente
  A.metasDoMes = function (ym) {
    const c = cfg();
    return (c.metasPorMes && c.metasPorMes[ym]) || c.metasVigentes || [];
  };
  A.metasEditaveis = function (ym) {
    const c = cfg();
    c.metasPorMes = c.metasPorMes || {};
    if (!c.metasPorMes[ym]) c.metasPorMes[ym] = JSON.parse(JSON.stringify(A.metasDoMes(ym)));
    return c.metasPorMes[ym];
  };

  // ---------- dias úteis (seg–sex, sem feriados cadastrados) ----------
  A.feriados = () => new Set((cfg().feriados || []).map(f => f.data));
  A.diasUteis = function (ym, ateDia) {
    const [y, m] = ym.split('-').map(Number);
    const fer = A.feriados();
    const total = new Date(y, m, 0).getDate();
    let uteis = 0, decorridos = 0;
    for (let d = 1; d <= total; d++) {
      const dt = new Date(y, m - 1, d), dow = dt.getDay();
      const iso = `${ym}-${String(d).padStart(2, '0')}`;
      if (dow === 0 || dow === 6 || fer.has(iso)) continue;
      uteis++; if (d <= ateDia) decorridos++;
    }
    return { total: uteis, decorridos, restantes: uteis - decorridos };
  };

  // ---------- formatação ----------
  const nf0 = A.nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const nf1 = A.nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const nf2 = A.nf2 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  // sem a regra "ver_valores" o servidor nem envia os valores; a tela mostra "—"
  A.verValores = () => window.AUTH.regra('ver_valores');
  A.brl = v => A.verValores() ? 'R$ ' + nf0.format(v || 0) : '—';
  A.brl2 = v => A.verValores() ? 'R$ ' + nf2.format(v || 0) : '—';
  A.lit = v => nf0.format(v || 0) + ' L';
  A.pct = v => (v === null || v === undefined || !isFinite(v)) ? '—' : nf1.format(v * 100) + '%';
  A.brlCompact = v => !A.verValores() ? '—' : v >= 1e6 ? 'R$ ' + nf2.format(v / 1e6) + ' mi' : v >= 1e3 ? 'R$ ' + nf0.format(v / 1e3) + ' mil' : A.brl(v);
  A.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  A.fmtDate = iso => iso ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) + '/' + String(iso).slice(0, 4) : '';
  A.fmtMes = ym => { const n = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']; return ym ? n[+ym.slice(5, 7) - 1] + '/' + ym.slice(0, 4) : ''; };
  A.todayISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  A.norm = s => String(s ?? '').trim();
  A.round = (v, d = 0) => Math.round(v * 10 ** d) / 10 ** d;
  A.num = v => (v === null || v === undefined || !isFinite(v)) ? '' : A.round(v, 4);
  A.sum = (arr, f) => { let s = 0; for (const x of arr) s += f(x); return s; };
  A.uniq = (arr, f) => new Set(arr.map(f)).size;
  A.groupBy = (arr, f) => { const m = new Map(); for (const x of arr) { const k = f(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };
  const { esc, norm, sum, uniq, groupBy, pct } = A;

  A.toast = function (msg, tipo) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.className = 'toast ' + (tipo || ''); t.hidden = false;
    clearTimeout(A.toast._t); A.toast._t = setTimeout(() => { t.hidden = true; }, 3600);
  };

  // ---------- clientes ----------
  A.cliente = cod => (A.store.clientes || {})[String(cod)] || null;
  A.nomeCli = cod => { const c = A.cliente(cod); return c ? (c.fantasia || c.razao || '') : ''; };
  A.cliLabel = cod => { const n = A.nomeCli(cod); return n ? `${esc(n)} <span class="muted small">${esc(cod)}</span>` : esc(cod); };

  // ---------- modelo ----------
  A.M = null;
  // preferência do aparelho: excluir "SIMPLES REMESSA" (padrão: sim)
  A.excluirRemessa = () => A.pref('incluirRemessa') !== true;

  A.classif = function (cod, desc) {
    const c = C.classificar(cod, desc || '');
    const ov = (cfg().premiumOverride || {})[cod];
    if (ov === 'Sim') c.premium = true; else if (ov === 'Não') c.premium = false;
    c.premiumFonte = ov ? 'manual' : 'regra';
    return c;
  };

  // escopo de dados (o servidor já filtra; aqui só organiza a visão)
  A.escopo = function () {
    const u = window.AUTH.usuarioAtual();
    const e = window.AUTH.escopo();
    const v = norm(u && u.vendedor);
    if (!u || e === 'todos') return { tipo: 'todos', ok: () => true, okMeta: () => true, okNome: () => true };
    if (e === 'canais') {
      const can = new Set(u.canais || []);
      const nomes = () => new Set(A.metasDoMes(A.ui.mes).filter(m => can.has(m[0])).map(m => norm(m[1])).concat(v ? [v] : []));
      return { tipo: 'canais', canais: [...can], ok: r => can.has(r.canal) || norm(r.vm) === v, okMeta: m => can.has(m[0]) || norm(m[1]) === v, okNome: n => nomes().has(norm(n)) };
    }
    return { tipo: 'vendedor', vendedor: v, ok: r => norm(r.vm) === v, okMeta: m => norm(m[1]) === v, okNome: n => norm(n) === v };
  };

  A.build = function () {
    const D = A.dados();
    const dp = new Map(D.deParaVendedores.map(r => [norm(r[0]), r]));
    const rg = new Map(D.deParaRegiao.map(r => [norm(r[0]), r[1]]));
    const prodInfo = {};
    for (const [cod, desc] of Object.entries(D.produtos)) prodInfo[cod] = A.classif(+cod || cod, desc);
    const clientes = D.clientes;

    const corrigeVol = cfg().corrigirVolume === true;
    const todas = D.sap.map(a => {
      const vend = norm(a[S.vend]) || 'Não encontrado';
      const m = dp.get(vend);
      const vm = m ? m[1] : '(revisar)';
      const canal = m ? m[2] : '(revisar)';
      const cod = a[S.cod];
      const p = prodInfo[cod] || A.classif(cod, a[S.desc]);
      const c = String(a[S.cond] || '').toUpperCase();
      const remessa = c.includes('SIMPLES REMESSA');
      const forma = remessa ? 'Simples Remessa' : (/PIX|VISTA|DEPOSITO|DEPÓSITO/.test(c) ? 'À Vista / PIX / Depósito' : 'A Prazo (parcelado)');
      const dt = String(a[S.data] || '');
      const cad = clientes[String(a[S.cli])];
      const ufCli = cad && /^(BA|SE)$/.test(cad.uf) ? cad.uf : '';
      return {
        cli: a[S.cli], dt, ym: dt.slice(0, 7), dia: +dt.slice(8, 10), fat: a[S.fat], item: a[S.item], cod, qtd: +a[S.qtd] || 0, um: a[S.um],
        vol: +a[S.vol] || (corrigeVol ? (+a[S.qtd] || 0) * (+a[S.volMat] || 0) : 0),
        volCalc: (+a[S.qtd] || 0) * (+a[S.volMat] || 0),
        volZerado: !(+a[S.vol] > 0) && (+a[S.qtd] || 0) * (+a[S.volMat] || 0) > 0, liq: +a[S.liq] || 0, imp: +a[S.imp] || 0, tot: +a[S.tot] || 0, codVend: a[S.codVend], vend, cond: a[S.cond],
        vm, canal, regiao: ufCli || rg.get(norm(vm)) || '(revisar)', premium: p.premium === true, remessa, forma,
      };
    });
    const meses = [...new Set(todas.map(r => r.ym))].filter(Boolean).sort();
    if (!A.ui.mes || !meses.includes(A.ui.mes)) A.ui.mes = meses[meses.length - 1] || A.todayISO().slice(0, 7);
    const ym = A.ui.mes;
    const doMes = todas.filter(r => r.ym === ym);
    const esc_ = A.escopo();
    const semRemessa = A.excluirRemessa() ? doMes.filter(r => !r.remessa) : doMes;
    const rows = semRemessa.filter(esc_.ok);

    const datas = doMes.map(r => r.dt).sort();
    const dMin = datas[0] || ym + '-01', dMax = datas[datas.length - 1] || ym + '-01';
    const [y, mo] = ym.split('-').map(Number);
    const diasMes = new Date(y, mo, 0).getDate();
    const diasCorridos = +dMax.slice(8, 10) || 1;
    const metas = A.metasDoMes(ym).filter(esc_.okMeta);

    A.M = { D, todas, doMes, rows, all: doMes, meses, ym, prodInfo, dMin, dMax, ano: y, mes: mo, diasCorridos, diasMes, fator: diasMes / diasCorridos, metas, escopo: esc_ };
    A.M._preco = null;
    return A.M;
  };

  A.kpis = function (M) {
    const R = M.rows;
    const fat = sum(R, r => r.tot), vol = sum(R, r => r.vol);
    const nfs = uniq(R, r => r.fat), clis = uniq(R, r => r.cli);
    const meta = sum(M.metas, r => +r[2] || 0);
    const semVend = R.filter(r => r.vend === 'Não encontrado');
    const rem = M.doMes.filter(r => r.remessa && M.escopo.ok(r));
    return {
      fat, vol, nfs, clis, ticket: nfs ? fat / nfs : 0, meta,
      ating: meta ? vol / meta : null, ritmo: meta ? (vol / M.diasCorridos * M.diasMes) / meta : null,
      premium: vol ? sum(R.filter(r => r.premium), r => r.vol) / vol : null,
      semVendFat: sum(semVend, r => r.tot), remessaFat: sum(rem, r => r.tot), remessaN: rem.length,
    };
  };

  A.status = function (meta, ating, ritmo) {
    if (!meta) return { cls: 'neutral', ico: '—', txt: 'Sem meta' };
    if (ating >= 1) return { cls: 'good', ico: '●', txt: 'Meta batida' };
    if (ritmo >= 0.95) return { cls: 'warn', ico: '▲', txt: 'Atenção' };
    return { cls: 'bad', ico: '▼', txt: 'Abaixo do ritmo' };
  };

  A.vendedores = function (M) {
    const byVm = groupBy(M.rows, r => norm(r.vm));
    const rg = new Map(M.D.deParaRegiao.map(r => [norm(r[0]), r[1]]));
    const nomesMeta = new Set();
    const out = M.metas.map(([canal, nome, mVol, mCli, mMix]) => {
      const k = norm(nome); nomesMeta.add(k);
      const R = byVm.get(k) || [];
      const vol = sum(R, r => r.vol), fat = sum(R, r => r.tot);
      const clis = uniq(R, r => r.cli);
      const ating = mVol ? vol / mVol : null;
      const ritmo = mVol ? (vol / M.diasCorridos * M.diasMes) / mVol : null;
      return {
        nome, canal, metaVol: +mVol || 0, vol, ating, ritmo, st: A.status(+mVol, ating, ritmo),
        metaCli: +mCli || 0, clis, cobertura: mCli ? clis / mCli : null,
        metaMix: +mMix || 0, mix: vol ? sum(R.filter(r => r.premium), r => r.vol) / vol : null,
        fat, regiao: rg.get(k) || '(revisar)', comMeta: true,
      };
    });
    const sem = groupBy(M.rows.filter(r => !nomesMeta.has(norm(r.vm))), r => r.vend);
    const extras = [...sem.entries()].map(([vend, R]) => {
      const vol = sum(R, r => r.vol);
      return {
        nome: vend, canal: R[0].canal, metaVol: 0, vol, ating: null, ritmo: null,
        st: { cls: 'neutral', ico: '—', txt: vend === 'Não encontrado' ? 'Sem vendedor no SAP' : 'Sem meta cadastrada' },
        metaCli: 0, clis: uniq(R, r => r.cli), cobertura: null, metaMix: 0,
        mix: vol ? sum(R.filter(r => r.premium), r => r.vol) / vol : null, fat: sum(R, r => r.tot), regiao: '—', comMeta: false,
      };
    }).sort((a, b) => b.fat - a.fat);
    return { out, extras };
  };

  A.porChave = function (M, f, labels) {
    const total = sum(M.rows, r => r.tot);
    const g = groupBy(M.rows, f);
    return (labels || [...g.keys()]).map(k => { const R = g.get(k) || []; const fat = sum(R, r => r.tot); return { k, fat, vol: sum(R, r => r.vol), n: R.length, nfs: uniq(R, r => r.fat), share: total ? fat / total : 0 }; });
  };

  A.clienteResumo = function (M, cli, todosMeses) {
    const base = todosMeses ? M.todas.filter(r => !r.remessa && M.escopo.ok(r)) : M.rows;
    const R = base.filter(r => String(r.cli) === String(cli));
    if (!R.length) return null;
    const vol = sum(R, r => r.vol);
    const porSku = [...groupBy(R, r => r.cod).entries()].map(([cod, X]) => ({ cod, desc: M.D.produtos[cod] || cod, vol: sum(X, r => r.vol), fat: sum(X, r => r.tot) })).sort((a, b) => b.fat - a.fat);
    return {
      cli, fat: sum(R, r => r.tot), vol, nfs: uniq(R, r => r.fat), ultima: R.map(r => r.dt).sort().pop(),
      mix: vol ? sum(R.filter(r => r.premium), r => r.vol) / vol : null, porSku,
      vendedores: [...new Set(R.map(r => r.vm))], canal: R[0].canal, cond: [...new Set(R.map(r => r.cond))].join(', '),
      meses: [...new Set(R.map(r => r.ym))].sort(),
    };
  };

  A.precoRef = function (M) {
    if (M._preco) return M._preco;
    const base = M.todas.filter(r => !r.remessa);
    const p = {};
    for (const [cod, X] of groupBy(base, r => r.cod)) {
      const ult = X.filter(r => r.ym === M.ym).length ? X.filter(r => r.ym === M.ym) : X;
      const q = sum(ult, r => r.qtd), v = sum(ult, r => r.vol), t = sum(ult, r => r.tot);
      p[cod] = { um: X[0].um, porUn: q ? t / q : 0, litrosUn: q ? v / q : 0, porL: v ? t / v : 0, vol: sum(X.filter(r => r.ym === M.ym), r => r.vol), fat: t, clientes: uniq(X.filter(r => r.ym === M.ym), r => r.cli) };
    }
    M._preco = p;
    return p;
  };

  // lista de clientes visíveis (compras no escopo + cadastro)
  A.listaClientes = function (M) {
    const mapa = new Map();
    for (const r of M.todas) {
      if (!M.escopo.ok(r)) continue;
      const k = String(r.cli);
      const o = mapa.get(k) || { cod: k, fatMes: 0, volMes: 0, fatTotal: 0, ultima: '', vendedores: new Set(), canal: r.canal };
      if (!r.remessa) { o.fatTotal += r.tot; if (r.ym === M.ym) { o.fatMes += r.tot; o.volMes += r.vol; } }
      if (r.dt > o.ultima) o.ultima = r.dt;
      o.vendedores.add(r.vm);
      mapa.set(k, o);
    }
    for (const [k, c] of Object.entries(A.store.clientes || {})) {
      // o servidor só envia os clientes que o usuário pode ver
      if (!mapa.has(k)) mapa.set(k, { cod: k, fatMes: 0, volMes: 0, fatTotal: 0, ultima: '', vendedores: new Set(c.vendedor ? [c.vendedor] : []), canal: '' });
    }
    return [...mapa.values()].map(o => Object.assign(o, { cad: A.cliente(o.cod), vendedores: [...o.vendedores] }));
  };

  // o servidor já devolve só as visitas que o usuário pode ver
  A.visitasVisiveis = () => A.store.visitas || [];

  // ---------- componentes ----------
  A.kpiCard = (label, value, foot, meter, icon) => `<div class="card kpi">${icon ? `<span class="kpi-ico" aria-hidden="true">${A.icon(icon)}</span>` : ''}<div class="label">${label}</div><div class="value">${value}</div>${foot ? `<div class="foot">${foot}</div>` : ''}${meter !== undefined && meter !== null ? `<div class="meter" role="meter" aria-valuenow="${A.round((meter || 0) * 100)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.max(0, Math.min(100, (meter || 0) * 100))}%"></i><b></b></div>` : ''}</div>`;
  A.inbar = (v, ref) => {
    if (v === null || v === undefined || !isFinite(v)) return '<span class="muted">—</span>';
    const max = Math.max(1.2, v);
    return `<div class="inbar"><div class="track"><i style="width:${Math.min(100, v / max * 100)}%"></i>${ref ? `<b style="left:${ref / max * 100}%"></b>` : ''}</div><span>${pct(v)}</span></div>`;
  };
  A.pill = st => `<span class="pill ${st.cls}"><span class="ico" aria-hidden="true">${st.ico}</span>${st.txt}</span>`;
  A.hbars = (items, fmt) => {
    const max = Math.max(...items.map(i => i.v), 1);
    return `<div class="hbars">${items.map(i => `<div class="hbar" data-tip="${esc(i.k)}: ${esc(fmt(i.v))}${i.extra ? ' · ' + esc(i.extra) : ''}"><span class="k" title="${esc(i.k)}">${esc(i.k)}</span><div class="t"><i style="width:${i.v / max * 100}%"></i></div><span class="v">${fmt(i.v)}</span></div>`).join('')}</div>`;
  };
  A.sortable = function (tableId, rows, cols, sortState, rowHtml, foot) {
    const { key, dir } = sortState;
    const col = cols.find(c => c.key === key);
    const sorted = col ? rows.slice().sort((a, b) => {
      let va = col.val(a), vb = col.val(b);
      if (va === null || va === undefined || (typeof va === 'number' && !isFinite(va))) va = -Infinity;
      if (vb === null || vb === undefined || (typeof vb === 'number' && !isFinite(vb))) vb = -Infinity;
      return (va > vb ? 1 : va < vb ? -1 : 0) * dir;
    }) : rows;
    return `<div class="table-wrap"><table id="${tableId}"><thead><tr>${cols.map(c => `<th class="sortable ${c.n ? 'n' : ''}" data-sort="${c.key}" aria-sort="${key === c.key ? (dir > 0 ? 'ascending' : 'descending') : 'none'}">${c.label}${key === c.key ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead><tbody>${sorted.map(rowHtml).join('')}</tbody>${foot || ''}</table></div>`;
  };
  A.niceMax = v => { const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; };

  A.dailyChart = function (M) {
    const g = groupBy(M.rows, r => r.dia);
    const days = Array.from({ length: M.diasMes }, (_, i) => i + 1);
    const vals = days.map(d => d > M.diasCorridos ? null : sum(g.get(d) || [], r => r.tot));
    const nice = A.niceMax(Math.max(...vals.filter(v => v !== null), 1));
    const W = 760, H = 220, L = 54, B = 24, T = 10, Rr = 6;
    const bw = (W - L - Rr) / M.diasMes;
    const y = v => T + (H - T - B) * (1 - v / nice);
    const ticks = [0, .25, .5, .75, 1].map(t => t * nice);
    const fmtT = t => t === 0 ? '0' : t >= 1e6 ? nf1.format(t / 1e6) + ' mi' : nf0.format(t / 1e3) + ' mil';
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Faturamento diário do mês">`;
    s += `<g class="grid">${ticks.map(t => `<line x1="${L}" x2="${W - Rr}" y1="${y(t)}" y2="${y(t)}"/>`).join('')}</g>`;
    s += `<g class="axis">${ticks.map(t => `<text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${fmtT(t)}</text>`).join('')}`;
    s += days.filter(d => d === 1 || d % 5 === 0).map(d => `<text x="${L + (d - .5) * bw}" y="${H - 6}" text-anchor="middle">${d}</text>`).join('') + '</g>';
    days.forEach((d, i) => {
      const v = vals[i]; if (v === null) return;
      const x = L + i * bw + 1, w = Math.max(2, bw - 2), top = y(v), h = Math.max(0, H - B - top), r = Math.min(4, h, w / 2);
      s += `<rect x="${L + i * bw}" y="${T}" width="${bw}" height="${H - B - T}" fill="transparent" data-tip="${String(d).padStart(2, '0')}/${String(M.mes).padStart(2, '0')}: ${A.brl(v)}${v === 0 ? ' (sem faturamento)' : ''}"/>`;
      if (h > 0) s += `<path d="M${x},${H - B} V${top + r} q0,-${r} ${r},-${r} H${x + w - r} q${r},0 ${r},${r} V${H - B} Z" fill="var(--bar)" pointer-events="none"/>`;
    });
    s += `<line x1="${L}" x2="${W - Rr}" y1="${H - B}" y2="${H - B}" stroke="var(--ink-3)" stroke-width="1"/>`;
    return s + '</svg>';
  };

  // ---------- gaveta lateral ----------
  A.openDrawer = html => { document.getElementById('drawerBody').innerHTML = html; const d = document.getElementById('drawer'); d.hidden = false; A.mountLogos(d); const f = d.querySelector('input,select,textarea,button:not(.close)'); if (f) f.focus(); };
  A.closeDrawer = () => { document.getElementById('drawer').hidden = true; };

  // ---------- downloads ----------
  A.download = function (name, content, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: type || 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  A.downloadCSV = function (name, rows) {
    const cell = v => { const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    A.download(name, '﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
  };
  A.copiar = t => (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => A.toast('Copiado.'), () => { window.prompt('Copie:', t); });

  // ---------- identidade visual ----------
  // Logo oficial: coloque o arquivo do kit de marca em assets/logo-lubrax.svg (ou .png),
  // ou envie pelo app em Cadastros → Base de dados → Identidade visual.
  A.logoHTML = (cls) => `<span class="logo-slot ${cls || ''}" data-logo></span>`;
  A.mountLogos = function (root) {
    (root || document).querySelectorAll('[data-logo]:not([data-ok])').forEach(slot => {
      slot.dataset.ok = '1';
      const fallback = () => { slot.innerHTML = '<span class="logo-fallback" aria-label="CGLUB">CG<i></i></span>'; };
      const tentar = fontes => {
        if (!fontes.length) return fallback();
        const img = new Image(); img.alt = 'Lubrax'; img.className = 'logo-img';
        img.onload = () => { slot.innerHTML = ''; slot.appendChild(img); };
        img.onerror = () => tentar(fontes.slice(1));
        img.src = fontes[0];
      };
      tentar([cfg().logo, 'assets/logo-lubrax.svg', 'assets/logo-lubrax.png'].filter(Boolean));
    });
  };

  const ICONES = {
    dashboard: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
    analises: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    gestor: '<path d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 14.4l-4.8 2.5.9-5.4L4.2 7.7l5.4-.8z"/><path d="M5 21h14"/>',
    roteiro: '<path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3zM9 3v15M15 6v15"/>',
    visitas: '<path d="M8 2v4M16 2v4M3 9h18M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2zM8 14l2.5 2.5L16 12"/>',
    clientes: '<path d="M3 21V8l9-5 9 5v13M9 21v-6h6v6M3 21h18"/>',
    carteira: '<path d="M9 3h6l1 4H8zM7 7h10l1 14H6zM10 12h4"/>',
    cadastros: '<path d="M4 4h16v16H4zM4 10h16M10 4v16"/>',
    usuarios: '<path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>',
    perfil: '<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z"/>',
    notas: '<path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/>',
    sair: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    upload: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    download: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    tema: '<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    litro: '<path d="M7 3h10l-1 4H8zM6 7h12v12a2 2 0 01-2 2H8a2 2 0 01-2-2z"/>',
    dinheiro: '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>',
    alvo: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    ritmo: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  };
  A.icon = (n, cls) => `<svg class="ico-svg ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[n] || ''}</svg>`;

  return A;
})();
