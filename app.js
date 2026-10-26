'use strict';

// 전역 오류 진단: 실행 중 예외와 처리되지 않은 Promise 거부를 화면에 표시합니다.
function showGlobalError(message) {
  const box = document.querySelector('#global-error');
  if (!box) return;
  box.textContent = message;
  box.hidden = false;
}
window.addEventListener('error', (e) => {
  const file = e.filename ? e.filename.split('/').pop() : '파일 미상';
  showGlobalError(String(e.message || '알 수 없는 오류') + ' (' + file + ':' + (e.lineno || '?') + ')');
});
window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason;
  showGlobalError('처리되지 않은 Promise 오류: ' + (reason instanceof Error ? reason.stack || reason.message : String(reason)));
});
document.querySelector('#global-error')?.addEventListener('click', (e) => { e.currentTarget.hidden = true; });


// 합성 규격 — 사용자가 여기에서 수정할 수 있습니다.
const OUT_W = 1200, OUT_H = 3600;
const SLOTS = [
  {x:100, y:120,  w:1000, h:750},
  {x:100, y:910,  w:1000, h:750},
  {x:100, y:1700, w:1000, h:750},
  {x:100, y:2490, w:1000, h:750},
];
const FRAMES = [
  {name:'프레임 1', src:'./frames/frame1.png', bg:'#ffffff'},
  {name:'프레임 2', src:'./frames/frame2.png', bg:'#ffe4ec'},
];

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
  resetComposition();
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
  // 촬영 완료에서 기존 썸네일 표시 동작을 유지하며 합성만 추가합니다.
  cameraStatus.textContent = '합성 시작';
  void compose(selectedFrameIndex);
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
    cameraStatus.textContent = '4컷 촬영 완료! 합성을 준비합니다.';
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


// 프레임 합성 단계. shots에는 이미 전면 거울 반전이 적용되어 있습니다.
let resultCanvas = null;
let selectedFrameIndex = 0;
let composeVersion = 0;
const composition = document.querySelector('#composition');
const composeStatus = document.querySelector('#compose-status');
const visibleCanvas = document.querySelector('#result-canvas');
const frameButtons = [...document.querySelectorAll('[data-frame]')];

function resetComposition() {
  ++composeVersion;
  resultCanvas = null;
  composition.hidden = true;
  composeStatus.textContent = '';
  const context = visibleCanvas.getContext('2d');
  if (context) context.clearRect(0, 0, visibleCanvas.width, visibleCanvas.height);
  frameButtons.forEach((button) => { button.disabled = false; });
}

function updateFrameButtons(index) {
  frameButtons.forEach((button, i) => {
    button.setAttribute('aria-pressed', String(index === i));
  });
}

function drawCover(ctx, source, slot) {
  const iw = source.width, ih = source.height;
  if (!iw || !ih || slot.w <= 0 || slot.h <= 0) throw new Error('InvalidImageDimensions');
  const ratio = Math.max(slot.w / iw, slot.h / ih);
  const sw = slot.w / ratio, sh = slot.h / ratio;
  const sx = (iw - sw) / 2, sy = (ih - sh) / 2;
  ctx.drawImage(source, sx, sy, sw, sh, slot.x, slot.y, slot.w, slot.h);
}

function fallbackLabel(ctx) {
  const now = new Date();
  const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('.');
  ctx.save();
  ctx.fillStyle = '#242424';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '42px sans-serif';
  ctx.fillText(date, OUT_W / 2, OUT_H - 240);
  ctx.font = 'bold 76px sans-serif';
  ctx.fillText('인생네컷', OUT_W / 2, OUT_H - 145);
  ctx.restore();
}

async function loadFrame(src) {
  // 실패할 수 있는 선택 리소스: 없으면 기본 프레임을 사용합니다.
  const response = await fetch(src);
  if (!response.ok) throw new Error('FrameHTTP' + response.status);
  const blob = await response.blob();
  return createImageBitmap(blob);
}

async function compose(frameIndex) {
  const version = ++composeVersion;
  if (shots.length !== SLOTS.length) return;
  if (!FRAMES[frameIndex]) return;
  selectedFrameIndex = frameIndex;
  updateFrameButtons(frameIndex);
  composition.hidden = false;
  composeStatus.textContent = '만드는 중...';
  cameraStatus.textContent = '합성 시작 · 만드는 중...';
  frameButtons.forEach((button) => { button.disabled = true; });
  let bitmap = null;
  try {
    cameraStatus.textContent = '합성 1단계: 캔버스 생성';
    const canvas = document.createElement('canvas');
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('CanvasUnavailable');
    ctx.fillStyle = FRAMES[frameIndex].bg;
    ctx.fillRect(0, 0, OUT_W, OUT_H);

    for (let i = 0; i < SLOTS.length; i++) {
      cameraStatus.textContent = '합성 2단계: 사진 그리기 ' + (i + 1) + ' / ' + SLOTS.length;
      bitmap = await createImageBitmap(shots[i]);
      if (version !== composeVersion) return;
      drawCover(ctx, bitmap, SLOTS[i]);
      bitmap.close();
      bitmap = null;
    }

    cameraStatus.textContent = '합성 3단계: 프레임 로드';
    try {
      bitmap = await loadFrame(FRAMES[frameIndex].src);
      if (version !== composeVersion) return;
      ctx.drawImage(bitmap, 0, 0, OUT_W, OUT_H);
    } catch (frameError) {
      console.warn('프레임 PNG를 불러오지 못해 기본 프레임으로 표시합니다:', frameError);
      cameraStatus.textContent = '프레임 파일 없음 · 기본 프레임 적용';
      fallbackLabel(ctx);
    } finally {
      if (bitmap) {
        bitmap.close();
        bitmap = null;
      }
    }

    if (version !== composeVersion) return;
    resultCanvas = canvas;
    const screenCtx = visibleCanvas.getContext('2d');
    if (!screenCtx) throw new Error('PreviewCanvasUnavailable');
    visibleCanvas.width = OUT_W;
    visibleCanvas.height = OUT_H;
    screenCtx.drawImage(resultCanvas, 0, 0);
    composeStatus.textContent = FRAMES[frameIndex].name + ' 합성이 완료됐어요.';
    cameraStatus.textContent = '합성 4단계: 완료';
  } catch (error) {
    console.error('4컷 합성 오류:', error);
    if (version !== composeVersion) return;
    resultCanvas = null;
    composeStatus.textContent = '사진을 합성하지 못했어요. 프레임을 다시 선택해 주세요.';
    cameraStatus.textContent = '합성 오류: 결과를 만들지 못했어요.';
  } finally {
    if (bitmap) bitmap.close();
    if (version === composeVersion) {
      frameButtons.forEach((button) => { button.disabled = false; });
    }
  }
}

frameButtons.forEach((button, index) => {
  button.textContent = FRAMES[index].name;
  button.addEventListener('click', () => {
    if (shots.length === SLOTS.length) void compose(index);
  });
});
updateFrameButtons(selectedFrameIndex);
