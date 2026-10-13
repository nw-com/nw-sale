/**
 * Firebase 初始化
 * 依賴 firebase-config.js 中的 FIREBASE_CONFIG
 */
(function () {
  if (!window.firebase) {
    console.error("Firebase SDK 未載入，請檢查網路連線");
    return;
  }
  firebase.initializeApp(window.FIREBASE_CONFIG);
  window.db = firebase.firestore();
  window.auth = firebase.auth();
  window.storage = firebase.storage();
  console.log("[Firebase] 初始化完成");
})();
