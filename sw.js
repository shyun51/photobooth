'use strict';
importScripts('./version.js');

// 배포 업데이트 시 이 버전을 변경하면 이전 캐시가 삭제됩니다.
const CACHE_NAME = 'photobooth-' + APP_VERSION;
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './version.js',
  './title.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];
const OPTIONAL_FRAMES = ['./frames.json', ...Array.from({length:20}, (_,i) => './frames/frame' + (i+1) + '.png')];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      // 필수 파일은 HTTP 캐시를 우회하고, 모두 성공해야 설치됩니다.
      await Promise.all(APP_SHELL.map(async (url) => {
        const request = new Request(url, { cache: 'reload' });
        const response = await fetch(request);
        if (!response.ok) throw new Error('필수 파일 캐시 실패: ' + url);
        await cache.put(request, response);
      }));
      // 프레임 파일은 없어도 설치를 계속합니다.
      await Promise.all(OPTIONAL_FRAMES.map(async (url) => {
        try {
          const request = new Request(url, { cache: 'reload' });
          const response = await fetch(request);
          if (response.ok) await cache.put(request, response);
        } catch (error) {
          console.warn('선택 프레임 캐시 생략:', url, error);
        }
      }));
      await self.skipWaiting();
    } catch (error) {
      console.error('서비스워커 설치 실패:', error);
      throw error; // 필수 앱 셸 없이 새 SW가 활성화되지 않도록 합니다.
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME && (key.startsWith('photobooth-') || key.startsWith('insaeng-necut-shell-'))).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

const OFFLINE_HTML = '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>오프라인</title><body><h1>오프라인 상태입니다</h1><p>인터넷 연결을 확인한 뒤 다시 시도해 주세요.</p></body></html>';
function offlineResponse(navigation) {
  return navigation
    ? new Response(OFFLINE_HTML, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    : new Response('오프라인 상태입니다.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin ||
      !url.pathname.startsWith(new URL('./', self.registration.scope).pathname)) return;

  event.respondWith((async () => {
    const navigate = request.mode === 'navigate';
    const networkFirst = navigate || /\.(?:html|css|js|webmanifest)$/i.test(url.pathname);
    if (networkFirst) {
      try {
        // Promise.race 타임아웃 시에도 늦게 도착한 응답이 캐시를 덮어쓰지 않도록 AbortController 사용.
        const controller = new AbortController();
        let timer;
        try {
          const response = await Promise.race([
            fetch(request, { cache: 'no-cache', signal: controller.signal }),
            new Promise((_, reject) => {
              timer = setTimeout(() => { controller.abort(); reject(new Error('NetworkTimeout')); }, 3000);
            })
          ]);
          if (!response.ok) throw new Error('HTTP ' + response.status);
          try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, response.clone());
          } catch (cacheError) { console.error('캐시 갱신 실패:', cacheError); }
          return response;
        } finally { clearTimeout(timer); }
      } catch (error) {
        console.warn('네트워크 우선 요청 실패, 캐시 사용:', error);
        try {
          const cached = await caches.match(request, { ignoreSearch: true });
          if (cached) return cached;
          // HTML 탐색에만 HTML 셸을 반환하여 JS/CSS 파싱 오류를 피합니다.
          if (navigate) {
            const index = await caches.match('./index.html');
            if (index) return index;
            const root = await caches.match('./');
            if (root) return root;
          }
        } catch (cacheError) { console.error('캐시 조회 실패:', cacheError); }
        return offlineResponse(navigate);
      }
    }
    try {
      const cached = await caches.match(request, { ignoreSearch: true });
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) {
        try {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        } catch (cacheError) { console.error('정적 파일 캐시 저장 실패:', cacheError); }
      }
      return response;
    } catch (error) {
      console.error('정적 파일 요청 실패:', error);
      return offlineResponse(false);
    }
  })().catch((error) => {
    console.error('서비스워커 응답 실패:', error);
    return offlineResponse(request.mode === 'navigate');
  }));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
  } else if (event.data?.type === 'GET_APP_VERSION') {
    event.ports[0]?.postMessage({ version: APP_VERSION, cache: CACHE_NAME });
  }
});
