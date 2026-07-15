# Changelog — BrightierOS

Todas as versões e mudanças relevantes do BrightierOS são documentadas aqui.

## v0.5.4.4 — Desatualizar (rollback) + atualizar por versão do GitHub + reiniciar

* **Desatualizar / rollback** na Administração: seção "Atualizações" permite
  atualizar para a versão mais recente do GitHub, ir para uma **versão específica**
  (atualização incremental via tag) ou **desatualizar** (rollback) para uma versão
  anterior. Um backup automático é criado antes de qualquer alteração.
* **Backups**: listar e **restaurar** backups do estado do sistema (com backup de
  segurança automático). Histórico de atualizações visível na UI.
* **Reiniciar o BrightierOS**: botão em Configurações que reinicia **apenas o
  servidor BrightierOS** (não o sistema operacional), via código de saída detectado
  pelo launcher (bOS.bat/bOS.sh).
* **Segurança**: rotas de escrita de atualização (`apply`, `rollback`, `backup`,
  `restore`) e `admin/restart` agora exigem `users:manage` (só admin). Leituras
  (check/history/backups/changelog) continuam para usuários logados.

## v0.5.4.3 — Correção: tela de carregamento + arquivos validando

* **Correção de bug crítico**: a tela de carregamento ficava em *loop* infinito
  porque o listener usava o evento digitado erado `DOMContentLoaded` (faltava
  um "D") em `app.js` e `auth.js` — o `guard()`/`boot()` nunca executava.
  Agora usa `DOMContentLoaded` correto e o boot loader some normalmente.
* **Arquivos validam autenticação** (`routes/files.js`): `authRead` agora exige
  `files:read` (qualquer usuário **logado** pode ler) e `authWrite` exige
  `files:all` (só admin/editor escreve). Nenhuma rota de arquivos funciona
  sem login. Visualizador (viewer) continua somente-leitura.
* **Permissão hierárquica** (`lib/users.js`): `<grupo>:all` agora concede
  automaticamente `<grupo>:ação` (ex.: `files:all` cobre `files:read`/`files:write`).
  Antes, admin/editor eram barrados ao *ler* arquivos porque só tinham `files:all`.
* **Segurança de dados**: `.gitignore` já ignora `data/` (usuários, sessões, convites —
  contém hashes de senha), `.env`, `*.log` e `*.ps1`. Nenhuma credencial é versionada.

## v0.5.4.2 — Terminal restrito a administradores

* **Segurança**: o terminal (WebSocket que executa comandos do SO) antes não exigia
  autenticação — qualquer um que alcançasse a porta tinha shell. Agora **só administradores
  autenticados** acessam.
  * `server.js`: o WebSocket do terminal valida um token admin (`?token=`); conexões de
    não-admin ou sem token são fechadas imediatamente.
  * `server.js`: `/console.html` retorna `403` para não-administradores (defesa em profundidade).
  * `lib/users.js`: `sessionFromToken(token)` para validar sessão fora do middleware HTTP.
* **UI**: o item "Console" saiu do dock padrão e só aparece para `admin`; removido o link
  rápido de Console do Dashboard.
* O **viewer** (e editor) **não tem mais acesso ao terminal**.

## v0.5.4.1 — Correção: copiar link de convite

* Corrigido "Copiar link" na lista de convites e na criação de convite que não
  copiava em contexto inseguro (HTTP em LAN). Adicionado `ui.copy()` com fallback
  via `textarea` + `execCommand('copy')` quando `navigator.clipboard` indisponível.
* Se mesmo assim a cópia falhar, o link é exibido em um diálogo para cópia manual.
* `ui.prompt` agora seleciona o texto ao abrir e fecha corretamente (resolve `null`).

## v0.5.4 — Convites por link

* **Convites por link** com papel pré-definido: o administrador gera um link que
  cria a conta já como **admin** ou **viewer**. Funciona mesmo com o auto-registro
  (`allowRegistration`) desligado.
* Backend `lib/users.js`: store de convites (`data/invites.json`) com token, papel,
  criador, expiração (7 dias), uso único e revogação.
* Rotas: `GET /api/users/invites/:token` (público, valida), `GET/POST /api/users/invites`
  e `DELETE /api/users/invites/:token` (users:manage). `POST /api/users/create` aceita
  `invite` e cria com o papel do convite.
* Tela de **Signup** reconhece `?invite=TOKEN`, mostra "Você foi convidado como
  <papel>" e trava o formulário se o convite for inválido/expirado/usado.
* Administração → **Convites por link**: botões "Convidar visualizador" / "Convidar
  administrador", lista com status (válido/usado/expirado/revogado), copiar link e revogar.

## v0.5.3 — Contas e permissões (correções)

* **Signup corrigido e visível**: o link "Criar conta" agora aparece sempre na
  tela de login; a página de cadastro explica que cria um usuário `viewer`; o
  servidor retorna `403 Cadastro fechado` claro quando `allowRegistration` está
  desligado (antes retornava 401 confuso). A seção de Usuários na Administração
  explica o fluxo de cadastro e o estado do auto-registro.
* **Diferença admin × usuário agora é real** (não só no papel):
  * `routes/files.js` passou a exigir autenticação em todas as rotas; apenas
    quem tem `files:all` (admin/editor) pode criar/editar/renomear/excluir/enviar.
    **Visualizador é somente-leitura** (navega e baixa, não modifica).
  * O usuário logado recebe suas `permissions` via `/me` e `/login`; a UI esconde
    botões de escrita para quem não pode (Arquivos) e mostra um **badge de papel**
    no topo.
