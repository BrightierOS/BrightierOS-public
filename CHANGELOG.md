# Changelog — BrightierOS

Todas as versões e mudanças relevantes do BrightierOS são documentadas aqui.

## v0.8.2.1 — Hotfix multiplataforma: consistência do lockfile + documentação

Hotfix de compatibilidade multiplataforma (Windows, Linux, macOS) sobre a v0.8.2.
Sem mudanças funcionais — apenas higiene de empacotamento e documentação.

### Instalação / Lockfile
* **`package-lock.json` sincronizado com `package.json`**: antes divergia como
  `1.0.0` enquanto o `package.json` estava em `0.8.2`. Agora ambos refletem a
  versão instalada, garantindo `npm ci` limpo e reproduzível — importante para
  o instalador Linux (`scripts/install-linux.sh`), que usa `npm ci --omit=dev`.
* **`node_modules/.package-lock.json` removido do versionamento**: o arquivo era
  rastreado desde `v0.0.1-dev` (antes de `node_modules/` entrar no `.gitignore`)
  e podia divergir entre plataformas. Agora cada instalação o regenera via
  `npm ci`, como esperado em Windows, Linux e macOS.

### Documentação
* **README**: adicionadas as seções v0.8.1, v0.8.2 e v0.8.2.1 (o roadmap havia
  parado em v0.8.0).

## v0.8.2 — Adicionar/remover nós da infraestrutura (funcional) + fix de permissão na UI

Versão que torna o gerenciamento de nós da infraestrutura realmente utilizável:
corrigida a checagem de permissão no frontend (que escondia os botões de
adicionar/remover até para administradores) e adicionada verificação real de
conectividade ao adicionar/testar nós.

### Infraestrutura — Nós
* **Adicionar e remover nós funcionando de ponta a ponta**: o botão
  "+ Adicionar nó" e as ações "Editar"/"Remover" agora aparecem para
  administradores (antes ficavam ocultos por um bug de permissão no frontend).
* **Verificação de conectividade (healthcheck)**: ao adicionar um nó ou clicar
  em "Testar", o sistema faz um probe HTTP ao endpoint `/api/health` do nó
  (host:porta) e atualiza o status para `online`/`offline` em tempo real, com
  latência (ms) e data da última verificação. Antes o status era sempre
  `offline` (placeholder da v0.8.0).
* **"↻ Atualizar status"**: testa a conectividade de todos os nós remotos de
  uma vez (nova coluna "Verificado" na tabela).
* Novos endpoints: `POST /api/infrastructure/nodes/:id/check` e
  `POST /api/infrastructure/nodes/check`. O `POST /nodes` agora retorna o nó já
  com o status verificado.
* O **nó local** não pode ser removido e é sempre considerado ativo (`local`).

### Correção de permissão (frontend)
* **`bosCan` agora replica a permissão hierárquica do backend**: `<grupo>:all`
  concede qualquer `<grupo>:<ação>`. Antes, a UI checava `infrastructure:control`
  e `services:control` literalmente — como administradores têm
  `infrastructure:all`/`services:all`, os botões de **adicionar/remover nós** e
  **iniciar/parar/reiniciar serviços** nunca apareciam. Agora aparecem.
* O backend (`lib/users.js`) já tinha essa lógica hierárquica desde v0.5.4.5;
  o frontend é que não a espelhava. Esta versão alinha os dois.

### Testes
* `test/infrastructure-check.test.js`: healthcheck online/offline com servidor
  HTTP efêmero, nó local e id inexistente.
* `test/infrastructure-permissions.test.js`: `bosCan` hierárquico no frontend.
* `test/admin.test.js`: confirma que `infrastructure:all`/`services:all`
  concedem `:control` no backend.

## v0.8.1 — Hotfix: force update via git checkout

* **Force update agora usa `git checkout`**: quando uma atualização é forçada
  (`force: true`), o sistema faz `git fetch` + `git checkout` + `git reset --hard`
  em vez de `git pull` (merge). Isso garante que os arquivos fiquem idênticos ao
  remote, sem merge conflicts nem commits de merge — resolvendo casos onde o
  force update anterior (com `pull`) não atualizava os arquivos corretamente,
  deixando rotas novas (Serviços, Infraestrutura) respondendo "Not found".
* **Incremental com force**: descarta alterações locais (`reset --hard` +
  `clean -fd`) antes do `checkout` da tag alvo, evitando falhas.
* Compatibilidade mantida: atualização normal (sem force) continua usando
  `git pull`; rollback já usava `git checkout`.

## v0.8.0 — Infraestrutura e Serviços

Versão focada em transformar o BrightierOS numa plataforma completa de
gerenciamento de infraestrutura, mantendo total compatibilidade com versões
anteriores.

### Dashboard
* **Gráficos em tempo real**: gráfico de linha multi-série (CPU/RAM/Rede) que
  atualiza automaticamente a cada 5s.
* **Métricas expandidas**: uso de CPU, memória, armazenamento, uptime,
  processos (top 5), temperatura (quando disponível) e utilização de rede.
