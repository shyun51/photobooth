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
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];
const OPTIONAL_FRAMES = ['./frames/frame1.png', './frames/frame2.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // 필수 앱 파일 오류는 설치 실패로 취급합니다.
      await cache.addAll(APP_SHELL);
      // 선택 프레임은 없어도 설치를 계속 진행합니다.
      await Promise.all(OPTIONAL_FRAMES.map(async (url) => {
        try {
          await cache.add(url);
        } catch (error) {
          console.warn('선택 프레임 캐시 생략:', url, error);
        }
      }));
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME && (key.startsWith('photobooth-') || key.startsWith('insaeng-necut-shell-'))).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin ||
      !url.pathname.startsWith(new URL('./', self.registration.scope).pathname)) return;

  event.respondWith((async () => {
    try {
      const cached = await caches.match(event.request, { ignoreSearch: true });
      if (cached) return cached;
      if (event.request.mode === 'navigate') {
        const index = await caches.match('./index.html');
        if (index) return index;
        const root = await caches.match('./');
        if (root) return root;
        try {
          return await fetch(event.request);
        } catch (error) {
          console.error('오프라인 페이지 요청 실패:', error);
          return new Response('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>오프라인</title><body><h1>오프라인 상태입니다</h1><p>인터넷에 연결한 뒤 다시 시도해 주세요.</p></body></html>', {
            status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' }
          });
        }
      }
      return await fetch(event.request);
    } catch (error) {
      console.error('서비스워커 요청 처리 실패:', error);
      if (event.request.mode === 'navigate') {
        return new Response('<!doctype html><html lang="ko"><meta charset="utf-8"><body><p>오프라인 상태입니다. 인터넷 연결을 확인해 주세요.</p></body></html>', {
          status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }
      return new Response('오프라인 상태입니다.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
  } else if (event.data?.type === 'GET_APP_VERSION') {
    event.ports[0]?.postMessage({ version: APP_VERSION, cache: CACHE_NAME });
  }
});
