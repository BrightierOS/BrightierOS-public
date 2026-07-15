# Changelog — BrightierOS

Todas as versões e mudanças relevantes do BrightierOS são documentadas aqui.

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
