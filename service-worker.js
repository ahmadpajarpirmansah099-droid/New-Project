const STATIC_CACHE = "guest-operations-static-v1";

self.addEventListener("install", function (event) {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) {
            return key.startsWith("guest-operations-static-") && key !== STATIC_CACHE;
          })
          .map(function (key) {
            return caches.delete(key);
          })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const scopePath = new URL(self.registration.scope).pathname;

  // Only cache this app's static files. Never cache HTML pages, Supabase/API
  // responses, authentication traffic, or requests to external origins.
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(scopePath + "assets/")) return;
  if (!["script", "style", "image", "font"].includes(request.destination)) return;

  event.respondWith(
    fetch(request).then(function (response) {
      if (response && response.ok && response.type === "basic") {
        const copy = response.clone();
        event.waitUntil(
          caches.open(STATIC_CACHE).then(function (cache) {
            return cache.put(request, copy);
          })
        );
      }
      return response;
    }).catch(function () {
      return caches.match(request);
    })
  );
});