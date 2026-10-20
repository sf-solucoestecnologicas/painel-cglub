// Cópia local (IndexedDB, com fallback para localStorage): guarda os últimos dados
// recebidos do servidor para abrir sem internet, e a fila de gravações feitas offline.
// O servidor é sempre a fonte da verdade; ao sair, a cópia do usuário é apagada.
window.DB = (function () {
  'use strict';
  const NOME = 'cglub', LOJA = 'kv', PREFIXO = 'cglub.kv.';
  let idb = null, aberto = null;

  function abrir() {
    if (aberto) return aberto;
    aberto = new Promise(resolve => {
      if (!window.indexedDB) return resolve(null);
      // alguns navegadores (aba anônima, file:// restrito) nunca respondem: cai no localStorage
      const limite = setTimeout(() => resolve(null), 2500);
      const ok = v => { clearTimeout(limite); idb = v; resolve(v); };
      let req;
      try { req = indexedDB.open(NOME, 2); } catch (e) { return ok(null); }
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(LOJA)) req.result.createObjectStore(LOJA); };
      req.onsuccess = () => ok(req.result);
      req.onerror = () => ok(null);
      req.onblocked = () => ok(null);
    });
    return aberto;
  }
  function tx(modo, fn) {
    return new Promise((resolve, reject) => {
      const t = idb.transaction(LOJA, modo);
      const r = fn(t.objectStore(LOJA));
      t.oncomplete = () => resolve(r && r.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  async function ler(chave) {
    await abrir();
    try {
      if (idb) return (await tx('readonly', s => s.get(chave))) ?? null;
      return JSON.parse(localStorage.getItem(PREFIXO + chave) || 'null');
    } catch (e) { return null; }
  }
  async function gravar(chave, valor) {
    await abrir();
    try {
      if (idb) await tx('readwrite', s => s.put(valor, chave));
      else localStorage.setItem(PREFIXO + chave, JSON.stringify(valor));
      return true;
    } catch (e) { return false; }
  }
  async function apagar(chave) {
    await abrir();
    try {
      if (idb) await tx('readwrite', s => s.delete(chave));
      else localStorage.removeItem(PREFIXO + chave);
    } catch (e) { /* ignora */ }
  }

  return { ler, gravar, apagar, tipo: () => (idb ? 'IndexedDB' : 'localStorage') };
})();
