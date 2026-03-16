# Twitch Ad Block — uBlock Origin / Tampermonkey

Bloqueador de anúncios da **Twitch TV** via **Tampermonkey** + **uBlock Origin**.
Utiliza a técnica VAFT (Video Ad-Fix Twitch) para interceptar o player HLS antes que os anúncios cheguem ao player, obtendo um stream limpo em tempo real.

[![uBlock Origin](https://img.shields.io/badge/uBlock%20Origin-1.50+-red?logo=firefox)](https://ublockorigin.com)
[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-4.0+-blue)](https://www.tampermonkey.net/)
[![Licença](https://img.shields.io/badge/licen%C3%A7a-MIT-blue)](LICENSE)

---

> **Crédito especial:**
> O núcleo deste projeto é baseado no script **VAFT** do repositório
> **[pixeltris/TwitchAdSolutions](https://github.com/pixeltris/TwitchAdSolutions)**,
> referência da comunidade para bloqueio de anúncios na Twitch.
> Todo o mérito técnico da abordagem de Worker Hook pertence ao autor original.

---

## Como Funciona

A Twitch usa **server-side ad injection** — os anúncios são inseridos diretamente no stream HLS (M3U8), tornando bloqueadores simples ineficazes. O VAFT resolve isso em dois níveis:

```
Twitch cria Web Worker para o player HLS
          │
          ▼
  window.Worker interceptado (hook)
          │
          ├── Worker CDN (Amazon IVS / WASM) → passa sem modificação
          └── Worker Twitch (blob:.twitch.tv) → interceptado
                        │
                        ▼
              fetch() do worker é substituído
                        │
                        ├── M3U8 com anúncio detectado?
                        │     └── SIM → busca stream limpo via playerType alternativo
                        │           └── Falhou? → remove segmentos de anúncio do M3U8
                        └── Stream normal → passa sem alteração
```

**Adicionalmente**, o `window.fetch` do contexto principal é interceptado para forçar `playerType: popout` no token de acesso, reduzindo a chance de receber anúncios desde o início.

---

## Instalação

### Método único recomendado — Tampermonkey

**Pré-requisitos:**

| Extensão | Link |
|----------|------|
| Tampermonkey | [Chrome](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) / [Firefox](https://addons.mozilla.org/pt-BR/firefox/addon/tampermonkey/) / [Edge](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd) |
| uBlock Origin | [Chrome](https://chrome.google.com/webstore/detail/ublock-origin/cjpalhdlnbpafiamejdnhcphjbkeiagm) / [Firefox](https://addons.mozilla.org/pt-BR/firefox/addon/ublock-origin/) / [Edge](https://microsoftedge.microsoft.com/addons/detail/ublock-origin/odfafepnkmbhccpbejgmiehpchacaeak) |

---

### Passo 1 — Instalar o script no Tampermonkey

1. Abra o Tampermonkey → clique no ícone → **Criar novo script**
2. Selecione todo o conteúdo padrão e apague
3. Acesse a URL abaixo, selecione tudo (`Ctrl+A`) e copie:

```
https://raw.githubusercontent.com/erikgds2/twitch-adblock-ublock/main/scriptlets/twitch-videoad.js
```

4. Cole no editor do Tampermonkey e clique em **Salvar** (`Ctrl+S`)

> O script inclui o header `// ==UserScript==` completo — não é necessário adicionar nada.

---

### Passo 2 — Adicionar a lista de filtros no uBlock Origin

1. Abra o uBlock Origin → ⚙ Painel → aba **"Listas de filtros"**
2. Role até o final → clique em **"Importar..."**
3. Cole a URL:

```
https://raw.githubusercontent.com/erikgds2/twitch-adblock-ublock/main/filtros/twitch-filtros.txt
```

4. Clique em **"Aplicar alterações"**

> Esta lista esconde elementos de UI de anúncio (banners, countdowns) e bloqueia redes de anúncio externas (Google DoubleClick, Amazon APS). Ela **não bloqueia** recursos do player ou do stream.

---

### Passo 3 — Verificar funcionamento

1. Acesse qualquer canal ao vivo em [twitch.tv](https://twitch.tv)
2. Abra o console do navegador (`F12` → Console)
3. Digite `window.twitchAdSolutionsVersion` e pressione Enter
4. Se retornar `24` (ou outro número), o script está ativo

Quando um anúncio for detectado, o console exibirá:
```
Blocking ads (embed)
```
ou
```
Blocking midroll ads (popout)
```

---

## Estrutura do Repositório

```
twitch-adblock-ublock/
│
├── config/
│   ├── advanced-settings-base.txt       # Configurações padrão do uBlock (referência)
│   └── advanced-settings-twitch.txt     # Configurações com userResourcesLocation
│
├── filtros/
│   └── twitch-filtros.txt               # Filtros de elementos e redes de anúncio
│
├── scriptlets/
│   └── twitch-videoad.js                # Script principal (VAFT + header Tampermonkey)
│
└── README.md
```

---

## Solução de Problemas

### O vídeo não carrega / tela preta

Certifique-se de que a lista de filtros está na versão **2.0.0** ou superior.
Versões anteriores continham filtros que bloqueavam o player Amazon IVS acidentalmente.

Para atualizar: uBlock Origin → ⚙ → Listas de filtros → clique no ícone de atualizar ao lado da lista customizada.

### O script não parece estar ativo (`window.twitchAdSolutionsVersion` retorna `undefined`)

O Tampermonkey precisa do `@inject-into page` para funcionar corretamente. Verifique se o cabeçalho do script contém:

```js
// @inject-into  page
// @run-at       document-start
// @grant        none
```

Se não contiver, re-instale o script seguindo o Passo 1.

### O anúncio aparece por alguns segundos antes de ser bloqueado

Isso é esperado. O script tenta obter um stream limpo assim que detecta o primeiro segmento de anúncio no M3U8. O tempo de bloqueio varia de 1 a 4 segundos dependendo da latência do servidor GQL da Twitch.

### Nada funciona / a Twitch mudou algo

Consulte o repositório original para atualizações:
[github.com/pixeltris/TwitchAdSolutions](https://github.com/pixeltris/TwitchAdSolutions)

---

## Notas para Microsoft Edge

O Edge usa o mesmo motor Chromium. Atenção a um ponto específico:

**Desative o "Enhanced Security Mode" para twitch.tv:**
> Edge → Configurações → Privacidade, pesquisa e serviços → Segurança aprimorada → Exceções → Adicionar `twitch.tv`

Sem isso, o Edge pode impedir que o Tampermonkey injete o script no contexto da página.

---

## Aviso de Uso

> Este repositório é estritamente para uso pessoal e fins educacionais.

Bloquear anúncios pode violar os Termos de Serviço da Twitch. Use por sua conta e risco.
Os criadores de conteúdo dependem de receita publicitária — considere apoiá-los via Bits, Assinatura ou Prime Gaming.

---

## Referências e Créditos

- **[pixeltris/TwitchAdSolutions](https://github.com/pixeltris/TwitchAdSolutions)** — origem do script VAFT, técnica de Worker Hook e toda a engenharia de bloqueio de ads HLS. Este repositório não existiria sem esse trabalho.
- [uBlock Origin](https://github.com/gorhill/uBlock) — motor de filtragem
- [Tampermonkey](https://www.tampermonkey.net/) — injeção do script no contexto da página

---

*Mantido por [@erikgds2](https://github.com/erikgds2)*
