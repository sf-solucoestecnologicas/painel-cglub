// Shell do app: boot, instalação / login, carga do servidor, menu por regras, roteamento e topo.
(function (A) {
  'use strict';
  const { esc } = A;
  const AUTH = window.AUTH;
  const $ = id => document.getElementById(id);

  const TITULOS = {
    dashboard: ['Dashboard', 'dashboard'], gestor: ['Central do Gestor', 'gestor'], analises: ['Análises', 'analises'],
    roteiro: ['Roteiro 5Q3A', 'roteiro'], visitas: ['Visitas', 'visitas'], clientes: ['Clientes', 'clientes'], carteira: ['Carteira Lubrax', 'carteira'],
    cadastros: ['Cadastros', 'cadastros'], usuarios: ['Usuários e regras', 'usuarios'], perfil: ['Meu perfil', 'perfil'], notas: ['Notas e limitações', 'notas'],
  };
  const GRUPOS = [['Painel', ['dashboard', 'gestor', 'analises']], ['Campo', ['roteiro', 'visitas', 'clientes', 'carteira']], ['Gestão', ['cadastros', 'usuarios', 'notas']]];

  // ---------- tema (por aparelho) ----------
  function aplicarTema() { try { const t = localStorage.getItem('cglub.tema'); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* ignora */ } }
  function alternarTema() {
    const r = document.documentElement;
    const escuro = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    r.dataset.theme = escuro ? 'light' : 'dark';
    try { localStorage.setItem('cglub.tema', r.dataset.theme); } catch (e) { /* ignora */ }
  }

  // ---------- telas de autenticação ----------
  function telaAuth(conteudo) {
    $('shell').hidden = true;
    const el = $('auth'); el.hidden = false;
    el.innerHTML = `<div class="auth-wrap">
      <section class="auth-brand">
        <div class="auth-brand-in">${A.logoHTML('xl on-dark')}
          <h1>Painel Comercial</h1><p>CGLUB · Distribuidora Lubrax BA/SE</p>
          <ul class="auth-points"><li>Desempenho da equipe × metas</li><li>Central do Gestor</li><li>Roteiro de visita 5Q3A</li><li>Carteira de produtos Lubrax</li></ul>
        </div><div class="stripe" aria-hidden="true"></div>
      </section>
      <section class="auth-form"><div class="auth-card">${conteudo}</div>
        <button class="btn ghost sm tema-auth" id="temaAuth" aria-label="Alternar tema">${A.icon('tema')}</button></section></div>`;
    A.mountLogos(el);
    $('temaAuth').onclick = alternarTema;
    const f = el.querySelector('input'); if (f) f.focus();
  }
  function telaCarregando(msg) {
    $('shell').hidden = true; $('auth').hidden = false;
    $('auth').innerHTML = `<div class="boot"><span class="logo-fallback">CG<i></i></span><p>${esc(msg || 'Carregando…')}</p></div>`;
  }

  function telaInstalacao() {
    telaAuth(`<h2>Instalação</h2><p class="muted">Crie o primeiro administrador com o código de instalação recebido.</p>
      <form id="fSetup" class="form">
        <label class="field"><span>Código de instalação</span><input name="codigo" required autocomplete="off" placeholder="XXXX-XXXX-XXXX-XXXX"></label>
        <label class="field"><span>Seu nome</span><input name="nome" required autocomplete="name"></label>
        <label class="field"><span>Login (e-mail)</span><input name="login" type="email" required autocomplete="username"></label>
        <label class="field"><span>Senha</span><input name="senha" type="password" required minlength="8" autocomplete="new-password"></label>
        <label class="field"><span>Repita a senha</span><input name="rep" type="password" required autocomplete="new-password"></label>
        <p class="muted small">Mínimo de 8 caracteres, com letras e números.</p>
        <p class="erro" id="aErro" role="alert"></p>
        <button class="btn block" type="submit">Criar administrador e entrar</button>
      </form>`);
    $('fSetup').onsubmit = async e => {
      e.preventDefault(); const f = e.target.elements, err = m => { $('aErro').textContent = m; };
      if (f.senha.value !== f.rep.value) return err('As senhas não conferem.');
      const v = AUTH.validarSenha(f.senha.value); if (v) return err(v);
      const bt = e.target.querySelector('button'); bt.disabled = true; bt.textContent = 'Criando…';
      try { await AUTH.instalar(f.codigo.value.trim().toUpperCase(), f.nome.value, f.login.value, f.senha.value); await entrarNoApp(); }
      catch (ex) { err(ex.message); bt.disabled = false; bt.textContent = 'Criar administrador e entrar'; }
    };
  }

  function telaLogin(msg) {
    telaAuth(`<h2>Entrar</h2><p class="muted">Use o login fornecido pelo administrador.</p>
      ${msg ? `<div class="alert info"><span>ℹ</span><div>${esc(msg)}</div></div>` : ''}
      <form id="fLogin" class="form">
        <label class="field"><span>Login (e-mail)</span><input name="login" type="email" required autocomplete="username"></label>
        <label class="field"><span>Senha</span><div class="pwd"><input name="senha" type="password" required autocomplete="current-password"><button type="button" class="linklike" id="verSenha">mostrar</button></div></label>
        <label class="check plain"><input type="checkbox" name="manter"> Manter conectado neste aparelho (30 dias)</label>
        <p class="erro" id="aErro" role="alert"></p>
        <button class="btn block" type="submit">Entrar</button>
      </form>
      <p class="muted small">Esqueceu a senha? Peça ao administrador para gerar uma senha temporária. Não marque "manter conectado" em computador compartilhado.</p>`);
    $('verSenha').onclick = () => { const i = document.querySelector('[name=senha]'); const v = i.type === 'password'; i.type = v ? 'text' : 'password'; $('verSenha').textContent = v ? 'ocultar' : 'mostrar'; };
    $('fLogin').onsubmit = async e => {
      e.preventDefault(); const f = e.target.elements, bt = e.target.querySelector('button[type=submit]');
      bt.disabled = true; bt.textContent = 'Verificando…';
      try { await AUTH.entrar(f.login.value, f.senha.value, f.manter.checked); await entrarNoApp(); }
      catch (ex) { $('aErro').textContent = ex.message; bt.disabled = false; bt.textContent = 'Entrar'; }
    };
  }

  function telaTrocaObrigatoria() {
    const u = AUTH.usuarioAtual();
    telaAuth(`<h2>Defina sua senha</h2><p class="muted">Olá, ${esc(u.nome)}. Troque a senha temporária antes de continuar.</p>
      <form id="fTroca" class="form">
        <label class="field"><span>Nova senha</span><input name="nova" type="password" required minlength="8" autocomplete="new-password"></label>
        <label class="field"><span>Repita a nova senha</span><input name="rep" type="password" required autocomplete="new-password"></label>
        <p class="muted small">Mínimo de 8 caracteres, com letras e números.</p>
        <p class="erro" id="aErro" role="alert"></p>
        <button class="btn block" type="submit">Salvar e entrar</button>
      </form><p><button class="linklike" id="sairT">Sair</button></p>`);
    $('sairT').onclick = () => sair();
    $('fTroca').onsubmit = async e => {
      e.preventDefault(); const f = e.target.elements;
      if (f.nova.value !== f.rep.value) { $('aErro').textContent = 'As senhas não conferem.'; return; }
      try { await AUTH.definirSenha(f.nova.value); await entrarNoApp(); }
      catch (ex) { $('aErro').textContent = ex.message; }
    };
  }

  async function sair(msg) {
    await A.limparCache();
    await AUTH.sair(); A.resetDraft(); A.closeDrawer();
    try { history.replaceState(null, '', location.pathname + location.search + '#dashboard'); } catch (e) { location.hash = '#dashboard'; }
    A.ui.mes = ''; A.ui.dashBusca = ''; A.ui.cliBusca = ''; A.ui.visBusca = '';
    telaLogin(typeof msg === 'string' ? msg : '');
  }
  A.sair = sair;

  // ---------- shell ----------
  async function entrarNoApp() {
    if (!AUTH.temSessao()) return telaLogin();
    const u0 = AUTH.usuarioAtual();
    if (u0 && u0.trocarSenha) return telaTrocaObrigatoria();
    telaCarregando('Carregando os dados…');
    try { await A.carregar(); }
    catch (e) {
      if (e.codigo === 'nao_autenticado') return sair('Sua sessão expirou. Entre novamente.');
      AUTH.limpar();
      return telaLogin(e.message);
    }
    const u = AUTH.usuarioAtual();
    if (u.trocarSenha) return telaTrocaObrigatoria();
    $('auth').hidden = true; $('auth').innerHTML = '';
    $('shell').hidden = false;
    A.renderShell();
    if (!AUTH.telas().includes(rota())) { try { history.replaceState(null, '', '#dashboard'); } catch (e) { location.hash = '#dashboard'; } }
    A.render();
    if (A.sync.offline) A.toast('Sem internet: mostrando os últimos dados salvos neste aparelho.', 'erro');
  }

  const rota = () => (location.hash || '#dashboard').slice(1).split('/')[0];

  A.renderShell = function () {
    const u = AUTH.usuarioAtual(); if (!u) return;
    const telas = AUTH.telas();
    $('side').innerHTML = `
      <div class="side-brand">${A.logoHTML('md on-dark')}<div><b>Painel Comercial</b><span>CGLUB · BA/SE</span></div></div>
      <nav class="side-nav" aria-label="Menu principal">
        ${GRUPOS.map(([g, itens]) => { const vis = itens.filter(i => telas.includes(i)); return vis.length ? `<div class="nav-group"><span class="nav-label">${g}</span>${vis.map(i => `<a href="#${i}" data-rota="${i}">${A.icon(TITULOS[i][1])}<span>${TITULOS[i][0]}</span></a>`).join('')}</div>` : ''; }).join('')}
      </nav>
      <div class="side-user">
        <a href="#perfil" class="user-chip" data-rota="perfil"><span class="avatar">${esc(A.iniciais(u.nome))}</span><span><b>${esc(u.nome)}</b><small>${esc(AUTH.PERFIS[u.perfil].nome)}</small></span></a>
        <button class="icon-btn" id="btnSair" title="Sair" aria-label="Sair">${A.icon('sair')}</button>
      </div>`;
    A.mountLogos($('side'));
    $('btnSair').onclick = () => sair();
    $('side').querySelectorAll('a').forEach(a => a.addEventListener('click', () => document.body.classList.remove('nav-open')));
    marcarAtivo();
  };
  function marcarAtivo() { const r = rota(); document.querySelectorAll('[data-rota]').forEach(a => a.classList.toggle('active', a.dataset.rota === r)); }

  function statusSync() {
    const s = A.sync, el = $('syncStatus');
    if (s.offline) { el.className = 'sync off'; el.textContent = s.pendentes ? `offline · ${s.pendentes} pendente(s)` : 'offline'; el.title = 'Sem conexão. Dados salvos neste aparelho em ' + (s.desde ? new Date(s.desde).toLocaleString('pt-BR') : '—'); }
    else { el.className = 'sync on'; el.textContent = 'online'; el.title = 'Dados do servidor de ' + (s.desde ? new Date(s.desde).toLocaleString('pt-BR') : '—'); }
  }

  function topo() {
    const M = A.M, r = rota();
    $('pgTitulo').textContent = TITULOS[r] ? TITULOS[r][0] : '';
    $('pgSub').textContent = M.meses.length ? `${A.fmtMes(M.ym)} · dados de ${A.fmtDate(M.dMin)} a ${A.fmtDate(M.dMax)} · dia ${M.diasCorridos} de ${M.diasMes}` : 'Sem dados de vendas importados';
    $('selMes').innerHTML = M.meses.slice().reverse().map(m => `<option value="${m}" ${m === M.ym ? 'selected' : ''}>${A.fmtMes(m)}</option>`).join('');
    $('selMes').parentElement.hidden = !M.meses.length;
    $('remessaWrap').hidden = !AUTH.pode('verRemessa');
    $('excluirRemessa').checked = A.excluirRemessa();
    $('btnImportar').hidden = !AUTH.pode('importar');
    statusSync();
  }

  A.render = function () {
    if (!AUTH.usuarioAtual()) return telaLogin();
    let r = rota();
    if (!AUTH.telas().includes(r)) { r = 'dashboard'; if (location.hash !== '#dashboard') { location.hash = '#dashboard'; return; } }
    A.build();
    const app = $('app');
    try { A.views[r](app); }
    catch (e) { console.error(e); app.innerHTML = `<div class="alert bad"><span>⚠</span><div>Erro ao montar a tela: ${esc(e.message)}</div></div>`; }
    topo(); marcarAtivo();
  };

  A.recarregar = async function (silencioso) {
    const bt = $('btnSync'); bt.classList.add('girando');
    try { const modo = await A.carregar(); if (!silencioso) A.toast(modo === 'online' ? 'Dados atualizados.' : 'Ainda sem internet.', modo === 'online' ? 'ok' : 'erro'); }
    catch (e) { if (e.codigo !== 'nao_autenticado') A.toast(e.message, 'erro'); }
    finally { bt.classList.remove('girando'); }
    if (AUTH.usuarioAtual()) { A.renderShell(); A.render(); }
  };

  window.addEventListener('hashchange', () => { if (AUTH.usuarioAtual()) { A.render(); window.scrollTo({ top: 0 }); } });

  // ---------- eventos globais ----------
  function ligarEventos() {
    $('drawerClose').onclick = A.closeDrawer;
    $('drawer').addEventListener('click', e => {
      if (e.target.id === 'drawer') A.closeDrawer();
      const a = e.target.closest('[data-cli]'); if (a) { e.preventDefault(); A.drawerCliente(a.dataset.cli); }
      const v = e.target.closest('[data-visita]'); if (v) { e.preventDefault(); A.novaVisita(v.dataset.visita); }
      const ed = e.target.closest('[data-editcli]'); if (ed) A.formCliente(ed.dataset.editcli);
    });
    document.addEventListener('click', e => { const a = e.target.closest('[data-nova-visita]'); if (a) { e.preventDefault(); A.novaVisita(''); } });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { A.closeDrawer(); document.body.classList.remove('nav-open'); } });
    $('btnMenu').onclick = () => document.body.classList.toggle('nav-open');
    $('scrim').onclick = () => document.body.classList.remove('nav-open');
    $('btnTema').onclick = alternarTema;
    $('btnSync').onclick = () => A.recarregar(false);
    $('selMes').onchange = e => { A.ui.mes = e.target.value; A.render(); };
    $('excluirRemessa').onchange = e => { A.pref('incluirRemessa', !e.target.checked); A.render(); };
    $('btnImportar').onclick = () => $('fileSap').click();
    $('fileSap').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) A.importarSAP(f); };
    window.addEventListener('sessao-expirada', () => { if (AUTH.usuarioAtual()) sair('Sua sessão expirou. Entre novamente.'); });
    window.addEventListener('online', () => { if (AUTH.usuarioAtual()) A.recarregar(true); });

    const tip = $('tip');
    document.addEventListener('mousemove', e => {
      const t = e.target.closest && e.target.closest('[data-tip]');
      if (!t) { tip.hidden = true; return; }
      tip.textContent = t.getAttribute('data-tip'); tip.hidden = false;
      tip.style.left = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8) + 'px'; tip.style.top = (e.clientY + 14) + 'px';
    });

    // sessão sem "manter conectado": renova com atividade, expira após 45 min parada
    ['click', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, () => AUTH.tocar(), { passive: true }));
    setInterval(() => { if (AUTH.usuarioAtual() && !AUTH.iniciar()) sair('Sua sessão expirou por inatividade. Entre novamente.'); }, 60e3);
  }

  // ---------- boot ----------
  aplicarTema();
  (async function boot() {
    ligarEventos();
    if (AUTH.iniciar()) return entrarNoApp();
    try {
      const st = await window.API.rpc('cglub_status', {});
      if (!st.instalado) return telaInstalacao();
    } catch (e) { return telaLogin(e.message); }
    telaLogin();
  })();
})(window.APP);
