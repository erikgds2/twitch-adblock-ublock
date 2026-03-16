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

## Próximas Versões (Planejado)

### [1.1.0] — Em breve
- [ ] Suporte a múltiplos scriptlets alternativos (low-bitrate swap)
- [ ] Script de auto-instalação para usuários não técnicos
- [ ] Screenshots reais do processo de configuração
- [ ] Integração com lista pública `twitch-adblock` da comunidade
