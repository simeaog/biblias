
const CACHE_NAME = 'biblia-app-v15-atualizacoes';

const APP_SHELL = [
    './',
    './index.html',
    './styles.css',
    './apoio-referencias.css',
    './app.js',
    './js_apoio_referencias_otimizado.js',
    './manifest.json',
    './fav-icon_192.png',
    './fav-icon_512.png',
    './fav-icon-maskable_512.png',
    './icon-splash_a.png',
    './icon-splash_b.png',
    './dados/apoio/apoio_biblico.json',
    './dados/apoio/indice_livros.json',
    './dados/apoio/indice_referencias.json',
    './dados/apoio/abreviacoes.json',
    './dados/apoio/manifest.json'
];

// ======================================================
// INSTALAÇÃO
// ======================================================

self.addEventListener('install', event => {

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );

});

// ======================================================
// ATIVAÇÃO
// ======================================================

self.addEventListener('activate', event => {

    event.waitUntil(

        caches.keys().then(keys => {

            return Promise.all(

                keys
                    .filter(key =>
                        key.startsWith('biblia-app-') &&
                        key !== CACHE_NAME
                    )
                    .map(key => caches.delete(key))

            );

        }).then(() => self.clients.claim())

    );

});

// ======================================================
// BUSCA DE ARQUIVOS
// ======================================================

self.addEventListener('fetch', event => {

    const request = event.request;

    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // Não interfere em arquivos de outros sites.
    if (url.origin !== self.location.origin) return;

    // ==================================================
    // ARQUIVOS JSON: INTERNET PRIMEIRO, CACHE DEPOIS
    // ==================================================

    if (url.pathname.endsWith('.json')) {

        event.respondWith(

            (async () => {

                try {

                    // Busca a versão mais recente na internet.
                    const response = await fetch(request, {
                        cache: 'no-cache'
                    });

                    if (response.ok) {

                        // Atualiza a cópia local.
                        const cache = await caches.open(CACHE_NAME);

                        await cache.put(
                            request,
                            response.clone()
                        );

                    }

                    return response;

                } catch (error) {

                    // Sem internet, utiliza a cópia armazenada.
                    const cachedResponse =
                        await caches.match(request);

                    if (cachedResponse) {
                        return cachedResponse;
                    }

                    return new Response('', {
                        status: 503,
                        statusText: 'Offline'
                    });

                }

            })()

        );

        return;
    }

    // ==================================================
    // DEMAIS ARQUIVOS: CACHE PRIMEIRO
    // ==================================================

    event.respondWith(

        caches.match(request).then(cachedResponse => {

            if (cachedResponse) {
                return cachedResponse;
            }

            return fetch(request).then(response => {

                if (!response || response.status !== 200) {
                    return response;
                }

                const responseClone = response.clone();

                caches.open(CACHE_NAME).then(cache => {
                    cache.put(request, responseClone);
                });

                return response;

            }).catch(() => {

                if (request.mode === 'navigate') {
                    return caches.match('./index.html');
                }

                return new Response('', {
                    status: 503,
                    statusText: 'Offline'
                });

            });

        })

    );

});

// ======================================================
// COMUNICAÇÃO COM O APLICATIVO
// ======================================================

self.addEventListener('message', event => {

    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

});
