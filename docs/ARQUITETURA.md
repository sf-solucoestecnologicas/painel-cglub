# Painel Comercial CGLUB: arquitetura

## Visão geral

```
GitHub Pages (este repositório, público) ──HTTPS──▶ Supabase (Postgres)
  só código: HTML, CSS, JS                            schema privado `cglub`
  nenhum dado de vendas                                acesso só pelas funções public.cglub_*
```

- **Front-end:** app estático, sem build (vanilla JS). Publicado pelo GitHub Pages a partir da branch `main`.
- **Back-end:** o mesmo projeto Supabase dos outros sistemas, isolado no schema `cglub`. As tabelas não têm GRANT para a API: tudo passa pelas funções `public.cglub_*` (`SECURITY DEFINER`), que exigem um token de sessão.
- **Dados de vendas** nunca entram no repositório (`dados.js` e `.xlsx` estão no `.gitignore`). A carga inicial foi feita por conexão direta ao banco (`tools/carga-inicial.js`). As cargas seguintes são feitas pelo app, em **Importar SAP**.

## Módulos

| Arquivo | Responsabilidade |
|---|---|
| `js/api.js` | Chamada às funções do banco (`/rest/v1/rpc/…`) e mensagens de erro em português. |
| `js/auth.js` | Sessão (token), perfis e regras de acesso recebidas do servidor. |
| `js/db.js` | Cópia local (IndexedDB): últimos dados baixados, para abrir sem internet, e fila de gravações feitas offline. |
| `js/core.js` | Modelo de dados (equivale às colunas Z:AH da aba Dados_SAP), dias úteis, componentes e sincronização. |
| `js/carteira.js` | Classificação de SKU pela descrição SAP. |
| `js/views-painel.js` | Dashboard e Análises. |
| `js/views-gestor.js` | Central do Gestor (plano de recuperação, clientes parados, mix premium, pauta 1:1). |
| `js/views-campo.js` | Roteiro 5Q3A, Visitas, Clientes e Carteira. |
| `js/views-admin.js` | Importação e exportação, Cadastros, Usuários e regras, Perfil e Notas. |
| `js/main.js` | Boot, instalação, login, menu e roteamento. |
| `supabase/schema.sql` | Schema, regras e funções. É idempotente. |
| `supabase/testes.sql` | 12 testes de segurança e escopo. Rodam numa transação desfeita no final. |

## Login e sessão

- O login e a senha são verificados no banco. A senha é guardada com bcrypt (`pgcrypto`).
- Depois de 5 senhas erradas, o usuário fica bloqueado por um tempo que cresce até 15 minutos. Há também um limite de falhas por IP (`cf-connecting-ip`).
- A sessão é um token aleatório de 256 bits; o banco guarda só o SHA-256 dele. Ela dura 12 h, ou 30 dias com "manter conectado", e expira após 7 dias sem uso.
- O primeiro administrador só pode ser criado com um código de instalação de uso único (`tools/codigo-instalacao.js`).
- Os usuários seguintes são criados pelo administrador, com senha temporária. A troca é obrigatória no primeiro acesso.

## Regras de acesso

Cada regra é resolvida em três camadas: **padrão do perfil** (no código) → **ajuste do perfil** (`config.regrasPerfis`, editável em *Usuários e regras → O que cada perfil vê*) → **exceção do usuário** (`usuarios.permissoes`).

| Regra | Admin | Gestor | Vendedor | Onde é aplicada |
|---|---|---|---|---|
| Escopo de vendas | toda a empresa | canais atribuídos | só a própria carteira | servidor |
| Ver valores em R$ | sim | sim | sim | servidor (as colunas N, O e P vão vazias) |
| Ranking da equipe (% da meta) | sim | sim | não | servidor |
| Análises / Central do Gestor / Notas | sim | sim | não | interface |
| Registrar visitas / cadastrar clientes | sim | sim | sim | servidor |
| Importar clientes / exportar | sim | sim | não | servidor / interface |
| Importar SAP / editar cadastros | sim | não (pode ser liberado) | nunca | servidor |

O vendedor enxerga as vendas cujo "Nome no SAP" está ligado, no **De-Para**, ao nome dele nas Metas. Por isso o De-Para também funciona como controle de acesso.

## Manutenção

```bash
cd tools && npm install                          # uma vez (pg, xlsx)
node tools/sql.js supabase/schema.sql            # aplica alterações do banco
node tools/sql.js supabase/testes.sql --testar   # roda os testes (nada fica gravado)
node tools/codigo-instalacao.js                  # novo código, se ainda não houver usuários
```

A senha do banco vem da variável `SUPABASE_DB_PASSWORD` ou do arquivo `../crm/.env`. Ela nunca vai para o repositório.

## Limites conhecidos

- O plano gratuito do Supabase pausa o projeto após 7 dias sem nenhum acesso. É só reativar no painel do Supabase.
- A cópia offline fica no aparelho até o usuário clicar em Sair. Em computador compartilhado, não use "manter conectado".
- "Exportar" é uma regra de interface: quem vê os dados na tela pode copiá-los de outras formas.
