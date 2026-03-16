// twitch-videoad.js
// Intercepta M3U8 da Twitch e remove segmentos de anuncio (server-side ads)
// Compativel: Chrome, Firefox, Edge (uBlock Origin 1.50+)
// =============================================================================
// FORMATO OBRIGATORIO: as duas primeiras linhas acima sao o identificador do
// recurso para o uBlock Origin (userResourcesLocation). SEM elas, o filtro
// twitch.tv##+js(twitch-videoad) e IGNORADO em qualquer navegador.
// Referencia: https://github.com/gorhill/uBlock/wiki/Advanced-settings#userresourceslocation
// =============================================================================

(function () {
    'use strict';

    // ── Constantes ──────────────────────────────────────────────────────────────

    const SCRIPTLET_NAME = 'twitch-videoad';
    const AD_SIGNAL_CLASS  = 'X-TV-TWITCH-AD-SIGNAL';
    const AD_URL_FRAGMENT  = 'static.twitchsvc.net';
    const LOW_RES_SUFFIX   = 'low';

    // Indica se o modo de depuração está ativo (não ativar em produção)
    const DEBUG = false;

    // ── Utilitário de log ────────────────────────────────────────────────────────

    function log(msg) {
        if (DEBUG) {
            console.debug(`[${SCRIPTLET_NAME}] ${msg}`);
        }
    }

    // ── Detecção de anúncio via atributo de qualidade no M3U8 ──────────────────

    /**
     * Verifica se uma linha do M3U8 indica um segmento de anúncio.
     * A Twitch marca esses segmentos com classes especiais ou URLs específicas.
     * @param {string} line - Linha do manifest M3U8
     * @returns {boolean}
     */
    function isAdSegment(line) {
        return (
            line.includes(AD_URL_FRAGMENT) ||
            line.includes(AD_SIGNAL_CLASS) ||
            line.includes('ue-us.amazon-adsystem') ||
            line.includes('imasdk.googleapis.com')
        );
    }

    // ── Clona apenas headers seguros (Edge e Chrome proibem alguns headers) ────────

    /**
     * Copia os headers de uma Response para um novo objeto Headers,
     * ignorando headers proibidos pelo construtor de Response no Chromium/Edge.
     * Headers como content-encoding, content-length e transfer-encoding
     * causam TypeError se passados diretamente ao new Response().
     * @param {Headers} sourceHeaders
     * @returns {Headers}
     */
    const HEADERS_PROIBIDOS = new Set([
        'content-encoding',
        'content-length',
        'transfer-encoding',
    ]);

    function clonarHeadersSeguros(sourceHeaders) {
        const headers = new Headers();
        sourceHeaders.forEach((value, key) => {
            if (!HEADERS_PROIBIDOS.has(key.toLowerCase())) {
                try {
                    headers.set(key, value);
                } catch (_) {
                    // Ignora headers que o browser recusa silenciosamente
                }
            }
        });
        return headers;
    }

    // ── Interceptação do fetch do M3U8 ──────────────────────────────────────────

    const originalFetch = window.fetch;

    window.fetch = async function (...args) {
        const request = args[0];
        const url = (request instanceof Request) ? request.url : String(request);

        // Só intercepta requisições de manifest HLS da Twitch
        if (!url.includes('usher.twitchapps.com') && !url.includes('.m3u8')) {
            return originalFetch.apply(this, args);
        }

        log(`Interceptando: ${url}`);

        try {
            const response = await originalFetch.apply(this, args);
            const text     = await response.text();
            const lines    = text.split('\n');
            let   hasAd    = false;

            // Verifica se o manifest contém segmentos de anúncio
            const cleanedLines = lines.map(line => {
                if (isAdSegment(line)) {
                    hasAd = true;
                    log(`Segmento de anúncio detectado: ${line.substring(0, 80)}...`);
                    // Substitui a URI do segmento de anúncio por string vazia
                    // O player vai pular o segmento sem travar
                    return '';
                }
                return line;
            });

            // statusText omitido intencionalmente: pode conter chars nao-ASCII
            // que causam TypeError no Edge/Chromium (Fetch spec, secao 2.2)
            const opcoes = {
                status:  response.status,
                headers: clonarHeadersSeguros(response.headers),
            };

            if (hasAd) {
                log('Anúncio removido do stream M3U8.');
                return new Response(cleanedLines.join('\n'), opcoes);
            }

            // Nenhum anúncio: retorna manifest original com headers seguros
            return new Response(text, opcoes);

        } catch (err) {
            log(`Erro ao interceptar: ${err.message}`);
            // Propaga o erro original sem retentar (evita loop de falha)
            throw err;
        }
    };

    // ── Interceptação do XMLHttpRequest (fallback para players legados) ─────────

    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this._interceptedUrl = url;
        return originalOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (...args) {
        const url = this._interceptedUrl || '';

        if (url.includes('.m3u8') || url.includes('usher.twitchapps.com')) {
            log(`XHR interceptado: ${url}`);

            this.addEventListener('readystatechange', function () {
                if (this.readyState !== 4) return;

                try {
                    const text  = this.responseText;
                    const lines = text.split('\n');
                    let hasAd   = false;

                    const cleaned = lines.map(line => {
                        if (isAdSegment(line)) {
                            hasAd = true;
                            return '';
                        }
                        return line;
                    });

                    if (hasAd) {
                        log('Anúncio removido do XHR M3U8.');
                        Object.defineProperty(this, 'responseText', {
                            value:    cleaned.join('\n'),
                            writable: false,
                        });
                        Object.defineProperty(this, 'response', {
                            value:    cleaned.join('\n'),
                            writable: false,
                        });
                    }
                } catch (err) {
                    log(`Erro no XHR intercept: ${err.message}`);
                }
            });
        }

        return originalSend.apply(this, args);
    };

    log('Scriptlet twitch-videoad carregado com sucesso.');

})();
