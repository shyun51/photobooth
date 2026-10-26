'use strict';

const network = document.querySelector('#network');
const mode = document.querySelector('#mode');
const feedback = document.querySelector('#feedback');

function updateNetwork() {
  network.textContent = navigator.onLine ? '네트워크 연결됨' : '오프라인 모드';
}

updateNetwork();
window.addEventListener('online', updateNetwork);
window.addEventListener('offline', updateNetwork);

const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
mode.textContent = standalone ? '홈 화면 앱 모드로 실행 중' : 'Safari 공유 메뉴에서 홈 화면에 추가할 수 있습니다.';

document.querySelector('#test-button').addEventListener('click', () => {
  feedback.textContent = '정상 작동합니다!';
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then(() => console.info('서비스워커 등록 완료'))
      .catch((error) => console.error('서비스워커 등록 실패:', error));
  });
}
