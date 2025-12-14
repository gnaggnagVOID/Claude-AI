const CACHE_NAME = 'claude-ai-chat-v1';
const urlsToCache = [
  './',
  './index.html',
  './script.js',
  './style.css',
  './favicon.png',
  './manifest.json',
];

// Install event - cache the specified resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache).catch(error => {
          console.error('Failed to cache resources:', error);
        });
      })
  );
});

// Fetch event - serve cached resources when offline
self.addEventListener('fetch', (event) => {
  // Check if this is a request for a static asset that we want to cache
  const url = new URL(event.request.url);

  if (url.origin === self.location.origin) {
    // Handle requests to our own origin (HTML, CSS, JS, images)
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          // Return cached version if available, otherwise fetch from network
          return response || fetch(event.request);
        })
        .catch(error => {
          console.error('Fetch failed:', error);
          // This fallback should only happen for our own assets in case of network issues
          return caches.match('/index.html');
        })
    );
  } else {
    // For external requests (like API calls), always try network first
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          // For external resources, return network error if not available in cache
          console.log(`Could not fetch ${event.request.url}, and no fallback available`);
          // Return a basic response for API errors that the app can handle
          if (event.request.url.includes('puter.com') || event.request.url.includes('puter.ai')) {
            return new Response(JSON.stringify({ error: "offline" }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          return new Response('Network Error', { status: 503 });
        })
    );
  }
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});