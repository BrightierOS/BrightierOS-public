# BrightierOS

## Um sistema operacional web moderno, extensível e construído para servidores pessoais.

O **BrightierOS** é uma plataforma de gerenciamento de servidores criada para transformar serviços, arquivos, aplicações e ferramentas em uma experiência simples, organizada e acessível através de uma interface web moderna.

Inspirado em sistemas como painéis de gerenciamento doméstico e plataformas self-hosted, o BrightierOS busca unir facilidade de uso com flexibilidade, permitindo que usuários controlem seus próprios ambientes sem depender de soluções complexas.
---

# Visão

O objetivo do BrightierOS é criar um ecossistema onde qualquer pessoa possa transformar um servidor comum em uma central pessoal de serviços.

Em vez de acessar diversos sistemas separados, o usuário pode administrar tudo em um único ambiente:

* arquivos;
* aplicações;
* plugins;
* serviços;
* configurações;
* informações do sistema.

O BrightierOS não pretende substituir um sistema operacional tradicional, mas funcionar como uma camada inteligente de gerenciamento sobre servidores e ambientes pessoais.
---

# Principais recursos

## Dashboard

O centro de controle do BrightierOS.

Permite visualizar informações importantes do servidor, incluindo:

* status do sistema;
* recursos utilizados;
* usuário conectado;
* aplicações instaladas;
* informações gerais do ambiente.
---

## Sistema de usuários

O BrightierOS possui um sistema próprio de autenticação para proteger áreas privadas.

Recursos:

* criação inicial de conta;
* login;
* controle de sessão;
* proteção de páginas;
* logout;
* gerenciamento de usuários.
---

## Gerenciador de arquivos

Uma interface web para acessar e organizar arquivos do servidor.

O objetivo é permitir que usuários gerenciem seus dados sem precisar utilizar apenas o terminal.

Possibilidades:

* navegação de diretórios;
* visualização de arquivos;
* gerenciamento através da interface;
* integração com outros componentes do sistema.
---

# Sistema de plugins UGC

Um dos principais pilares do BrightierOS.

O sistema de plugins permite que desenvolvedores criem extensões próprias para adicionar novas funcionalidades.

Cada plugin pode possuir:

* backend em Node.js;
* rotas HTTP próprias;
* interface web;
* arquivos personalizados;
* configurações;
* manifesto de informações.

Exemplo:

```
data/
└── plugins/
    └── exemplo/
        ├── manifest.json
        ├── backend.js
        └── frontend/
```

O BrightierOS detecta plugins automaticamente e permite que a comunidade desenvolva novas experiências sem modificar o núcleo do sistema.
---

# Community App Store

O BrightierOS possui uma visão de uma loja comunitária descentralizada.

Usuários poderão adicionar catálogos públicos hospedados em serviços Git, como GitHub e GitLab, permitindo:

* descoberta de plugins;
* instalação de aplicações;
* compartilhamento de projetos;
* criação de ecossistemas independentes.

A ideia é criar uma comunidade onde desenvolvedores possam distribuir suas próprias extensões.
---

# Arquitetura

O BrightierOS utiliza uma arquitetura baseada em tecnologias web modernas:

## Backend

* Node.js;
* Express;
* APIs HTTP;
* carregamento dinâmico de módulos.

## Frontend

* HTML;
* CSS;
* JavaScript;
* interface web responsiva.

## Dados

* armazenamento local;
* arquivos JSON;
* estrutura modular.

A arquitetura foi pensada para ser simples, transparente e fácil de modificar.
---

# Filosofia do projeto

O BrightierOS segue alguns princípios:

## Simplicidade

Ferramentas poderosas não precisam ser difíceis de usar.

## Extensibilidade

O sistema deve permitir que outras pessoas criem em cima dele.

## Comunidade

Projetos independentes podem crescer juntos.

## Controle

O usuário deve possuir controle sobre seus próprios dados e serviços.
---

# Desenvolvimento

O BrightierOS é desenvolvido de forma incremental.

Cada versão busca adicionar melhorias sem abandonar a compatibilidade com versões anteriores.

O projeto possui foco em:

* estabilidade;
* aprendizado;
* experimentação;
* criação de novas tecnologias.
---

# Roadmap

## v0.1.x

Base inicial do sistema.

Inclui:

* autenticação;
* dashboard;
* arquivos;
* estrutura inicial de plugins;
* melhorias de segurança.

## v0.2

Próxima evolução:

* verificação de atualizações pelo GitHub;
* melhorias no gerenciamento do sistema.


## v0.3.0

Gerenciamento de Arquivos e Instalação.

## 🗑️ Recycle Bin (Lixeira)

* Restaurar arquivos excluídos.
* Excluir arquivos permanentemente.
* Esvaziar lixeira.
* Mostrar espaço ocupado pela lixeira.

## 📦 Sistema de Instalação

Criar scripts de instalação específicos para cada sistema operacional:

### 🪟 Windows

* Script de instalação .ps1.
* Instalação automática de dependências.
* Configuração inicial do ambiente.
* Criação de atalhos e configurações necessárias.

### 🐧 Linux

* Script de instalação .sh.
* Instalação de dependências pelo gerenciador de pacotes.
* Configuração de permissões.
* Inicialização automática do serviço.

### 🍎 macOS

* Script de instalação .sh.
* Configuração do ambiente.
* Instalação de dependências necessárias.
* Preparação para execução no sistema.

## Objetivos da versão

* Facilitar a instalação do BrightierOS.
* Reduzir configuração manual.
* Melhorar suporte multiplataforma.

## v0.2.1

Expansão:

* suporte aprimorado para Linux;
* suporte para macOS;
* scripts de inicialização multiplataforma;
* compatibilidade entre sistemas operacionais.

## v0.8.0 — Infraestrutura e Serviços

* **Dashboard expandido**: gráficos em tempo real (CPU/RAM/Rede), histórico de
  utilização, armazenamento, uptime, processos, temperatura e rede.
* **Histórico de métricas**: coletor periódico em background (CPU/RAM/Disco/Rede)
  com endpoints dedicados e base para estatísticas futuras.
* **Serviços**: iniciar, parar, reiniciar, status e logs (multiplataforma).
* **Infraestrutura**: base preparada para múltiplos nós/servidores e conexões
  remotas (registro CRUD + nó local).
* **Notificações em tempo real** (SSE) com categorias e persistência.
* **Auditoria** ampliada (ações em serviços, falhas, eventos críticos).
* **APIs** organizadas para métricas, serviços, infraestrutura e histórico.
* **Correções de bugs**: divisão por zero no dashboard, nome restaurado na
  lixeira, `JSON.parse` sem proteção na loja.
* Compatibilidade total com versões anteriores mantida.

## Futuro

Possíveis melhorias:

* mais aplicações nativas;
* gerenciamento avançado de serviços;
* melhorias no sistema de plugins;
* evolução da Community App Store;
* novos recursos para servidores pessoais.
---

# Licença e comunidade

O BrightierOS é um projeto experimental focado em tecnologia, desenvolvimento e criação de um ecossistema próprio.

Desenvolvedores e usuários podem participar criando plugins, sugerindo melhorias e explorando novas possibilidades para a plataforma.
---

**BrightierOS**

> Um lugar onde servidores deixam de ser apenas máquinas e se tornam plataformas. 🌿
