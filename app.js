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

// 카메라 스트림은 사용자가 버튼을 누르기 전에는 요청하지 않습니다.
const preview = document.querySelector('#preview');
const startCameraButton = document.querySelector('#start-camera');
const switchCameraButton = document.querySelector('#switch-camera');
const cameraStatus = document.querySelector('#status');
let cameraStream = null;
let facingMode = 'user';
let cameraRequestId = 0;

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
  preview.pause();
  preview.srcObject = null;
}

function resetCameraUI(message) {
  startCameraButton.hidden = false;
  startCameraButton.disabled = false;
  switchCameraButton.hidden = true;
  switchCameraButton.disabled = false;
  cameraStatus.textContent = message;
}

function cameraErrorMessage(error) {
  switch (error.name) {
    case 'NotAllowedError':
      return '카메라 권한이 꺼져 있어요. 설정 → Safari(또는 이 앱) → 카메라에서 허용해 주세요.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return '사용할 수 있는 카메라를 찾지 못했어요.';
    case 'NotReadableError':
      return '다른 앱이 카메라를 사용 중이에요.';
    default:
      return '카메라를 시작하지 못했어요: ' + error.name;
  }
}

async function openCamera(nextFacingMode) {
  const requestId = ++cameraRequestId;
  stopCamera();
  cameraStatus.textContent = '카메라 요청 중...';
  startCameraButton.disabled = true;
  switchCameraButton.disabled = true;

  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new DOMException('카메라 API를 사용할 수 없습니다.', 'NotSupportedError');
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: nextFacingMode,
        width: { ideal: 1280 },
        height: { ideal: 960 }
      },
      audio: false
    });

    // 권한 팝업이 열린 동안 앱이 숨겨지거나 새 요청이 시작됐다면 즉시 해제합니다.
    if (requestId !== cameraRequestId || document.hidden) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    cameraStream = stream;
    preview.srcObject = stream;
    preview.classList.toggle('mirrored', nextFacingMode === 'user');
    await preview.play();

    if (requestId !== cameraRequestId || document.hidden) {
      if (cameraStream === stream) stopCamera();
      else stream.getTracks().forEach((track) => track.stop());
      return;
    }

    facingMode = nextFacingMode;
    startCameraButton.hidden = true;
    switchCameraButton.hidden = false;
    cameraStatus.textContent = nextFacingMode === 'user' ? '전면 카메라 연결 성공' : '후면 카메라 연결 성공';
  } catch (error) {
    console.error('카메라 오류:', error);
    if (requestId !== cameraRequestId || document.hidden) return;
    stopCamera();
    resetCameraUI(cameraErrorMessage(error));
  } finally {
    if (requestId === cameraRequestId && !document.hidden) {
      startCameraButton.disabled = false;
      switchCameraButton.disabled = false;
    }
  }
}

startCameraButton.addEventListener('click', () => openCamera(facingMode));
switchCameraButton.addEventListener('click', () => {
  openCamera(facingMode === 'user' ? 'environment' : 'user');
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    ++cameraRequestId;
    stopCamera();
    resetCameraUI('카메라가 정지됐어요. 카메라 시작을 눌러주세요.');
  } else if (!cameraStream) {
    resetCameraUI('카메라 시작 버튼을 눌러 다시 연결해 주세요.');
  }
});
