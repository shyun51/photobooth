// Change only this value to update the photobooth's displayed title.
const APP_TITLE = '261029';

document.title = APP_TITLE;
document.querySelector('.brand').textContent = APP_TITLE;
document.querySelector('#heading').textContent = APP_TITLE;
document.querySelector('#composition h2').textContent = APP_TITLE + ' 완성본';
document.querySelector('#save-fallback-image').alt = '완성된 ' + APP_TITLE + ' 이미지';
document.querySelector('meta[name="apple-mobile-web-app-title"]').content = APP_TITLE;
document.querySelector('meta[name="description"]').content = '오프라인에서도 실행되는 ' + APP_TITLE + ' PWA';
