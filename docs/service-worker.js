/* Minimal service worker for the simple static docs site */
const CACHE_NAME = 'web-buddy-docs-v1';
const RESOURCES = [
	'/',
	'/index.html',
	'/style.css',
	'/manifest.json'
];

self.addEventListener('install', event => {
	event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(RESOURCES)));
});

self.addEventListener('fetch', event => {
	event.respondWith(caches.match(event.request).then(r => r || fetch(event.request)));
});
	/* Minimal service worker for the simple static docs site */
	const CACHE_NAME = 'web-buddy-docs-v1';
	const RESOURCES = [
		'/',
		'/index.html',
		'/style.css',
		'/manifest.json'
	];

	self.addEventListener('install', event => {
		event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(RESOURCES)));
	});

	self.addEventListener('fetch', event => {
		event.respondWith(caches.match(event.request).then(r => r || fetch(event.request)));
	});