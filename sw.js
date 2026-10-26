'use strict';

// 배포 업데이트 시 이 버전을 변경하면 이전 캐시가 삭제됩니다.
const CACHE_NAME = 'insaeng-necut-shell-v4';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
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
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // 다른 출처 및 저장소 범위 밖의 요청에는 관여하지 않습니다.
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL('./', self.registration.scope).pathname)) return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
