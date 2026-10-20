// Sessão do usuário. O login é verificado no servidor (senha com bcrypt, bloqueio por
// tentativas); aqui fica só o token da sessão e as regras de acesso que o servidor devolve.
window.AUTH = (function () {
  'use strict';
  const CHAVE = 'cglub.sessao';
  const INATIVIDADE_MS = 45 * 60e3; // sessão sem "manter conectado" expira após 45 min parada

  const PERFIS = {
    admin: { nome: 'Administrador / Gerência', curto: 'Administrador', desc: 'Vê tudo, importa dados, edita metas e cadastros, gerencia usuários e regras.' },
    supervisor: { nome: 'Gestor / Supervisor', curto: 'Gestor', desc: 'Vê a equipe dos canais atribuídos, a Central do Gestor e as visitas da equipe.' },
    consultor: { nome: 'Vendedor / Consultor', curto: 'Vendedor', desc: 'Vê a própria carteira, faz o roteiro 5Q3A e registra visitas e clientes.' },
  };

  // Regras de acesso (o servidor aplica as que envolvem dados)
  const REGRAS = [
    { k: 'escopo', grupo: 'Dados', nome: 'Vendas que pode ver', tipo: 'escopo', servidor: true },
    { k: 'ver_valores', grupo: 'Dados', nome: 'Ver valores em R$ (faturamento, ticket, preço médio)', servidor: true },
    { k: 'ver_ranking_equipe', grupo: 'Dados', nome: 'Ver ranking da equipe (só % da meta, sem valores)', servidor: true },
    { k: 'ver_analises', grupo: 'Telas', nome: 'Tela Análises' },
    { k: 'ver_central_gestor', grupo: 'Telas', nome: 'Central do Gestor' },
    { k: 'ver_notas', grupo: 'Telas', nome: 'Notas e qualidade dos dados' },
    { k: 'registrar_visitas', grupo: 'Ações', nome: 'Fazer roteiro 5Q3A e registrar visitas', servidor: true },
    { k: 'cadastrar_clientes', grupo: 'Ações', nome: 'Cadastrar e editar clientes', servidor: true },
    { k: 'importar_clientes', grupo: 'Ações', nome: 'Importar planilha de clientes', servidor: true },
    { k: 'exportar', grupo: 'Ações', nome: 'Exportar CSV / planilha' },
    { k: 'importar_sap', grupo: 'Gestão', nome: 'Importar extração do SAP', servidor: true, soGestor: true },
    { k: 'editar_cadastros', grupo: 'Gestão', nome: 'Editar metas, De-Para, região, produtos e feriados', servidor: true, soGestor: true },
  ];
  const ESCOPOS = { proprio: 'Só a própria carteira', canais: 'Os canais atribuídos', todos: 'Toda a empresa' };
  // espelho de cglub.regras_padrao() no banco (o servidor é quem vale)
  const PADRAO = {
    supervisor: { escopo: 'canais', ver_valores: true, ver_ranking_equipe: true, ver_analises: true, ver_central_gestor: true, ver_notas: true, registrar_visitas: true, cadastrar_clientes: true, importar_clientes: true, exportar: true, importar_sap: false, editar_cadastros: false },
    consultor: { escopo: 'proprio', ver_valores: true, ver_ranking_equipe: false, ver_analises: false, ver_central_gestor: false, ver_notas: false, registrar_visitas: true, cadastrar_clientes: true, importar_clientes: false, exportar: false, importar_sap: false, editar_cadastros: false },
  };

  let atual = null, token = null, lembrar = false;

  function ler() {
    try {
      const s = JSON.parse(localStorage.getItem(CHAVE) || sessionStorage.getItem(CHAVE) || 'null');
      if (!s || !/^[0-9a-f]{64}$/.test(s.token)) return null;
      if (!s.lembrar && Date.now() - (s.ultimo || 0) > INATIVIDADE_MS) { limpar(); return null; }
      return s;
    } catch (e) { return null; }
  }
  function gravar() {
    const s = JSON.stringify({ token, lembrar, ultimo: Date.now(), uid: atual && atual.id });
    try { (lembrar ? localStorage : sessionStorage).setItem(CHAVE, s); (lembrar ? sessionStorage : localStorage).removeItem(CHAVE); } catch (e) { /* ignora */ }
  }
  function limpar() { token = null; atual = null; try { localStorage.removeItem(CHAVE); sessionStorage.removeItem(CHAVE); } catch (e) { /* ignora */ } }

  function iniciar() { const s = ler(); if (s) { token = s.token; lembrar = !!s.lembrar; } return !!token; }
  const uidSalvo = () => { const s = ler(); return s && s.uid; };

  async function entrar(login, senha, manter) {
    const r = await API.rpc('cglub_entrar', { p_login: login, p_senha: senha, p_lembrar: !!manter });
    if (!r || !r.ok) throw new Error((r && r.erro) || 'Não foi possível entrar.');
    token = r.token; lembrar = !!manter; atual = r.usuario; gravar();
    return atual;
  }
  async function instalar(codigo, nome, login, senha) {
    const r = await API.rpc('cglub_instalar', { p_codigo: codigo, p_nome: nome, p_login: login, p_senha: senha });
    if (!r || !r.ok) throw new Error((r && r.erro) || 'Não foi possível instalar.');
    token = r.token; lembrar = false; atual = r.usuario; gravar();
    return atual;
  }
  async function sair() {
    const t = token; limpar();
    if (t) { try { await API.rpc('cglub_sair', { p_token: t }, { timeout: 5000 }); } catch (e) { /* sessão expira sozinha */ } }
  }
  async function definirSenha(nova) {
    const r = await API.rpc('cglub_definir_senha', { p_token: token, p_nova: nova });
    if (!r.ok) throw new Error(r.erro); atual = r.usuario; return atual;
  }
  async function trocarSenha(atualSenha, nova) {
    const r = await API.rpc('cglub_trocar_senha', { p_token: token, p_atual: atualSenha, p_nova: nova });
    if (!r.ok) throw new Error(r.erro); atual = r.usuario; return atual;
  }

  function validarSenha(s) {
    if (!s || s.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
    if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) return 'Use letras e números na senha.';
    return '';
  }
  function senhaTemporaria() {
    const c = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const r = new Uint32Array(10); crypto.getRandomValues(r);
    const s = [...r].map(x => c[x % c.length]).join('');
    return s.slice(0, 4) + '-' + s.slice(4, 8) + (2 + (r[8] % 8)) + (2 + (r[9] % 8));
  }

  // ---------- regras ----------
  const regras = () => (atual && atual.regras) || {};
  const regra = k => !!regras()[k];
  const escopo = () => (atual && atual.escopo) || 'proprio';
  const ehAdmin = () => !!atual && atual.perfil === 'admin';

  // nomes antigos usados pelas telas -> regras do servidor
  const ALIAS = { importar: 'importar_sap', editarMetas: 'editar_cadastros', editarCadastros: 'editar_cadastros', editarClientes: 'cadastrar_clientes' };
  function pode(acao) {
    if (!atual) return false;
    if (acao === 'usuarios') return ehAdmin();
    if (acao === 'verRemessa') return escopo() !== 'proprio';
    return regra(ALIAS[acao] || acao);
  }
  function telas() {
    if (!atual) return [];
    const t = ['dashboard'];
    if (regra('ver_central_gestor')) t.push('gestor');
    if (regra('ver_analises')) t.push('analises');
    if (regra('registrar_visitas')) t.push('roteiro');
    t.push('visitas', 'clientes', 'carteira');
    if (regra('editar_cadastros') || regra('importar_sap')) t.push('cadastros');
    if (ehAdmin()) t.push('usuarios');
    t.push('perfil');
    if (regra('ver_notas')) t.push('notas');
    return t;
  }

  return {
    PERFIS, REGRAS, ESCOPOS, PADRAO, iniciar, entrar, instalar, sair, definirSenha, trocarSenha, validarSenha, senhaTemporaria,
    usuarioAtual: () => atual, setUsuario: u => { atual = u; if (token) gravar(); }, token: () => token, temSessao: () => !!token,
    uidSalvo, regras, regra, escopo, ehAdmin, pode, telas, tocar: () => { if (token && !lembrar) gravar(); }, limpar,
  };
})();
