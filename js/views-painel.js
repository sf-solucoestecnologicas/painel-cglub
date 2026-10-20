// Telas de painel: Dashboard (aba Dashboard da planilha) e Análises (aba Analises).
(function (A) {
  'use strict';
  const { esc, norm, sum, uniq, groupBy, pct, brl, brlCompact, lit, nf0 } = A;
  A.views = A.views || {};

  A.views.dashboard = function (app) {
    const M = A.M, K = A.kpis(M), u = window.AUTH.usuarioAtual();
    const { out, extras } = A.vendedores(M);
    const ui = A.ui;
    const ehConsultor = M.escopo.tipo === 'vendedor';
    const canais = [...new Set(out.map(v => v.canal))];
    const regioes = [...new Set(out.map(v => v.regiao))];
    const lista = out.filter(v => (!ui.dashCanal || v.canal === ui.dashCanal) && (!ui.dashRegiao || v.regiao === ui.dashRegiao) && (!ui.dashBusca || v.nome.toLowerCase().includes(ui.dashBusca.toLowerCase())));
    const cont = { good: out.filter(v => v.st.cls === 'good').length, warn: out.filter(v => v.st.cls === 'warn').length, bad: out.filter(v => v.st.cls === 'bad').length };
    const mesAtual = M.ym === A.todayISO().slice(0, 7) || M.diasCorridos < M.diasMes;

    const cols = [
      { key: 'nome', label: 'Colaborador', val: v => v.nome },
      { key: 'canal', label: 'Canal', val: v => v.canal },
      { key: 'metaVol', label: 'Meta (L)', n: 1, val: v => v.metaVol },
      { key: 'vol', label: 'Realizado (L)', n: 1, val: v => v.vol },
      { key: 'ating', label: '% Ating.', val: v => v.ating },
      { key: 'ritmo', label: 'Ritmo proj.', val: v => v.ritmo },
      { key: 'st', label: 'Status', val: v => ({ good: 3, warn: 2, bad: 1, neutral: 0 })[v.st.cls] },
      { key: 'metaCli', label: 'Meta cli.', n: 1, val: v => v.metaCli },
      { key: 'clis', label: 'Clientes', n: 1, val: v => v.clis },
      { key: 'cobertura', label: '% Cobert.', n: 1, val: v => v.cobertura },
      { key: 'metaMix', label: 'Meta mix', n: 1, val: v => v.metaMix },
      { key: 'mix', label: 'Mix premium', n: 1, val: v => v.mix },
      { key: 'fat', label: 'Realizado (R$)', n: 1, val: v => v.fat },
      { key: 'regiao', label: 'Região', val: v => v.regiao },
    ];
    const row = v => `<tr class="clickable" data-vend="${esc(v.nome)}" tabindex="0">
      <td><b>${esc(v.nome)}</b></td><td>${esc(v.canal)}</td><td class="n">${nf0.format(v.metaVol)}</td><td class="n">${nf0.format(v.vol)}</td>
      <td>${A.inbar(v.ating, 1)}</td><td>${A.inbar(v.ritmo, 1)}</td><td>${A.pill(v.st)}</td>
      <td class="n">${v.metaCli || '—'}</td><td class="n">${v.clis}</td><td class="n">${pct(v.cobertura)}</td>
      <td class="n">${v.metaMix ? pct(v.metaMix) : '—'}</td><td class="n">${pct(v.mix)}</td>
      <td class="n">${brl(v.fat)}</td><td>${v.regiao === '(revisar)' ? '<span class="muted">(revisar)</span>' : esc(v.regiao)}</td></tr>`;
    const tMeta = sum(lista, v => v.metaVol), tVol = sum(lista, v => v.vol);
    const foot = `<tfoot><tr><td colspan="2">Total (${lista.length})</td><td class="n">${nf0.format(tMeta)}</td><td class="n">${nf0.format(tVol)}</td><td>${A.inbar(tMeta ? tVol / tMeta : null, 1)}</td><td>${A.inbar(tMeta ? tVol / M.diasCorridos * M.diasMes / tMeta : null, 1)}</td><td></td><td class="n">${nf0.format(sum(lista, v => v.metaCli))}</td><td class="n">${nf0.format(sum(lista, v => v.clis))}</td><td></td><td></td><td></td><td class="n">${brl(sum(lista, v => v.fat))}</td><td></td></tr></tfoot>`;

    const minha = ehConsultor ? lista[0] : null;
    const saud = `<div class="hello"><div><h2>Olá, ${esc((u.nome || '').split(' ')[0])}</h2><p class="muted">${ehConsultor ? `Sua carteira em ${A.fmtMes(M.ym)}` : M.escopo.tipo === 'canais' ? `Canais: ${esc(M.escopo.canais.join(', '))} · ${A.fmtMes(M.ym)}` : `Visão geral CGLUB · ${A.fmtMes(M.ym)}`} · dia ${M.diasCorridos} de ${M.diasMes}</p></div>
      <a class="btn" href="#roteiro" data-nova-visita>${A.icon('plus')} Nova visita 5Q3A</a></div>`;

    let html = saud;
    if (ehConsultor && !u.vendedor) html += `<div class="alert warn"><span>⚠</span><div>Seu usuário não está vinculado a um vendedor das Metas. Peça ao administrador para fazer o vínculo em Usuários.</div></div>`;
    if (!ehConsultor && A.excluirRemessa() && K.remessaN) html += `<div class="alert info"><span aria-hidden="true">ℹ</span><div><b>Simples Remessa fora dos números.</b> ${K.remessaN} linhas (${brl(K.remessaFat)}) excluídas por não serem venda. ${window.AUTH.pode('verRemessa') ? 'Desmarque no topo para ver os números iguais aos da planilha.' : ''}</div></div>`;
    if (!ehConsultor && K.semVendFat > 0) html += `<div class="alert warn"><span aria-hidden="true">⚠</span><div><b>Atenção:</b> ${brl(K.semVendFat)} (${pct(K.semVendFat / K.fat)}) do faturamento está sem vendedor identificado no SAP ("Não encontrado").${window.AUTH.telas().includes('notas') ? ' Ver <a href="#notas">Notas</a>.' : ''}</div></div>`;

    const du = A.diasUteis(M.ym, M.diasCorridos);
    const ritmoDU = K.meta && du.decorridos ? (K.vol / du.decorridos * du.total) / K.meta : null;
    const vv = A.verValores();
    html += `<div class="grid kpis">
        ${vv ? A.kpiCard('Faturamento', brlCompact(K.fat), brl(K.fat), null, 'dinheiro') : A.kpiCard('Notas fiscais', nf0.format(K.nfs), 'no mês', null, 'dinheiro')}
        ${A.kpiCard('Volume', lit(K.vol), `${nf0.format(du.decorridos ? K.vol / du.decorridos : 0)} L por dia útil`, null, 'litro')}
        ${A.kpiCard('% da meta de volume', pct(K.ating), `Meta ${lit(K.meta)} · ${du.decorridos} de ${du.total} dias úteis`, K.ating, 'alvo')}
        ${A.kpiCard('Ritmo projetado', pct(ritmoDU), `Por dias úteis · linear (planilha): ${pct(K.ritmo)}`, ritmoDU, 'ritmo')}
        ${vv ? A.kpiCard('Ticket médio por NF', brl(K.ticket), `${nf0.format(K.nfs)} notas fiscais`) : A.kpiCard('Falta para a meta', lit(Math.max(0, K.meta - K.vol)), du.restantes ? `${nf0.format(Math.max(0, K.meta - K.vol) / du.restantes)} L por dia útil restante` : 'mês encerrado')}
        ${A.kpiCard('Clientes atendidos', nf0.format(K.clis), minha ? `Meta: ${minha.metaCli} · cobertura ${pct(minha.cobertura)}` : 'no mês')}
        ${A.kpiCard('Mix premium', pct(K.premium), minha && minha.metaMix ? `Meta: ${pct(minha.metaMix)}` : 'Volume sintético/semi/linhas superiores')}
        ${ehConsultor ? A.kpiCard('Status', minha ? A.pill(minha.st) : '—', 'Meta batida ≥ 100% · Atenção = ritmo ≥ 95%') :
        A.kpiCard('Status da equipe', `<span class="status-row">${A.pill({ cls: 'good', ico: '●', txt: cont.good })} ${A.pill({ cls: 'warn', ico: '▲', txt: cont.warn })} ${A.pill({ cls: 'bad', ico: '▼', txt: cont.bad })}</span>`, 'Meta batida · Atenção · Abaixo do ritmo')}
      </div>`;

    if (ehConsultor) {
      html += rankingEquipe(M) + minhaCarteira(M);
    } else {
      html += `<section class="card section">
        <header><h2>Desempenho por vendedor (realizado × meta)</h2><span class="muted small">Clique numa linha para ver clientes e produtos</span></header>
        <div class="filters">
          <input type="search" id="fBusca" placeholder="Buscar colaborador…" value="${esc(ui.dashBusca)}" aria-label="Buscar colaborador">
          <select id="fCanal" aria-label="Canal"><option value="">Todos os canais</option>${canais.map(c => `<option ${c === ui.dashCanal ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
          <select id="fRegiao" aria-label="Região"><option value="">Todas as regiões</option>${regioes.map(c => `<option ${c === ui.dashRegiao ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
          ${window.AUTH.pode('exportar') ? `<button class="btn ghost sm" id="expVend">${A.icon('download')} CSV</button>` : ''}
        </div>
        ${A.sortable('tVend', lista, cols, ui.dashSort, row, foot)}
        <p class="muted small">Status: <b>Meta batida</b> = atingimento ≥ 100%; <b>Atenção</b> = ritmo projetado ≥ 95%; <b>Abaixo do ritmo</b> = demais. A marca vertical nas barras indica 100%.</p>
      </section>
      ${extras.length ? `<section class="card section">
        <header><h2>Vendas sem meta correspondente</h2><span class="muted small">Revisar De-Para / Metas</span></header>
        <div class="table-wrap"><table><thead><tr><th>Nome no SAP</th><th>Canal</th><th>Situação</th><th class="n">Volume (L)</th><th class="n">Clientes</th><th class="n">Faturamento</th></tr></thead>
        <tbody>${extras.map(v => `<tr class="clickable" data-sapvend="${esc(v.nome)}" tabindex="0"><td><b>${esc(v.nome)}</b></td><td>${esc(v.canal)}</td><td>${A.pill(v.st)}</td><td class="n">${nf0.format(v.vol)}</td><td class="n">${v.clis}</td><td class="n">${brl(v.fat)}</td></tr>`).join('')}</tbody></table></div>
      </section>` : ''}`;
    }
    app.innerHTML = html;

    app.querySelectorAll('th[data-sort]').forEach(th => th.onclick = () => {
      const k = th.dataset.sort; const c = cols.find(x => x.key === k);
      ui.dashSort = { key: k, dir: ui.dashSort.key === k ? -ui.dashSort.dir : (c.n || ['ating', 'ritmo', 'st'].includes(k) ? -1 : 1) }; A.views.dashboard(app);
    });
    const b = app.querySelector('#fBusca');
    if (b) b.oninput = () => { ui.dashBusca = b.value; const pos = b.selectionStart; A.views.dashboard(app); const nb = app.querySelector('#fBusca'); nb.focus(); nb.setSelectionRange(pos, pos); };
    const fc = app.querySelector('#fCanal'); if (fc) fc.onchange = e => { ui.dashCanal = e.target.value; A.views.dashboard(app); };
    const fr = app.querySelector('#fRegiao'); if (fr) fr.onchange = e => { ui.dashRegiao = e.target.value; A.views.dashboard(app); };
    const ex = app.querySelector('#expVend');
    if (ex) ex.onclick = () => A.downloadCSV(`desempenho_vendedores_${M.ym}.csv`, [cols.map(c => c.label)].concat(lista.map(v => [v.nome, v.canal, v.metaVol, A.round(v.vol), A.num(v.ating), A.num(v.ritmo), v.st.txt, v.metaCli, v.clis, A.num(v.cobertura), v.metaMix, A.num(v.mix), A.round(v.fat, 2), v.regiao])));
    const abre = (sel, fn) => app.querySelectorAll(sel).forEach(tr => { tr.onclick = () => fn(tr); tr.onkeydown = e => { if (e.key === 'Enter') fn(tr); }; });
    abre('tr[data-vend]', tr => A.drawerVendedor(tr.dataset.vend, 'vm'));
    abre('tr[data-sapvend]', tr => A.drawerVendedor(tr.dataset.sapvend, 'sap'));
    app.querySelectorAll('[data-cli]').forEach(a => a.onclick = e => { e.preventDefault(); A.drawerCliente(a.dataset.cli); });
    app.querySelectorAll('[data-visita]').forEach(a => a.onclick = e => { e.preventDefault(); A.novaVisita(a.dataset.visita); });
  };

  // ranking do canal (só % da meta; o servidor só envia se a regra permitir)
  function rankingEquipe(M) {
    const rk = (A.store.ranking || []).filter(r => r.mes === M.ym);
    if (!rk.length) return '';
    const pos = rk.findIndex(r => r.eu) + 1;
    return `<section class="card section"><header><h2>Ranking do canal — % da meta de volume</h2><span class="muted small">${pos ? `Você está em ${pos}º de ${rk.length}` : ''} · sem Simples Remessa</span></header>
      <div class="ranking">${rk.map((r, i) => `<div class="rk ${r.eu ? 'eu' : ''}"><span class="rk-pos">${i + 1}º</span><span class="rk-nome">${r.eu ? '<b>Você</b>' : esc(r.nome)}</span>${A.inbar(r.pct, 1)}</div>`).join('')}</div></section>`;
  }

  function minhaCarteira(M) {
    const porCli = [...groupBy(M.rows, r => r.cli).entries()].map(([cli, X]) => ({ cli, fat: sum(X, r => r.tot), vol: sum(X, r => r.vol), ult: X.map(r => r.dt).sort().pop(), mix: sum(X, r => r.vol) ? sum(X.filter(r => r.premium), r => r.vol) / sum(X, r => r.vol) : null })).sort((a, b) => b.fat - a.fat);
    // clientes que compraram em meses anteriores e não neste mês = oportunidade de recompra
    const doMes = new Set(porCli.map(c => String(c.cli)));
    const antes = [...groupBy(M.todas.filter(r => r.ym < M.ym && !r.remessa && M.escopo.ok(r)), r => String(r.cli)).entries()].filter(([k]) => !doMes.has(k)).map(([cli, X]) => ({ cli, ult: X.map(r => r.dt).sort().pop(), fat: sum(X, r => r.tot) })).sort((a, b) => b.fat - a.fat).slice(0, 15);
    const hoje = A.todayISO();
    const ret = A.visitasVisiveis().filter(v => v.a3 && v.a3.data && !v.retornoFeito).sort((a, b) => a.a3.data.localeCompare(b.a3.data)).slice(0, 8);
    return `<div class="grid two section">
      <section class="card"><header><h2>Meus clientes no mês (${porCli.length})</h2></header>
        <div class="table-wrap"><table><thead><tr><th>Cliente</th><th class="n">Faturamento</th><th class="n">Volume</th><th class="n">Mix</th><th>Última</th><th></th></tr></thead><tbody>
        ${porCli.map(c => `<tr><td><a href="#" data-cli="${esc(c.cli)}">${A.cliLabel(c.cli)}</a></td><td class="n">${brl(c.fat)}</td><td class="n">${lit(c.vol)}</td><td class="n">${pct(c.mix)}</td><td>${A.fmtDate(c.ult)}</td><td><a class="btn ghost sm" href="#" data-visita="${esc(c.cli)}">Visitar</a></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Sem vendas no mês.</td></tr>'}
        </tbody></table></div></section>
      <div class="grid">
        <section class="card"><header><h2>Meus retornos</h2></header>
          ${ret.length ? `<ul class="list">${ret.map(v => `<li><span class="${v.a3.data < hoje ? 'pill bad' : 'pill neutral'}">${A.fmtDate(v.a3.data)}</span> ${A.cliLabel(v.cliente)} — ${esc(v.a3.acao || 'retorno')} <a href="#" data-visita="${esc(v.cliente)}">iniciar</a></li>`).join('')}</ul>` : '<p class="muted">Nenhum retorno agendado.</p>'}</section>
        <section class="card"><header><h2>Compraram antes, ainda não neste mês</h2></header>
          ${antes.length ? `<ul class="list">${antes.map(c => `<li>${A.cliLabel(c.cli)} <span class="muted small">última ${A.fmtDate(c.ult)}</span> <a href="#" data-visita="${esc(c.cli)}">visitar</a></li>`).join('')}</ul>` : `<p class="muted">${M.meses.indexOf(M.ym) > 0 ? 'Todos os clientes anteriores já compraram.' : 'Disponível quando houver mais de um mês importado.'}</p>`}</section>
      </div></div>`;
  }

  A.drawerVendedor = function (nome, tipo) {
    const M = A.M;
    const R = M.rows.filter(r => tipo === 'vm' ? norm(r.vm) === norm(nome) : r.vend === nome);
    const porCli = [...groupBy(R, r => r.cli).entries()].map(([cli, X]) => ({ cli, fat: sum(X, r => r.tot), vol: sum(X, r => r.vol), nfs: uniq(X, r => r.fat), ult: X.map(r => r.dt).sort().pop() })).sort((a, b) => b.fat - a.fat);
    const porSku = [...groupBy(R, r => r.cod).entries()].map(([cod, X]) => ({ cod, fat: sum(X, r => r.tot), vol: sum(X, r => r.vol) })).sort((a, b) => b.fat - a.fat).slice(0, 12);
    const vol = sum(R, r => r.vol);
    A.openDrawer(`
      <h2>${esc(nome)}</h2><p class="muted">${tipo === 'vm' ? 'Vendedor (nome nas Metas)' : 'Nome no SAP'} · ${A.fmtMes(M.ym)} · ${R.length} linhas de nota</p>
      <div class="stat-row">
        <div class="mini"><div class="label">Faturamento</div><div class="value">${brlCompact(sum(R, r => r.tot))}</div></div>
        <div class="mini"><div class="label">Volume</div><div class="value">${lit(vol)}</div></div>
        <div class="mini"><div class="label">Clientes</div><div class="value">${porCli.length}</div></div>
        <div class="mini"><div class="label">Mix premium</div><div class="value">${pct(vol ? sum(R.filter(r => r.premium), r => r.vol) / vol : null)}</div></div>
      </div>
      <div class="card section"><header><h3>Produtos mais vendidos</h3></header>${A.hbars(porSku.map(p => ({ k: M.D.produtos[p.cod] || p.cod, v: p.fat, extra: lit(p.vol) })), brlCompact)}</div>
      <div class="card section"><header><h3>Clientes (${porCli.length})</h3></header>
      <div class="table-wrap"><table><thead><tr><th>Cliente</th><th class="n">Faturamento</th><th class="n">Volume</th><th class="n">NFs</th><th>Última</th><th></th></tr></thead><tbody>
      ${porCli.map(c => `<tr><td><a href="#" data-cli="${esc(c.cli)}">${A.cliLabel(c.cli)}</a></td><td class="n">${brl(c.fat)}</td><td class="n">${lit(c.vol)}</td><td class="n">${c.nfs}</td><td>${A.fmtDate(c.ult)}</td><td><a class="btn ghost sm" href="#" data-visita="${esc(c.cli)}">Visitar</a></td></tr>`).join('')}
      </tbody></table></div></div>`);
  };

  A.drawerCliente = function (cli) {
    const M = A.M, c = A.clienteResumo(M, cli, true), cad = A.cliente(cli);
    const vis = A.visitasVisiveis().filter(v => String(v.cliente) === String(cli)).sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    A.openDrawer(`
      <h2>${cad ? esc(cad.fantasia || cad.razao) : 'Cliente ' + esc(cli)}</h2>
      <p class="muted">Código SAP ${esc(cli)}${cad && cad.razao && cad.fantasia ? ' · ' + esc(cad.razao) : ''}${cad && cad.cidade ? ' · ' + esc(cad.cidade) + '/' + esc(cad.uf || '') : ''}${cad && cad.segmento ? ' · ' + esc(cad.segmento) : ''}</p>
      ${cad && (cad.contato || cad.telefone) ? `<p>${esc(cad.contato || '')} ${cad.telefone ? `· <a href="tel:${esc(cad.telefone)}">${esc(cad.telefone)}</a>` : ''}</p>` : ''}
      <div class="row"><a class="btn" href="#" data-visita="${esc(cli)}">${A.icon('roteiro')} Iniciar visita 5Q3A</a>${window.AUTH.pode('cadastrar_clientes') ? `<button class="btn ghost" data-editcli="${esc(cli)}">${cad ? 'Editar cadastro' : 'Cadastrar dados do cliente'}</button>` : ''}</div>
      ${c ? `<div class="stat-row section">
        <div class="mini"><div class="label">Faturamento${c.meses.length > 1 ? ' (todos os meses)' : ''}</div><div class="value">${brlCompact(c.fat)}</div></div>
        <div class="mini"><div class="label">Volume</div><div class="value">${lit(c.vol)}</div></div>
        <div class="mini"><div class="label">Notas</div><div class="value">${c.nfs}</div></div>
        <div class="mini"><div class="label">Mix premium</div><div class="value">${pct(c.mix)}</div></div>
      </div>
      <p class="muted small">Canal ${esc(c.canal)} · Vendedor(es): ${esc(c.vendedores.join(', '))} · Última compra ${A.fmtDate(c.ultima)} · Condição: ${esc(c.cond)}</p>
      <div class="card section"><header><h3>O que compra</h3></header>${A.hbars(c.porSku.slice(0, 15).map(p => ({ k: p.desc, v: p.fat, extra: lit(p.vol) })), brlCompact)}</div>`
        : '<div class="alert info section"><span>ℹ</span><div>Sem compras na base carregada — cliente novo ou prospecção.</div></div>'}
      <div class="card section"><header><h3>Visitas (${vis.length})</h3></header>
      ${vis.length ? `<ul class="list">${vis.map(v => `<li><b>${A.fmtDate(v.data)}</b> — ${esc(v.consultor)}: ${esc(v.q5.dores.join(', ') || 'sem dores registradas')} · ${v.a2.semPedido ? 'sem pedido' : brl(v.valorEst)} · próximo: ${esc(v.a3.acao || '-')} ${A.fmtDate(v.a3.data)}</li>`).join('')}</ul>` : '<p class="muted">Nenhuma visita registrada.</p>'}</div>`);
  };

  A.views.analises = function (app) {
    const M = A.M;
    const total = sum(M.rows, r => r.tot);
    const canais = A.porChave(M, r => r.canal).sort((a, b) => b.fat - a.fat);
    const regioes = A.porChave(M, r => r.regiao, ['BA', 'SE', '(revisar)']);
    const formas = A.porChave(M, r => r.forma).sort((a, b) => b.fat - a.fat);
    const topCli = [...groupBy(M.rows, r => r.cli).entries()].map(([cli, X]) => ({ cli, fat: sum(X, r => r.tot), vol: sum(X, r => r.vol), nfs: uniq(X, r => r.fat), vend: [...new Set(X.map(r => r.vm))].join(', ') })).sort((a, b) => b.fat - a.fat).slice(0, 20);
    const topProd = [...groupBy(M.rows, r => r.cod).entries()].map(([cod, X]) => ({ cod, fat: sum(X, r => r.tot), vol: sum(X, r => r.vol) })).sort((a, b) => b.fat - a.fat).slice(0, 20);
    const linhas = A.porChave(M, r => { const p = M.prodInfo[r.cod]; return p ? p.base : '—'; }).sort((a, b) => b.vol - a.vol);
    // evolução mensal (quando houver mais de um mês)
    const evol = M.meses.map(ym => { const R = M.todas.filter(r => r.ym === ym && M.escopo.ok(r) && !(A.excluirRemessa() && r.remessa)); return { k: A.fmtMes(ym), v: sum(R, r => r.tot), extra: lit(sum(R, r => r.vol)) }; });
    const tbl = (rows, k) => `<div class="table-wrap"><table><thead><tr><th>${k}</th><th class="n">Faturamento</th><th class="n">Volume (L)</th><th class="n">% do total</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.k)}</td><td class="n">${brl(r.fat)}</td><td class="n">${nf0.format(r.vol)}</td><td class="n">${pct(r.share)}</td></tr>`).join('')}</tbody><tfoot><tr><td>Total</td><td class="n">${brl(total)}</td><td class="n">${nf0.format(sum(M.rows, r => r.vol))}</td><td class="n">100%</td></tr></tfoot></table></div>`;

    app.innerHTML = `
      <section class="card"><header><h2>Faturamento diário</h2><span class="muted small">${A.fmtMes(M.ym)} · dias sem barra = sem faturamento${M.diasCorridos < M.diasMes ? `; após o dia ${M.diasCorridos} = ainda não ocorreu` : ''}</span></header>
        <div class="chart">${A.dailyChart(M)}</div></section>
      ${evol.length > 1 ? `<section class="card section"><header><h2>Evolução mensal</h2></header>${A.hbars(evol, brlCompact)}</section>` : ''}
      <div class="grid two section">
        <section class="card"><header><h2>Faturamento por canal</h2></header>${A.hbars(canais.map(c => ({ k: c.k, v: c.fat, extra: lit(c.vol) + ' · ' + pct(c.share) })), brlCompact)}<div class="section">${tbl(canais, 'Canal')}</div></section>
        <section class="card"><header><h2>Faturamento por região (BA × SE)</h2><span class="muted small">UF do cadastro do cliente; sem cadastro, região do vendedor</span></header>
          ${regioes.every(r => r.k === '(revisar)' || r.fat === 0) ? `<div class="alert warn"><span>⚠</span><div>Nenhuma região definida ainda. Cadastre a UF dos clientes ou defina a região dos vendedores${window.AUTH.pode('editarCadastros') ? ' em <a href="#cadastros">Cadastros → Região</a>' : ''}.</div></div>` : ''}
          ${A.hbars(regioes.map(c => ({ k: c.k, v: c.fat, extra: pct(c.share) })), brlCompact)}<div class="section">${tbl(regioes, 'Região')}</div></section>
      </div>
      <div class="grid two section">
        <section class="card"><header><h2>Forma de pagamento</h2><span class="muted small">Por palavra-chave na condição</span></header>
          <div class="table-wrap"><table><thead><tr><th>Forma</th><th class="n">Linhas</th><th class="n">NFs</th><th class="n">Faturamento</th><th class="n">%</th></tr></thead><tbody>${formas.map(f => `<tr><td>${esc(f.k)}</td><td class="n">${f.n}</td><td class="n">${f.nfs}</td><td class="n">${brl(f.fat)}</td><td class="n">${pct(f.share)}</td></tr>`).join('')}</tbody></table></div></section>
        <section class="card"><header><h2>Volume por tipo de base</h2></header>${A.hbars(linhas.map(c => ({ k: c.k, v: c.vol, extra: brl(c.fat) })), lit)}</section>
      </div>
      <div class="grid two section">
        <section class="card"><header><h2>Top 20 clientes</h2></header>
          <div class="table-wrap"><table><thead><tr><th class="n">#</th><th>Cliente</th><th class="n">Faturamento</th><th class="n">Volume</th><th class="n">NFs</th><th class="n">%</th></tr></thead><tbody>
          ${topCli.map((c, i) => `<tr><td class="n">${i + 1}</td><td><a href="#" data-cli="${esc(c.cli)}">${A.cliLabel(c.cli)}</a><div class="muted small">${esc(c.vend)}</div></td><td class="n">${brl(c.fat)}</td><td class="n">${nf0.format(c.vol)}</td><td class="n">${c.nfs}</td><td class="n">${pct(c.fat / total)}</td></tr>`).join('')}</tbody></table></div></section>
        <section class="card"><header><h2>Top 20 produtos</h2></header>
          <div class="table-wrap"><table><thead><tr><th class="n">#</th><th>Produto</th><th class="n">Faturamento</th><th class="n">Volume</th><th class="n">%</th></tr></thead><tbody>
          ${topProd.map((p, i) => { const inf = M.prodInfo[p.cod]; return `<tr><td class="n">${i + 1}</td><td>${esc(M.D.produtos[p.cod] || p.cod)}<div class="muted small">${esc(p.cod)} · ${esc(inf ? inf.familiaNome : '')}${inf && inf.premium ? ' · premium' : ''}</div></td><td class="n">${brl(p.fat)}</td><td class="n">${nf0.format(p.vol)}</td><td class="n">${pct(p.fat / total)}</td></tr>`; }).join('')}</tbody></table></div></section>
      </div>`;
    app.querySelectorAll('[data-cli]').forEach(a => a.onclick = e => { e.preventDefault(); A.drawerCliente(a.dataset.cli); });
  };
})(window.APP);
