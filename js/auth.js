/**
 * 認證模組
 * 全域暴露 NW.Auth
 */
(function () {
  const NW = window.NW || (window.NW = {});
  const db = window.db;
  const auth = window.auth;

  let currentUser = null;
  let currentUserRole = null; // "admin" | "sales"
  let currentUserData = null; // Firestore users 文件

  const listeners = new Set();

  function notify() {
    listeners.forEach((fn) => fn(currentUser, currentUserRole, currentUserData));
  }

  /**
   * 登入
   * @param {string} email
   * @param {string} password
   * @param {boolean} remember
   */
  NW.Auth = {
    login(email, password, remember = true) {
      const persistence = remember
        ? firebase.auth.Auth.Persistence.LOCAL
        : firebase.auth.Auth.Persistence.SESSION;
      return auth.setPersistence(persistence).then(() =>
        auth.signInWithEmailAndPassword(email, password)
      );
    },

    logout() {
      return auth.signOut();
    },

    getUser() { return currentUser; },
    getRole() { return currentUserRole; },
    getUserData() { return currentUserData; },
    isAdmin() { return currentUserRole === "admin"; },

    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /** 建立用戶（管理員用） */
    createUser(email, password, displayName, role) {
      // 前端建立用戶（需開啟 Auth 電子郵件登入）
      return auth.createUserWithEmailAndPassword(email, password).then((cred) => {
        return db.collection("users").doc(cred.user.uid).set({
          email,
          displayName: displayName || email,
          role: role || "sales",
          disabled: false,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
      });
    },

    /** 更新用戶角色/停用狀態 */
    updateUser(uid, data) {
      return db.collection("users").doc(uid).update(data);
    },
  };

  // 監聽 Auth 狀態變更
  auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    if (user) {
      try {
        const doc = await db.collection("users").doc(user.uid).get();
        if (doc.exists) {
          currentUserData = { id: doc.id, ...doc.data() };
          // 若在管理員清單中，強制為 admin
          if (window.ADMIN_EMAILS && window.ADMIN_EMAILS.includes(user.email)) {
            currentUserRole = "admin";
            // 同步寫回 Firestore
            if (currentUserData.role !== "admin") {
              db.collection("users").doc(user.uid).update({ role: "admin" });
              currentUserData.role = "admin";
            }
          } else {
            currentUserRole = currentUserData.role || "sales";
          }
          // 檢查停用
          if (currentUserData.disabled) {
            NW.toast("此帳號已停用，請聯絡管理員", "error");
            await auth.signOut();
            currentUser = null;
            currentUserRole = null;
            currentUserData = null;
          }
        } else {
          // 首次登入自動建立用戶文件
          const isAdmin = window.ADMIN_EMAILS && window.ADMIN_EMAILS.includes(user.email);
          const data = {
            email: user.email,
            displayName: user.displayName || user.email,
            role: isAdmin ? "admin" : "sales",
            disabled: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          };
          await db.collection("users").doc(user.uid).set(data);
          currentUserData = { id: user.uid, ...data };
          currentUserRole = data.role;
        }
      } catch (err) {
        console.error("載入用戶資料失敗:", err);
        NW.toast("載入用戶資料失敗: " + err.message, "error");
      }
    } else {
      currentUserRole = null;
      currentUserData = null;
    }
    notify();
  });
})();
