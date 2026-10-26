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


// 4컷 연속 촬영: 기존 카메라 시작/전환/오류 코드는 변경하지 않습니다.
const COUNTDOWN_SEC = 3;
const SHOT_COUNT = 4;
const MIRROR_SAVED = true;
const shots = [];
const shootStart = document.querySelector('#shoot-start');
const shootCancel = document.querySelector('#shoot-cancel');
const shootRetry = document.querySelector('#shoot-retry');
const countdown = document.querySelector('#countdown');
const flash = document.querySelector('#flash');
const shotProgress = document.querySelector('#shot-progress');
const shotResults = document.querySelector('#shot-results');
const shotThumbnails = document.querySelector('#shot-thumbnails');
let shootRun = 0;
let shooting = false;
let completed = false;
let pendingSleep = null;
let flashTimer = null;
let thumbnailUrls = [];
let hiddenDuringShoot = false;

function cameraReady() {
  return !!cameraStream && cameraStream.active && !document.hidden &&
    preview.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    preview.videoWidth > 0 && preview.videoHeight > 0;
}

function updateShootReady() {
  shootStart.disabled = shooting || completed || !cameraReady();
}

function releaseThumbnails() {
  thumbnailUrls.forEach((url) => URL.revokeObjectURL(url));
  thumbnailUrls = [];
  shotThumbnails.replaceChildren();
  shotResults.hidden = true;
}

function clearShotData() {
  shots.length = 0;
  releaseThumbnails();
}

function cancelSleep() {
  if (pendingSleep) {
    const cancel = pendingSleep;
    pendingSleep = null;
    cancel();
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingSleep = null;
      resolve();
    }, ms);
    pendingSleep = () => {
      clearTimeout(timer);
      resolve();
    };
  });
}

function ensureCurrent(run) {
  if (run !== shootRun || !shooting || !cameraReady()) {
    throw new Error('ShootCancelled');
  }
}

function clearFlash() {
  clearTimeout(flashTimer);
  flashTimer = null;
  flash.classList.remove('active');
}

function showFlash() {
  clearFlash();
  // 애니메이션을 다시 시작할 수 있도록 reflow.
  void flash.offsetWidth;
  flash.classList.add('active');
  flashTimer = setTimeout(() => {
    flash.classList.remove('active');
    flashTimer = null;
  }, 150);
}

function resetShotControls() {
  countdown.hidden = true;
  countdown.textContent = '';
  shotProgress.hidden = true;
  shootCancel.hidden = true;
  shootRetry.hidden = true;
  shootStart.hidden = false;
  switchCameraButton.disabled = false;
  shooting = false;
  completed = false;
  updateShootReady();
}

function cancelShooting(message = '촬영이 취소됐어요.') {
  ++shootRun;
  cancelSleep();
  clearFlash();
  clearShotData();
  resetShotControls();
  cameraStatus.textContent = message;
}

function captureFrame(run) {
  ensureCurrent(run);
  const width = preview.videoWidth;
  const height = preview.videoHeight;
  if (!width || !height) throw new Error('CameraNotReady');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('CanvasUnavailable');
  if (MIRROR_SAVED && facingMode === 'user') {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(preview, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('BlobUnavailable'));
    }, 'image/jpeg', 0.92);
  });
}

function renderThumbnails() {
  releaseThumbnails();
  shots.forEach((blob, index) => {
    const url = URL.createObjectURL(blob);
    thumbnailUrls.push(url);
    const img = document.createElement('img');
    img.src = url;
    img.alt = `${index + 1}번째 촬영 사진`;
    shotThumbnails.appendChild(img);
  });
  shotResults.hidden = false;
}

async function startShooting() {
  if (shooting || completed) return;
  if (!cameraReady()) {
    cameraStatus.textContent = '카메라가 아직 준비되지 않았어요';
    updateShootReady();
    return;
  }
  const run = ++shootRun;
  clearShotData();
  shooting = true;
  shootStart.disabled = true;
  switchCameraButton.disabled = true;
  shootCancel.hidden = false;
  shootRetry.hidden = true;
  shotProgress.hidden = false;

  try {
    for (let i = 0; i < SHOT_COUNT; i++) {
      ensureCurrent(run);
      shotProgress.textContent = `${i + 1} / ${SHOT_COUNT}`;
      for (let second = COUNTDOWN_SEC; second > 0; second--) {
        ensureCurrent(run);
        countdown.hidden = false;
        countdown.textContent = String(second);
        cameraStatus.textContent = `${i + 1}번째 컷 촬영까지 ${second}초`;
        await sleep(1000);
      }
      ensureCurrent(run);
      countdown.hidden = true;
      const blob = await captureFrame(run);
      ensureCurrent(run);
      shots.push(blob);
      showFlash();
      cameraStatus.textContent = `${i + 1}번째 컷 촬영 완료`;
    }
    ensureCurrent(run);
    shooting = false;
    completed = true;
    shootCancel.hidden = true;
    shootStart.hidden = true;
    shootRetry.hidden = false;
    countdown.hidden = true;
    shotProgress.textContent = `${SHOT_COUNT} / ${SHOT_COUNT}`;
    cameraStatus.textContent = '4컷 촬영 완료!';
    renderThumbnails();
  } catch (error) {
    if (run !== shootRun) return;
    if (error.message === 'CameraNotReady') {
      cancelShooting('카메라가 아직 준비되지 않았어요');
    } else if (error.message === 'ShootCancelled') {
      cancelShooting('카메라 연결이 끊겨 촬영이 취소됐어요.');
    } else {
      console.error('연속 촬영 오류:', error);
      cancelShooting('촬영 중 오류가 발생했어요.');
    }
  } finally {
    if (run === shootRun) updateShootReady();
  }
}

shootStart.addEventListener('click', startShooting);
shootCancel.addEventListener('click', () => cancelShooting());
shootRetry.addEventListener('click', () => {
  cancelShooting('다시 촬영할 준비가 됐어요.');
});
preview.addEventListener('playing', updateShootReady);
preview.addEventListener('loadeddata', updateShootReady);
preview.addEventListener('pause', updateShootReady);
preview.addEventListener('emptied', updateShootReady);
shootStart.addEventListener('focus', updateShootReady);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (shooting) {
      hiddenDuringShoot = true;
      cancelShooting('다른 앱으로 이동하여 촬영이 자동 취소됐어요. 카메라를 다시 시작해 주세요.');
    } else {
      clearShotData();
      if (completed) resetShotControls();
    }
    updateShootReady();
  } else {
    updateShootReady();
    if (hiddenDuringShoot) {
      cameraStatus.textContent = '다른 앱으로 이동하여 촬영이 자동 취소됐어요. 카메라를 다시 시작해 주세요.';
      hiddenDuringShoot = false;
    }
  }
});
updateShootReady();
