/**
 * Atlas Service Worker（PWA 离线基础）：
 * - 静态资源（/_next/static、icons、manifest）：Cache-First（内容哈希，不可变）
 * - 页面导航：Network-First，失败回退缓存，再回退内置离线占位
 * - API（/v1/**）与跨域请求永不缓存（会话/心跳必须走网络）
 * 仅生产环境注册（dev 热更新会被缓存干扰）；版本号变更时清理旧缓存。
 */
const VERSION = 'v1';
const STATIC_CACHE = `atlas-static-${VERSION}`;
const PAGE_CACHE = `atlas-pages-${VERSION}`;
const OFFLINE_HTML = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Atlas · 离线</title><style>body{font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#0d0f17;color:#e8e8f2}main{text-align:center}h1{font-size:18px;letter-spacing:.2em}p{color:#8a8aa4;font-size:13px}</style></head><body><main><h1>ATLAS</h1><p>当前离线，恢复网络后自动重试。</p></main></body></html>`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      .then((cache) =>
        cache.put(
          '/',
          new Response(OFFLINE_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } }),
        ),
      ),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== PAGE_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/v1/')) return; // API 永不缓存
  if (url.pathname.includes('webpack-hmr') || url.pathname.startsWith('/_next/webpack')) return;

  // 静态资源：Cache-First（哈希文件名不可变）
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname === '/manifest.json' ||
    url.pathname.endsWith('.svg')
  ) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  // 页面导航：Network-First → 缓存 → 离线占位
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(PAGE_CACHE);
            cache.put(request, response.clone());
            cache.put('/', response.clone()); // SPA 壳
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(PAGE_CACHE);
          return (
            (await cache.match(request)) ??
            (await cache.match('/')) ??
            new Response(OFFLINE_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } })
          );
        }),
    );
    return;
  }

  // 其余同源 GET：Stale-While-Revalidate
  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const hit = await cache.match(request);
      const network = fetch(request)
        .then(async (response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => hit ?? Response.error());
      return hit ?? network;
    }),
  );
});
