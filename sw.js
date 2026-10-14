/**
 * 西北探吉業務平台 - Service Worker
 * 負責快取核心靜態資源，支援 PWA 離線啟動
 * 策略：HTML/JS/CSS 採網路優先（確保最新版），圖片等靜態資源採快取優先
 */

const CACHE_NAME = "nw-tanji-cache-v26";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./firebase-config.js",
  "./css/style.css",
  "./assets/icon-192.svg",
  "./assets/icon-512.svg",
  "./assets/logo.svg"
];

// 安裝：快取核心資源
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL).catch((err) => {
        console.warn("[SW] 部分資源快取失敗:", err);
      });
    })
  );
  self.skipWaiting();
});

// 啟用：清理舊快取
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// 判斷是否為需即時更新的資源（HTML/JS/CSS）
function isLiveAsset(url) {
  return url.pathname.endsWith(".html") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname === "/" ||
    url.pathname.endsWith("/");
}

// 攔截請求
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Firebase / CDN 相關請求一律走網路
  if (
    url.hostname.includes("firebase") ||
    url.hostname.includes("googleapis") ||
    url.hostname.includes("gstatic")
  ) {
    return;
  }

  // 非同源請求直接走網路
  if (url.origin !== self.location.origin) return;

  // HTML / JS / CSS：網路優先，離線時回退快取
  if (isLiveAsset(url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  // 圖片等其他靜態資源：快取優先，失敗則網路
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
