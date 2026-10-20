// Cliente da API (Supabase / PostgREST). Todas as operações passam pelas funções
// public.cglub_* do banco; as tabelas não são acessíveis diretamente.
// A chave abaixo é a "publishable" do projeto: pública por definição (o controle de
// acesso é feito no banco, pela sessão do usuário).
window.API = (function () {
  'use strict';
  const URL_BASE = 'https://vsjidlibxhsxhivuzyqk.supabase.co';
  const CHAVE = 'sb_publishable_7nnphSWYCAFkgTf6uzyuTg_9vVI_Fyc';

  const MENSAGENS = {
    nao_autenticado: 'Sua sessão expirou. Entre novamente.',
    sem_permissao: 'Seu usuário não tem permissão para esta ação.',
    linha_invalida: 'O arquivo tem linhas sem cliente, data, fatura ou produto.',
    quantidade_invalida: 'Arquivo vazio ou grande demais (máx. 30 mil linhas por importação).',
    cliente_sem_codigo: 'Informe o código do cliente.',
    valor_grande_demais: 'Conteúdo grande demais para salvar.',
    visita_grande_demais: 'A visita tem texto demais para salvar.',
    usuario_inexistente: 'Usuário não encontrado.',
    offline: 'Sem conexão com o servidor. Verifique a internet.',
  };

  class ErroAPI extends Error {
    constructor(msg, codigo) { super(msg); this.codigo = codigo; }
  }

  async function rpc(funcao, args, opcoes) {
    const ctrl = new AbortController();
    const limite = setTimeout(() => ctrl.abort(), (opcoes && opcoes.timeout) || 45000);
    let r;
    try {
      r = await fetch(`${URL_BASE}/rest/v1/rpc/${funcao}`, {
        method: 'POST',
        headers: { apikey: CHAVE, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(args || {}),
        signal: ctrl.signal,
        cache: 'no-store',
      });
    } catch (e) {
      throw new ErroAPI(MENSAGENS.offline, 'offline');
    } finally { clearTimeout(limite); }
    const txt = await r.text();
    let corpo = null;
    try { corpo = txt ? JSON.parse(txt) : null; } catch (e) { corpo = txt; }
    if (!r.ok) {
      const cod = (corpo && corpo.message) || ('http_' + r.status);
      if (cod === 'nao_autenticado') window.dispatchEvent(new CustomEvent('sessao-expirada'));
      throw new ErroAPI(MENSAGENS[cod] || (r.status >= 500 ? 'O servidor não respondeu. Tente de novo em instantes.' : cod), cod);
    }
    return corpo;
  }

  return { rpc, ErroAPI, MENSAGENS, URL_BASE };
})();
