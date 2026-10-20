// Central do Gestor: o que fazer hoje para bater a meta do mês.
// Plano de recuperação por vendedor (dias úteis), clientes parados, oportunidades de
// mix premium, retornos de visita da equipe, pendências de dados e pauta de 1:1.
(function (A) {
  'use strict';
  const { esc, norm, sum, pct, lit, nf0, nf1, groupBy } = A;
  A.views = A.views || {};

  function situacao(v) {
    if (v.semVinculo && !v.vol) return { cls: 'neutral', ico: '○', txt: 'Sem vínculo no SAP', ordem: 6 };
    if (v.metaVol && v.falta <= 0) return { cls: 'good', ico: '●', txt: 'Meta batida', ordem: 5 };
    if (!v.vol) return { cls: 'bad', ico: '■', txt: 'Sem venda', ordem: 0 };
    if (v.pctProj >= 1) return { cls: 'good', ico: '●', txt: 'No caminho', ordem: 4 };
    if (v.esforco <= 1.25) return { cls: 'warn', ico: '▲', txt: 'Recuperável', ordem: 2 };
    return { cls: 'bad', ico: '▼', txt: 'Crítico', ordem: 1 };
  }

  // dados da central (reaproveitados pela pauta 1:1)
  function montar(M) {
    const du = A.diasUteis(M.ym, M.diasCorridos);
    const { out } = A.vendedores(M);
    const vendedores = out.filter(v => v.metaVol > 0).map(v => {
      const mediaDU = du.decorridos ? v.vol / du.decorridos : 0;
      const falta = Math.max(0, v.metaVol - v.vol);
      const necDU = du.restantes ? falta / du.restantes : (falta > 0 ? Infinity : 0);
      const x = Object.assign({}, v, { mediaDU, falta, necDU, projDU: mediaDU * du.total, pctProj: v.metaVol ? mediaDU * du.total / v.metaVol : null, esforco: mediaDU ? necDU / mediaDU : (falta > 0 ? Infinity : 0) });
      x.sit = situacao(x);
      return x;
    });
    const metaMix = new Map(out.map(v => [norm(v.nome), v.metaMix || 0.15]));

    // clientes: última compra (todos os meses) x compras do mês
    const limiar = A.pref('gestorDias') || 10;
    const base = M.todas.filter(r => !r.remessa && M.escopo.ok(r));
    const porCli = [...groupBy(base, r => String(r.cli)).entries()].map(([cli, X]) => {
      const mes = X.filter(r => r.ym === M.ym), antes = X.filter(r => r.ym < M.ym);
      const ult = X.map(r => r.dt).sort().pop();
      const volMes = sum(mes, r => r.vol);
      const vend = [...new Set(X.map(r => r.vm))];
      return { cli, ult, volMes, fatMes: sum(mes, r => r.tot), mixMes: volMes ? sum(mes.filter(r => r.premium), r => r.vol) / volMes : null,
        fatAntes: sum(antes, r => r.tot), volAntes: sum(antes, r => r.vol), mesesAntes: new Set(antes.map(r => r.ym)).size, vend,
        dias: Math.round((new Date(M.dMax) - new Date(ult)) / 864e5) };
    });
    const parados = porCli.filter(c => c.ult <= M.dMax && ((c.volMes > 0 && c.dias >= limiar) || (c.volMes === 0 && c.volAntes > 0)))
      .sort((a, b) => (b.fatMes + b.fatAntes / Math.max(1, b.mesesAntes)) - (a.fatMes + a.fatAntes / Math.max(1, a.mesesAntes)));
    const oport = porCli.filter(c => c.volMes >= 100 && c.mixMes !== null)
      .map(c => { const alvo = Math.max(...c.vend.map(v => metaMix.get(norm(v)) || 0.15)); return Object.assign(c, { alvo, potencial: Math.max(0, (alvo - c.mixMes) * c.volMes) }); })
      .filter(c => c.potencial >= 20).sort((a, b) => b.potencial - a.potencial);

    const hoje = A.todayISO(), em7 = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    const visitas = A.visitasVisiveis();
    const visMes = visitas.filter(v => String(v.data || '').startsWith(M.ym));
    const retornos = visitas.filter(v => v.a3 && v.a3.data && !v.retornoFeito && v.a3.data <= em7).sort((a, b) => a.a3.data.localeCompare(b.a3.data));
    const porConsultor = groupBy(visMes, v => norm(v.consultor));
    return { du, vendedores, parados, oport, retornos, visMes, porConsultor, limiar, hoje };
  }

  A.views.gestor = function (app) {
    const M = A.M, ui = A.ui;
    if (!M.meses.length) { app.innerHTML = '<div class="alert info"><span>ℹ</span><div>Sem dados de vendas importados ainda.</div></div>'; return; }
    const G = montar(M);
    const canais = [...new Set(G.vendedores.map(v => v.canal))];
    const lista = G.vendedores.filter(v => !ui.gestorCanal || v.canal === ui.gestorCanal).sort((a, b) => a.sit.ordem - b.sit.ordem || b.falta - a.falta);
    const tMeta = sum(lista, v => v.metaVol), tVol = sum(lista, v => v.vol), tFalta = Math.max(0, tMeta - tVol);
    const tMedia = G.du.decorridos ? tVol / G.du.decorridos : 0;
    const tNec = G.du.restantes ? tFalta / G.du.restantes : 0;
    const criticos = lista.filter(v => ['Crítico', 'Sem venda'].includes(v.sit.txt)).length;
    const semVinc = lista.filter(v => v.sit.txt === 'Sem vínculo no SAP');
    const atrasados = G.retornos.filter(v => v.a3.data < G.hoje);
    const nomesLista = new Set(lista.map(v => norm(v.nome)));
    const filtraCli = c => !ui.gestorCanal || c.vend.some(n => nomesLista.has(norm(n)));
    const parados = G.parados.filter(filtraCli), oport = G.oport.filter(filtraCli);
    const pend = pendencias(M);

    app.innerHTML = `
      <div class="hello"><div><h2>Central do Gestor</h2><p class="muted">${A.fmtMes(M.ym)} · ${G.du.decorridos} de ${G.du.total} dias úteis (${G.du.restantes} restantes) · dados até ${A.fmtDate(M.dMax)}</p></div>
        <label class="field" style="margin:0;min-width:220px"><span>Canal</span><select id="gCanal"><option value="">Todos os canais</option>${canais.map(c => `<option ${c === ui.gestorCanal ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label></div>
      <div class="grid kpis">
        ${A.kpiCard('Falta para a meta', lit(tFalta), `de ${lit(tMeta)} · ${pct(tMeta ? tVol / tMeta : null)} atingido`, tMeta ? tVol / tMeta : 0, 'alvo')}
        ${A.kpiCard('Necessário por dia útil', `${nf0.format(tNec)} L`, `média atual: ${nf0.format(tMeta ? tMedia : 0)} L/dia útil${tMedia ? ` (${nf1.format(tNec / tMedia)}×)` : ''}`, null, 'ritmo')}
        ${A.kpiCard('Projeção por dias úteis', pct(tMeta ? tMedia * G.du.total / tMeta : null), lit(tMedia * G.du.total), tMeta ? tMedia * G.du.total / tMeta : 0, 'litro')}
        ${A.kpiCard('Pedem atenção hoje', nf0.format(criticos + atrasados.length), `${criticos} vendedor(es) crítico(s) · ${atrasados.length} retorno(s) atrasado(s)`, null, 'notas')}
      </div>

      <section class="card section"><header><h2>Plano de recuperação por vendedor</h2><span class="muted small">Ordenado por urgência · clique em "Pauta 1:1" para preparar a conversa</span></header>
        <div class="table-wrap"><table id="tGestor"><thead><tr><th>Vendedor</th><th>Situação</th><th class="n">Meta (L)</th><th class="n">Realizado</th><th class="n">Falta</th><th class="n">Média / dia útil</th><th class="n">Precisa / dia útil</th><th class="n">Esforço</th><th>Projeção</th><th class="n">Visitas no mês</th><th></th></tr></thead><tbody>
        ${lista.map(v => { const vis = G.porConsultor.get(norm(v.nome)) || []; return `<tr>
          <td><b>${esc(v.nome)}</b><div class="muted small">${esc(v.canal)}</div></td><td>${A.pill(v.sit)}</td>
          <td class="n">${nf0.format(v.metaVol)}</td><td class="n">${nf0.format(v.vol)}</td><td class="n">${v.falta ? nf0.format(v.falta) : '—'}</td>
          <td class="n">${nf0.format(v.mediaDU)}</td><td class="n">${v.falta ? (isFinite(v.necDU) ? nf0.format(v.necDU) : 'mês encerrado') : '—'}</td>
          <td class="n">${v.falta && isFinite(v.esforco) ? `<span class="${v.esforco > 1.25 ? 'txt-bad' : v.esforco > 1 ? 'txt-warn' : ''}">${nf1.format(v.esforco)}×</span>` : '—'}</td>
          <td>${A.inbar(v.pctProj, 1)}</td><td class="n">${vis.length}</td>
          <td><button class="btn ghost sm" data-pauta="${esc(v.nome)}">Pauta 1:1</button></td></tr>`; }).join('') || '<tr><td colspan="11" class="muted">Nenhum vendedor com meta no filtro.</td></tr>'}
        </tbody></table></div>
        ${semVinc.length ? `<p class="small"><span class="pill neutral">○ ${semVinc.length}</span> meta(s) sem vínculo com nenhum nome do SAP (${esc(semVinc.map(v => v.nome).join(', '))}) — ligue no De-Para para acompanhar; somam ${lit(sum(semVinc, v => v.metaVol))} da meta.</p>` : ''}
        <p class="muted small"><b>Esforço</b> = quanto o vendedor precisa vender por dia útil dividido pela média que vem fazendo (1,0× = manter o ritmo). Até 1,25× é recuperável com foco; acima disso, a conversa é de plano de ação. Dias úteis = seg–sex sem os feriados de Cadastros.</p>
      </section>

      <div class="grid two section">
        <section class="card"><header><h2>Clientes parados</h2>
          <label class="small muted">sem compra há <select id="gDias">${[7, 10, 15, 20, 30].map(d => `<option ${d === G.limiar ? 'selected' : ''}>${d}</option>`).join('')}</select> dias</label></header>
          ${parados.length ? `<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Vendedor</th><th>Última compra</th><th class="n">Dias</th><th></th></tr></thead><tbody>
          ${parados.slice(0, 15).map(c => `<tr><td><a href="#" data-cli="${esc(c.cli)}">${A.cliLabel(c.cli)}</a><div class="muted small">${c.volMes ? `${lit(c.volMes)} no mês` : `comprou em mês anterior · ${lit(c.volAntes / Math.max(1, c.mesesAntes))}/mês`}</div></td><td class="small">${esc(c.vend.join(', '))}</td><td>${A.fmtDate(c.ult)}</td><td class="n">${c.dias}</td><td><button class="btn ghost sm" data-visita="${esc(c.cli)}">Visitar</button></td></tr>`).join('')}
          </tbody></table></div>${parados.length > 15 ? `<p class="muted small">+${parados.length - 15} cliente(s). Exporte em Clientes.</p>` : ''}` : '<p class="muted">Nenhum cliente parado no critério escolhido.</p>'}
        </section>
        <section class="card"><header><h2>Oportunidades de mix premium</h2><span class="muted small">Clientes com ≥ 100 L no mês abaixo da meta de mix</span></header>
          ${oport.length ? `<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Vendedor</th><th class="n">Volume</th><th class="n">Mix</th><th class="n">Potencial premium</th></tr></thead><tbody>
          ${oport.slice(0, 12).map(c => `<tr><td><a href="#" data-cli="${esc(c.cli)}">${A.cliLabel(c.cli)}</a></td><td class="small">${esc(c.vend.join(', '))}</td><td class="n">${lit(c.volMes)}</td><td class="n">${pct(c.mixMes)} <span class="muted small">/ ${pct(c.alvo)}</span></td><td class="n"><b>${lit(c.potencial)}</b></td></tr>`).join('')}
          </tbody></table></div><p class="muted small">Potencial = litros que precisariam migrar para a linha premium para o cliente atingir a meta de mix do vendedor.</p>` : '<p class="muted">Nenhuma oportunidade relevante no mês.</p>'}
        </section>
      </div>

      <div class="grid two section">
        <section class="card"><header><h2>Retornos de visita da equipe</h2><span class="muted small">Atrasados e próximos 7 dias</span></header>
          ${G.retornos.length ? `<ul class="list">${G.retornos.slice(0, 15).map(v => `<li><span class="pill ${v.a3.data < G.hoje ? 'bad' : 'neutral'}">${A.fmtDate(v.a3.data)}</span> <b>${esc(v.consultor)}</b> → ${A.cliLabel(v.cliente)} · ${esc(v.a3.acao || 'retorno')}</li>`).join('')}</ul>` : '<p class="muted">Nenhum retorno pendente.</p>'}
          <p class="muted small section">${G.visMes.length} visita(s) registradas em ${A.fmtMes(M.ym)} · ${G.visMes.filter(v => !(v.a2 || {}).semPedido && (v.valorEst || v.volEst)).length} com pedido.</p>
        </section>
        <section class="card"><header><h2>Pendências de dados</h2><span class="muted small">Afetam o que a equipe enxerga</span></header>
          ${pend.length ? `<ul class="list">${pend.map(p => `<li><span class="pill ${p.cls}">${p.n}</span> ${p.txt}${p.link ? ` <a href="${p.link}">resolver</a>` : ''}</li>`).join('')}</ul>` : '<p class="muted">Tudo em ordem.</p>'}
        </section>
      </div>`;

    app.querySelector('#gCanal').onchange = e => { ui.gestorCanal = e.target.value; A.views.gestor(app); };
    app.querySelector('#gDias').onchange = e => { A.pref('gestorDias', +e.target.value); A.views.gestor(app); };
    app.querySelectorAll('[data-cli]').forEach(a => a.onclick = e => { e.preventDefault(); A.drawerCliente(a.dataset.cli); });
    app.querySelectorAll('[data-visita]').forEach(b => b.onclick = () => A.novaVisita(b.dataset.visita));
    app.querySelectorAll('[data-pauta]').forEach(b => b.onclick = () => pauta(b.dataset.pauta, G));
  };

  function pendencias(M) {
    const p = [];
    const admin = window.AUTH.pode('editar_cadastros');
    const revisar = [...new Set(M.todas.filter(r => r.vm === '(revisar)').map(r => r.vend))];
    if (revisar.length) p.push({ n: revisar.length, cls: 'bad', txt: `nome(s) do SAP sem De-Para — essas vendas não aparecem para vendedores e gestores: ${esc(revisar.slice(0, 4).join(', '))}${revisar.length > 4 ? '…' : ''}`, link: admin ? '#cadastros' : '' });
    const semMeta = A.vendedores(M).extras.filter(x => x.nome !== 'Não encontrado' && x.vol > 0);
    if (semMeta.length) p.push({ n: semMeta.length, cls: 'warn', txt: `vendedor(es) com venda e sem meta: ${esc(semMeta.map(x => x.nome).join(', '))}`, link: admin ? '#cadastros' : '' });
    const rg = new Map(M.D.deParaRegiao.map(x => [norm(x[0]), x[1]]));
    const semReg = M.metas.filter(r => (rg.get(norm(r[1])) || '(revisar)') === '(revisar)').length;
    if (semReg) p.push({ n: semReg, cls: 'warn', txt: 'vendedor(es) sem região BA/SE', link: admin ? '#cadastros' : '' });
    const vz = M.doMes.filter(r => r.volZerado && M.escopo.ok(r)).length;
    if (vz && !(A.store.config || {}).corrigirVolume) p.push({ n: vz, cls: 'warn', txt: 'linha(s) do SAP com "Volume Total" zerado (volume subestimado)', link: admin ? '#cadastros' : '' });
    const semCad = A.listaClientes(M).filter(c => !c.cad && c.fatMes > 0).length;
    if (semCad) p.push({ n: semCad, cls: 'neutral', txt: 'cliente(s) que compraram no mês sem cadastro (nome, cidade, UF)', link: '#clientes' });
    return p;
  }

  function pauta(nome, G) {
    const M = A.M;
    const v = G.vendedores.find(x => x.nome === nome);
    if (!v) return;
    const meus = c => c.vend.some(n => norm(n) === norm(nome));
    const parados = G.parados.filter(meus).slice(0, 5);
    const oport = G.oport.filter(meus).slice(0, 3);
    const vis = G.porConsultor.get(norm(nome)) || [];
    const ret = G.retornos.filter(r => norm(r.consultor) === norm(nome));
    const atras = ret.filter(r => r.a3.data < G.hoje);
    const linhas = [
      `PAUTA 1:1 — ${v.nome} — ${A.fmtMes(M.ym)}`,
      '',
      `RESULTADO: ${nf0.format(v.vol)} L de ${nf0.format(v.metaVol)} L (${pct(v.ating)}) · ${v.sit.txt}`,
      `Projeção por dias úteis: ${pct(v.pctProj)} (${nf0.format(v.projDU)} L)`,
      v.falta ? `Para bater a meta: ${isFinite(v.necDU) ? nf0.format(v.necDU) + ' L por dia útil' : 'mês encerrado'} nos ${G.du.restantes} dias úteis restantes — hoje a média é ${nf0.format(v.mediaDU)} L/dia${isFinite(v.esforco) && v.esforco ? ` (${nf1.format(v.esforco)}×)` : ''}.` : 'Meta de volume batida. Próximo passo: mix e cobertura.',
      `Cobertura: ${v.clis} clientes de ${v.metaCli} (${pct(v.cobertura)}) · Mix premium: ${pct(v.mix)} (meta ${pct(v.metaMix)})`,
      '',
      'CLIENTES PARA REATIVAR:',
      ...(parados.length ? parados.map(c => `  - ${A.nomeCli(c.cli) || c.cli} (${c.cli}) — última compra ${A.fmtDate(c.ult)}, ${c.dias} dias`) : ['  - nenhum no critério']),
      '',
      'OPORTUNIDADES DE MIX PREMIUM:',
      ...(oport.length ? oport.map(c => `  - ${A.nomeCli(c.cli) || c.cli} — ${nf0.format(c.volMes)} L, mix ${pct(c.mixMes)}: potencial ${nf0.format(c.potencial)} L`) : ['  - nenhuma relevante']),
      '',
      `VISITAS: ${vis.length} registrada(s) no mês · ${atras.length} retorno(s) atrasado(s)${ret.length ? ` · próximos: ${ret.filter(r => r.a3.data >= G.hoje).map(r => A.fmtDate(r.a3.data) + ' ' + (A.nomeCli(r.cliente) || r.cliente)).slice(0, 3).join('; ') || '—'}` : ''}`,
      '',
      'COMBINADOS:',
      '  1. ',
      '  2. ',
      '  3. ',
      'Próximo acompanhamento: ',
    ];
    const txt = linhas.join('\n');
    A.openDrawer(`<h2>Pauta 1:1 — ${esc(v.nome)}</h2><p class="muted">${esc(v.canal)} · gerada da Central do Gestor · edite antes de enviar</p>
      <textarea id="pautaTxt" class="pauta" rows="24">${esc(txt)}</textarea>
      <div class="row section"><button class="btn" id="pCopiar">Copiar</button><a class="btn ghost" id="pZap" target="_blank" rel="noopener">Enviar no WhatsApp</a><button class="btn ghost" id="pImprimir">Imprimir</button></div>`);
    const ta = document.getElementById('pautaTxt');
    const zap = document.getElementById('pZap');
    const atual = () => { zap.href = 'https://wa.me/?text=' + encodeURIComponent(ta.value); };
    atual(); ta.oninput = atual;
    document.getElementById('pCopiar').onclick = () => A.copiar(ta.value);
    document.getElementById('pImprimir').onclick = () => {
      const w = window.open('', '_blank');
      if (!w) { A.toast('Permita pop-ups para imprimir.', 'erro'); return; }
      w.document.write(`<!doctype html><meta charset="utf-8"><title>Pauta 1:1 — ${esc(v.nome)}</title><pre style="font:14px/1.6 system-ui,sans-serif;white-space:pre-wrap;margin:32px">${esc(ta.value)}</pre>`);
      w.document.close(); w.print();
    };
    A.log('Gerou pauta 1:1 de ' + v.nome);
  }
})(window.APP);
