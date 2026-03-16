# 📺 Twitch Ad Block — uBlock Origin

Bloqueador de anúncios da **Twitch TV** via configurações avançadas do **uBlock Origin**. Utiliza injeção de scriptlets, listas de filtros customizadas e configuração do `userResourcesLocation` para eliminar anúncios de vídeo embutidos no stream (server-side ads).

[![uBlock Origin](https://img.shields.io/badge/uBlock%20Origin-1.50+-red?logo=firefox)](https://ublockorigin.com)
[![Mantido](https://img.shields.io/badge/mantido-sim-brightgreen)](https://github.com/erikgds2/twitch-adblock-ublock)
[![Licença](https://img.shields.io/badge/licen%C3%A7a-MIT-blue)](LICENSE)

---

## 📋 Sumário

- [Como Funciona](#como-funciona)
- [Pré-requisitos](#pré-requisitos)
- [Instalação Rápida](#instalação-rápida)
- [Passo a Passo Detalhado](#passo-a-passo-detalhado)
- [Estrutura do Repositório](#estrutura-do-repositório)
- [Solução de Problemas](#solução-de-problemas)
- [Aviso de Uso](#aviso-de-uso)

---

## Como Funciona

A Twitch utiliza **server-side ad injection** — os anúncios são inseridos diretamente no stream HLS (M3U8), tornando bloqueadores simples ineficazes. Este projeto combina três camadas de defesa:

```
┌─────────────────────────────────────────────────────────────┐
│                    Camadas de Bloqueio                      │
├──────────┬──────────────────────────────────────────────────┤
│ Camada 1 │ Filtros de Rede — bloqueia domínios de ad-server │
│ Camada 2 │ Filtros de Elemento — esconde UI de anúncios     │
│ Camada 3 │ Scriptlet — intercepta e limpa o M3U8 em tempo  │
│          │ real, substituindo segmentos de anúncio          │
└──────────┴──────────────────────────────────────────────────┘
```

### Fluxo técnico

```
Twitch Stream (HLS/M3U8)
        │
        ▼
  window.fetch (interceptado pelo scriptlet)
        │
        ├─── É um anúncio? (detecta URL do ad-server)
        │         │ SIM → substitui segmento por string vazia
        │         │ NÃO → passa o stream sem modificação
        ▼
  Player recebe stream limpo → sem anúncio
```

---

## Pré-requisitos

| Requisito | Versão mínima | Link |
|-----------|--------------|------|
| uBlock Origin | 1.50+ | [Chrome](https://chrome.google.com/webstore/detail/ublock-origin/cjpalhdlnbpafiamejdnhcphjbkeiagm) / [Firefox](https://addons.mozilla.org/pt-BR/firefox/addon/ublock-origin/) / [Edge](https://microsoftedge.microsoft.com/addons/detail/ublock-origin/odfafepnkmbhccpbejgmiehpchacaeak) |
| Navegador | Chrome 90+ / Firefox 90+ / **Edge 90+** | — |

> **Não funciona com uBlock Origin Lite** (versão limitada do Chrome Web Store). Use a versão completa — disponível nos três navegadores acima.

---

## Instalação Rápida

Se você sabe o que está fazendo, copie e cole:

**1. Configurações Avançadas** — cole em uBlock Origin → Painel → Configurações → Configurações Avançadas:

```
allowGenericProceduralFilters true
differentialUpdate true
dnsCacheTTL 600
trustedListPrefixes ublock-
userResourcesLocation https://raw.githubusercontent.com/erikgds2/twitch-adblock-ublock/main/scriptlets/twitch-videoad.js
```

**2. Lista de Filtros** — cole em uBlock Origin → Painel → Minhas Regras → Editar:

```
https://raw.githubusercontent.com/erikgds2/twitch-adblock-ublock/main/filtros/twitch-filtros.txt
```

---

## Passo a Passo Detalhado

### Etapa 1 — Instalar o uBlock Origin

Instale a extensão no seu navegador:

![Instalar uBlock Origin na Chrome Web Store](https://via.placeholder.com/800x300/1a1a2e/00d4ff?text=Chrome+Web+Store+%E2%86%92+uBlock+Origin+%E2%86%92+Adicionar+ao+Chrome)

> **Atenção:** Certifique-se de instalar o **uBlock Origin** (ícone vermelho), não o "uBlock Origin Lite".

---

### Etapa 2 — Acessar as Configurações Avançadas

1. Clique no ícone do uBlock Origin na barra de ferramentas
2. Clique no ícone de engrenagem ⚙ (Abrir o painel de controle)
3. Vá na aba **"Configurações"**
4. Role a página até o final e clique em:
   > *"Estou ciente dos riscos e desejo habilitar as configurações avançadas"*

![Acessando o Painel de Configurações Avançadas do uBlock Origin](https://via.placeholder.com/800x400/16213e/00d4ff?text=uBlock+Origin+%E2%86%92+Configura%C3%A7%C3%B5es+%E2%86%92+Configura%C3%A7%C3%B5es+Avan%C3%A7adas)

---

### Etapa 3 — Aplicar as Configurações Avançadas

1. Um editor de texto aparecerá com as configurações atuais
2. **Substitua todo o conteúdo** pelo arquivo [config/advanced-settings-twitch.txt](config/advanced-settings-twitch.txt)
3. Ou edite apenas as linhas-chave:

```diff
- allowGenericProceduralFilters false
+ allowGenericProceduralFilters true

- trustedListPrefixes ublock-
+ trustedListPrefixes ublock-

- userResourcesLocation unset
+ userResourcesLocation https://raw.githubusercontent.com/erikgds2/twitch-adblock-ublock/main/scriptlets/twitch-videoad.js
```

4. Clique em **"Aplicar alterações"**

![Editor de Configurações Avançadas com userResourcesLocation preenchido](https://via.placeholder.com/800x400/0f3460/00d4ff?text=Editor+de+Configura%C3%A7%C3%B5es+Avan%C3%A7adas+%E2%80%94+userResourcesLocation+configurado)

---

### Etapa 4 — Adicionar a Lista de Filtros Customizada

**Opção A: Via URL (recomendado — atualiza automaticamente)**

1. Vá em uBlock Origin → Painel → aba **"Listas de filtros"**
2. Role até o final → **"Importar"** (ou "Personalizado")
3. Cole a URL:
   ```
   https://raw.githubusercontent.com/erikgds2/twitch-adblock-ublock/main/filtros/twitch-filtros.txt
   ```
4. Clique em **"Aplicar alterações"**

![Aba de Listas de Filtros com URL customizada adicionada](https://via.placeholder.com/800x400/16213e/e94560?text=Listas+de+Filtros+%E2%86%92+Importar+%E2%86%92+Cole+a+URL+do+reposit%C3%B3rio)

**Opção B: Via Minhas Regras (manual)**

1. Vá em uBlock Origin → Painel → aba **"Minhas regras"**
2. Clique em **"Editar"**
3. Cole o conteúdo de [filtros/twitch-filtros.txt](filtros/twitch-filtros.txt)
4. Clique em **"Salvar"**

---

### Etapa 5 — Verificar se está funcionando

1. Acesse [twitch.tv](https://twitch.tv)
2. Entre em qualquer canal ao vivo
3. Se um anúncio aparecer, ele deve ser interrompido em **menos de 2 segundos**
4. O stream voltará normalmente após a detecção

Para confirmar que o scriptlet foi carregado:

1. Abra o **Logger do uBlock Origin** (ícone de relógio ⏱ no painel)
2. Acesse a Twitch
3. Procure por entradas `twitch-videoad` nas requisições interceptadas

![Logger do uBlock Origin mostrando interceptação do M3U8](https://via.placeholder.com/800x300/1a1a2e/4caf50?text=Logger+uBlock+%E2%80%94+twitch-videoad+interceptando+M3U8)

---

## Estrutura do Repositório

```
twitch-adblock-ublock/
│
├── config/
│   ├── advanced-settings-base.txt       # Configurações padrão (referência)
│   └── advanced-settings-twitch.txt     # Configurações otimizadas p/ Twitch ✅
│
├── filtros/
│   └── twitch-filtros.txt               # Lista de filtros: rede + elementos ✅
│
├── scriptlets/
│   └── twitch-videoad.js                # Scriptlet de interceptação HLS ✅
│
├── docs/                                # Documentação adicional e capturas
├── .gitignore
└── README.md
```

---

## Notas para Microsoft Edge

O Edge usa o mesmo motor Chromium do Chrome, então o uBlock Origin funciona de forma idêntica. Atenção a dois pontos específicos do Edge:

**1. Instale pelo Edge Add-ons Store:**
> Acesse [microsoftedge.microsoft.com/addons](https://microsoftedge.microsoft.com/addons/detail/ublock-origin/odfafepnkmbhccpbejgmiehpchacaeak) e instale o uBlock Origin (ícone vermelho, **não** o Lite).

**2. Desative o "Modo de Segurança Aprimorada" para twitch.tv:**
> Edge → Configurações → Privacidade, pesquisa e serviços → Segurança aprimorada → Exceções → Adicionar `twitch.tv`

Sem desativar o Enhanced Security Mode para o twitch.tv, o Edge pode bloquear a injeção do scriptlet mesmo com o uBlock configurado.

**3. Permita extensões em modo InPrivate (opcional):**
> Edge → `edge://extensions` → uBlock Origin → Ativar "Permitir em InPrivate"

---

## Solução de Problemas

### O stream trava ou fica em buffer constante

As exceções `@@` nos filtros devem evitar isso. Se acontecer:
1. Desative temporariamente o uBlock Origin na Twitch (`Alt+Click` no ícone)
2. Se resolver, o problema é um filtro de bloqueio muito agressivo
3. Adicione manualmente em **Minhas Regras**:
   ```
   @@||twitch.tv^$media
   ```

### O anúncio ainda aparece (tela roxa / "graças ao nosso parceiro")

A Twitch atualiza frequentemente a forma de injeção de anúncios. Se o scriptlet não estiver funcionando:
1. Verifique se o `userResourcesLocation` está apontando para a URL correta
2. Atualize as listas de filtros: uBlock Origin → ⚙ → Atualizar agora
3. Consulte [github.com/pixeltris/TwitchAdSolutions](https://github.com/pixeltris/TwitchAdSolutions) para versões mais recentes do scriptlet

### Erro "Failed to fetch scriptlet"

O uBlock Origin não conseguiu baixar o scriptlet. Causas comuns:
- Conexão instável
- URL do `userResourcesLocation` incorreta ou inacessível
- Firewall corporativo bloqueando raw.githubusercontent.com

Solução: hospede o arquivo `twitch-videoad.js` em outro serviço (ex: Pastebin raw, jsDelivr).

---

## Aviso de Uso

> **Este repositório é estritamente educacional e para uso pessoal.**

- Bloquear anúncios pode violar os **Termos de Serviço da Twitch**. Use por sua conta e risco.
- Os criadores de conteúdo na Twitch dependem de receita publicitária. Considere apoiá-los via **Bits**, **Assinatura** ou **Amazon Prime Gaming**.
- Este projeto **não distribui malware** — os scriptlets são abertos, auditáveis e não coletam dados.
- A técnica de interceptação HLS é utilizada por extensões populares como [TwitchAdSolutions](https://github.com/pixeltris/TwitchAdSolutions) e documentada publicamente pela comunidade.

---

## Referências

- [uBlock Origin — Wiki de Scriptlets](https://github.com/gorhill/uBlock/wiki/Static-filter-syntax#scriptlets)
- [uBlock Origin — userResourcesLocation](https://github.com/gorhill/uBlock/wiki/Advanced-settings#userresourceslocation)
- [TwitchAdSolutions por pixeltris](https://github.com/pixeltris/TwitchAdSolutions)
- [Lista EasyList — Twitch Section](https://easylist.to)

---

*Mantido por [@erikgds2](https://github.com/erikgds2)*