* **Cards dedicados**: Performance, Sistema, Armazenamento, Rede, Processos.
* **Atualização automática** de todas as informações sem recarregar a página.

### Histórico de Métricas
* **Coletor periódico em background** (`lib/metrics.js`): registra CPU, RAM,
  Disco e Rede continuamente (a cada 15s), independente de alguém visualizar o
  dashboard. Histórico retido até 1000 pontos.
* **Endpoints dedicados**: `/api/metrics/current`, `/api/metrics/history`,
  `/api/metrics/summary` (média/máx/mín — base para futuras estatísticas).

### Serviços
* **Gerenciamento de serviços** (`lib/services.js` + `routes/services.js`):
  listar, iniciar, parar, reiniciar, visualizar status e logs.
* **Multiplataforma**: systemd (Linux), sc (Windows), launchctl (macOS).
* **BrightierOS como serviço virtual**: status/logs próprios; reinício delega
  ao launcher (mesmo mecanismo seguro do admin).
* Ações de controle restritas a administradores; status/logs abertos a
  editores/viewers.

### Infraestrutura
* **Base para múltiplos nós/servidores** (`lib/infrastructure.js` +
  `routes/infrastructure.js`): registro CRUD de nós com nó local
  auto-registrado. Preparado para conexões remotas e futuras integrações
  distribuídas (sem gerenciamento remoto completo nesta versão).
* **Página Infraestrutura** com visão geral e tabela de nós.

### Notificações
* **Tempo real via SSE** (`/api/notifications/stream`): atualiza sem recarregar
  páginas. Sino com badge de não-lidas no topbar.
* **Categorias**: system, service, security, update, infrastructure, general.
* **Persistência** mantida (JSON) + `markAllRead` e contagem de não-lidas.

### Auditoria
* Ações em serviços (start/stop/restart e falhas) registradas em
  `data/admin-logs.json`.
* Falhas importantes e erros internos (ex.: coleta de métricas) auditados.

### Interface
* Indicadores visuais (status pills), estados de carregamento (spinner),
  feedback de ações (toasts), páginas consistentes e pequenas melhorias de UX.

### APIs
* Novos endpoints organizados: `/api/metrics/*`, `/api/services/*`,
  `/api/infrastructure/*`, `/api/notifications/*`, `/api/health`.
* Compatibilidade mantida: `/api/stats` e `/api/metrics/history` (legado)
  continuam funcionando.

### Correções de bugs
* **Dashboard — divisão por zero**: o gráfico de histórico quebrava (NaN) quando
  o sistema estava ocioso (CPU/RAM em 0). Agora usa `Math.max(1, …)`.
* **Dashboard — `loadHistory` sombreado**: existiam duas funções `loadHistory`;
  a do gráfico de métricas era sobrescrita pela de histórico de updates e nunca
  rodava. Renomeada para `loadMetricsHistory` com auto-refresh.
* **Lixeira — nome restaurado incorreto**: `report__1234567890.txt` era
  restaurado/listado como `1234567890.txt`. Corrigido via `recoverOriginalName`.
* **Store — `JSON.parse` sem try/catch**: arquivos corrompidos/vazios podiam
  derrubar requisições. Adicionados helpers de leitura segura.
* **Stats — `avgLoad`/`graphics`/`disks` nulos**: tratados defensivamente (já em
  hotfix anterior, mantido).

### Compatibilidade
Nenhuma funcionalidade existente deixou de funcionar. Verificado: autenticação,
dashboard, arquivos, plugins, atualizações, auditoria, monitoramento e
notificações. Permissões novas (`services:*`, `infrastructure:*`) foram
adicionadas de forma aditiva, sem alterar as existentes.

> **Sugestão para versões futuras**: o registro de infraestrutura está preparado
> para healthcheck real e conexões remotas (agentes/nós distribuídos); a
> implementação completa exigiria uma refatoração maior e foi apenas documentada.

## v0.7.1.2 — Hotfix

* **Correção api.user.login**: adicionado método faltante no api.js.
* **Correção loadMetrics**: agora usa `r.data` ao invés de resposta direta.
* **loadHistory**: corrigido para usar `api.history()` com `r.data`.

## v0.7.1 — Plataforma

* **Monitoramento**: Stats expandidos com uptime, OS (distro, release, arch), CPU cores.

### Monitoramento
* **Stats expandidos**: `/api/stats` agora retorna uptime, OS (distro, release, arch), cores CPU, load average.
* **Histórico de métricas**: `/api/metrics/history` retorna os últimos 100 pontos (CPU/RAM).

### Notificações
* **Sistema de notificações**: `lib/notifications.js` + rotas `/api/notifications`.
* **Tipos**: success, warning, error, info.

### Auditoria
* **Login/Logout agora registrados**: `users.appendAdminLog` é chamado automaticamente.
* **Logs completos**: já existentes para settings, restart, updates, plugins, users.

### Plugins
* **Hooks expostos**: plugins recebem `hooks` na `pluginApi` para escutar eventos.
* **Eventos disponíveis**: `server:start`.

