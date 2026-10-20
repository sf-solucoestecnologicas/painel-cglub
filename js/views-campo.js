// Telas de campo: Roteiro 5Q3A, Visitas, Clientes (cadastro) e Carteira Lubrax.
(function (A) {
  'use strict';
  const { esc, norm, sum, pct, brl, brl2, brlCompact, lit, nf0, nf1 } = A;
  const C = A.C;
  A.views = A.views || {};
  const DRAFT_KEY = 'cglub.rascunho.';

  // ======================= ROTEIRO 5Q3A =======================
  const PASSOS = [
    { id: 'prep', curto: 'Preparar', tit: 'Preparação da visita', sub: 'Antes de entrar no cliente: revise o histórico e defina o objetivo.' },
    { id: 'q1', curto: 'Q1', tit: 'Quem é o cliente e o que ele atende?', sub: 'Entenda o negócio e a frota/clientela atendida — é isso que define o mix certo.' },
    { id: 'q2', curto: 'Q2', tit: 'Quanto ele consome e como está o estoque?', sub: 'Dimensione o potencial: volume mensal, giro e rupturas.' },
    { id: 'q3', curto: 'Q3', tit: 'Com quem dividimos o espaço?', sub: 'Mapeie a concorrência e a participação estimada de Lubrax.' },
    { id: 'q4', curto: 'Q4', tit: 'Como está a execução no ponto de venda?', sub: 'Verifique visibilidade, preço e materiais. Olhe a gôndola/estoque, não só pergunte.' },
    { id: 'q5', curto: 'Q5', tit: 'Qual a principal dor ou oportunidade?', sub: 'Descubra o que faria o cliente comprar mais de nós.' },
    { id: 'a1', curto: 'A1', tit: 'Ofereça a solução certa', sub: 'Recomende os produtos da carteira Lubrax que respondem ao que você ouviu.' },
    { id: 'a2', curto: 'A2', tit: 'Feche o pedido', sub: 'Quantifique, negocie a condição e registre o pedido (ou o motivo de não fechar).' },
    { id: 'a3', curto: 'A3', tit: 'Combine o próximo passo', sub: 'Toda visita termina com data e compromisso definidos.' },
    { id: 'fim', curto: 'Resumo', tit: 'Resumo da visita', sub: 'Revise, salve e compartilhe.' },
  ];
  const OPC = A.OPC = {
    tipo: ['Posto de combustível', 'Troca de óleo / Auto center', 'Oficina mecânica', 'Autopeças / Revenda', 'Frota / Transportadora', 'Concessionária', 'Loja de motos', 'Revenda agro / Fazenda', 'Indústria', 'Atacadista'],
    perfis: Object.keys(C.PERFIL_SEGMENTOS),
    estoque: ['Adequado', 'Baixo', 'Ruptura em itens-chave', 'Excesso'],
    marcas: ['Mobil', 'Shell', 'Castrol', 'Ipiranga / Texaco', 'Petronas', 'Motul', 'Valvoline', 'YPF / Elaion', 'Repsol', 'Marca própria / genérica', 'Outra'],
    pdv: ['Produtos Lubrax visíveis e organizados', 'Preço sinalizado ao consumidor', 'Material Lubrax (banner, gôndola, display)', 'Linha premium (sintético/semi) exposta', 'Equipe indica Lubrax ao consumidor'],
    dores: ['Preço', 'Prazo / crédito', 'Entrega / logística', 'Falta de produto', 'Mix premium baixo', 'Treinamento da equipe', 'Material de PDV', 'Giro lento', 'Novo segmento / nova frota', 'Atendimento / frequência de visita'],
    cond: ['À vista / PIX', '7 dias', '14/28 dias', '28 dias', '28/42/56 dias', '30/60/90 dias', 'Outra (negociar)'],
    acoes: ['Retornar para fechar pedido', 'Treinamento da equipe do cliente', 'Instalar material de PDV', 'Enviar proposta / tabela', 'Visita técnica com especialista', 'Acompanhar entrega', 'Revisar crédito / condição'],
    objetivos: ['Aumentar volume', 'Subir mix premium', 'Positivar novos SKUs', 'Recuperar cliente', 'Prospecção', 'Relacionamento / pós-venda'],
  };
  const DICAS = {
    prep: ['Revise o que o cliente comprou e o mix premium.', 'Veja as lacunas: itens que clientes parecidos compram e ele não.', 'Defina 1 objetivo claro.'],
    q1: ['"Quais veículos/equipamentos mais passam aqui?"', '"Qual o perfil de cliente que mais compra de você?"'],
    q2: ['"Quantos litros/trocas você faz por mês?"', 'Confira o estoque físico: o que está acabando?'],
    q3: ['"Quais outras marcas você trabalha? Por quê?"', 'Observe a gôndola: quanto do espaço é Lubrax?'],
    q4: ['Marque só o que você viu. Cada item vale 1 ponto (0–5).'],
    q5: ['"O que te impede de comprar mais Lubrax?"', '"Se pudesse mudar uma coisa no nosso atendimento, o que seria?"'],
    a1: ['Comece pelo que responde à dor (Q5) e ao perfil (Q1).', 'Lacunas: itens que o cliente ainda não compra.', 'Tente subir 1 degrau no mix (mineral → semi → sintético).'],
    a2: ['Quantidade na unidade de venda do SAP (caixa, balde, tambor).', 'Preço de referência = média realizada no mês (com impostos). Confirme a tabela vigente.'],
    a3: ['Combine data e responsável. Sem data, não há próximo passo.'],
  };

  const chaveRasc = () => DRAFT_KEY + ((window.AUTH.usuarioAtual() || {}).id || 'anon');
  function novoRascunho(cli) {
    const u = window.AUTH.usuarioAtual() || {};
    const cad = cli ? A.cliente(cli) : null;
    return { id: 'v' + Date.now().toString(36), data: A.todayISO(), consultor: u.perfil === 'consultor' ? u.vendedor : (u.vendedor || ''), cliente: cli ? String(cli) : '', clienteNome: cad ? (cad.fantasia || cad.razao || '') : '', objetivo: '', passo: 0,
      q1: { tipo: cad && cad.segmento ? cad.segmento : '', perfis: [], obs: '' }, q2: { volMes: '', trocas: '', estoque: '', ruptura: '', obs: '' },
      q3: { marcas: [], share: 50, obs: '' }, q4: { checks: [], obs: '' }, q5: { dores: [], obs: '' },
      a1: { produtos: [] }, a2: { itens: {}, cond: '', semPedido: false, motivo: '', obs: '' }, a3: { data: '', acao: '', compromisso: '' } };
  }
  let draft = null;
  function getDraft() { if (!draft) { try { draft = JSON.parse(localStorage.getItem(chaveRasc()) || 'null'); } catch (e) { draft = null; } if (!draft) draft = novoRascunho(); } return draft; }
  function saveDraft() { try { localStorage.setItem(chaveRasc(), JSON.stringify(draft)); } catch (e) { /* rascunho é conveniência */ } }
  A.resetDraft = () => { draft = null; };
  A.novaVisita = function (cli) { draft = novoRascunho(cli); saveDraft(); if (location.hash !== '#roteiro') location.hash = '#roteiro'; else A.render(); A.closeDrawer(); };

  const chips = (name, opts, selected, multi) => { const sel = multi ? selected : [selected]; return `<div class="chips" role="group">${opts.map(o => `<button type="button" class="chip" data-chip="${name}" data-val="${esc(o)}" data-multi="${multi ? 1 : 0}" aria-pressed="${sel.includes(o)}">${esc(o)}</button>`).join('')}</div>`; };
  const tips = id => DICAS[id] ? `<details class="tipbox" open><summary>Dicas</summary><ul>${DICAS[id].map(t => `<li>${esc(t)}</li>`).join('')}</ul></details>` : '';

  function sugestoes(M, d) {
    const preco = A.precoRef(M);
    const segs = new Set(d.q1.perfis.flatMap(p => C.PERFIL_SEGMENTOS[p] || []));
    if (!segs.size) ['leve', 'diesel', 'moto'].forEach(s => segs.add(s));
    if (d.q1.perfis.length && !d.q1.perfis.includes('Concessionária (OEM)')) segs.delete('oem');
    const res = A.clienteResumo(M, d.cliente, true);
    const ja = new Set(res ? res.porSku.map(p => String(p.cod)) : []);
    const focoPremium = d.q5.dores.includes('Mix premium baixo') || d.objetivo === 'Subir mix premium';
    return Object.values(M.prodInfo).filter(p => segs.has(p.segmento) && preco[p.codigo]).map(p => {
      const pr = preco[p.codigo];
      return Object.assign({}, p, { _ja: ja.has(String(p.codigo)), _score: Math.log10(1 + pr.vol) + Math.log10(1 + pr.clientes) * 1.5 + (p.premium ? (focoPremium ? 3 : 1) : 0) + (ja.has(String(p.codigo)) ? -0.5 : 0.5) });
    }).sort((a, b) => b._score - a._score).slice(0, 14);
  }

  A.views.roteiro = function (app) {
    const M = A.M, d = getDraft(), p = PASSOS[d.passo] || PASSOS[0], id = p.id, u = window.AUTH.usuarioAtual();
    const consultores = A.metasDoMes(M.ym).filter(M.escopo.okMeta).map(r => r[1]);
    const res = d.cliente ? A.clienteResumo(M, d.cliente, true) : null;
    const cad = d.cliente ? A.cliente(d.cliente) : null;
    const preco = A.precoRef(M);
    let body = '';

    if (id === 'prep') {
      const clis = A.listaClientes(M);
      body = `<div class="row">
          <label class="field"><span>Data da visita</span><input type="date" data-f="data" value="${esc(d.data)}"></label>
          <label class="field"><span>Consultor</span>${u.perfil === 'consultor' ? `<input type="text" value="${esc(d.consultor)}" disabled>` : `<select data-f="consultor"><option value="">Selecione…</option>${consultores.map(c => `<option ${c === d.consultor ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`}</label>
        </div>
        <div class="row">
          <label class="field"><span>Cliente (código SAP ou nome)</span><input type="text" list="listaClientes" data-f="cliente" value="${esc(d.cliente)}" placeholder="ex.: 1000253" autocomplete="off"></label>
          <label class="field"><span>Nome do cliente</span><input type="text" data-f="clienteNome" value="${esc(d.clienteNome)}" placeholder="${cad ? '' : 'novo? digite o nome para cadastrar'}"></label>
        </div>
        <datalist id="listaClientes">${clis.slice(0, 1500).map(c => `<option value="${esc(c.cod)}">${esc(c.cad ? (c.cad.fantasia || c.cad.razao) : '')}</option>`).join('')}</datalist>
        <p class="small"><button type="button" class="linklike" id="prospect">Cliente novo sem código SAP? Gerar código de prospecção</button></p>
        ${res ? `<div class="card soft"><header><h3>Histórico de ${A.cliLabel(res.cli)}</h3><a href="#" data-cli="${esc(res.cli)}" class="small">ver detalhe</a></header>
          <div class="stat-row"><div class="mini"><div class="label">Faturamento</div><div class="value">${brlCompact(res.fat)}</div></div><div class="mini"><div class="label">Volume</div><div class="value">${lit(res.vol)}</div></div><div class="mini"><div class="label">Mix premium</div><div class="value">${pct(res.mix)}</div></div><div class="mini"><div class="label">Última compra</div><div class="value">${A.fmtDate(res.ultima)}</div></div></div>
          <p class="small muted">Canal ${esc(res.canal)} · Vendedor(es): ${esc(res.vendedores.join(', '))}</p>
          <p class="small"><b>Compra:</b> ${res.porSku.slice(0, 6).map(s => esc(s.desc)).join(' · ')}${res.porSku.length > 6 ? ` · +${res.porSku.length - 6}` : ''}</p></div>`
        : d.cliente ? `<div class="alert info"><span>ℹ</span><div>Sem compras na base para ${esc(d.cliente)} — cliente novo / prospecção. ${d.clienteNome ? 'Ele será cadastrado ao salvar a visita.' : 'Informe o nome para cadastrá-lo.'}</div></div>` : ''}
        <label class="field section"><span>Objetivo da visita</span>${chips('objetivo', OPC.objetivos, d.objetivo, false)}</label>`;
    } else if (id === 'q1') {
      body = `<label class="field"><span>Tipo de negócio</span>${chips('q1.tipo', OPC.tipo, d.q1.tipo, false)}</label>
        <label class="field"><span>Veículos / equipamentos atendidos (marque todos)</span>${chips('q1.perfis', OPC.perfis, d.q1.perfis, true)}</label>
        <label class="field"><span>Anotações</span><textarea data-f="q1.obs">${esc(d.q1.obs)}</textarea></label>`;
    } else if (id === 'q2') {
      body = `<div class="row"><label class="field"><span>Volume mensal estimado (L)</span><input type="number" min="0" inputmode="numeric" data-f="q2.volMes" value="${esc(d.q2.volMes)}"></label>
        <label class="field"><span>Trocas de óleo / mês</span><input type="number" min="0" inputmode="numeric" data-f="q2.trocas" value="${esc(d.q2.trocas)}"></label></div>
        ${res && d.q2.volMes ? `<div class="tipbox">Potencial informado: <b>${lit(+d.q2.volMes)}</b>/mês · Comprado de nós em ${A.fmtMes(M.ym)}: <b>${lit(A.clienteResumo(M, d.cliente) ? A.clienteResumo(M, d.cliente).vol : 0)}</b>.</div>` : ''}
        <label class="field"><span>Situação do estoque Lubrax</span>${chips('q2.estoque', OPC.estoque, d.q2.estoque, false)}</label>
        <label class="field"><span>Itens em ruptura / acabando</span><input type="text" data-f="q2.ruptura" value="${esc(d.q2.ruptura)}" placeholder="ex.: Top Moto 20W50, 5W30 SQ"></label>
        <label class="field"><span>Anotações</span><textarea data-f="q2.obs">${esc(d.q2.obs)}</textarea></label>`;
    } else if (id === 'q3') {
      body = `<label class="field"><span>Marcas concorrentes presentes</span>${chips('q3.marcas', OPC.marcas, d.q3.marcas, true)}</label>
        <label class="field"><span>Participação estimada de Lubrax no cliente: <b id="shareOut">${d.q3.share}%</b></span><input type="range" min="0" max="100" step="5" data-f="q3.share" value="${d.q3.share}"></label>
        <label class="field"><span>Por que compra da concorrência?</span><textarea data-f="q3.obs" placeholder="preço, prazo, relacionamento, bonificação…">${esc(d.q3.obs)}</textarea></label>`;
    } else if (id === 'q4') {
      const score = d.q4.checks.length;
      body = `${OPC.pdv.map(o => `<label class="check"><input type="checkbox" data-check="q4" value="${esc(o)}" ${d.q4.checks.includes(o) ? 'checked' : ''}>${esc(o)}</label>`).join('')}
        <p>Nota de execução: <span class="pill ${score >= 4 ? 'good' : score >= 2 ? 'warn' : 'bad'}">${score >= 4 ? '●' : score >= 2 ? '▲' : '▼'} ${score} / 5</span></p>
        <label class="field"><span>Anotações / fotos tiradas</span><textarea data-f="q4.obs">${esc(d.q4.obs)}</textarea></label>`;
    } else if (id === 'q5') {
      body = `<label class="field"><span>Dores e oportunidades (marque todas)</span>${chips('q5.dores', OPC.dores, d.q5.dores, true)}</label>
        <label class="field"><span>Nas palavras do cliente</span><textarea data-f="q5.obs">${esc(d.q5.obs)}</textarea></label>`;
    } else if (id === 'a1') {
      const sug = sugestoes(M, d);
      const sel = new Set(d.a1.produtos.map(String));
      const extras = d.a1.produtos.filter(c => !sug.find(s => String(s.codigo) === String(c)));
      const linha = (pi, ja) => { const pr = preco[pi.codigo] || {}; return `<label class="prod-sug"><input type="checkbox" data-prod="${esc(pi.codigo)}" ${sel.has(String(pi.codigo)) ? 'checked' : ''}><span><b>${esc(pi.desc)}</b><br><span class="muted small">${esc(pi.familiaNome)} · ${esc(pi.base)}${pi.viscosidade ? ' · ' + esc(pi.viscosidade) : ''}${pi.specs.length ? ' · ' + esc(pi.specs.join(', ')) : ''}</span></span><span class="prod-sug-r">${pi.premium ? '<span class="tag prem">Premium</span>' : ''}${ja ? '<span class="tag">Já compra</span>' : '<span class="tag gap">Lacuna</span>'}<span class="small muted">${pr.porL ? brl2(pr.porL) + '/L' : ''}</span></span></label>`; };
      body = `<p class="small muted">Sugestões a partir de Q1 (${esc(d.q1.perfis.join(', ') || 'perfil não informado — mostrando leve, diesel e moto')}), ordenadas pelo giro regional${d.q5.dores.includes('Mix premium baixo') ? ', com prioridade para premium' : ''}.</p>
        ${sug.map(s => linha(s, s._ja)).join('')}
        ${extras.map(c => M.prodInfo[c] ? linha(M.prodInfo[c], false) : '').join('')}
        <div class="field section"><span>Adicionar outro produto da carteira</span><input type="search" id="buscaProd" list="listaProd" placeholder="Digite parte da descrição ou código"><datalist id="listaProd">${Object.values(M.prodInfo).map(x => `<option value="${esc(x.codigo)} — ${esc(x.desc)}">`).join('')}</datalist></div>`;
    } else if (id === 'a2') {
      let tot = 0, totL = 0;
      const rows = d.a1.produtos.map(c => {
        const pi = M.prodInfo[c], pr = preco[c] || {}; const q = +d.a2.itens[c] || 0;
        tot += q * (pr.porUn || 0); totL += q * (pr.litrosUn || 0);
        return `<tr><td>${esc(pi ? pi.desc : c)}<div class="muted small">${esc(pr.um || '')} = ${pr.litrosUn ? nf1.format(pr.litrosUn) + ' L' : '?'} · ref. ${pr.porUn ? brl2(pr.porUn) : '—'}</div></td><td class="qtd"><input type="number" min="0" step="1" inputmode="numeric" data-qtd="${esc(c)}" value="${q || ''}" placeholder="0" aria-label="Quantidade"></td><td class="n">${nf0.format(q * (pr.litrosUn || 0))} L</td><td class="n">${brl(q * (pr.porUn || 0))}</td></tr>`;
      }).join('');
      body = d.a1.produtos.length ? `<div class="table-wrap"><table><thead><tr><th>Produto</th><th>Qtd</th><th class="n">Volume</th><th class="n">Valor est.</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="2">Total estimado</td><td class="n">${nf0.format(totL)} L</td><td class="n">${brl(tot)}</td></tr></tfoot></table></div>`
        : '<div class="alert warn"><span>⚠</span><div>Nenhum produto selecionado em A1. Volte e escolha o que ofertar.</div></div>';
      body += `<label class="field section"><span>Condição de pagamento negociada</span>${chips('a2.cond', OPC.cond, d.a2.cond, false)}</label>
        <label class="check"><input type="checkbox" data-bool="a2.semPedido" ${d.a2.semPedido ? 'checked' : ''}> Não houve pedido nesta visita</label>
        ${d.a2.semPedido ? `<label class="field section"><span>Motivo</span><input type="text" data-f="a2.motivo" value="${esc(d.a2.motivo)}" placeholder="ex.: estoque alto, aguardando aprovação, preço"></label>` : ''}
        <label class="field section"><span>Observações da negociação</span><textarea data-f="a2.obs">${esc(d.a2.obs)}</textarea></label>`;
    } else if (id === 'a3') {
      body = `<div class="row"><label class="field"><span>Data do retorno</span><input type="date" data-f="a3.data" value="${esc(d.a3.data)}" min="${A.todayISO()}"></label></div>
        <label class="field"><span>Próxima ação</span>${chips('a3.acao', OPC.acoes, d.a3.acao, false)}</label>
        <label class="field"><span>Compromisso combinado (quem faz o quê)</span><textarea data-f="a3.compromisso">${esc(d.a3.compromisso)}</textarea></label>`;
    } else {
      const falta = validar(d);
      body = `<div class="summary"><pre>${esc(resumoTexto(d))}</pre></div>
        ${falta.length ? `<div class="alert warn section"><span>⚠</span><div><b>Faltando:</b> ${falta.map(esc).join(' · ')}</div></div>` : '<div class="alert good section"><span>✓</span><div>Roteiro completo.</div></div>'}
        <div class="row section"><button class="btn" id="salvarVisita">Salvar visita</button><button class="btn ghost" id="copiarResumo">Copiar resumo</button><button class="btn ghost danger" id="descartar">Descartar rascunho</button></div>`;
    }

    const prog = PASSOS.map((s, i) => `<button type="button" class="step-dot ${i === d.passo ? 'current' : i < d.passo ? 'done' : ''} ${s.id.startsWith('a') ? 'is-a' : ''}" data-goto="${i}" aria-current="${i === d.passo ? 'step' : 'false'}">${s.curto}</button>`).join('');
    const badge = id === 'prep' ? '0' : id === 'fim' ? '✓' : id.toUpperCase();
    app.innerHTML = `
      <div class="roteiro-head"><div><h2>Roteiro de Visita do Consultor — 5Q3A</h2><p class="muted small">5 Questões de diagnóstico + 3 Ações de fechamento · rascunho salvo automaticamente</p></div>
        <div class="progress" aria-label="Progresso"><i style="width:${d.passo / (PASSOS.length - 1) * 100}%"></i></div>
        <div class="steps">${prog}</div></div>
      <section class="card">
        <div class="q-head"><div class="q-badge ${id.startsWith('a') ? 'a' : ''}">${badge}</div><div><h2>${esc(p.tit)}</h2><p>${esc(p.sub)}</p></div></div>
        ${tips(id)}
        <div>${body}</div>
        <div class="nav-steps"><button class="btn ghost" id="voltar" ${d.passo === 0 ? 'disabled' : ''}>← Voltar</button>${d.passo < PASSOS.length - 1 ? `<button class="btn" id="avancar">Avançar →</button>` : ''}</div>
      </section>`;
    bindRoteiro(app);
  };

  const setPath = (o, path, v) => { const ks = path.split('.'); ks.slice(0, -1).forEach(k => { o = o[k]; }); o[ks[ks.length - 1]] = v; };
  const getPath = (o, path) => path.split('.').reduce((x, k) => x && x[k], o);

  function bindRoteiro(app) {
    const d = draft, again = () => A.views.roteiro(app);
    app.querySelectorAll('[data-f]').forEach(el => {
      const ev = el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input';
      el.addEventListener(ev, () => {
        setPath(d, el.dataset.f, el.type === 'range' ? +el.value : el.value);
        if (el.dataset.f === 'q3.share') document.getElementById('shareOut').textContent = el.value + '%';
        saveDraft();
      });
      if (el.dataset.f === 'cliente') el.addEventListener('change', () => { const cad = A.cliente(d.cliente); if (cad) { d.clienteNome = cad.fantasia || cad.razao || ''; if (cad.segmento && !d.q1.tipo) d.q1.tipo = cad.segmento; } saveDraft(); again(); });
      if (el.dataset.f === 'q2.volMes') el.addEventListener('change', again);
    });
    app.querySelectorAll('[data-chip]').forEach(b => b.onclick = () => {
      const path = b.dataset.chip, val = b.dataset.val;
      if (b.dataset.multi === '1') { const arr = getPath(d, path); const i = arr.indexOf(val); i >= 0 ? arr.splice(i, 1) : arr.push(val); }
      else setPath(d, path, getPath(d, path) === val ? '' : val);
      saveDraft(); again();
    });
    app.querySelectorAll('[data-check="q4"]').forEach(c => c.onchange = () => { const a = d.q4.checks; const i = a.indexOf(c.value); if (c.checked && i < 0) a.push(c.value); if (!c.checked && i >= 0) a.splice(i, 1); saveDraft(); again(); });
    app.querySelectorAll('[data-bool]').forEach(c => c.onchange = () => { setPath(d, c.dataset.bool, c.checked); saveDraft(); again(); });
    app.querySelectorAll('[data-prod]').forEach(c => c.onchange = () => { const v = c.dataset.prod; const a = d.a1.produtos.map(String); const i = a.indexOf(v); if (c.checked && i < 0) a.push(v); if (!c.checked && i >= 0) a.splice(i, 1); d.a1.produtos = a; saveDraft(); });
    app.querySelectorAll('[data-qtd]').forEach(i => i.onchange = () => { d.a2.itens[i.dataset.qtd] = i.value; saveDraft(); again(); });
    const bp = app.querySelector('#buscaProd');
    if (bp) bp.onchange = () => { const cod = bp.value.split(' — ')[0].trim(); if (A.M.prodInfo[cod] && !d.a1.produtos.map(String).includes(cod)) { d.a1.produtos.push(cod); saveDraft(); again(); } };
    const pr = app.querySelector('#prospect');
    if (pr) pr.onclick = () => { d.cliente = 'PROSP-' + Date.now().toString(36).toUpperCase().slice(-6); saveDraft(); again(); };
    app.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => { d.passo = +b.dataset.goto; saveDraft(); again(); });
    const av = app.querySelector('#avancar'); if (av) av.onclick = () => { d.passo++; saveDraft(); again(); window.scrollTo({ top: 0 }); };
    app.querySelector('#voltar').onclick = () => { if (d.passo > 0) { d.passo--; saveDraft(); again(); } };
    app.querySelectorAll('[data-cli]').forEach(a => a.onclick = e => { e.preventDefault(); A.drawerCliente(a.dataset.cli); });
    const sv = app.querySelector('#salvarVisita');
    if (sv) {
      sv.onclick = async () => {
        const falta = validar(d);
        if (falta.length && !confirm('Faltam: ' + falta.join(', ') + '.\nSalvar mesmo assim?')) return;
        const u = window.AUTH.usuarioAtual();
        const v = JSON.parse(JSON.stringify(d)); delete v.passo;
        v.valorEst = valorPedido(v); v.volEst = volumePedido(v);
        sv.disabled = true; sv.textContent = 'Salvando…';
        try {
          // cliente novo digitado no roteiro vira cadastro
          if (v.cliente && v.clienteNome && !A.cliente(v.cliente) && window.AUTH.pode('cadastrar_clientes')) {
            const c = { codigo: v.cliente, fantasia: v.clienteNome, segmento: v.q1.tipo, vendedor: v.consultor, origem: 'roteiro' };
            await A.gravar('cglub_cliente_salvar', { p_cliente: c }, 'Cliente ' + v.cliente);
            A.store.clientes[v.cliente] = Object.assign({ criadoPor: u.id }, c);
          }
          const r = await A.gravar('cglub_visita_salvar', { p_visita: v }, 'Visita ' + v.cliente);
          A.store.visitas = (A.store.visitas || []).filter(x => x.id !== v.id).concat([Object.assign(v, { criadoPor: u.id, criadoPorNome: u.nome, salvoEm: new Date().toISOString() })]);
          draft = novoRascunho(); saveDraft();
          A.toast(r.offline ? 'Sem internet: visita guardada no aparelho e será enviada quando a conexão voltar.' : 'Visita salva.', r.offline ? 'erro' : 'ok');
          location.hash = '#visitas';
        } catch (e) { A.toast('Não foi possível salvar: ' + e.message, 'erro'); sv.disabled = false; sv.textContent = 'Salvar visita'; }
      };
      app.querySelector('#copiarResumo').onclick = () => A.copiar(resumoTexto(d));
      app.querySelector('#descartar').onclick = () => { if (confirm('Descartar este rascunho?')) { draft = novoRascunho(); saveDraft(); again(); } };
    }
  }

  function validar(v) {
    const f = [];
    if (!v.consultor) f.push('consultor'); if (!v.cliente) f.push('cliente');
    if (!v.q1.perfis.length) f.push('Q1 perfil'); if (!v.q5.dores.length) f.push('Q5 dor/oportunidade');
    if (!v.a1.produtos.length) f.push('A1 produtos ofertados');
    if (!v.a2.semPedido && !Object.values(v.a2.itens).some(q => +q > 0)) f.push('A2 pedido ou motivo');
    if (!v.a3.data) f.push('A3 data de retorno');
    return f;
  }
  const valorPedido = v => { const p = A.precoRef(A.M); return v.a1.produtos.reduce((s, c) => s + (+v.a2.itens[c] || 0) * ((p[c] || {}).porUn || 0), 0); };
  const volumePedido = v => { const p = A.precoRef(A.M); return v.a1.produtos.reduce((s, c) => s + (+v.a2.itens[c] || 0) * ((p[c] || {}).litrosUn || 0), 0); };

  function resumoTexto(v) {
    const M = A.M;
    const itens = v.a1.produtos.map(c => { const q = +v.a2.itens[c] || 0; return `  - ${M.D.produtos[c] || c}${q ? ` — ${q} ${(A.precoRef(M)[c] || {}).um || 'un'}` : ' (ofertado)'}`; }).join('\n');
    return [
      `VISITA 5Q3A — ${A.fmtDate(v.data)}`,
      `Consultor: ${v.consultor || '-'} | Cliente: ${v.cliente || '-'}${v.clienteNome ? ' (' + v.clienteNome + ')' : ''}`,
      `Objetivo: ${v.objetivo || '-'}`, '',
      `Q1 Perfil: ${v.q1.tipo || '-'} | Atende: ${v.q1.perfis.join(', ') || '-'}${v.q1.obs ? ' | ' + v.q1.obs : ''}`,
      `Q2 Consumo: ${v.q2.volMes ? v.q2.volMes + ' L/mês' : '-'}${v.q2.trocas ? ', ' + v.q2.trocas + ' trocas/mês' : ''} | Estoque: ${v.q2.estoque || '-'}${v.q2.ruptura ? ' | Ruptura: ' + v.q2.ruptura : ''}`,
      `Q3 Concorrência: ${v.q3.marcas.join(', ') || '-'} | Share Lubrax est.: ${v.q3.share}%${v.q3.obs ? ' | ' + v.q3.obs : ''}`,
      `Q4 Execução PDV: ${v.q4.checks.length}/5${v.q4.obs ? ' | ' + v.q4.obs : ''}`,
      `Q5 Dores/oport.: ${v.q5.dores.join(', ') || '-'}${v.q5.obs ? ' | ' + v.q5.obs : ''}`, '',
      `A1 Ofertado:\n${itens || '  -'}`,
      `A2 Pedido: ${v.a2.semPedido ? 'SEM PEDIDO — ' + (v.a2.motivo || 'motivo não informado') : `${brl(valorPedido(v))} / ${nf0.format(volumePedido(v))} L (estimado)`} | Condição: ${v.a2.cond || '-'}${v.a2.obs ? ' | ' + v.a2.obs : ''}`,
      `A3 Próximo passo: ${v.a3.acao || '-'} em ${A.fmtDate(v.a3.data) || '-'}${v.a3.compromisso ? ' | ' + v.a3.compromisso : ''}`,
    ].join('\n');
  }
  A.resumoVisita = resumoTexto;

  // ======================= VISITAS =======================
  A.views.visitas = function (app) {
    const vis = A.visitasVisiveis().slice().sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    const q = A.ui.visBusca.toLowerCase();
    const lista = vis.filter(v => !q || [v.consultor, v.cliente, v.clienteNome, v.q1.tipo, A.nomeCli(v.cliente)].join(' ').toLowerCase().includes(q));
    const hoje = A.todayISO();
    const pend = vis.filter(v => v.a3 && v.a3.data && v.a3.data >= hoje && !v.retornoFeito).sort((a, b) => a.a3.data.localeCompare(b.a3.data));
    const atras = vis.filter(v => v.a3 && v.a3.data && v.a3.data < hoje && !v.retornoFeito);
    const totPed = sum(vis, v => v.valorEst || 0), comPed = vis.filter(v => !v.a2.semPedido && (v.valorEst || 0) > 0).length;
    const admin = window.AUTH.ehAdmin();
    app.innerHTML = `
      <div class="grid kpis">
        ${A.kpiCard('Visitas registradas', nf0.format(vis.length), admin ? 'todas' : 'visíveis para você', null, 'visitas')}
        ${A.kpiCard('Conversão em pedido', pct(vis.length ? comPed / vis.length : null), `${comPed} com pedido`, null, 'alvo')}
        ${A.kpiCard('Pedidos estimados', brlCompact(totPed), lit(sum(vis, v => v.volEst || 0)), null, 'dinheiro')}
        ${A.kpiCard('Retornos atrasados', nf0.format(atras.length), `${pend.length} agendados`, null, 'ritmo')}
      </div>
      <section class="card section"><header><h2>Próximos retornos</h2></header>
        ${pend.length || atras.length ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Cliente</th><th>Consultor</th><th>Ação</th><th></th></tr></thead><tbody>
        ${atras.concat(pend).map(v => `<tr><td>${v.a3.data < hoje ? `<span class="pill bad">▼ ${A.fmtDate(v.a3.data)}</span>` : A.fmtDate(v.a3.data)}</td><td>${A.cliLabel(v.cliente)}</td><td>${esc(v.consultor)}</td><td>${esc(v.a3.acao || '-')}</td><td><button class="btn ghost sm" data-ret="${v.id}">Iniciar retorno</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Nenhum retorno agendado.</p>'}
      </section>
      <section class="card section"><header><h2>Histórico de visitas</h2>
        <div class="row">${window.AUTH.pode('registrar_visitas') ? `<button class="btn sm" id="novaV">${A.icon('plus')} Nova visita</button>` : ''}${window.AUTH.pode('exportar') ? `<button class="btn ghost sm" id="expV">${A.icon('download')} CSV</button><button class="btn ghost sm" id="expJ">JSON</button>` : ''}</div></header>
        <div class="filters"><input type="search" id="vBusca" placeholder="Buscar por consultor, cliente, tipo…" value="${esc(A.ui.visBusca)}" aria-label="Buscar visitas"></div>
        <div class="table-wrap"><table><thead><tr><th>Data</th><th>Consultor</th><th>Cliente</th><th>Tipo</th><th>Dores (Q5)</th><th class="n">PDV</th><th class="n">Pedido est.</th><th>Retorno</th><th></th></tr></thead><tbody>
        ${lista.map(v => `<tr><td>${A.fmtDate(v.data)}</td><td>${esc(v.consultor)}<div class="muted small">${esc(v.criadoPorNome || '')}</div></td><td><a href="#" data-cli="${esc(v.cliente)}">${A.cliLabel(v.cliente)}</a></td><td>${esc(v.q1.tipo || '-')}</td><td class="small">${esc(v.q5.dores.join(', '))}</td><td class="n">${v.q4.checks.length}/5</td><td class="n">${v.a2.semPedido ? '<span class="muted">sem pedido</span>' : brl(v.valorEst)}</td><td>${A.fmtDate(v.a3.data)}</td>
          <td class="nowrap"><button class="btn ghost sm" data-ver="${v.id}">Ver</button>${admin || v.criadoPor === window.AUTH.usuarioAtual().id ? ` <button class="btn ghost sm danger" data-del="${v.id}" aria-label="Excluir visita">✕</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="9" class="muted">Nenhuma visita registrada ainda. Use o Roteiro 5Q3A.</td></tr>'}
        </tbody></table></div>
        <p class="muted small">As visitas ficam no servidor: o gestor vê as da equipe assim que são salvas. Sem internet, a visita fica guardada no aparelho e é enviada depois.</p>
      </section>`;
    const vb = app.querySelector('#vBusca'); vb.oninput = () => { A.ui.visBusca = vb.value; const p = vb.selectionStart; A.views.visitas(app); const n = app.querySelector('#vBusca'); n.focus(); n.setSelectionRange(p, p); };
    const nv = app.querySelector('#novaV'); if (nv) nv.onclick = () => A.novaVisita('');
    app.querySelectorAll('[data-cli]').forEach(a => a.onclick = e => { e.preventDefault(); A.drawerCliente(a.dataset.cli); });
    app.querySelectorAll('[data-ver]').forEach(b => b.onclick = () => { const v = vis.find(x => x.id === b.dataset.ver); A.openDrawer(`<h2>Visita ${A.fmtDate(v.data)}</h2><p class="muted">Registrada por ${esc(v.criadoPorNome || '-')}</p><div class="summary section"><pre>${esc(resumoTexto(v))}</pre></div><p class="section"><button class="btn ghost" id="cpV">Copiar</button></p>`); document.getElementById('cpV').onclick = () => A.copiar(resumoTexto(v)); });
    app.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (!confirm('Excluir esta visita?')) return; try { await A.rpc('cglub_visita_excluir', { p_id: b.dataset.del }); A.store.visitas = A.store.visitas.filter(x => x.id !== b.dataset.del); A.views.visitas(app); } catch (e) { A.toast(e.message, 'erro'); } });
    app.querySelectorAll('[data-ret]').forEach(b => b.onclick = () => { const v = vis.find(x => x.id === b.dataset.ret); v.retornoFeito = true; A.rpc('cglub_visita_retorno', { p_id: v.id }).catch(() => {}); if (!window.AUTH.pode('registrar_visitas')) { A.views.visitas(app); return; } A.novaVisita(v.cliente); draft.objetivo = 'Relacionamento / pós-venda'; saveDraft(); A.render(); });
    const ev = app.querySelector('#expV'); if (ev) ev.onclick = () => A.downloadCSV('visitas_5q3a.csv', [['Data', 'Consultor', 'Registrado por', 'Cliente', 'Nome', 'Objetivo', 'Tipo', 'Perfis', 'Vol. mensal (L)', 'Estoque', 'Concorrentes', 'Share Lubrax %', 'Nota PDV', 'Dores', 'Produtos ofertados', 'Pedido (R$)', 'Pedido (L)', 'Sem pedido - motivo', 'Condição', 'Retorno', 'Próxima ação', 'Compromisso']]
      .concat(vis.map(v => [v.data, v.consultor, v.criadoPorNome, v.cliente, v.clienteNome || A.nomeCli(v.cliente), v.objetivo, v.q1.tipo, v.q1.perfis.join('; '), v.q2.volMes, v.q2.estoque, v.q3.marcas.join('; '), v.q3.share, v.q4.checks.length, v.q5.dores.join('; '), v.a1.produtos.map(c => A.M.D.produtos[c] || c).join('; '), A.round(v.valorEst || 0, 2), A.round(v.volEst || 0), v.a2.semPedido ? v.a2.motivo : '', v.a2.cond, v.a3.data, v.a3.acao, v.a3.compromisso])));
    const ej = app.querySelector('#expJ'); if (ej) ej.onclick = () => A.download('visitas_' + A.todayISO() + '.json', JSON.stringify(vis, null, 1), 'application/json');
  };

  // ======================= CLIENTES =======================
  const CAMPOS_CLI = [
    ['codigo', 'Código SAP *'], ['razao', 'Razão social'], ['fantasia', 'Nome fantasia'], ['cnpj', 'CNPJ'],
    ['cidade', 'Cidade'], ['uf', 'UF'], ['segmento', 'Segmento'], ['contato', 'Contato'], ['telefone', 'Telefone'], ['email', 'E-mail'], ['vendedor', 'Vendedor responsável'], ['obs', 'Observações'],
  ];
  const ALIAS_CLI = { codigo: ['codigo', 'código', 'cliente', 'cod cliente', 'código cliente', 'codigo sap', 'código sap'], razao: ['razao social', 'razão social', 'razao', 'nome'], fantasia: ['nome fantasia', 'fantasia'], cnpj: ['cnpj', 'cnpj/cpf'], cidade: ['cidade', 'municipio', 'município'], uf: ['uf', 'estado'], segmento: ['segmento', 'tipo'], contato: ['contato', 'responsavel', 'responsável'], telefone: ['telefone', 'fone', 'celular', 'whatsapp'], email: ['email', 'e-mail'], vendedor: ['vendedor', 'consultor'], obs: ['obs', 'observacao', 'observação', 'observacoes'] };
  const soDig = s => String(s || '').replace(/\D/g, '');
  function cnpjValido(c) {
    c = soDig(c); if (!c) return true; if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
    const dv = n => { let s = 0, p = n - 7; for (let i = 0; i < n; i++) { s += +c[i] * p--; if (p < 2) p = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
    return dv(12) === +c[12] && dv(13) === +c[13];
  }

  A.formCliente = function (cod) {
    const u = window.AUTH.usuarioAtual();
    const c = Object.assign({ codigo: cod || '', uf: '', vendedor: u.perfil === 'consultor' ? u.vendedor : '' }, A.cliente(cod) || {});
    const vendedores = A.metasDoMes(A.M.ym).filter(A.M.escopo.okMeta).map(r => r[1]);
    A.openDrawer(`<h2>${A.cliente(cod) ? 'Editar cliente' : 'Novo cliente'}</h2>
      <form id="fCli" class="form" novalidate>
        <div class="row">
          <label class="field"><span>Código SAP *</span><input name="codigo" value="${esc(c.codigo)}" ${A.cliente(cod) ? 'readonly' : ''} required placeholder="ex.: 1000253 ou PROSP-…"></label>
          <label class="field"><span>CNPJ</span><input name="cnpj" value="${esc(c.cnpj || '')}" inputmode="numeric" placeholder="00.000.000/0000-00"></label>
        </div>
        <label class="field"><span>Razão social</span><input name="razao" value="${esc(c.razao || '')}"></label>
        <label class="field"><span>Nome fantasia</span><input name="fantasia" value="${esc(c.fantasia || '')}"></label>
        <div class="row">
          <label class="field"><span>Cidade</span><input name="cidade" value="${esc(c.cidade || '')}"></label>
          <label class="field" style="flex:0 0 110px"><span>UF</span><select name="uf">${['', 'BA', 'SE', 'AL', 'PE', 'Outra'].map(o => `<option ${o === c.uf ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
        </div>
        <label class="field"><span>Segmento</span><select name="segmento"><option value=""></option>${OPC.tipo.map(o => `<option ${o === c.segmento ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>
        <div class="row">
          <label class="field"><span>Contato</span><input name="contato" value="${esc(c.contato || '')}"></label>
          <label class="field"><span>Telefone / WhatsApp</span><input name="telefone" type="tel" value="${esc(c.telefone || '')}"></label>
        </div>
        <label class="field"><span>E-mail</span><input name="email" type="email" value="${esc(c.email || '')}"></label>
        <label class="field"><span>Vendedor responsável</span>${u.perfil === 'consultor' ? `<input name="vendedor" value="${esc(c.vendedor)}" readonly>` : `<select name="vendedor"><option value=""></option>${vendedores.map(o => `<option ${o === c.vendedor ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`}</label>
        <label class="field"><span>Observações</span><textarea name="obs">${esc(c.obs || '')}</textarea></label>
        <p class="erro" id="cliErro" role="alert"></p>
        <div class="row"><button class="btn" type="submit">Salvar cliente</button>${A.cliente(cod) && window.AUTH.ehAdmin() ? '<button class="btn ghost danger" type="button" id="delCli">Excluir cadastro</button>' : ''}</div>
        ${c.atualizadoEm ? `<p class="muted small">Atualizado em ${A.fmtDate(c.atualizadoEm)} por ${esc(c.atualizadoPorNome || '-')}</p>` : ''}
      </form>`);
    const f = document.getElementById('fCli');
    f.onsubmit = async e => {
      e.preventDefault();
      const o = Object.fromEntries(new FormData(f).entries());
      for (const k in o) o[k] = String(o[k]).trim();
      const erro = !o.codigo ? 'Informe o código do cliente.' : (!A.cliente(cod) && A.cliente(o.codigo)) ? 'Já existe cliente com esse código.' : !cnpjValido(o.cnpj) ? 'CNPJ inválido.' : (o.email && !/^\S+@\S+\.\S+$/.test(o.email)) ? 'E-mail inválido.' : (!o.razao && !o.fantasia) ? 'Informe a razão social ou o nome fantasia.' : '';
      if (erro) { document.getElementById('cliErro').textContent = erro; return; }
      try {
        const r = await A.gravar('cglub_cliente_salvar', { p_cliente: o }, 'Cliente ' + o.codigo);
        A.store.clientes[o.codigo] = r.offline ? Object.assign({}, A.store.clientes[o.codigo] || { criadoPor: u.id }, o) : r.r;
        A.closeDrawer(); A.toast(r.offline ? 'Sem internet: cliente guardado no aparelho e enviado depois.' : 'Cliente salvo.', r.offline ? 'erro' : 'ok'); A.render();
      } catch (ex) { document.getElementById('cliErro').textContent = ex.message; }
    };
    const del = document.getElementById('delCli');
    if (del) del.onclick = async () => {
      if (!confirm('Excluir o cadastro deste cliente? (as vendas do SAP continuam)')) return;
      try { await A.rpc('cglub_cliente_excluir', { p_codigo: cod }); delete A.store.clientes[cod]; A.closeDrawer(); A.render(); }
      catch (ex) { A.toast(ex.message, 'erro'); }
    };
  };

  A.views.clientes = function (app) {
    const M = A.M, ui = A.ui;
    const todos = A.listaClientes(M);
    const q = ui.cliBusca.toLowerCase();
    const f = ui.cliFiltro;
    const lista = todos.filter(c => {
      if (q && ![c.cod, c.cad && c.cad.razao, c.cad && c.cad.fantasia, c.cad && c.cad.cidade, c.cad && c.cad.cnpj, c.vendedores.join(' ')].join(' ').toLowerCase().includes(q)) return false;
      if (f === 'semCadastro') return !c.cad;
      if (f === 'comprouMes') return c.fatMes > 0;
      if (f === 'naoComprouMes') return c.fatMes === 0;
      if (f === 'prospect') return String(c.cod).startsWith('PROSP');
      return true;
    }).sort((a, b) => b.fatMes - a.fatMes || b.fatTotal - a.fatTotal);
    const semCad = todos.filter(c => !c.cad).length;
    const pode = window.AUTH.pode('cadastrar_clientes'), podeImp = window.AUTH.pode('importar_clientes');
    app.innerHTML = `
      <div class="grid kpis">
        ${A.kpiCard('Clientes', nf0.format(todos.length), 'com compra ou cadastrados', null, 'clientes')}
        ${A.kpiCard('Compraram no mês', nf0.format(todos.filter(c => c.fatMes > 0).length), A.fmtMes(M.ym), null, 'alvo')}
        ${A.kpiCard('Com cadastro completo', nf0.format(todos.length - semCad), `${pct(todos.length ? (todos.length - semCad) / todos.length : null)} da base`, todos.length ? (todos.length - semCad) / todos.length : 0)}
        ${A.kpiCard('Prospecções', nf0.format(todos.filter(c => String(c.cod).startsWith('PROSP')).length), 'sem código SAP ainda')}
      </div>
      ${semCad ? `<div class="alert info section"><span>ℹ</span><div><b>${semCad} clientes só têm o código SAP.</b> O SAP não traz razão social nem cidade. Cadastre aqui (um a um ou importando uma planilha) — o nome passa a aparecer em todo o app e a UF alimenta a análise BA × SE.</div></div>` : ''}
      <section class="card section"><header><h2>Clientes</h2>
        <div class="row">${pode ? `<button class="btn sm" id="novoCli">${A.icon('plus')} Novo cliente</button>` : ''}${podeImp ? `<button class="btn ghost sm" id="impCli">${A.icon('upload')} Importar planilha</button><input type="file" id="fileCli" accept=".xlsx,.xls,.csv" hidden>` : ''}${window.AUTH.pode('exportar') ? `<button class="btn ghost sm" id="expCli">${A.icon('download')} CSV</button>` : ''}</div></header>
        <div class="filters">
          <input type="search" id="cliBusca" placeholder="Buscar por código, nome, cidade, CNPJ…" value="${esc(ui.cliBusca)}" aria-label="Buscar clientes">
          <select id="cliFiltro" aria-label="Filtro"><option value="">Todos</option>${[['comprouMes', 'Compraram no mês'], ['naoComprouMes', 'Não compraram no mês'], ['semCadastro', 'Sem cadastro'], ['prospect', 'Prospecções']].map(([k, t]) => `<option value="${k}" ${f === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <span class="muted small">${lista.length} cliente(s)</span>
        </div>
        <div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Cidade/UF</th><th>Segmento</th><th>Vendedor</th><th class="n">Fat. ${A.fmtMes(M.ym)}</th><th>Última compra</th><th></th></tr></thead><tbody>
        ${lista.slice(0, 400).map(c => `<tr><td><a href="#" data-cli="${esc(c.cod)}">${c.cad ? `<b>${esc(c.cad.fantasia || c.cad.razao)}</b>` : `<span class="muted">sem cadastro</span>`}</a><div class="muted small">${esc(c.cod)}${c.cad && c.cad.cnpj ? ' · ' + esc(c.cad.cnpj) : ''}</div></td>
          <td>${c.cad && c.cad.cidade ? esc(c.cad.cidade) + '/' + esc(c.cad.uf || '') : '<span class="muted">—</span>'}</td><td>${esc(c.cad ? c.cad.segmento || '' : '')}</td><td class="small">${esc(c.vendedores.join(', '))}</td>
          <td class="n">${c.fatMes ? brl(c.fatMes) : '<span class="muted">—</span>'}</td><td>${A.fmtDate(c.ultima)}</td>
          <td class="nowrap">${pode ? `<button class="btn ghost sm" data-edit="${esc(c.cod)}">${c.cad ? 'Editar' : 'Cadastrar'}</button> ` : ''}<button class="btn ghost sm" data-visita="${esc(c.cod)}">Visitar</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">Nenhum cliente encontrado.</td></tr>'}
        </tbody></table></div>${lista.length > 400 ? `<p class="muted small">Mostrando 400 de ${lista.length}. Refine a busca.</p>` : ''}
      </section>`;
    const cb = app.querySelector('#cliBusca'); cb.oninput = () => { ui.cliBusca = cb.value; const p = cb.selectionStart; A.views.clientes(app); const n = app.querySelector('#cliBusca'); n.focus(); n.setSelectionRange(p, p); };
    app.querySelector('#cliFiltro').onchange = e => { ui.cliFiltro = e.target.value; A.views.clientes(app); };
    app.querySelectorAll('[data-cli]').forEach(a => a.onclick = e => { e.preventDefault(); A.drawerCliente(a.dataset.cli); });
    app.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => A.formCliente(b.dataset.edit));
    app.querySelectorAll('[data-visita]').forEach(b => b.onclick = () => A.novaVisita(b.dataset.visita));
    const nc = app.querySelector('#novoCli'); if (nc) nc.onclick = () => A.formCliente('');
    const ec = app.querySelector('#expCli'); if (ec) ec.onclick = () => A.downloadCSV('clientes.csv', [CAMPOS_CLI.map(c => c[1].replace(' *', '')).concat(['Faturamento mês', 'Última compra'])].concat(lista.map(c => CAMPOS_CLI.map(([k]) => k === 'codigo' ? c.cod : (c.cad || {})[k] || '').concat([A.round(c.fatMes, 2), c.ultima]))));
    const ic = app.querySelector('#impCli');
    if (ic) { ic.onclick = () => app.querySelector('#fileCli').click(); app.querySelector('#fileCli').onchange = e => importarClientes(e.target.files[0]).finally(() => { e.target.value = ''; }); }
  };

  async function importarClientes(file) {
    if (!file) return;
    if (!window.XLSX) { A.toast('Leitor de Excel não carregou (sem internet?). Use CSV separado por ";".', 'erro'); }
    try {
      let aoa;
      if (window.XLSX) { const wb = XLSX.read(await file.arrayBuffer()); const ws = wb.Sheets['Clientes'] || wb.Sheets[wb.SheetNames[0]]; aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }); }
      else aoa = (await file.text()).split(/\r?\n/).map(l => l.split(';'));
      const hi = aoa.findIndex(r => r.some(c => ALIAS_CLI.codigo.includes(String(c).trim().toLowerCase())));
      if (hi < 0) throw new Error('Não achei a coluna de código do cliente (ex.: "Código", "Cliente").');
      const h = aoa[hi].map(c => String(c).trim().toLowerCase());
      const idx = {}; for (const [k, al] of Object.entries(ALIAS_CLI)) idx[k] = h.findIndex(x => al.includes(x));
      const u = window.AUTH.usuarioAtual();
      let novos = 0, atual = 0, invalid = 0;
      const prev = [];
      for (const r of aoa.slice(hi + 1)) {
        const cod = String(r[idx.codigo] || '').trim(); if (!cod) continue;
        const o = {}; for (const k of Object.keys(ALIAS_CLI)) if (idx[k] >= 0 && String(r[idx[k]] || '').trim()) o[k] = String(r[idx[k]]).trim();
        o.codigo = cod; if (o.uf) o.uf = o.uf.toUpperCase().slice(0, 2);
        if (o.cnpj && !cnpjValido(o.cnpj)) { invalid++; delete o.cnpj; }
        prev.push(o);
      }
      if (!prev.length) throw new Error('Nenhuma linha com código.');
      if (!confirm(`${prev.length} clientes encontrados em ${file.name}.\nCampos lidos: ${Object.keys(idx).filter(k => idx[k] >= 0).join(', ')}.\n${invalid ? invalid + ' CNPJ inválido(s) serão ignorados.\n' : ''}Os dados preenchidos substituem os atuais (campos vazios não apagam). Continuar?`)) return;
      for (const o of prev) { if (A.cliente(o.codigo)) atual++; else novos++; o.origem = 'importação'; }
      void u;
      await A.rpc('cglub_clientes_importar', { p_lista: prev }, { timeout: 120000 });
      A.toast(`${novos} novo(s), ${atual} atualizado(s).`, 'ok');
      await A.recarregar(true);
    } catch (err) { A.toast('Falha ao importar clientes: ' + err.message, 'erro'); }
  }

  // ======================= CARTEIRA LUBRAX =======================
  A.views.carteira = function (app) {
    const M = A.M, preco = A.precoRef(M), ui = A.ui;
    const prods = Object.values(M.prodInfo);
    const q = ui.carteiraBusca.toLowerCase();
    const filtro = p => q ? (p.desc + ' ' + p.codigo + ' ' + p.familiaNome + ' ' + p.viscosidade + ' ' + p.specs.join(' ')).toLowerCase().includes(q) : p.segmento === ui.carteiraSeg;
    const vis = prods.filter(filtro);
    const fams = C.FAMILIAS.filter(f => vis.some(p => p.familia === f.id));
    const segVol = s => sum(prods.filter(p => p.segmento === s), p => (preco[p.codigo] || {}).vol || 0);
    const totVol = sum(Object.values(preco), p => p.vol);
    const card = p => { const pr = preco[p.codigo] || {}; return `<article class="prod-card ${p.premium ? 'is-prem' : ''}">
        <div class="prod-top"><span class="fam-dot fam-${esc(p.segmento)}"></span><span class="tag">${esc(p.codigo)}</span>${p.premium ? '<span class="tag prem">Premium</span>' : ''}</div>
        <h4>${esc(p.desc)}</h4>
        <div class="meta"><span class="tag">${esc(p.base)}</span>${p.viscosidade ? `<span class="tag strong">${esc(p.viscosidade)}</span>` : ''}${p.specs.map(s => `<span class="tag">${esc(s)}</span>`).join('')}</div>
        <div class="small muted">Embalagem: ${esc(p.embalagem.label)}</div>
        <div class="kv"><div>Volume mês<b>${pr.vol ? nf0.format(pr.vol) + ' L' : '—'}</b></div><div>Clientes<b>${pr.clientes || '—'}</b></div><div>Preço médio<b>${pr.porL ? brl2(pr.porL) + '/L' : '—'}</b></div></div>
      </article>`; };
    app.innerHTML = `
      <section class="card hero-carteira"><header><div><h2>Carteira de produtos Lubrax</h2><p class="muted small">${prods.length} SKUs faturados pela CGLUB · indicadores de ${A.fmtMes(M.ym)}</p></div></header>
        <div class="filters"><input type="search" id="cBusca" placeholder="Buscar: 5W30, dexos1, CK-4, Hydra, 10000607…" value="${esc(ui.carteiraBusca)}" aria-label="Buscar produtos"></div>
        <div class="seg-tabs">${C.SEGMENTOS.map(s => `<button class="chip" data-seg="${s.id}" aria-pressed="${!q && ui.carteiraSeg === s.id}"><span class="fam-dot fam-${s.id}"></span>${esc(s.nome)} <span class="muted">· ${prods.filter(p => p.segmento === s.id).length}</span></button>`).join('')}</div>
        <p class="muted" style="margin:0">${!q ? `${esc((C.SEGMENTOS.find(s => s.id === ui.carteiraSeg) || {}).perfil || '')} · ${pct(totVol ? segVol(ui.carteiraSeg) / totVol : 0)} do volume vendido no mês` : `${vis.length} resultado(s) para "${esc(ui.carteiraBusca)}"`}</p>
      </section>
      <div class="section">
      ${fams.map(f => { const ps = vis.filter(p => p.familia === f.id).sort((a, b) => ((preco[b.codigo] || {}).vol || 0) - ((preco[a.codigo] || {}).vol || 0)); return `<section class="fam"><header><h3>${esc(f.nome)} <span class="muted small">· ${ps.length} SKU(s)</span></h3><p>${esc(f.texto)}</p></header><div class="prod-grid">${ps.map(card).join('')}</div></section>`; }).join('') || '<p class="muted">Nada encontrado.</p>'}
      </div>
      <p class="muted small">Família, base, viscosidade, normas e embalagem são lidas da descrição SAP. Textos de família são resumos comerciais — confirme no catálogo técnico oficial Lubrax antes de propostas formais.</p>`;
    app.querySelectorAll('[data-seg]').forEach(b => b.onclick = () => { ui.carteiraSeg = b.dataset.seg; ui.carteiraBusca = ''; A.views.carteira(app); });
    const cb = app.querySelector('#cBusca'); cb.oninput = () => { ui.carteiraBusca = cb.value; const p = cb.selectionStart; A.views.carteira(app); const n = app.querySelector('#cBusca'); n.focus(); n.setSelectionRange(p, p); };
  };
})(window.APP);
