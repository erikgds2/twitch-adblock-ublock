# Changelog

Todas as mudanças notáveis deste projeto serão documentadas aqui.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

---

## [1.0.0] — 2026-03-16

### Adicionado
- Arquivo de configurações avançadas base do uBlock Origin (`config/advanced-settings-base.txt`)
- Arquivo de configurações otimizadas para Twitch (`config/advanced-settings-twitch.txt`)
  - `allowGenericProceduralFilters true` — necessário para filtros procedurais
  - `userResourcesLocation` apontando para o scriptlet customizado
  - `trustedListPrefixes ublock-` para listas externas confiáveis
- Lista de filtros customizada para Twitch (`filtros/twitch-filtros.txt`)
  - Filtros de elementos: overlays, countdown, containers de anúncio
  - Filtros de rede: Google DoubleClick, Amazon APS, Twitch Ad Servers
  - Filtros procedurais via scriptlet `##+js(twitch-videoad)`
  - Exceções `@@` para funcionamento normal do player
- Scriptlet de interceptação HLS (`scriptlets/twitch-videoad.js`)
  - Override de `window.fetch` para interceptar manifests M3U8
  - Override de `XMLHttpRequest` como fallback para players legados
  - Detecção de segmentos de anúncio por URL e atributos HLS
  - Substituição de segmentos de anúncio por linha vazia (stream limpo)
- README completo com passo a passo visual e guia de configuração
- `.gitignore` com padrões para sistema, editor e dependências

### Corrigido
- Adicionadas exceções `@@` necessárias para o player Twitch funcionar:
  - `usher.twitchapps.com` (XMLHttpRequest)
  - `static.twitchsvc.net/extensions` (extensões)
  - `assets.twitch.tv` (recursos estáticos legítimos)

---

## [1.0.1] — 2026-03-16

### Corrigido
- **[CRÍTICO]** Header do scriptlet corrigido para `// twitch-videoad.js` como primeira linha
  — sem isso, `##+js(twitch-videoad)` era silenciosamente ignorado em todos os navegadores
- **[Edge/Chrome]** `Response` constructor não aceita headers restritos (`content-encoding`,
  `content-length`, `transfer-encoding`) — substituído por `clonarHeadersSeguros()`
- **[Edge/Chrome]** `statusText` removido do `new Response()` — pode conter chars não-ASCII
  que causam `TypeError` no Chromium
- **[Edge/SPA]** `Object.defineProperty` no XHR trocado de `writable: false` para getter
  com `configurable: true` — impede `TypeError: Cannot redefine property` na navegação SPA
- Cabeçalho da lista de filtros atualizado para incluir compatibilidade com Edge

### Adicionado
- Seção "Notas para Microsoft Edge" no README
- Link para uBlock Origin no Edge Add-ons Store
- Instruções para desativar o Enhanced Security Mode do Edge para twitch.tv

---

## [1.1.0] — 2026-03-16

### Refatorado
- **[REESCRITA COMPLETA]** Scriptlet `twitch-videoad.js` reescrito com a técnica de Worker Hook:
  - Hook em `window.Worker` intercepta o player HLS da Twitch antes de ser spawned
  - Lê o código original do worker via XHR síncrono e injeta funções de bloqueio via `.toString()`
  - Fetch de backup stream: busca novo Access Token via GQL com `playerType` alternativo (`popout`)
  - Comunicação Worker ↔ main thread via `FetchRequest`/`FetchResponse` (GQL proxy)
  - `limparSegmentosAd()` remove segmentos `#EXTINF` de ad do manifesto M3U8
  - `acionarPlayer()` recarrega/pause-play o player via React internals após bloqueio
  - `atualizarBanner()` exibe overlay "bloqueando anúncios" no `.video-player`
  - `monitorarBuffer()` previne travamento pós-ad com auto pause/play
  - `aplicarCorrecaoVisibilidade()` impede pausa ao trocar de aba

### Corrigido
- **[Bug Crítico]** `authHeader: undefined` no template literal do blob do worker gerava a string
  `"undefined"` (truthy), causando envio de `Authorization: undefined` nas requisições GQL
- **[Bug Crítico]** Detecção de worker por `.endsWith('.twitch.tv')` falha para workers
  hospedados em CDN externa (`static.twitchsvc.net`, etc.) — substituído por check de `blob:` URL
- **[Arquitetura]** Abordagem anterior (hook de `window.fetch` no main thread) nunca interceptava
  M3U8 pois o player HLS roda dentro de um Web Worker separado

---

## Próximas Versões (Planejado)

### [1.1.0] — Em breve
- [ ] Suporte a múltiplos scriptlets alternativos (low-bitrate swap)
- [ ] Script de auto-instalação para usuários não técnicos
- [ ] Screenshots reais do processo de configuração
- [ ] Integração com lista pública `twitch-adblock` da comunidade
