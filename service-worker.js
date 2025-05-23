const CACHE_NAME = "skyrail-cache-v1";
const FILES_TO_CACHE = [
  "index.html",
  "guide.html",
  "map.html",
  "planner.html",
  "manifest.json"
];

self.addEventListener("install", (evt) => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener("fetch", (evt) => {
  evt.respondWith(
    caches.match(evt.request).then((response) => {
      return response || fetch(evt.request);
    })
  );
});
