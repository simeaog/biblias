const CACHE_NAME = 'biblia-app-v7-referencias-contexto';

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
    './icon-splash_a.png',
    './icon-splash_b.png',
    './dados/apoio/apoio_biblico.json',
    './dados/apoio/indice_livros.json',
    './dados/apoio/indice_referencias.json',
    './dados/apoio/abreviacoes.json',
    './dados/apoio/manifest.json'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;

    if (request.method !== 'GET') return;

    event.respondWith(
        caches.match(request).then(cachedResponse => {
            if (cachedResponse) return cachedResponse;

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

self.addEventListener('message', event => {
    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