* **Seção Papéis** com descrição humana do que cada papel pode fazer.
* Tagline do Dashboard: "Your infrastructure. Brighter."

## v0.5.2 — Setup e Signup

* Sistema de autenticação refeito em **dois fluxos** distintos:
  * **Setup** (`/setup.html`): primeira execução do sistema, cria a conta
    administradora inicial (só quando não há usuários).
  * **Signup** (`/signup.html`): criação de uma **nova conta** quando o sistema
    já está configurado, respeitando a configuração `allowRegistration`
    (papel fixo `viewer`, sem privilégios).
* `GET /api/users/setup` agora informa `allowRegistration`, usado para exibir
  o link "Criar conta" na tela de login.
* `POST /api/users/create` reformulado:
  * sem usuários → cria o admin inicial (Setup);
  * com `allowRegistration` e sem autenticação → cria conta `viewer` (Signup);
  * autenticado com `users:manage` → cria usuário com papel definido pelo admin.
* Tela de Setup ganhou campo "Nome de exibição" e textos mais claros.

## v0.5.1 — Meu Perfil

* Nova tela **Meu Perfil** (`/profile.html`) acessível a qualquer usuário logado
  (item de navegação "Perfil" visível para todos).
* Visualização dos próprios dados (usuário, papel, nome de exibição, status).
* **Alteração do nome de exibição** via `PUT /api/users/me` (atualiza apenas o
  próprio perfil; não permite trocar papel/ativo/username por esta rota).
* **Troca de senha** com confirmação da senha atual + confirmação da nova senha.
* **Listagem e encerramento das próprias sessões ativas** (ao encerrar a sessão
  atual, o usuário é desconectado).

## v0.5.0 — Administração

### Usuários
* Gerenciamento multi-usuário (`data/users.json`), com migração automática do
  usuário único legado (`data/user.json`) preservando o administrador existente.
* Criar, editar (nome, papel, ativo/inativo) e remover usuários.
* Alteração de senha (própria ou por administrador).

### Permissões
* Papéis (roles): `admin`, `editor`, `viewer`.
* Mapa de permissões por papel e controle de acesso via middleware
  `requirePermission` nas rotas.
* Proteção contra lockout: não é possível remover/rebaixar/desativar o último
  administrador.

### Sessões
* Sessões ativas baseadas em token (`data/sessions.json`), criadas no login.
* Listagem e encerramento de sessões (próprias ou de terceiros por admin).
* Melhorias na autenticação: senhas com hash `scrypt` + salt (crypto nativo,
  sem novas dependências) e autenticação por token Bearer.

### Administração
* Nova página **Administração** (`/admin.html`) com usuários, papéis, sessões,
  configurações e logs.
* Configurações do sistema (`data/settings.json`): nome, tempo de sessão,
  auto-registro e modo manutenção.
* Logs administrativos/auditoria (`data/admin-logs.json`) para ações sensíveis.
* Melhorias de responsividade (tabelas, cabeçalhos de seção, topbar, modais e
  ações em telas pequenas).

### Atualização forçada
* Mantida a proteção padrão que bloqueia atualização/rollback quando há
  alterações locais; agora o usuário pode escolher **"Atualizar mesmo assim"**.
* Antes de sobrescrever, é criado um **backup automático**; a atualização então
  ignora as alterações locais e o evento é **registrado no log administrativo**
  (`update.force` / `rollback.force`).

## v0.4.5 — Atualizações Inteligentes

* **Rollback aprimorado**: reversão para versões anteriores via tag, agora com
  backup automático antes de reverter.
* **Backup antes de atualizar**: todo `apply`/`rollback` cria um snapshot do
  diretório `data/` em `data/backups/`. Adicionados endpoints manuais de backup
  (`POST /api/update/backup`), listagem (`GET /api/update/backups`) e restauração
  (`POST /api/update/restore`, que cria um backup de segurança do estado atual).
* **Changelog integrado**: `GET /api/update/changelog` expõe este arquivo; o
  `check` também informa `changelogAvailable` e as `incrementalTags` disponíveis.
* **Atualização incremental**: `POST /api/update/apply` aceita `targetVersion`
  e vai exatamente para a tag alvo (delta em relação à versão instalada), em vez
  de puxar toda a branch `main`.
* **Atualização de plugins junto**: durante o `apply`, os plugins instalados que
  são repositórios git são atualizados automaticamente (`git pull`).
* **Proteção contra atualização por cima de alterações locais**: `apply` e
  `rollback` detectam arquivos modificados/não commitados e retornam
  `code: "LOCAL_CHANGES"`. A interface avisa o usuário e só prossegue se ele
  confirmar "Continuar".

## v0.4.1

* Correções de estabilidade no sistema de atualizações e histórico.

## v0.3.0

* Gerenciador de arquivos e sistema de instalação multiplataforma (Windows,
  Linux e macOS).

## v0.2.x

* Verificação de atualizações pelo GitHub.
* Suporte aprimorado para Linux e macOS; scripts de inicialização
  multiplataforma.

## v0.1.x

* Autenticação, dashboard, arquivos e estrutura inicial de plugins.
