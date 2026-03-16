// twitch-videoad.js
// Bloqueador de anuncios da Twitch — backup stream via playerType alternativo
// Compativel: Chrome, Firefox, Edge (uBlock Origin 1.50+)
(function () {
    if (!/(^|\.)twitch\.tv$/.test(location.hostname)) return;
    'use strict';

    // ── Controle de versão para evitar conflito com outras instâncias ────────────
    const VERSAO_SCRIPT = 25;
    if (typeof window.__twBlockVersao !== 'undefined' && window.__twBlockVersao >= VERSAO_SCRIPT) return;
    window.__twBlockVersao = VERSAO_SCRIPT;

    // ── Configurações globais ────────────────────────────────────────────────────
    const CONF = Object.freeze({
        clientId:           'kimne78kx3ncx6brgo4mv6wki5h1ko',
        marcadorAd:         'stitched',
        tiposBackup:        ['embed', 'popout', 'autoplay'],
        tipoForcado:        'popout',
        recarregarAposAd:   true,
        monitorBuffer:      true,
        intervaloBuffer:    600,
        tentativasBuffer:   3,
        delayMinBuffer:     8000,
        ttlCacheSegmento:   120000,
    });

    // ── Sistema de log ────────────────────────────────────────────────────────────
    const _logBuf = [];
    function _log(msg) {
        const ts    = new Date().toISOString().slice(11, 23);
        const entry = `[TW-BLOCK ${ts}] ${msg}`;
        _logBuf.push(entry);
        if (_logBuf.length > 300) _logBuf.shift();
        console.log(entry);
    }

    // Expõe diagnóstico via console do browser
    window.__twLogs  = _logBuf;
    window.twLogs    = () => { console.log(_logBuf.join('\n')); return _logBuf.slice(); };
    window.twDebug   = () => {
        const info = {
            versao:          VERSAO_SCRIPT,
            workersHookados: ctx.workers.length,
            authCapturada:   !!ctx.authHeader,
            deviceId:        ctx.deviceId ? ctx.deviceId.slice(0, 8) + '...' : null,
            v2api:           ctx.v2api,
            logs_recentes:   _logBuf.slice(-30),
        };
        console.table(info);
        return info;
    };

    // ── Estado do contexto principal ─────────────────────────────────────────────
    const ctx = {
        deviceId:        null,
        authHeader:      undefined,
        integrityHeader: null,
        clientVersion:   null,
        clientSession:   null,
        workers:         [],
        v2api:           false,
    };

    // ────────────────────────────────────────────────────────────────────────────
    // FUNÇÕES PURAS — serializadas via .toString() para dentro do Worker
    // Não podem referenciar variáveis externas (closures não funcionam em Worker)
    // ────────────────────────────────────────────────────────────────────────────

    function temMarcadorAd(texto, marcador) {
        return texto.includes(marcador);
    }

    function extrairNomeCanal(url) {
        try { return new URL(url).pathname.match(/([^/]+)(?=\.\w+$)/)?.[0] ?? null; }
        catch (_) { return null; }
    }

    function lerServerTime(m3u8, isV2) {
        const rx = isV2
            ? /#EXT-X-SESSION-DATA:DATA-ID="SERVER-TIME",VALUE="([^"]+)"/
            : /SERVER-TIME="([0-9.]+)"/;
        return m3u8.match(rx)?.[1] ?? null;
    }

    function escreverServerTime(m3u8, tempo, isV2) {
        if (!tempo) return m3u8;
        return isV2
            ? m3u8.replace(/(#EXT-X-SESSION-DATA:DATA-ID="SERVER-TIME",VALUE=")[^"]+(")/, `$1${tempo}$2`)
            : m3u8.replace(/(SERVER-TIME=")[0-9.]+"/, `SERVER-TIME="${tempo}"`);
    }

    function parsearAtributos(linha) {
        return Object.fromEntries(
            linha.split(/(?:^|,)((?:[^=]*)=(?:"[^"]*"|[^,]*))/)
                .filter(Boolean)
                .map(par => {
                    const sep = par.indexOf('=');
                    const k   = par.slice(0, sep);
                    const v   = par.slice(sep + 1);
                    const n   = Number(v);
                    return [k, isNaN(n) ? (v.startsWith('"') ? JSON.parse(v) : v) : n];
                })
        );
    }

    function urlParaResolucao(encodings, resolucaoAlvo) {
        const linhas = encodings.replaceAll('\r', '').split('\n');
        const [tw, th] = resolucaoAlvo.Resolution.split('x').map(Number);
        let melhorUrl  = null;
        let menorDiff  = Infinity;
        for (let i = 0; i < linhas.length - 1; i++) {
            if (!linhas[i].startsWith('#EXT-X-STREAM-INF') || !linhas[i + 1].includes('.m3u8')) continue;
            const attr = parsearAtributos(linhas[i]);
            const res  = attr['RESOLUTION'];
            if (!res) continue;
            if (res === resolucaoAlvo.Resolution && attr['FRAME-RATE'] == resolucaoAlvo.FrameRate) return linhas[i + 1];
            const [rw, rh] = res.split('x').map(Number);
            const diff = Math.abs(rw * rh - tw * th);
            if (diff < menorDiff) { menorDiff = diff; melhorUrl = linhas[i + 1]; }
        }
        return melhorUrl;
    }

    function limparSegmentosAd(texto, cacheRef, marcador) {
        const URL_NEUTRA  = 'https://twitch.tv';
        const linhas      = texto.replaceAll('\r', '').split('\n');
        let   encontrouAd = false;
        const agora       = Date.now();

        for (let i = 0; i < linhas.length; i++) {
            linhas[i] = linhas[i]
                .replaceAll(/(X-TV-TWITCH-AD-URL=")([^"]*)(")/g,               `$1${URL_NEUTRA}$3`)
                .replaceAll(/(X-TV-TWITCH-AD-CLICK-TRACKING-URL=")([^"]*)(")/g, `$1${URL_NEUTRA}$3`);

            if (i < linhas.length - 1 && linhas[i].startsWith('#EXTINF') && !linhas[i].includes(',live')) {
                cacheRef.set(linhas[i + 1], agora);
                encontrouAd = true;
            }
            if (linhas[i].includes(marcador)) encontrouAd = true;
        }

        if (encontrouAd) {
            for (let i = 0; i < linhas.length; i++) {
                if (linhas[i].startsWith('#EXT-X-TWITCH-PREFETCH:')) linhas[i] = '';
            }
        }

        // Remove entradas expiradas do cache
        cacheRef.forEach((ts, k) => { if (agora - ts > 120000) cacheRef.delete(k); });
        return { texto: linhas.join('\n'), encontrouAd };
    }

    function gerarDeviceId() {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    }

    // ── Fetch de Access Token via GQL (roda dentro do Worker) ───────────────────
    function pedirAccessToken(nomeCanal, playerType, estado, CONF) {
        if (!estado.deviceId) estado.deviceId = gerarDeviceId();
        const corpo = {
            operationName: 'PlaybackAccessToken',
            variables: {
                isLive: true, login: nomeCanal,
                isVod: false, vodID: '',
                playerType,
                platform: playerType === 'autoplay' ? 'android' : 'web',
            },
            extensions: {
                persistedQuery: {
                    version: 1,
                    sha256Hash: 'ed230aa1e33e07eebb8928504583da78a5173989fadfb1ac94be06a04f3cdbe9',
                },
            },
        };
        const headers = {
            'Client-ID':   CONF.clientId,
            'X-Device-Id': estado.deviceId,
            ...(estado.authHeader      ? { 'Authorization':     estado.authHeader }      : {}),
            ...(estado.integrityHeader ? { 'Client-Integrity':  estado.integrityHeader } : {}),
            ...(estado.clientVersion   ? { 'Client-Version':    estado.clientVersion }   : {}),
            ...(estado.clientSession   ? { 'Client-Session-Id': estado.clientSession }   : {}),
        };
        return new Promise((resolve, reject) => {
            const id = Math.random().toString(36).slice(2);
            if (!self.__pendentes) self.__pendentes = new Map();
            self.__pendentes.set(id, { resolve, reject });
            postMessage({ key: 'FetchRequest', value: { id, url: 'https://gql.twitch.tv/gql', options: { method: 'POST', body: JSON.stringify(corpo), headers } } });
        });
    }

    // ── Processamento central do M3U8 (roda dentro do Worker) ──────────────────
    async function processarM3U8(url, texto, fetchReal, estado, CONF, cacheAd) {
        const canal = estado.canaisPorUrl[url];
        if (!canal) return texto;

        if (HasTriggeredPlayerReload) {
            HasTriggeredPlayerReload = false;
            canal.ultimoReload = Date.now();
        }

        const ehAd = temMarcadorAd(texto, CONF.marcadorAd);
        postMessage({ key: 'Log', value: `M3U8 recebido canal=${canal.nome} ehAd=${ehAd} url=${url.slice(0, 80)}` });

        if (ehAd) {
            if (!canal.exibindoAd) {
                canal.exibindoAd = true;
                postMessage({ key: 'UpdateAdBlockBanner', hasAds: true, isMidroll: false, isStrippingAdSegments: false });
            }

            const resolucaoAtual = canal.urls[url];
            if (resolucaoAtual) {
                let m3u8Limpo = null;
                const minRequests = canal.ultimoReload > Date.now() - 1500;
                const inicio = minRequests ? 2 : 0;

                for (let t = inicio; !m3u8Limpo && t < CONF.tiposBackup.length; t++) {
                    const tipo = CONF.tiposBackup[t];
                    postMessage({ key: 'Log', value: `tentando backup playerType=${tipo}` });
                    try {
                        let encodings = canal.cacheBackup[tipo];
                        if (!encodings) {
                            const tokenResp = await pedirAccessToken(canal.nome, tipo, estado, CONF);
                            if (tokenResp.status !== 200) {
                                postMessage({ key: 'Log', value: `token falhou status=${tokenResp.status} tipo=${tipo}` });
                                canal.cacheBackup[tipo] = null; continue;
                            }
                            const tokenData = await tokenResp.json();
                            const usherUrl  = new URL(`https://usher.ttvnw.net/api/${estado.v2api ? 'v2/' : ''}channel/hls/${canal.nome}.m3u8${canal.usherParams}`);
                            usherUrl.searchParams.set('sig',   tokenData.data.streamPlaybackAccessToken.signature);
                            usherUrl.searchParams.set('token', tokenData.data.streamPlaybackAccessToken.value);
                            const encResp = await fetchReal(usherUrl.href);
                            if (encResp.status !== 200) { canal.cacheBackup[tipo] = null; continue; }
                            encodings = canal.cacheBackup[tipo] = await encResp.text();
                        }
                        const urlStream  = urlParaResolucao(encodings, resolucaoAtual);
                        if (!urlStream) { postMessage({ key: 'Log', value: `urlStream nao encontrada tipo=${tipo}` }); continue; }
                        const streamResp = await fetchReal(urlStream);
                        if (streamResp.status !== 200) { canal.cacheBackup[tipo] = null; continue; }
                        const candidato  = await streamResp.text();
                        postMessage({ key: 'Log', value: `backup candidato ehAd=${temMarcadorAd(candidato, CONF.marcadorAd)} tipo=${tipo}` });
                        if (!temMarcadorAd(candidato, CONF.marcadorAd) || (!m3u8Limpo && t >= CONF.tiposBackup.length - 1)) {
                            m3u8Limpo = candidato;
                        }
                        if (minRequests) { m3u8Limpo = candidato; break; }
                    } catch (err) {
                        postMessage({ key: 'Log', value: `erro backup tipo=${tipo} err=${err.message}` });
                        canal.cacheBackup[tipo] = null;
                    }
                }

                if (m3u8Limpo) texto = m3u8Limpo;
            }

            const { texto: textoLimpo, encontrouAd } = limparSegmentosAd(texto, cacheAd, CONF.marcadorAd);
            canal.estaRemovendo = encontrouAd;
            const ehMidroll = texto.includes('"MIDROLL"') || texto.includes('"midroll"');
            postMessage({ key: 'UpdateAdBlockBanner', hasAds: true, isMidroll: ehMidroll, isStrippingAdSegments: encontrouAd });
            return textoLimpo;
        }

        if (canal.exibindoAd) {
            canal.exibindoAd    = false;
            canal.estaRemovendo = false;
            Object.keys(canal.cacheBackup).forEach(k => { canal.cacheBackup[k] = null; });
            postMessage({ key: 'UpdateAdBlockBanner', hasAds: false, isMidroll: false, isStrippingAdSegments: false });
            postMessage({ key: CONF.recarregarAposAd ? 'ReloadPlayer' : 'PauseResumePlayer' });
        }

        return texto;
    }

    // ── Hook de fetch dentro do Worker ──────────────────────────────────────────
    function hookFetchWorker(estado, CONF) {
        const fetchReal = fetch;
        fetch = async function (url, opts) {
            if (typeof url !== 'string') return fetchReal.apply(this, arguments);

            // Segmento de anúncio cacheado → retorna .ts vazio (mp4 mínimo válido)
            if (cacheSegmentosAd.has(url.trimEnd())) {
                return fetchReal('data:video/mp4;base64,AAAAKGZ0eXBtcDQyAAAAAWlzb21tcDQyZGFzaGF2YzFpc282aGxzZgAABEltb292AAAAbG12aGQAAAAAAAAAAAAAAAAAAYagAAAAAAABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAABqHRyYWsAAABcdGtoZAAAAAMAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAURtZGlhAAAAIG1kaGQAAAAAAAAAAAAAAAAAALuAAAAAAFXEAAAAAAAtaGRscgAAAAAAAAAAc291bgAAAAAAAAAAAAAAAFNvdW5kSGFuZGxlcgAAAADvbWluZgAAABBzbWhkAAAAAAAAAAAAAAAkZGluZgAAABxkcmVmAAAAAAAAAAEAAAAMdXJsIAAAAAEAAACzc3RibAAAAGdzdHNkAAAAAAAAAAEAAABXbXA0YQAAAAAAAAABAAAAAAAAAAAAAgAQAAAAALuAAAAAAAAzZXNkcwAAAAADgICAIgABAASAgIAUQBUAAAAAAAAAAAAAAAWAgIACEZAGgICAAQIAAAAQc3R0cwAAAAAAAAAAAAAAEHN0c2MAAAAAAAAAAAAAABRzdHN6AAAAAAAAAAAAAAAAAAAAEHN0Y28AAAAAAAAAAAAAAeV0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAoAAAAFoAAAAAAGBbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAA9CQAAAAABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABLG1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAOxzdGJsAAAAoHN0c2QAAAAAAAAAAQAAAJBhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAoABaABIAAAASAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGP//AAAAOmF2Y0MBTUAe/+EAI2dNQB6WUoFAX/LgLUBAQFAAAD6AAA6mDgAAHoQAA9CW7y4KAQAEaOuPIAAAABBzdHRzAAAAAAAAAAAAAAAQc3RzYwAAAAAAAAAAAAAAFHN0c3oAAAAAAAAAAAAAAAAAAAAQc3RjbwAAAAAAAAAAAAAASG12ZXgAAAAgdHJleAAAAAAAAAABAAAAAQAAAC4AAAAAAoAAAAAAACB0cmV4AAAAAAAAAAIAAAABAACCNQAAAAACQAAA', opts);
            }

            url = url.trimEnd();

            // Manifest do stream (.m3u8 individual de qualidade)
            if (url.endsWith('m3u8')) {
                return new Promise((resolve, reject) => {
                    fetchReal(url, opts)
                        .then(async r => {
                            if (r.status === 200) {
                                resolve(new Response(await processarM3U8(url, await r.text(), fetchReal, estado, CONF, cacheSegmentosAd)));
                            } else {
                                resolve(r);
                            }
                        })
                        .catch(reject);
                });
            }

            // Playlist de encodings (lista de qualidades disponíveis)
            if (url.includes('/channel/hls/') && !url.includes('picture-by-picture')) {
                estado.v2api = url.includes('/api/v2/');
                const nome   = extrairNomeCanal(url);
                return new Promise((resolve, reject) => {
                    fetchReal(url, opts)
                        .then(async r => {
                            if (r.status !== 200) { resolve(r); return; }
                            const encodings  = await r.text();
                            const serverTime = lerServerTime(encodings, estado.v2api);

                            if (!estado.canaisAtivos[nome]) {
                                const canal = estado.canaisAtivos[nome] = {
                                    nome,
                                    exibindoAd:   false,
                                    estaRemovendo: false,
                                    ultimoReload: Date.now(),
                                    cacheBackup:  {},
                                    usherParams:  new URL(url).search,
                                    urls:         {},
                                    resolucoes:   [],
                                };
                                const linhas = encodings.replaceAll('\r', '').split('\n');
                                for (let i = 0; i < linhas.length - 1; i++) {
                                    if (linhas[i].startsWith('#EXT-X-STREAM-INF') && linhas[i + 1].includes('.m3u8')) {
                                        const attr = parsearAtributos(linhas[i]);
                                        if (attr['RESOLUTION']) {
                                            const info = { Resolution: attr['RESOLUTION'], FrameRate: attr['FRAME-RATE'], Codecs: attr['CODECS'], Url: linhas[i + 1] };
                                            canal.urls[linhas[i + 1]]         = info;
                                            canal.resolucoes.push(info);
                                            estado.canaisPorUrl[linhas[i + 1]] = canal;
                                        }
                                    }
                                }
                                postMessage({ key: 'Log', value: `canal registrado: ${nome} resolucoes=${canal.resolucoes.length}` });
                            }
                            resolve(new Response(escreverServerTime(encodings, serverTime, estado.v2api)));
                        })
                        .catch(reject);
                });
            }

            return fetchReal.apply(this, arguments);
        };
        postMessage({ key: 'Log', value: 'hookFetchWorker instalado' });
    }

    // ── Hook do Worker — ponto central da solução ────────────────────────────────
    function hookWorker() {
        const WorkerOriginal = window.Worker;

        const NovoWorker = class Worker extends WorkerOriginal {
            constructor(blobUrl, opts) {
                // Intercepta qualquer worker de URL string — já estamos dentro do twitch.tv
                // Inclui blob: (HLS player antigo) e CDN direto (Amazon IVS WASM worker)
                if (typeof blobUrl !== 'string') { super(blobUrl, opts); return; }
                _log(`worker interceptado: ${blobUrl.slice(0, 80)}`);

                _log(`worker blob interceptado: ${blobUrl.slice(0, 60)}`);

                // Lê o código original do worker de forma síncrona (blob: ou CDN com CORS)
                const codigoOriginal = (() => {
                    try {
                        const req = new XMLHttpRequest();
                        req.open('GET', blobUrl, false);
                        req.overrideMimeType('text/javascript');
                        req.send();
                        if (req.status === 0 || req.status === 200) {
                            _log(`worker codigo lido: ${req.responseText.length} chars, url-tipo: ${blobUrl.startsWith('blob:') ? 'blob' : 'cdn'}`);
                            return req.responseText;
                        }
                        _log(`ERRO XHR status=${req.status}`);
                        return '';
                    } catch (err) {
                        _log(`ERRO ao ler worker: ${err.message}`);
                        return '';
                    }
                })();

                if (!codigoOriginal) {
                    _log('AVISO: codigo vazio, passando worker original sem modificacao');
                    super(blobUrl, opts);
                    return;
                }

                // Monta o novo worker injetando nossas funções
                const blobNovo = new Blob([`
                    'use strict';
                    var HasTriggeredPlayerReload = false;
                    var cacheSegmentosAd = new Map();
                    const estado = {
                        deviceId:        ${ctx.deviceId        ? JSON.stringify(ctx.deviceId)        : null},
                        authHeader:      ${ctx.authHeader      ? JSON.stringify(ctx.authHeader)      : null},
                        integrityHeader: ${ctx.integrityHeader ? JSON.stringify(ctx.integrityHeader) : null},
                        clientVersion:   ${ctx.clientVersion   ? JSON.stringify(ctx.clientVersion)   : null},
                        clientSession:   ${ctx.clientSession   ? JSON.stringify(ctx.clientSession)   : null},
                        canaisAtivos:    {},
                        canaisPorUrl:    {},
                        v2api:           false,
                    };
                    const CONF = ${JSON.stringify(CONF)};

                    // Funções injetadas
                    ${temMarcadorAd.toString()}
                    ${extrairNomeCanal.toString()}
                    ${lerServerTime.toString()}
                    ${escreverServerTime.toString()}
                    ${parsearAtributos.toString()}
                    ${urlParaResolucao.toString()}
                    ${limparSegmentosAd.toString()}
                    ${gerarDeviceId.toString()}
                    ${pedirAccessToken.toString()}
                    ${processarM3U8.toString()}
                    ${hookFetchWorker.toString()}

                    // Mensagens recebidas do contexto principal
                    self.addEventListener('message', function(e) {
                        const { key, value } = e.data;
                        if (key === 'SyncDeviceId')    estado.deviceId        = value;
                        if (key === 'SyncAuth')        estado.authHeader      = value;
                        if (key === 'SyncIntegridade') estado.integrityHeader = value;
                        if (key === 'SyncVersao')      estado.clientVersion   = value;
                        if (key === 'SyncSessao')      estado.clientSession   = value;
                        if (key === 'RecarregarOk')    HasTriggeredPlayerReload = true;
                        if (key === 'FetchResponse') {
                            if (!self.__pendentes) return;
                            const p = self.__pendentes.get(value.id);
                            if (!p) return;
                            self.__pendentes.delete(value.id);
                            if (value.error) {
                                p.reject(new Error(value.error));
                            } else {
                                // Monta Response sem headers restritos
                                const hdrs = new Headers();
                                Object.entries(value.headers || {}).forEach(([k, v]) => {
                                    const proibidos = ['content-encoding','content-length','transfer-encoding'];
                                    if (!proibidos.includes(k.toLowerCase())) {
                                        try { hdrs.set(k, v); } catch (_) {}
                                    }
                                });
                                p.resolve(new Response(value.body, { status: value.status, headers: hdrs }));
                            }
                        }
                    });

                    hookFetchWorker(estado, CONF);
                    eval(${JSON.stringify(codigoOriginal)});
                `]);

                super(URL.createObjectURL(blobNovo), opts);
                ctx.workers.push(this);
                _log(`worker hookeado com sucesso. total workers: ${ctx.workers.length}`);

                // Mensagens enviadas pelo worker ao contexto principal
                this.addEventListener('message', e => {
                    if (e.data.key === 'Log')                 _log(`[worker] ${e.data.value}`);
                    if (e.data.key === 'UpdateAdBlockBanner') atualizarBanner(e.data);
                    if (e.data.key === 'PauseResumePlayer')   acionarPlayer(true,  false);
                    if (e.data.key === 'ReloadPlayer')        acionarPlayer(false, true);
                });

                // Proxy de fetch: worker pede → main thread executa → devolve resultado
                this.addEventListener('message', async e => {
                    if (e.data.key !== 'FetchRequest') return;
                    const req = e.data.value;
                    try {
                        const resp  = await window.realFetch(req.url, req.options);
                        const corpo = await resp.text();
                        this.postMessage({ key: 'FetchResponse', value: {
                            id:      req.id,
                            status:  resp.status,
                            headers: Object.fromEntries(resp.headers.entries()),
                            body:    corpo,
                        }});
                    } catch (err) {
                        _log(`ERRO proxy fetch: ${err.message}`);
                        this.postMessage({ key: 'FetchResponse', value: { id: req.id, error: err.message } });
                    }
                });
            }
        };

        Object.defineProperty(window, 'Worker', {
            get: ()  => NovoWorker,
            set: (_) => { /* bloqueia substituição do Worker */ },
            configurable: true,
        });
        _log('hookWorker registrado');
    }

    // ── Intercepta fetch principal para capturar headers GQL ────────────────────
    function hookFetchPrincipal() {
        const fetchReal    = window.fetch;
        window.realFetch   = fetchReal;

        window.fetch = function (url, init, ...resto) {
            if (typeof url === 'string' && init?.headers) {
                const h = init.headers;

                const sync = (campo, chaveHeader, chaveAlt, msg) => {
                    const val = typeof h[chaveHeader] === 'string' ? h[chaveHeader]
                              : typeof h[chaveAlt]    === 'string' ? h[chaveAlt] : null;
                    if (val && val !== ctx[campo]) {
                        ctx[campo] = val;
                        notificarWorkers(msg, val);
                        _log(`sync ${campo} -> workers`);
                    }
                };

                if (url.includes('gql')) {
                    sync('deviceId',        'X-Device-Id',      'Device-ID',         'SyncDeviceId');
                    sync('clientVersion',   'Client-Version',   'Client-Version',    'SyncVersao');
                    sync('clientSession',   'Client-Session-Id','Client-Session-Id', 'SyncSessao');
                    sync('integrityHeader', 'Client-Integrity', 'Client-Integrity',  'SyncIntegridade');
                    if (typeof h['Authorization'] === 'string' && h['Authorization'] !== ctx.authHeader) {
                        ctx.authHeader = h['Authorization'];
                        notificarWorkers('SyncAuth', ctx.authHeader);
                        _log('auth capturada -> workers');
                    }

                    // Força playerType para obter token sem anúncio
                    if (init?.body && typeof init.body === 'string' && init.body.includes('PlaybackAccessToken')) {
                        try {
                            const body = JSON.parse(init.body);
                            const forcar = (obj) => {
                                if (obj?.variables?.playerType && obj.variables.playerType !== CONF.tipoForcado) {
                                    _log(`forçando playerType: ${obj.variables.playerType} -> ${CONF.tipoForcado}`);
                                    obj.variables.playerType = CONF.tipoForcado;
                                }
                            };
                            Array.isArray(body) ? body.forEach(forcar) : forcar(body);
                            init.body = JSON.stringify(body);
                        } catch (_) {}
                    }
                }
            }
            return fetchReal.apply(this, arguments);
        };
        _log('hookFetchPrincipal registrado');
    }

    // ── Utilitários do player Twitch (via React internals) ───────────────────────
    function buscarNoReact(no, teste) {
        if (no?.stateNode && teste(no.stateNode)) return no.stateNode;
        let filho = no?.child;
        while (filho) {
            const r = buscarNoReact(filho, teste);
            if (r) return r;
            filho = filho.sibling;
        }
        return null;
    }

    function obterPlayer() {
        const root = document.querySelector('#root');
        if (!root) return null;
        let rRoot = root._reactRootContainer?._internalRoot?.current;
        if (!rRoot) {
            const k = Object.keys(root).find(x => x.startsWith('__reactContainer'));
            if (k) rRoot = root[k];
        }
        if (!rRoot) return null;
        let player = buscarNoReact(rRoot, n => n.setPlayerActive && n.props?.mediaPlayerInstance);
        player     = player?.props?.mediaPlayerInstance ?? null;
        if (player?.playerInstance) player = player.playerInstance;
        const playerState = buscarNoReact(rRoot, n => n.setSrc && n.setInitialPlaybackSettings);
        return { player, playerState };
    }

    function acionarPlayer(pausePlay, recarregar) {
        const ps = obterPlayer();
        if (!ps?.player || ps.player.isPaused?.() || ps.player.core?.paused) return;
        if (pausePlay) { ps.player.pause(); ps.player.play(); return; }
        if (recarregar && ps.playerState) {
            ps.playerState.setSrc({ isNewMediaPlayerInstance: true, refreshAccessToken: true });
            notificarWorkers('RecarregarOk');
            ps.player.play();
        }
    }

    function notificarWorkers(chave, valor) {
        ctx.workers.forEach(w => w.postMessage({ key: chave, value: valor }));
    }

    // ── Banner visual de status ──────────────────────────────────────────────────
    function atualizarBanner(dados) {
        const playerDiv = document.querySelector('.video-player');
        if (!playerDiv) return;
        let banner = playerDiv.querySelector('.tw-adblock-status');
        if (!banner) {
            banner = document.createElement('div');
            banner.className = 'tw-adblock-status';
            banner.style.cssText = 'position:absolute;top:8px;left:8px;z-index:9999;pointer-events:none;';
            banner.innerHTML = '<div style="color:#fff;background:rgba(15,10,30,.82);padding:5px 10px;font-size:11px;font-family:monospace;border-radius:4px;border:1px solid rgba(145,71,255,.5);letter-spacing:.3px"><span></span></div>';
            banner._span = banner.querySelector('span');
            playerDiv.style.position = 'relative';
            playerDiv.appendChild(banner);
        }

        if (!dados.hasAds) {
            banner.style.display = 'none';
            return;
        }

        let texto = 'Propagandas sendo bloqueadas';
        if (dados.isMidroll)             texto += ' (midroll)';
        if (dados.isStrippingAdSegments) texto += ' — removendo segmentos';
        banner._span.textContent = texto;
        banner.style.display = 'block';
    }

    // ── Indicador de startup — confirma que o scriptlet está ativo ───────────────
    function mostrarIndicadorAtivo() {
        const esperar = setInterval(() => {
            const playerDiv = document.querySelector('.video-player');
            if (!playerDiv) return;
            clearInterval(esperar);

            const el = document.createElement('div');
            el.style.cssText = 'position:absolute;top:8px;left:8px;z-index:9999;pointer-events:none;transition:opacity 1s;';
            el.innerHTML = '<div style="color:#aaa;background:rgba(0,0,0,.6);padding:3px 8px;font-size:10px;font-family:monospace;border-radius:3px">tw-block v' + VERSAO_SCRIPT + ' ativo</div>';
            playerDiv.style.position = 'relative';
            playerDiv.appendChild(el);
            setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 1100); }, 3000);
        }, 800);
    }

    // ── Monitor de buffer — previne travamento pós-ad ────────────────────────────
    const bufSt = { pos: 0, bufPos: 0, bufDur: 0, igual: 0, ultimoFix: 0, iniciou: false };

    function monitorarBuffer() {
        try {
            const ps = obterPlayer();
            const p  = ps?.player;
            if (p?.core && ps?.playerState?.props?.content?.type === 'live' && !p.isPaused?.()) {
                const pos    = p.core.state?.position;
                const bufPos = p.core.state?.bufferedPosition;
                const bufDur = p.getBufferDuration?.();
                if (pos !== undefined && bufPos !== undefined) {
                    if (bufSt.iniciou && pos !== 0
                        && (bufSt.pos === pos || bufDur < 1)
                        && bufSt.bufPos === bufPos
                        && bufSt.bufDur >= bufDur
                        && Date.now() - bufSt.ultimoFix > CONF.delayMinBuffer) {
                        bufSt.igual++;
                        if (bufSt.igual >= CONF.tentativasBuffer) {
                            acionarPlayer(true, false);
                            bufSt.ultimoFix = Date.now();
                            bufSt.igual     = 0;
                        }
                    } else { bufSt.igual = 0; }
                    bufSt.pos = pos; bufSt.bufPos = bufPos; bufSt.bufDur = bufDur;
                }
                if (p.getState?.() === 'Playing') bufSt.iniciou = true;
            }
        } catch (_) {}
        setTimeout(monitorarBuffer, CONF.intervaloBuffer);
    }

    // ── Impede Twitch de pausar ao trocar de aba ─────────────────────────────────
    function aplicarCorrecaoVisibilidade() {
        const bloquear = e => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };
        try { Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true }); } catch (_) {}
        try { Object.defineProperty(document, 'hidden',          { get: () => false,     configurable: true }); } catch (_) {}
        document.addEventListener('visibilitychange',       bloquear, true);
        document.addEventListener('webkitvisibilitychange', bloquear, true);
        try {
            if (/Firefox/.test(navigator.userAgent)) {
                Object.defineProperty(document, 'mozHidden', { get: () => false, configurable: true });
            } else {
                Object.defineProperty(document, 'webkitHidden', { get: () => false, configurable: true });
            }
        } catch (_) {}
    }

    // ── Inicialização ────────────────────────────────────────────────────────────
    _log(`scriptlet v${VERSAO_SCRIPT} iniciando em ${location.hostname}`);

    hookWorker();
    hookFetchPrincipal();

    if (CONF.monitorBuffer) monitorarBuffer();
    mostrarIndicadorAtivo();

    if (['complete', 'loaded', 'interactive'].includes(document.readyState)) {
        aplicarCorrecaoVisibilidade();
    } else {
        window.addEventListener('DOMContentLoaded', aplicarCorrecaoVisibilidade);
    }

    // Atalhos de diagnóstico — use no console F12 do browser
    window.recarregarPlayerTwitch = () => acionarPlayer(false, true);

    _log('inicializacao concluida');

})();
