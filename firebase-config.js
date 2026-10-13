/**
 * 西北探吉業務平台 - Firebase 設定檔
 * ============================================
 * 請至 https://console.firebase.google.com 建立專案後，
 * 將下列設定替換為您的真實 Firebase 專案設定。
 *
 * 替換步驟：
 * 1. 進入 Firebase Console > 專案設定 > 一般 > 您的應用程式
 * 2. 新增 Web 應用程式，取得 firebaseConfig 設定
 * 3. 將下方對應欄位替換為真實值
 * 4. 於 Authentication 開啟「電子郵件/密碼」登入方式
 * 5. 於 Firestore Database 建立資料庫
 * 6. 部署 firestore.rules（詳見 firebase.json）
 */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBiDYItSJ70TAt9b8zYFEr8ufPaTHqlk_I",
  authDomain: "nw-sale.firebaseapp.com",
  projectId: "nw-sale",
  storageBucket: "nw-sale.firebasestorage.app",
  messagingSenderId: "264690911800",
  appId: "1:264690911800:web:7f32ff3e66e3d25dfd34cd",
  measurementId: "G-YKPDDQR2EF"
};

/**
 * 管理員預設帳號清單
 * 這些 Email 註冊後自動擁有管理員權限
 * 可於此處新增更多管理員 Email
 */
const ADMIN_EMAILS = [
  "istage.eason@gmail.com"
];

// 暴露至全域供其他模組使用
window.FIREBASE_CONFIG = FIREBASE_CONFIG;
window.ADMIN_EMAILS = ADMIN_EMAILS;