## v0.6.1 — Separação do server.js

* **Rotas core extraídas**: criado `routes/core.js` com `/console.html`, páginas de erro (403/404/500), e `/api/stats`.
* **server.js focado em bootstrap**: agora contém apenas inicialização do Express/WebSocket, middlewares e carregamento de rotas.

## v0.6.0 — Consolidação

### Tratamento de erros
* Padronizada resposta de erro no `/api/store/*`: agora retorna `{ success: false, error: "..." }`.
* Fallback 404 já existente divide HTML (páginas bonitas) de JSON (APIs).

## v0.5.4.11 — Fallback 404 corrigido (HTML para páginas, JSON para APIs)

* Corrigido o fallback 404 para distinguir requisições de página (HTML) de APIs.
  Agora `/api/*` retorna JSON `{ error: "Not found" }`, enquanto outras rotas
  servem `public/404.html` com estilo bonito.

## v0.5.4.10 — Fallback 404 bonito

* **Página 404 bonita para todas as rotas não encontradas**: adicionado middleware
  `app.use` que serve `public/404.html` para requisições HTML (qualquer rota que não
  exista), e retorna JSON `{ error: 'Not found' }` para requisições API.
* Corrigido posicionamento do `trashRouter` (agora antes do fallback, não depois do
  `server.listen`).

## v0.5.4.9 — Teste de forçar atualização + backend integrado

* **Teste de force update**: adicionado teste em `test/update.test.js` que verifica
  que `force:true` é reconhecido pelo backend (implementado em
  `routes/update.js` linhas 352-372, 362-372). Quando `force` é verdadeiro,
  as alterações locais são ignoradas e um backup automático é criado antes.
* **Forçar atualização já estava implementado**: o `/api/update/apply` aceita
  `{ force: true }` no body, ignora alterações locais e registra o log
  administrativo com `action: "update.force"`.

## v0.5.4.8 — Console liberado + páginas de erro bonitas

* **Console liberado**: o `console.html` agora é servido sem o bloqueio 403 no
  request HTTP. A segurança real está no WebSocket (token no querystring) e no
  guard do `app.js` (redireciona não-admin para `/`).
* **Páginas de erro**: criadas `403.html`, `404.html` e `500.html` — UI
  limpa, estilo consistente com o resto do sistema.
* **Correção de sintaxe**: adicionado `});` faltando na rota do console.

## v0.5.4.7 — Correção definitiva do "role is not defined" + guarda automática

* **Correção definitiva**: o `app.js` referenciava uma variável `role` fora de
  escopo (`let userRole = role || ''`), causando `ReferenceError: role is not
  defined` em `mountLayout` (tela em branco em todas as páginas protegidas).
  Agora `userRole` é inicializado vazio e preenchido a partir do `localStorage`
  (`userRaw`). Nenhuma leitura de papel depende de variável solta.
* **Teste de guarda (CI)**: adicionado `test/frontend.no-role-var.test.js` que
  **falha se** o `app.js` usar a variável `role` como identificador solto, se
  houver o typo `DOMContentDLoaded`, ou se `guard()/mountLayout` lançar
  `ReferenceError`. Assim o bug não volta sem o teste avisar.
* **Dados de instalação ficam em `/data`**: confirmado que `.gitignore` ignora
  `data/` por completo (usuários, sessões, configurações, convites, backups,
  plugins, lojas) — nada de estado de instalação específica é versionado. O
  frontend só lê `localStorage`; o backend persiste tudo em `data/`.
* **Multiplataforma**: backend usa `child_process.exec` (portátil) e launchers
  separados (`bOS.sh` Linux/macOS, `bOS.bat` Windows) tratam o restart por
  código 65.

## v0.5.4.6 — Correção: telas de auth quebradas (login/setup/signup)

* **Hotfix crítico**: `auth.js` tinha o mesmo typo do app shell — o listener
  usava `DOMContentDLoaded` (evento inexistente) em vez de `DOMContentLoaded`,
  então `boot()` nunca rodava e os formulários de **login, setup e signup**
  nunca eram vinculados (a interface "não funcionava a partir do login").
  Agora `boot()` é chamado direto (com `requestAnimationFrame` como fallback),
  igual ao `app.js`.
* **Multiplataforma**: confirmado que backend e launchers (`bOS.sh` para
  Linux/macOS, `bOS.bat` para Windows) não dependem de comandos específicos de
  SO — o terminal usa `child_process.exec` (portátil) e o restart por código 65
  é tratado em ambos os launchers.

## v0.5.4.5 — Correção: crash do app shell (ReferenceError: role is not defined)

* **Hotfix crítico**: `navVisible` referenciava `role` fora de escopo, causando
  `ReferenceError: role is not defined` em `mountLayout` (tela em branco / dock
  sumido em todas as páginas protegidas). Agora `navVisible` lê o papel direto
  do `localStorage` via `currentRole()`. Também corrigido o acesso de `userRaw`
  antes de sua declaração (temporal dead zone) dentro de `mountLayout`.

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
