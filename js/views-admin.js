// Telas administrativas: Importação SAP, Exportação no formato da planilha, Cadastros,
// Usuários e regras de acesso, Perfil e Notas. Tudo grava no servidor.
(function (A) {
  'use strict';
  const { esc, norm, sum, pct, brl, nf0 } = A;
  const S = A.S;
  const AUTH = window.AUTH;
  A.views = A.views || {};
  const cfg = () => A.store.config;

  // ======================= IMPORTAÇÃO SAP =======================
  const ALIAS_SAP = { 'codigo do produto': 'código do produto', 'descricao do produto': 'descrição do produto', 'valor liquido': 'valor líquido', 'descricao condicao pagto': 'descrição condição pagto', 'condicao pagto': 'condição pagto' };
  const OBRIG = ['Cliente', 'Data', 'Fatura', 'Código do Produto', 'Descrição do Produto', 'QTD', 'Volume Total', 'Valor Total', 'Nome Vendedor'];
  function toISO(v) {
    if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v) ? null : new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    if (typeof v === 'number') return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);
    const s = String(v || '').trim(); let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[0] : null;
  }
  const toNum = v => typeof v === 'number' ? v : (String(v ?? '').trim() === '' ? null : (+String(v).replace(/\./g, '').replace(',', '.') || 0));
  const chave = r => [r[S.fat], r[S.item] ?? '', r[S.cod]].join('|');

  A.lerSAP = async function (file) {
    if (!window.XLSX) throw new Error('Leitor de Excel não carregou (verifique a internet).');
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    const ws = wb.Sheets['Dados_SAP'] || wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    const hi = aoa.findIndex(r => r && r.some(c => String(c || '').trim().toLowerCase() === 'valor total'));
    if (hi < 0) throw new Error('Cabeçalho "Valor Total" não encontrado. Use a extração SAP com as colunas da aba Dados_SAP.');
    const h = aoa[hi].map(c => { const k = String(c || '').trim().toLowerCase(); return ALIAS_SAP[k] || k; });
    const pos = A.COLS_SAP.map(n => h.indexOf(n.toLowerCase()));
    const falta = OBRIG.filter(n => pos[A.COLS_SAP.indexOf(n)] < 0);
    if (falta.length) throw new Error('Colunas obrigatórias não encontradas: ' + falta.join(', '));
    const rows = [], erros = [];
    aoa.slice(hi + 1).forEach((r, i) => {
      if (!r || r[pos[S.cli]] === null || r[pos[S.cli]] === '') return;
      const o = pos.map(p => (p >= 0 ? r[p] : null));
      o[S.data] = toISO(o[S.data]); o[S.dataNf] = o[S.dataNf] ? toISO(o[S.dataNf]) : null;
      if (!o[S.data]) { erros.push(`linha ${hi + i + 2}: data inválida`); return; }
      if (o[S.fat] === null || o[S.cod] === null) { erros.push(`linha ${hi + i + 2}: sem fatura ou produto`); return; }
      [S.qtd, S.volMat, S.vol, S.liq, S.imp, S.tot].forEach(k => { o[k] = toNum(o[k]); });
      if (o[S.tot] === null) { erros.push(`linha ${hi + i + 2}: sem Valor Total`); return; }
      o[S.vend] = A.norm(o[S.vend]) || 'Não encontrado';
      for (let k = 0; k < 25; k++) if (o[k] instanceof Object && !(Array.isArray(o[k]))) o[k] = String(o[k]);
      rows.push(o);
    });
    return { rows, erros, nome: file.name };
  };

  A.importarSAP = async function (file) {
    if (!AUTH.pode('importar_sap')) { A.toast('Seu usuário não pode importar dados do SAP.', 'erro'); return; }
    let lido;
    try { lido = await A.lerSAP(file); } catch (e) { A.toast('Falha ao ler: ' + e.message, 'erro'); return; }
    const { rows, erros } = lido;
    if (!rows.length) { A.toast('Nenhuma linha de dados encontrada.', 'erro'); return; }
    const D = A.dados();
    const atuais = D.sap;
    const mesesArq = [...new Set(rows.map(r => r[S.data].slice(0, 7)))].sort();
    const mesesBase = [...new Set(atuais.map(r => String(r[S.data]).slice(0, 7)))].sort();
    const chavesBase = new Set(atuais.map(chave));
    const dup = rows.filter(r => chavesBase.has(chave(r))).length;
    const dpNomes = new Set(D.deParaVendedores.map(r => norm(r[0])));
    const vendNovos = [...new Set(rows.map(r => r[S.vend]).filter(v => !dpNomes.has(norm(v))))];
    const skusNovos = [...new Set(rows.filter(r => !D.produtos[r[S.cod]]).map(r => r[S.cod] + ' — ' + r[S.desc]))];
    const fat = sum(rows, r => +r[S.tot] || 0), vol = sum(rows, r => +r[S.vol] || 0);
    const datas = rows.map(r => r[S.data]).sort();
    A.openDrawer(`<h2>Importar dados SAP</h2><p class="muted">${esc(file.name)} · os dados vão para o servidor e ficam disponíveis para toda a equipe (cada um vê só o que as regras permitem).</p>
      <div class="stat-row section">
        <div class="mini"><div class="label">Linhas válidas</div><div class="value">${nf0.format(rows.length)}</div></div>
        <div class="mini"><div class="label">Período</div><div class="value small-v">${A.fmtDate(datas[0])} a ${A.fmtDate(datas[datas.length - 1])}</div></div>
        <div class="mini"><div class="label">Faturamento</div><div class="value">${A.brlCompact(fat)}</div></div>
        <div class="mini"><div class="label">Volume</div><div class="value">${A.lit(vol)}</div></div>
      </div>
      ${erros.length ? `<div class="alert warn section"><span>⚠</span><div><b>${erros.length} linha(s) ignorada(s):</b> ${esc(erros.slice(0, 5).join('; '))}${erros.length > 5 ? '…' : ''}</div></div>` : ''}
      ${vendNovos.length ? `<div class="alert warn section"><span>⚠</span><div><b>Vendedores sem De-Para:</b> ${esc(vendNovos.join(', '))}. Vão aparecer como "(revisar)" até serem mapeados em Cadastros — e vendedores/gestores não verão essas vendas até lá.</div></div>` : ''}
      ${skusNovos.length ? `<div class="alert info section"><span>ℹ</span><div><b>${skusNovos.length} SKU(s) novo(s)</b> — classificados automaticamente: ${esc(skusNovos.slice(0, 6).join('; '))}${skusNovos.length > 6 ? '…' : ''}</div></div>` : ''}
      <fieldset class="section modos"><legend>Como aplicar</legend>
        <label class="check"><input type="radio" name="modo" value="meses" checked><span><b>Substituir só ${mesesArq.map(A.fmtMes).join(', ')}</b><br><span class="muted small">Recomendado. Mantém os outros meses (${mesesBase.filter(m => !mesesArq.includes(m)).map(A.fmtMes).join(', ') || 'nenhum'}) e troca os meses do arquivo.</span></span></label>
        <label class="check"><input type="radio" name="modo" value="acrescentar"><span><b>Acrescentar linhas novas</b><br><span class="muted small">Ignora ${nf0.format(dup)} linha(s) já existentes (mesma fatura + item + produto).</span></span></label>
        <label class="check"><input type="radio" name="modo" value="substituir"><span><b>Substituir toda a base</b><br><span class="muted small">Apaga os ${nf0.format(atuais.length)} registros atuais de todos os meses.</span></span></label>
      </fieldset>
      <p class="erro" id="impErro" role="alert"></p>
      <div class="row section"><button class="btn" id="aplicarImp">Importar</button><button class="btn ghost" id="cancImp">Cancelar</button></div>`);
    document.getElementById('cancImp').onclick = A.closeDrawer;
    document.getElementById('aplicarImp').onclick = async () => {
      const modo = document.querySelector('input[name=modo]:checked').value;
      if (modo === 'substituir' && !confirm('Apagar TODOS os meses atuais e ficar só com este arquivo?')) return;
      const bt = document.getElementById('aplicarImp'); bt.disabled = true; bt.textContent = 'Enviando…';
      try {
        const r = await A.rpc('cglub_importar_sap', { p_linhas: rows, p_modo: modo, p_arquivo: file.name }, { timeout: 120000 });
        A.ui.mes = mesesArq[mesesArq.length - 1];
        A.closeDrawer();
        A.toast(`${nf0.format(r.inseridas)} linhas importadas${r.ignoradas ? ` · ${nf0.format(r.ignoradas)} já existiam` : ''}.`, 'ok');
        await A.recarregar(true);
      } catch (e) {
        document.getElementById('impErro').textContent = e.message; bt.disabled = false; bt.textContent = 'Importar';
      }
    };
  };

  // ======================= EXPORTAÇÃO (estrutura da planilha) =======================
  A.exportarPlanilha = function () {
    if (!window.XLSX) { A.toast('Leitor de Excel não carregou (sem internet?).', 'erro'); return; }
    const D = A.dados(), M = A.M;
    const wb = XLSX.utils.book_new();
    const comData = r => r.map((v, i) => (i === S.data || i === S.dataNf) && v ? new Date(v + 'T00:00:00') : v);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([A.COLS_SAP].concat(D.sap.map(comData)), { cellDates: true }), 'Dados_SAP');
    const mc = A.metasDoMes(M.ym), ms = D.metasSupervisor;
    const n = Math.max(mc.length, ms.length);
    const metas = [['METAS POR SUPERVISOR / CANAL (visão regional)', null, null, null, `METAS POR COLABORADOR (visão individual) — ${A.fmtMes(M.ym)}`], ['Supervisor - Canal', 'Volume (Meta L)', 'Cobertura (Meta Nº Clientes)', null, 'Canal', 'Colaborador', 'Volume (Meta L)', 'Núm. de Clientes (Meta)', 'Mix Premium (Meta %)']];
    for (let i = 0; i < n; i++) metas.push([...(ms[i] || [null, null, null]), null, ...(mc[i] || [null, null, null, null, null])]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(metas), 'Metas');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['TABELA DE CORRESPONDÊNCIA: Nome do Vendedor no SAP  x  Nome do Colaborador na aba Metas'], ['Nome no SAP', 'Nome nas Metas', 'Canal', 'Confiança do Match', 'Observação']].concat(D.deParaVendedores)), 'De_Para_Vendedores');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['REGIÃO POR VENDEDOR (Bahia x Sergipe) — EDITÁVEL, preencher BA ou SE'], ['Vendedor (nas Metas)', 'Região (BA/SE)']].concat(D.deParaRegiao)), 'De_Para_Regiao');
    const cls = Object.values(M.prodInfo).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo))).map(p => [p.codigo, p.desc, `${p.familiaNome} — ${p.base}`, p.premium === true ? 'Sim' : p.premium === false ? 'Não' : '', p.premiumFonte === 'manual' ? 'Ajuste manual' : 'Classificação automática (app)']);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['CLASSIFICAÇÃO DE PRODUTOS (linha / premium)'], ['Código do Produto', 'Descrição do Produto', 'Linha (classificação sugerida)', 'Premium (S/N)', 'Observação']].concat(cls)), 'Classificacao_Produtos');
    const cli = Object.values(D.clientes);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Código', 'Razão Social', 'Nome Fantasia', 'CNPJ', 'Cidade', 'UF', 'Segmento', 'Contato', 'Telefone', 'E-mail', 'Vendedor', 'Observações']].concat(cli.map(c => [c.codigo, c.razao, c.fantasia, c.cnpj, c.cidade, c.uf, c.segmento, c.contato, c.telefone, c.email, c.vendedor, c.obs]))), 'Clientes');
    const vis = A.store.visitas || [];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Data', 'Consultor', 'Cliente', 'Objetivo', 'Tipo', 'Perfis', 'Concorrentes', 'Share Lubrax %', 'Nota PDV', 'Dores', 'Produtos ofertados', 'Pedido (R$)', 'Pedido (L)', 'Condição', 'Retorno', 'Próxima ação', 'Registrado por']].concat(vis.map(v => [v.data, v.consultor, v.cliente, v.objetivo, (v.q1 || {}).tipo, ((v.q1 || {}).perfis || []).join('; '), ((v.q3 || {}).marcas || []).join('; '), (v.q3 || {}).share, ((v.q4 || {}).checks || []).length, ((v.q5 || {}).dores || []).join('; '), ((v.a1 || {}).produtos || []).map(c => D.produtos[c] || c).join('; '), A.round(v.valorEst || 0, 2), A.round(v.volEst || 0), (v.a2 || {}).cond, (v.a3 || {}).data, (v.a3 || {}).acao, v.criadoPorNome]))), 'Visitas_5Q3A');
    XLSX.writeFile(wb, `Painel_Comercial_CGLUB_dados_${A.todayISO()}.xlsx`, { cellDates: true });
    A.log('Exportou planilha de dados');
  };

  // ======================= CADASTROS =======================
  A.views.cadastros = function (app) {
    const M = A.M, D = M.D, ui = A.ui;
    const podeCad = AUTH.pode('editar_cadastros'), podeImp = AUTH.pode('importar_sap');
    const todas = [['metas', 'Metas do mês'], ['supervisor', 'Metas por supervisor'], ['depara', 'De-Para vendedores'], ['regiao', 'Região BA/SE'], ['produtos', 'Produtos / premium'], ['feriados', 'Feriados'], ['dados', 'Base de dados']];
    const abas = todas.filter(([k]) => k === 'dados' ? (podeImp || podeCad) : podeCad);
    if (!abas.some(([k]) => k === ui.cadAba)) ui.cadAba = abas[0][0];
    const metas = A.metasDoMes(M.ym);
    const proprias = !!(cfg().metasPorMes && cfg().metasPorMes[M.ym]);
    let body = '';
    if (ui.cadAba === 'metas') {
      body = `<div class="alert info"><span>ℹ</span><div>Metas de <b>${A.fmtMes(M.ym)}</b> ${proprias ? '(tabela própria deste mês)' : '(usando a tabela vigente — ao editar, é criada uma cópia só para este mês)'}. Troque o mês no topo para editar outro período.</div></div>
        <div class="table-wrap"><table><thead><tr><th>Canal</th><th>Colaborador</th><th class="n">Meta volume (L)</th><th class="n">Meta nº clientes</th><th class="n">Meta mix (%)</th><th></th></tr></thead><tbody>
        ${metas.map((r, i) => `<tr><td><input data-m="${i}.0" value="${esc(r[0])}" aria-label="Canal"></td><td><input data-m="${i}.1" value="${esc(r[1])}" aria-label="Colaborador"></td><td><input type="number" min="0" data-m="${i}.2" value="${r[2]}" aria-label="Meta volume"></td><td><input type="number" min="0" data-m="${i}.3" value="${r[3]}" aria-label="Meta clientes"></td><td><input type="number" min="0" max="100" step="1" data-m="${i}.4" value="${A.round((+r[4] || 0) * 100, 1)}" aria-label="Meta mix"></td><td><button class="btn ghost sm danger" data-mdel="${i}" aria-label="Remover">✕</button></td></tr>`).join('')}
        </tbody><tfoot><tr><td colspan="2">Total</td><td class="n">${nf0.format(sum(metas, r => +r[2] || 0))}</td><td class="n">${nf0.format(sum(metas, r => +r[3] || 0))}</td><td colspan="2"></td></tr></tfoot></table></div>
        <div class="row section"><button class="btn" id="novoVend">${A.icon('plus')} Novo vendedor (metas + De-Para + região)</button>${proprias ? '<button class="btn ghost sm" id="tornarVig">Usar estas metas como vigentes</button>' : ''}</div>`;
    } else if (ui.cadAba === 'supervisor') {
      body = `<div class="table-wrap"><table><thead><tr><th>Supervisor - Canal</th><th class="n">Volume (meta L)</th><th class="n">Cobertura (meta clientes)</th></tr></thead><tbody>${D.metasSupervisor.map((r, i) => `<tr><td>${esc(r[0])}</td><td><input type="number" data-s="${i}.1" value="${r[1]}"></td><td><input type="number" data-s="${i}.2" value="${r[2]}"></td></tr>`).join('')}</tbody></table></div>
        <p class="muted small">A 1ª linha é o total consolidado. Não há vínculo colaborador → supervisor na planilha; o painel consolida por canal.</p>`;
    } else if (ui.cadAba === 'depara') {
      const nomesSap = [...new Set(M.todas.map(r => r.vend))].sort();
      const mapeados = new Set(D.deParaVendedores.map(r => norm(r[0])));
      const faltam = nomesSap.filter(n => !mapeados.has(n));
      const nomes = metas.map(r => r[1]);
      body = `<div class="alert info"><span>🔒</span><div>O De-Para também define <b>o que cada vendedor e gestor enxerga</b>: as vendas de um "Nome no SAP" só aparecem para o vendedor vinculado ao "Nome nas Metas" e para os gestores do canal.</div></div>
        ${faltam.length ? `<div class="alert warn"><span>⚠</span><div><b>Nomes do SAP sem De-Para:</b> ${faltam.map(n => `<button class="linklike" data-addmap="${esc(n)}">${esc(n)}</button>`).join(', ')} — clique para adicionar.</div></div>` : ''}
        <div class="table-wrap"><table><thead><tr><th>Nome no SAP</th><th>Nome nas Metas</th><th>Canal</th><th>Confiança</th><th>Observação</th><th></th></tr></thead><tbody>
        ${D.deParaVendedores.map((r, i) => `<tr><td><input data-d="${i}.0" value="${esc(r[0])}"></td><td><select data-d="${i}.1"><option>(sem correspondência)</option>${nomes.map(m => `<option ${m === r[1] ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></td><td><input data-d="${i}.2" value="${esc(r[2])}"></td><td>${/BAIXA|SEM/.test(r[3]) ? `<span class="pill bad">${esc(r[3])}</span>` : /Média/.test(r[3]) ? `<span class="pill warn">${esc(r[3])}</span>` : `<span class="pill neutral">${esc(r[3])}</span>`}</td><td><input data-d="${i}.4" value="${esc(r[4])}"></td><td><button class="btn ghost sm danger" data-ddel="${i}" aria-label="Remover">✕</button></td></tr>`).join('')}
        </tbody></table></div><p><button class="btn ghost sm" id="dAdd">${A.icon('plus')} Adicionar linha</button></p>`;
    } else if (ui.cadAba === 'regiao') {
      const rg = new Map(D.deParaRegiao.map(r => [norm(r[0]), r[1]]));
      const nomes = metas.map(r => r[1]);
      const pend = nomes.filter(n => (rg.get(norm(n)) || '(revisar)') === '(revisar)').length;
      body = `<div class="alert ${pend ? 'warn' : 'info'}"><span>${pend ? '⚠' : 'ℹ'}</span><div>${pend ? `<b>${pend} de ${nomes.length}</b> vendedores ainda sem região. ` : ''}A região do <b>cliente</b> (UF no cadastro) tem prioridade; esta tabela vale para clientes sem cadastro.</div></div>
        <div class="row" style="margin-bottom:10px"><button class="btn ghost sm" data-rall="BA">Todos BA</button><button class="btn ghost sm" data-rall="SE">Todos SE</button></div>
        <div class="table-wrap"><table><thead><tr><th>Vendedor (nas Metas)</th><th>Região</th></tr></thead><tbody>
        ${nomes.map(n => `<tr><td>${esc(n)}</td><td><select data-r="${esc(n)}">${['(revisar)', 'BA', 'SE'].map(o => `<option ${(rg.get(norm(n)) || '(revisar)') === o ? 'selected' : ''}>${o}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div>`;
    } else if (ui.cadAba === 'produtos') {
      const old = new Map(D.classificacao.map(r => [String(r[0]), r]));
      const ps = Object.values(M.prodInfo).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
      const diverg = ps.filter(p => { const o = old.get(String(p.codigo)); const op = o ? o[3] : ''; return op !== '' && (op === 'Sim') !== (p.premium === true); });
      body = `<div class="alert info"><span>ℹ</span><div>O app reclassifica os SKUs pela descrição. <b>${diverg.length}</b> SKU(s) têm premium diferente da aba Classificacao_Produtos original. Use "Ajuste manual" para forçar Sim/Não.</div></div>
        <div class="filters"><label class="switch"><input type="checkbox" id="soDiv" ${ui.soDiv ? 'checked' : ''}> Só divergências</label></div>
        <div class="table-wrap"><table><thead><tr><th>Código</th><th>Descrição</th><th>Família</th><th>Base</th><th>Planilha</th><th>App</th><th>Ajuste manual</th></tr></thead><tbody>
        ${(ui.soDiv ? diverg : ps).map(p => { const o = old.get(String(p.codigo)); const ov = (cfg().premiumOverride || {})[p.codigo] || ''; return `<tr ${diverg.includes(p) ? 'class="hl"' : ''}><td>${esc(p.codigo)}</td><td>${esc(p.desc)}</td><td>${esc(p.familiaNome)}</td><td>${esc(p.base)}</td><td>${esc(o ? (o[3] || '—') : 'novo')}</td><td>${p.premium === true ? 'Sim' : p.premium === false ? 'Não' : '—'}</td><td><select data-pov="${esc(p.codigo)}" aria-label="Ajuste premium"><option value="">Auto</option><option ${ov === 'Sim' ? 'selected' : ''}>Sim</option><option ${ov === 'Não' ? 'selected' : ''}>Não</option></select></td></tr>`; }).join('')}
        </tbody></table></div>`;
    } else if (ui.cadAba === 'feriados') {
      const fer = (cfg().feriados || []).slice().sort((a, b) => a.data.localeCompare(b.data));
      body = `<div class="alert info"><span>ℹ</span><div>Os feriados entram no cálculo de <b>dias úteis</b> (segunda a sexta), usado no ritmo projetado e na Central do Gestor. Inclua feriados municipais e pontos facultativos em que a distribuidora não fatura.</div></div>
        <form id="fFer" class="row"><label class="field" style="flex:0 0 170px"><span>Data</span><input type="date" name="data" required></label><label class="field"><span>Nome</span><input name="nome" required placeholder="ex.: São João"></label><button class="btn" type="submit">${A.icon('plus')} Adicionar</button></form>
        <div class="table-wrap section"><table><thead><tr><th>Data</th><th>Dia</th><th>Feriado</th><th></th></tr></thead><tbody>
        ${fer.map(f => `<tr><td>${A.fmtDate(f.data)}</td><td>${['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(f.data + 'T12:00').getDay()]}</td><td>${esc(f.nome)}</td><td><button class="btn ghost sm danger" data-fdel="${esc(f.data)}" aria-label="Remover">✕</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted">Nenhum feriado cadastrado.</td></tr>'}</tbody></table></div>`;
    } else {
      const imps = A.store.importacoes || [];
      body = `<div class="grid two">
        <section class="card soft"><h3>Base de vendas no servidor</h3><p>${nf0.format(D.sap.length)} linhas · meses: ${M.meses.map(A.fmtMes).join(', ') || '—'} · ${nf0.format(Object.keys(D.produtos).length)} SKUs · ${nf0.format(Object.keys(D.clientes).length)} clientes cadastrados</p>
          <div class="row">${podeImp ? `<button class="btn" id="impSap">${A.icon('upload')} Importar SAP</button>` : ''}${AUTH.pode('exportar') ? `<button class="btn ghost" id="expXlsx">${A.icon('download')} Baixar planilha (estrutura original)</button>` : ''}</div>
          ${podeCad ? `<label class="switch section"><input type="checkbox" id="corrVol" ${cfg().corrigirVolume ? 'checked' : ''}> Corrigir "Volume Total" zerado do SAP com QTD × Volume Material (${nf0.format(M.todas.filter(r => r.volZerado).length)} linhas)</label>` : ''}
          <p class="muted small">A planilha baixada tem as abas Dados_SAP (colunas A:Y), Metas, De_Para_Vendedores, De_Para_Regiao e Classificacao_Produtos no layout original, mais Clientes e Visitas_5Q3A. Pode ser reimportada.</p></section>
        ${AUTH.ehAdmin() ? `<section class="card soft"><h3>Identidade visual</h3><p class="small">Envie o logo oficial Lubrax (SVG ou PNG do kit de marca, versão para fundo escuro). Vale para todos os usuários.</p>
          <div class="logo-preview">${A.logoHTML('lg')}</div>
          <div class="row"><button class="btn ghost" id="upLogo">${A.icon('upload')} Enviar logo</button>${cfg().logo ? '<button class="btn ghost danger" id="rmLogo">Remover</button>' : ''}<input type="file" id="fileLogo" accept="image/svg+xml,image/png,image/jpeg,image/webp" hidden></div></section>` : ''}
        </div>
        <section class="card soft section"><h3>Histórico de importações</h3>${imps.length ? `<ul class="list">${imps.map(i => `<li>${A.fmtDate(String(i.t).slice(0, 10))} — ${esc(i.arquivo)} · ${nf0.format(i.linhas)} linhas · ${esc(i.modo)} · ${esc(i.por || '')}</li>`).join('')}</ul>` : '<p class="muted">Nenhuma importação registrada.</p>'}</section>`;
    }
    app.innerHTML = `<section class="card"><header><h2>Cadastros</h2><span class="muted small">Alterações valem para toda a equipe assim que salvas</span></header>
      <div class="seg-tabs" role="tablist">${abas.map(([k, t]) => `<button class="chip" role="tab" data-cad="${k}" aria-pressed="${ui.cadAba === k}">${t}</button>`).join('')}</div>${body}</section>`;
    A.mountLogos(app);
    bindCadastros(app, D, M);
  };

  function bindCadastros(app, D, M) {
    const again = () => { A.build(); A.views.cadastros(app); };
    const c = cfg();
    const edit = (key, src) => { if (!c[key]) c[key] = JSON.parse(JSON.stringify(src || [])); return c[key]; };
    const salvar = async (key, rerender) => { const ok = await A.salvarConfig(key); if (ok) A.toast('Salvo.', 'ok'); if (rerender) again(); else A.build(); };
    app.querySelectorAll('[data-cad]').forEach(b => b.onclick = () => { A.ui.cadAba = b.dataset.cad; A.views.cadastros(app); });
    app.querySelectorAll('[data-m]').forEach(inp => inp.onchange = () => { const [i, j] = inp.dataset.m.split('.').map(Number); const t = A.metasEditaveis(M.ym); t[i][j] = j >= 2 ? (j === 4 ? (+inp.value || 0) / 100 : +inp.value || 0) : inp.value; salvar('metasPorMes'); });
    app.querySelectorAll('[data-mdel]').forEach(b => b.onclick = () => { const t = A.metasEditaveis(M.ym); if (!confirm(`Remover ${t[+b.dataset.mdel][1]} das metas de ${A.fmtMes(M.ym)}?`)) return; t.splice(+b.dataset.mdel, 1); salvar('metasPorMes', true); });
    const tv = app.querySelector('#tornarVig'); if (tv) tv.onclick = () => { c.metasVigentes = JSON.parse(JSON.stringify(c.metasPorMes[M.ym])); salvar('metasVigentes'); };
    const nv = app.querySelector('#novoVend'); if (nv) nv.onclick = () => formNovoVendedor(D, M);
    app.querySelectorAll('[data-s]').forEach(inp => inp.onchange = () => { const [i, j] = inp.dataset.s.split('.').map(Number); edit('metasSupervisor', D.metasSupervisor)[i][j] = +inp.value || 0; salvar('metasSupervisor'); });
    app.querySelectorAll('[data-d]').forEach(inp => inp.onchange = () => { const [i, j] = inp.dataset.d.split('.').map(Number); const t = edit('deParaVendedores', D.deParaVendedores); t[i][j] = inp.value; if (j === 1) { t[i][3] = 'Manual'; const mc = A.metasDoMes(M.ym).find(r => r[1] === inp.value); if (mc) t[i][2] = mc[0]; } salvar('deParaVendedores', true); });
    app.querySelectorAll('[data-ddel]').forEach(b => b.onclick = () => { edit('deParaVendedores', D.deParaVendedores).splice(+b.dataset.ddel, 1); salvar('deParaVendedores', true); });
    app.querySelectorAll('[data-addmap]').forEach(b => b.onclick = () => { edit('deParaVendedores', D.deParaVendedores).push([b.dataset.addmap, '(sem correspondência)', 'Sem vendedor identificado', 'Manual', '']); salvar('deParaVendedores', true); });
    const da = app.querySelector('#dAdd'); if (da) da.onclick = () => { edit('deParaVendedores', D.deParaVendedores).push(['', '(sem correspondência)', 'Sem vendedor identificado', 'Manual', '']); salvar('deParaVendedores', true); };
    const setReg = (n, v) => { const t = edit('deParaRegiao', D.deParaRegiao); const r = t.find(x => norm(x[0]) === norm(n)); if (r) r[1] = v; else t.push([n, v]); };
    app.querySelectorAll('[data-r]').forEach(s => s.onchange = () => { setReg(s.dataset.r, s.value); salvar('deParaRegiao'); });
    app.querySelectorAll('[data-rall]').forEach(b => b.onclick = () => { if (!confirm('Definir todos os vendedores como ' + b.dataset.rall + '?')) return; A.metasDoMes(M.ym).forEach(r => setReg(r[1], b.dataset.rall)); salvar('deParaRegiao', true); });
    app.querySelectorAll('[data-pov]').forEach(s => s.onchange = () => { c.premiumOverride = c.premiumOverride || {}; if (s.value) c.premiumOverride[s.dataset.pov] = s.value; else delete c.premiumOverride[s.dataset.pov]; salvar('premiumOverride', true); });
    const sd = app.querySelector('#soDiv'); if (sd) sd.onchange = () => { A.ui.soDiv = sd.checked; A.views.cadastros(app); };
    const ff = app.querySelector('#fFer');
    if (ff) ff.onsubmit = e => { e.preventDefault(); const f = e.target.elements; c.feriados = (c.feriados || []).filter(x => x.data !== f.data.value).concat([{ data: f.data.value, nome: f.nome.value.trim() }]); salvar('feriados', true); };
    app.querySelectorAll('[data-fdel]').forEach(b => b.onclick = () => { c.feriados = (c.feriados || []).filter(x => x.data !== b.dataset.fdel); salvar('feriados', true); });
    const is = app.querySelector('#impSap'); if (is) is.onclick = () => document.getElementById('fileSap').click();
    const ex = app.querySelector('#expXlsx'); if (ex) ex.onclick = A.exportarPlanilha;
    const cv = app.querySelector('#corrVol'); if (cv) cv.onchange = () => { c.corrigirVolume = cv.checked; salvar('corrigirVolume'); };
    const ul = app.querySelector('#upLogo');
    if (ul) {
      ul.onclick = () => app.querySelector('#fileLogo').click();
      app.querySelector('#fileLogo').onchange = e => { const f = e.target.files[0]; if (!f) return; if (f.size > 600e3) { A.toast('Logo grande demais (máx. 600 KB).', 'erro'); return; } const r = new FileReader(); r.onload = async () => { c.logo = r.result; if (await A.salvarConfig('logo')) { A.toast('Logo atualizado para todos.', 'ok'); document.querySelectorAll('[data-logo]').forEach(s => { delete s.dataset.ok; }); A.renderShell(); again(); } }; r.readAsDataURL(f); };
      const rm = app.querySelector('#rmLogo'); if (rm) rm.onclick = async () => { c.logo = null; await A.salvarConfig('logo'); delete c.logo; A.renderShell(); again(); };
    }
  }

  function formNovoVendedor(D, M) {
    const canais = [...new Set(A.metasDoMes(M.ym).map(r => r[0]))];
    const nomesSap = [...new Set(M.todas.map(r => r.vend))].sort();
    A.openDrawer(`<h2>Novo vendedor</h2><p class="muted">Cadastra de uma vez nas Metas, no De-Para e na Região${AUTH.ehAdmin() ? ' e, se quiser, cria o acesso dele' : ''}.</p>
      <form id="fVend" class="form">
        <label class="field"><span>Nome (como nas Metas) *</span><input name="nome" required></label>
        <label class="field"><span>Nome no SAP</span><input name="sap" list="nomesSap" placeholder="como aparece em Nome Vendedor"><datalist id="nomesSap">${nomesSap.map(n => `<option value="${esc(n)}">`).join('')}</datalist></label>
        <div class="row"><label class="field"><span>Canal *</span><select name="canal">${canais.map(c => `<option>${esc(c)}</option>`).join('')}</select></label>
        <label class="field"><span>Região</span><select name="regiao"><option>(revisar)</option><option>BA</option><option>SE</option></select></label></div>
        <div class="row"><label class="field"><span>Meta volume (L)</span><input name="vol" type="number" min="0" value="0"></label>
        <label class="field"><span>Meta clientes</span><input name="cli" type="number" min="0" value="0"></label>
        <label class="field"><span>Meta mix (%)</span><input name="mix" type="number" min="0" max="100" value="15"></label></div>
        ${AUTH.ehAdmin() ? `<label class="check"><input type="checkbox" name="criarUser"> Criar também o acesso (perfil Vendedor)</label>
        <div class="row" id="userCampos" hidden><label class="field"><span>Login (e-mail)</span><input name="login" type="email"></label></div>` : ''}
        <p class="erro" id="vErro" role="alert"></p>
        <button class="btn" type="submit">Cadastrar vendedor</button>
      </form>`);
    const f = document.getElementById('fVend');
    if (f.elements.criarUser) f.elements.criarUser.onchange = () => { document.getElementById('userCampos').hidden = !f.elements.criarUser.checked; };
    f.onsubmit = async e => {
      e.preventDefault();
      const o = Object.fromEntries(new FormData(f).entries());
      const nome = o.nome.trim(), err = m => { document.getElementById('vErro').textContent = m; };
      if (!nome) return err('Informe o nome.');
      if (A.metasDoMes(M.ym).some(r => norm(r[1]) === norm(nome))) return err('Já existe vendedor com esse nome nas metas deste mês.');
      const c = cfg();
      const linha = [o.canal, nome, +o.vol || 0, +o.cli || 0, (+o.mix || 0) / 100];
      A.metasEditaveis(M.ym).push(linha.slice());
      c.metasVigentes = c.metasVigentes || [];
      if (!c.metasVigentes.some(r => norm(r[1]) === norm(nome))) c.metasVigentes.push(linha.slice());
      if (o.sap && o.sap.trim()) {
        const dp = c.deParaVendedores = c.deParaVendedores || [];
        const ex = dp.find(r => norm(r[0]) === norm(o.sap)); if (ex) { ex[1] = nome; ex[2] = o.canal; ex[3] = 'Manual'; } else dp.push([o.sap.trim(), nome, o.canal, 'Manual', '']);
      }
      const rg = c.deParaRegiao = c.deParaRegiao || [];
      const rr = rg.find(r => norm(r[0]) === norm(nome)); if (rr) rr[1] = o.regiao; else rg.push([nome, o.regiao]);
      for (const k of ['metasPorMes', 'metasVigentes', 'deParaVendedores', 'deParaRegiao']) if (!(await A.salvarConfig(k))) return err('Falha ao salvar ' + k + '.');
      let temp = '';
      if (o.criarUser) {
        temp = AUTH.senhaTemporaria();
        try {
          const r = await A.rpc('cglub_usuario_salvar', { p_dados: { login: o.login, nome, perfil: 'consultor', vendedor: nome }, p_senha_temp: temp });
          if (!r.ok) { temp = ''; A.toast('Vendedor cadastrado, mas o acesso não foi criado: ' + r.erro, 'erro'); }
        } catch (ex) { temp = ''; A.toast('Vendedor cadastrado, mas o acesso não foi criado: ' + ex.message, 'erro'); }
      }
      if (temp) {
        A.openDrawer(senhaHTML('Vendedor cadastrado', `Acesso criado para <b>${esc(o.login)}</b>.`, temp));
        document.getElementById('cpS').onclick = () => A.copiar(`Acesso Painel CGLUB\n${location.href.split('#')[0]}\nLogin: ${o.login}\nSenha temporária: ${temp}`);
      } else { A.closeDrawer(); A.toast('Vendedor cadastrado.', 'ok'); }
      A.render();
    };
  }
  const senhaHTML = (titulo, sub, temp) => `<h2>${titulo}</h2><p>${sub}</p><div class="alert warn"><span>🔑</span><div>Senha temporária (mostrada só agora): <code class="senha">${esc(temp)}</code><br>A troca será exigida no primeiro acesso.</div></div><button class="btn ghost" id="cpS">Copiar login, link e senha</button>`;

  // ======================= USUÁRIOS E REGRAS =======================
  const iniciais = n => String(n || '?').split(/\s+/).filter(Boolean).map(s => s[0]).slice(0, 2).join('').toUpperCase();
  A.iniciais = iniciais;
  A.ui.usuAba = 'usuarios';

  // regra efetiva do perfil (padrão + ajuste salvo em "regrasPerfis")
  const regrasPerfil = p => Object.assign({}, AUTH.PADRAO[p] || {}, ((cfg().regrasPerfis || {})[p]) || {});
  const simNao = v => v ? '<span class="pill good">Sim</span>' : '<span class="pill neutral">Não</span>';
  const valorRegra = (r, v) => r.tipo === 'escopo' ? esc(AUTH.ESCOPOS[v] || v) : simNao(v);

  A.views.usuarios = async function (app) {
    app.innerHTML = '<div class="card"><p class="muted">Carregando usuários…</p></div>';
    let dados;
    try { dados = await A.rpc('cglub_usuarios'); } catch (e) { app.innerHTML = `<div class="alert bad"><span>⚠</span><div>${esc(e.message)}</div></div>`; return; }
    const us = dados.usuarios, eu = AUTH.usuarioAtual();
    const nomeVend = A.metasDoMes(A.M.ym).map(r => r[1]);
    const semAcesso = nomeVend.filter(n => !us.some(u => u.ativo && norm(u.vendedor) === norm(n)));
    const abas = [['usuarios', 'Usuários'], ['regras', 'O que cada perfil vê'], ['atividade', 'Atividade']];
    let body = '';
    if (A.ui.usuAba === 'usuarios') {
      body = `<div class="grid three perfis">${Object.entries(AUTH.PERFIS).map(([k, p]) => `<div class="mini"><div class="label">${esc(p.nome)}</div><div class="small">${esc(p.desc)}</div><div class="value">${us.filter(u => u.ativo && u.perfil === k).length}</div></div>`).join('')}</div>
        <div class="row section"><button class="btn" id="novoU">${A.icon('plus')} Novo usuário</button></div>
        <div class="table-wrap section"><table><thead><tr><th>Nome</th><th>Login</th><th>Perfil</th><th>Vê</th><th>Exceções</th><th>Último acesso</th><th>Status</th><th></th></tr></thead><tbody>
        ${us.map(u => { const exc = Object.keys(u.permissoes || {}).length; return `<tr><td><span class="avatar sm">${esc(iniciais(u.nome))}</span> <b>${esc(u.nome)}</b>${u.vendedor ? `<div class="muted small">${esc(u.vendedor)}</div>` : ''}</td><td>${esc(u.login)}</td><td><span class="pill ${u.perfil === 'admin' ? 'brand' : 'neutral'}">${esc(AUTH.PERFIS[u.perfil].curto)}</span></td>
          <td class="small">${esc(AUTH.ESCOPOS[u.escopo] || u.escopo)}${u.escopo === 'canais' ? `<div class="muted">${esc((u.canais || []).join(', '))}</div>` : ''}${u.perfil === 'consultor' && !u.vendedor ? '<div class="pill bad">sem vínculo</div>' : ''}</td>
          <td>${exc ? `<span class="pill warn">${exc}</span>` : '<span class="muted">—</span>'}</td>
          <td>${u.ultimoAcesso ? A.fmtDate(String(u.ultimoAcesso).slice(0, 10)) : '<span class="muted">nunca</span>'}</td>
          <td>${u.ativo ? (u.bloqueado ? '<span class="pill warn">bloqueado</span>' : '<span class="pill good">ativo</span>') : '<span class="pill neutral">inativo</span>'}${u.trocarSenha ? ' <span class="pill warn">senha temporária</span>' : ''}</td>
          <td class="nowrap"><button class="btn ghost sm" data-ed="${u.id}">Editar</button> <button class="btn ghost sm" data-rs="${u.id}" ${u.id === eu.id ? 'disabled' : ''}>Nova senha</button></td></tr>`; }).join('')}
        </tbody></table></div>
        ${semAcesso.length ? `<p class="small muted">Vendedores das metas sem acesso: ${semAcesso.map(esc).join(', ')}.</p>` : ''}`;
    } else if (A.ui.usuAba === 'regras') {
      const pr = { supervisor: regrasPerfil('supervisor'), consultor: regrasPerfil('consultor') };
      let grupo = '';
      body = `<div class="alert info"><span>🔒</span><div>Defina aqui o que <b>gestores</b> e <b>vendedores</b> podem ver e fazer. As regras marcadas com <b>servidor</b> são aplicadas no banco: o dado nem chega ao aparelho de quem não tem permissão. Exceções individuais ficam no cadastro de cada usuário.</div></div>
        <form id="fRegras"><div class="table-wrap"><table class="regras"><thead><tr><th>Regra</th><th>Administrador</th><th>Gestor / Supervisor</th><th>Vendedor / Consultor</th></tr></thead><tbody>
        ${AUTH.REGRAS.map(r => { const g = r.grupo !== grupo ? `<tr class="grupo"><td colspan="4">${esc(r.grupo)}</td></tr>` : ''; grupo = r.grupo; return g + `<tr><td>${esc(r.nome)}${r.servidor ? ' <span class="tag">servidor</span>' : ''}</td>
          <td>${r.tipo === 'escopo' ? 'Toda a empresa' : '<span class="pill good">Sim</span>'}</td>
          ${['supervisor', 'consultor'].map(p => r.tipo === 'escopo'
            ? `<td><select name="${p}.${r.k}">${Object.entries(AUTH.ESCOPOS).filter(([k]) => !(p === 'consultor' && k === 'todos')).map(([k, t]) => `<option value="${k}" ${pr[p][r.k] === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></td>`
            : `<td>${p === 'consultor' && r.soGestor ? '<span class="muted small">não permitido</span>' : `<label class="switch"><input type="checkbox" name="${p}.${r.k}" ${pr[p][r.k] ? 'checked' : ''}> ${pr[p][r.k] ? 'Sim' : 'Não'}</label>`}</td>`).join('')}</tr>`; }).join('')}
        </tbody></table></div>
        <div class="row section"><button class="btn" type="submit">Salvar regras</button><button class="btn ghost" type="button" id="padraoRegras">Voltar ao padrão</button></div></form>
        <p class="muted small">"Os canais atribuídos" usa os canais do cadastro de cada usuário; gestor sem canal definido vê toda a empresa. "Ranking da equipe" compara o vendedor com os colegas do mesmo canal, só pela % da meta de volume.</p>`;
    } else {
      body = dados.atividade.length ? `<div class="table-wrap"><table><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th></tr></thead><tbody>${dados.atividade.map(l => `<tr><td class="nowrap">${new Date(l.t).toLocaleString('pt-BR')}</td><td>${esc(l.nome)}</td><td>${esc(l.acao)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Sem atividade registrada.</p>';
    }
    app.innerHTML = `<section class="card"><header><h2>Usuários e regras de acesso</h2><span class="muted small">Só administradores veem esta tela</span></header>
      <div class="seg-tabs">${abas.map(([k, t]) => `<button class="chip" data-usu="${k}" aria-pressed="${A.ui.usuAba === k}">${t}</button>`).join('')}</div>${body}</section>`;
    app.querySelectorAll('[data-usu]').forEach(b => b.onclick = () => { A.ui.usuAba = b.dataset.usu; A.views.usuarios(app); });
    const nu = app.querySelector('#novoU'); if (nu) nu.onclick = () => formUsuario(null, nomeVend, us);
    app.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => formUsuario(us.find(u => u.id === b.dataset.ed), nomeVend, us));
    app.querySelectorAll('[data-rs]').forEach(b => b.onclick = async () => {
      const u = us.find(x => x.id === b.dataset.rs);
      if (!confirm(`Gerar nova senha temporária para ${u.nome}? A sessão atual dele será encerrada.`)) return;
      const t = AUTH.senhaTemporaria();
      try {
        const r = await A.rpc('cglub_usuario_redefinir', { p_id: u.id, p_senha_temp: t });
        if (!r.ok) throw new Error(r.erro);
        A.openDrawer(senhaHTML('Senha redefinida', `${esc(u.nome)} (${esc(u.login)})`, t));
        document.getElementById('cpS').onclick = () => A.copiar(`Acesso Painel CGLUB\n${location.href.split('#')[0]}\nLogin: ${u.login}\nSenha temporária: ${t}`);
        A.views.usuarios(app);
      } catch (e) { A.toast(e.message, 'erro'); }
    });
    const fr = app.querySelector('#fRegras');
    if (fr) {
      fr.querySelectorAll('input[type=checkbox]').forEach(cb => cb.onchange = () => { cb.parentElement.lastChild.textContent = cb.checked ? ' Sim' : ' Não'; });
      fr.onsubmit = async e => {
        e.preventDefault();
        const novo = { supervisor: {}, consultor: {} };
        for (const p of ['supervisor', 'consultor']) for (const r of AUTH.REGRAS) {
          const el = fr.elements[`${p}.${r.k}`]; if (!el) continue;
          novo[p][r.k] = r.tipo === 'escopo' ? el.value : el.checked;
        }
        cfg().regrasPerfis = novo;
        if (await A.salvarConfig('regrasPerfis')) { A.toast('Regras salvas. Valem no próximo carregamento de cada usuário.', 'ok'); await A.recarregar(true); }
      };
      app.querySelector('#padraoRegras').onclick = async () => { if (!confirm('Voltar às regras padrão para gestores e vendedores?')) return; cfg().regrasPerfis = null; await A.salvarConfig('regrasPerfis'); delete cfg().regrasPerfis; A.views.usuarios(app); };
    }
  };

  function formUsuario(u, nomesVend, todos) {
    const canais = [...new Set(A.metasDoMes(A.M.ym).map(r => r[0]))];
    const eu = AUTH.usuarioAtual();
    const x = u || { nome: '', login: '', perfil: 'consultor', vendedor: '', canais: [], telefone: '', ativo: true, permissoes: {} };
    const exc = x.permissoes || {};
    const linhasRegras = perfil => AUTH.REGRAS.map(r => {
      const base = regrasPerfil(perfil)[r.k];
      if (perfil === 'admin') return '';
      if (perfil === 'consultor' && r.soGestor) return '';
      const opcoes = r.tipo === 'escopo'
        ? [['', `Padrão do perfil (${AUTH.ESCOPOS[base]})`]].concat(Object.entries(AUTH.ESCOPOS).filter(([k]) => !(perfil === 'consultor' && k === 'todos')))
        : [['', `Padrão do perfil (${base ? 'Sim' : 'Não'})`], ['true', 'Sim'], ['false', 'Não']];
      const atual = exc[r.k] === undefined ? '' : String(exc[r.k]);
      return `<tr><td>${esc(r.nome)}</td><td><select name="regra.${r.k}" class="${atual ? 'mudou' : ''}">${opcoes.map(([v, t]) => `<option value="${v}" ${v === atual ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></td></tr>`;
    }).join('');
    A.openDrawer(`<h2>${u ? 'Editar usuário' : 'Novo usuário'}</h2>
      <form id="fU" class="form">
        <label class="field"><span>Nome *</span><input name="nome" value="${esc(x.nome)}" required></label>
        <label class="field"><span>Login (e-mail) *</span><input name="login" type="email" value="${esc(x.login)}" ${u ? 'readonly' : ''} required></label>
        <label class="field"><span>Perfil</span><select name="perfil" ${u && u.id === eu.id ? 'disabled' : ''}>${Object.entries(AUTH.PERFIS).map(([k, p]) => `<option value="${k}" ${k === x.perfil ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></label>
        <div id="fCons"><label class="field"><span>Vendedor vinculado (nome nas Metas)</span><select name="vendedor"><option value=""></option>${nomesVend.map(n => `<option ${n === x.vendedor ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
          <p class="muted small">O vendedor vê as vendas deste nome (via De-Para). Gestor vinculado também vê as próprias vendas.</p></div>
        <div id="fSup"><span class="field-l">Canais que vê (vazio = todos, para gestor)</span>${canais.map(c => `<label class="check"><input type="checkbox" name="canais" value="${esc(c)}" ${(x.canais || []).includes(c) ? 'checked' : ''}>${esc(c)}</label>`).join('')}</div>
        <label class="field"><span>Telefone</span><input name="telefone" type="tel" value="${esc(x.telefone || '')}"></label>
        <details class="regras-user section" ${Object.keys(exc).length ? 'open' : ''}><summary><b>Regras de acesso deste usuário</b> <span class="muted small">(exceções ao perfil)</span></summary>
          <div id="regrasUser"></div></details>
        ${u ? `<label class="check"><input type="checkbox" name="ativo" ${x.ativo ? 'checked' : ''} ${u.id === eu.id ? 'disabled' : ''}> Usuário ativo</label>` : '<p class="muted small">Uma senha temporária será gerada e mostrada uma única vez.</p>'}
        <p class="erro" id="uErro" role="alert"></p>
        <button class="btn" type="submit">${u ? 'Salvar' : 'Criar usuário'}</button>
      </form>`);
    const f = document.getElementById('fU');
    const vis = () => {
      const p = f.elements.perfil.value;
      document.getElementById('fCons').hidden = p === 'admin';
      document.getElementById('fSup').hidden = p === 'admin';
      document.getElementById('regrasUser').innerHTML = p === 'admin' ? '<p class="muted small">Administrador sempre tem acesso total.</p>' : `<table class="regras"><tbody>${linhasRegras(p)}</tbody></table>`;
      document.querySelectorAll('#regrasUser select').forEach(s => s.onchange = () => s.classList.toggle('mudou', !!s.value));
    };
    f.elements.perfil.onchange = vis; vis();
    f.onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(f), el = f.elements;
      const perfil = el.perfil.value;
      const permissoes = {};
      if (perfil !== 'admin') for (const r of AUTH.REGRAS) {
        const v = fd.get('regra.' + r.k); if (!v) continue;
        permissoes[r.k] = r.tipo === 'escopo' ? v : v === 'true';
      }
      const dados = { nome: fd.get('nome').trim(), login: fd.get('login'), perfil, vendedor: fd.get('vendedor') || '', canais: fd.getAll('canais'), telefone: fd.get('telefone') || '', permissoes };
      const err = m => { document.getElementById('uErro').textContent = m; };
      if (!dados.nome) return err('Informe o nome.');
      if (perfil === 'consultor' && !dados.vendedor) return err('Vendedor precisa estar vinculado a um nome das Metas.');
      if (u) {
        dados.id = u.id;
        if (el.ativo && !el.ativo.disabled) dados.ativo = el.ativo.checked;
        if (u.perfil === 'admin' && perfil !== 'admin' && todos.filter(z => z.ativo && z.perfil === 'admin').length < 2) return err('É preciso manter pelo menos um administrador ativo.');
        try { const r = await A.rpc('cglub_usuario_salvar', { p_dados: dados, p_senha_temp: null }); if (!r.ok) return err(r.erro); }
        catch (ex) { return err(ex.message); }
        A.closeDrawer(); A.toast('Usuário salvo.', 'ok'); A.render();
      } else {
        const t = AUTH.senhaTemporaria();
        try {
          const r = await A.rpc('cglub_usuario_salvar', { p_dados: dados, p_senha_temp: t });
          if (!r.ok) return err(r.erro);
          A.openDrawer(senhaHTML('Usuário criado', `<b>${esc(r.usuario.nome)}</b> — ${esc(r.usuario.login)}`, t));
          document.getElementById('cpS').onclick = () => A.copiar(`Acesso Painel CGLUB\n${location.href.split('#')[0]}\nLogin: ${r.usuario.login}\nSenha temporária: ${t}`);
          A.render();
        } catch (ex) { err(ex.message); }
      }
    };
  }

  // ======================= PERFIL =======================
  A.views.perfil = function (app) {
    const u = AUTH.usuarioAtual(), rg = AUTH.regras();
    const minhas = (A.store.visitas || []).filter(v => v.criadoPor === u.id);
    app.innerHTML = `<div class="grid two">
      <section class="card"><div class="perfil-head"><span class="avatar lg">${esc(iniciais(u.nome))}</span><div><h2>${esc(u.nome)}</h2><p class="muted">${esc(u.login)} · ${esc(AUTH.PERFIS[u.perfil].nome)}</p></div></div>
        <form id="fP" class="form section">
          <label class="field"><span>Nome</span><input name="nome" value="${esc(u.nome)}" required></label>
          <label class="field"><span>Telefone</span><input name="telefone" type="tel" value="${esc(u.telefone || '')}"></label>
          <button class="btn" type="submit">Salvar</button>
        </form>
        <dl class="dl section"><dt>Vínculo</dt><dd>${esc(u.vendedor || '—')}</dd><dt>Último acesso</dt><dd>${u.ultimoAcesso ? new Date(u.ultimoAcesso).toLocaleString('pt-BR') : '—'}</dd><dt>Visitas registradas</dt><dd>${minhas.length}</dd></dl>
      </section>
      <section class="card"><h2>Trocar senha</h2>
        <form id="fS" class="form section">
          <label class="field"><span>Senha atual</span><input name="atual" type="password" autocomplete="current-password" required></label>
          <label class="field"><span>Nova senha</span><input name="nova" type="password" autocomplete="new-password" required minlength="8"></label>
          <label class="field"><span>Repita a nova senha</span><input name="rep" type="password" autocomplete="new-password" required></label>
          <p class="muted small">Mínimo de 8 caracteres, com letras e números. As suas outras sessões abertas serão encerradas.</p>
          <p class="erro" id="sErro" role="alert"></p>
          <button class="btn" type="submit">Trocar senha</button>
        </form></section></div>
      <section class="card section"><header><h2>O que você pode ver e fazer</h2><span class="muted small">Definido pelo administrador</span></header>
        <div class="table-wrap"><table class="regras"><tbody>${AUTH.REGRAS.map(r => `<tr><td>${esc(r.nome)}</td><td>${valorRegra(r, rg[r.k])}${r.tipo === 'escopo' && u.canais && u.canais.length && rg.escopo === 'canais' ? ` <span class="muted small">(${esc(u.canais.join(', '))})</span>` : ''}</td></tr>`).join('')}</tbody></table></div></section>`;
    app.querySelector('#fP').onsubmit = async e => {
      e.preventDefault(); const f = e.target.elements;
      try { const nu = await A.rpc('cglub_perfil_salvar', { p_nome: f.nome.value, p_telefone: f.telefone.value }); AUTH.setUsuario(Object.assign(u, nu)); A.toast('Perfil salvo.', 'ok'); A.renderShell(); }
      catch (ex) { A.toast(ex.message, 'erro'); }
    };
    app.querySelector('#fS').onsubmit = async e => {
      e.preventDefault(); const form = e.target, f = form.elements, err = m => { app.querySelector('#sErro').textContent = m; };
      if (f.nova.value !== f.rep.value) return err('As senhas não conferem.');
      try { await AUTH.trocarSenha(f.atual.value, f.nova.value); form.reset(); err(''); A.toast('Senha alterada.', 'ok'); }
      catch (ex) { err(ex.message); }
    };
  };

  // ======================= NOTAS =======================
  A.views.notas = function (app) {
    const M = A.M;
    const all = M.doMes, totAll = sum(all, r => r.tot) || 1;
    const ne = all.filter(r => r.vend === 'Não encontrado');
    const neFat = sum(ne, r => r.tot), neRem = sum(ne.filter(r => r.remessa), r => r.tot);
    const remAll = all.filter(r => r.remessa), remFat = sum(remAll, r => r.tot);
    const remCli = [...new Set(remAll.map(r => r.cli))];
    const v = A.vendedores(M);
    const semMeta = v.extras.filter(x => x.nome !== 'Não encontrado');
    const rgMap = new Map(M.D.deParaRegiao.map(x => [norm(x[0]), x[1]]));
    const rgPend = M.metas.filter(r => (rgMap.get(norm(r[1])) || '(revisar)') === '(revisar)').length;
    const metaSemVenda = v.out.filter(x => x.metaVol > 0 && x.vol === 0).map(x => x.nome);
    const semCad = A.listaClientes(M).filter(c => !c.cad).length;
    const vz = all.filter(r => r.volZerado), vzL = sum(vz, r => r.volCalc);
    const notas = [
      ['CRÍTICO', 'bad', `${pct(neFat / totAll)} do faturamento (${brl(neFat)}) está sob vendedor "Não encontrado" no SAP`, `Códigos de empregado sem nome: ${[...new Set(ne.map(r => r.codVend))].join(', ') || '—'}. Essas vendas só aparecem para quem vê a empresa toda. Pedir ao TI/SAP a atualização do cadastro de vendedores.`],
      ['CRÍTICO', 'bad', `"SIMPLES REMESSA" soma ${brl(remFat)} (${pct(remFat / totAll)} do total)`, `${remAll.length} linhas para ${remCli.length} cliente(s), respondendo por ${pct(neFat ? neRem / neFat : 0)} do "Não encontrado". Normalmente é movimentação sem venda. O app exclui por padrão. Confirmar com o fiscal/faturamento.`],
      ['ALTO', vz.length ? 'warn' : 'good', `${vz.length} linha(s) com "Volume Total" = 0 no SAP (${brl(sum(vz, r => r.tot))} · ~${nf0.format(vzL)} L)`, `QTD × Volume Material indica volume, mas o SAP mandou zero — volume e atingimento ficam subestimados. ${cfg().corrigirVolume ? 'Correção ATIVA.' : 'Ative a correção em Cadastros → Base de dados.'} Reportar ao TI/SAP.`],
      ['ALTO', 'warn', 'Nomes de vendedores divergem entre SAP e Metas', 'O De-Para define o que cada vendedor vê — revise em Cadastros → De-Para. Confiança BAIXA: "Luis Fernando Sousa Silva" (SAP) × "Luís Fernando Silva" (Metas).'],
      ['ALTO', 'warn', `Vendas sem meta cadastrada: ${semMeta.map(x => x.nome).join(', ') || 'nenhuma'}`, `Somam ${brl(sum(semMeta, x => x.fat))}. Use "Novo vendedor" em Cadastros.`],
      ['ALTO', 'warn', `Com meta e sem venda no SAP: ${metaSemVenda.join(', ') || 'nenhum'}`, '"Atacadistas" e "Grandes Contas" são carteiras, não pessoas — sem código de vendedor no SAP o realizado fica zerado.'],
      ['ALTO', rgPend ? 'warn' : 'good', `Região BA/SE: ${rgPend} vendedor(es) sem região`, 'A UF do cadastro do cliente tem prioridade; para os demais, preencha Cadastros → Região.'],
      ['MÉDIO', semCad ? 'warn' : 'good', `${semCad} clientes sem cadastro (só código SAP)`, 'Cadastre ou importe a planilha de clientes em Clientes.'],
      ['MÉDIO', 'neutral', 'Ritmo projetado: linear e por dias úteis', 'O linear usa dias corridos (como a planilha). O por dias úteis desconta fins de semana e os feriados de Cadastros → Feriados — costuma ser mais realista.'],
      ['INFO', 'good', 'Dados no servidor, com controle de acesso', 'Login verificado no banco (senha bcrypt, bloqueio após 5 erros). As regras de escopo e de valores são aplicadas no servidor: o dado não chega ao aparelho de quem não pode ver. Sem internet, o app mostra a última cópia baixada naquele aparelho.'],
    ];
    app.innerHTML = `<section class="card"><header><h2>Pontos de atenção, limitações e premissas</h2><span class="muted small">${A.fmtMes(M.ym)} · dados que você pode ver</span></header>
      <div class="table-wrap"><table><thead><tr><th>Severidade</th><th>Ponto de atenção</th><th>Detalhamento / recomendação</th></tr></thead><tbody>
      ${notas.map(n => `<tr><td><span class="pill ${n[1]}">${n[0]}</span></td><td><b>${esc(n[2])}</b></td><td>${esc(n[3])}</td></tr>`).join('')}</tbody></table></div></section>`;
  };
})(window.APP);
