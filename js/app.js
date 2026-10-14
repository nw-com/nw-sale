/**
 * 主應用：路由、殼層、登入頁
 * 全域暴露 NW.App
 */
(function () {
  const NW = window.NW || (window.NW = {});
  const app = document.getElementById("app");

  const NAV = [
    { id: "dashboard", label: "儀表板", icon: "▦", admin: false },
    { id: "projects", label: "項目管理", icon: "📋", admin: false },
    { id: "quotes", label: "報價單", icon: "💰", admin: false },
    { id: "cost", label: "成本分析", icon: "📊", admin: false },
    { id: "settings", label: "帳號設定", icon: "⚙", admin: false },
  ];

  let currentRoute = "dashboard";

  NW.App = {
    navigate(route) {
      currentRoute = route;
      render();
    },
    refresh() { render(); },
  };

  // 監聽 auth 狀態，決定顯示登入頁或主介面
  NW.Auth.onChange((user, role) => {
    render();
  });

  function render() {
    // 偵測分享參數（唯讀頁面，不需登入）
    const params = new URLSearchParams(window.location.search);
    if (params.get("share") === "projects") {
      renderShareView(params);
      return;
    }
    const user = NW.Auth.getUser();
    if (!user) {
      renderLogin();
      return;
    }
    renderShell();
  }

  /* ---------- 分享唯讀頁面 ---------- */
  function renderShareView(params) {
    const raw = params.get("data") || "";
    let payload = null;
    try {
      payload = JSON.parse(decodeURIComponent(raw));
    } catch (e) {
      payload = null;
    }

    app.innerHTML = `
      <div class="share-page">
        <div id="share-content"></div>
      </div>`;

    const container = document.getElementById("share-content");
    if (!payload || !Array.isArray(payload.projects)) {
      container.innerHTML = `
        <div class="readonly-wrap">
          <div class="readonly-header">
            <img src="assets/logo.svg" alt="西北探吉" class="readonly-logo" />
            <h1 class="readonly-title">分享連結無效</h1>
            <p class="readonly-sub">此分享連結已損毀或過期，請重新產生。</p>
          </div>
        </div>`;
      return;
    }

    // 等待 projects.js 載入完成後渲染
    if (NW.Projects && NW.Projects.renderReadOnly) {
      NW.Projects.renderReadOnly(container, payload.projects);
    } else {
      // 延遲一次確保模組載入
      setTimeout(() => {
        if (NW.Projects && NW.Projects.renderReadOnly) {
          NW.Projects.renderReadOnly(container, payload.projects);
        } else {
          container.innerHTML = `<div class="empty">載入失敗，請重新整理頁面</div>`;
        }
      }, 300);
    }
  }

  /* ---------- 登入頁 ---------- */
  function renderLogin() {
    app.innerHTML = `
      <div class="login-page">
        <div class="login-card">
          <img src="assets/logo.svg" alt="西北探吉" class="login-logo" />
          <h1 class="login-title">西北探吉業務平台</h1>
          <p class="login-sub">保全 · 物業管理 · 報價 · 成本分析</p>
          <div class="field">
            <label>電子郵件</label>
            <input type="email" id="login-email" placeholder="your@email.com" autocomplete="username" />
          </div>
          <div class="field">
            <label>密碼</label>
            <input type="password" id="login-pw" placeholder="請輸入密碼" autocomplete="current-password" />
          </div>
          <div class="login-options">
            <label><input type="checkbox" id="login-remember" checked /> 記住我</label>
            <span class="show-pw" id="login-show">顯示密碼</span>
          </div>
          <div class="login-error" id="login-err"></div>
          <button class="btn btn-primary btn-block btn-pulse" id="login-btn">登入</button>
          <div class="login-install" id="install-area" style="display:none">
            <button id="install-btn">⬇ 安裝應用程式</button>
          </div>
        </div>
      </div>`;

    const email = document.getElementById("login-email");
    const pw = document.getElementById("login-pw");
    const remember = document.getElementById("login-remember");
    const showPw = document.getElementById("login-show");
    const btn = document.getElementById("login-btn");
    const err = document.getElementById("login-err");

    showPw.onclick = () => { pw.type = pw.type === "password" ? "text" : "password"; };
    btn.onclick = doLogin;
    pw.onkeydown = (e) => { if (e.key === "Enter") doLogin(); };

    async function doLogin() {
      err.textContent = "";
      if (!email.value || !pw.value) { err.textContent = "請輸入帳號與密碼"; return; }
      btn.disabled = true; btn.textContent = "登入中...";
      try {
        await NW.Auth.login(email.value.trim(), pw.value, remember.checked);
        NW.toast("登入成功", "success");
      } catch (e) {
        err.textContent = mapErr(e.code);
        btn.disabled = false; btn.textContent = "登入";
      }
    }

    // PWA 安裝按鈕
    window.addEventListener("pwa-install-available", () => {
      document.getElementById("install-area").style.display = "block";
    });
    const ib = document.getElementById("install-btn");
    if (ib) ib.onclick = () => { if (window.NW_PWA_PROMPT) window.NW_PWA_PROMPT(); };
  }

  function mapErr(code) {
    const m = {
      "auth/invalid-credential": "帳號或密碼錯誤",
      "auth/user-not-found": "帳號不存在",
      "auth/wrong-password": "密碼錯誤",
      "auth/invalid-email": "電子郵件格式不正確",
      "auth/user-disabled": "此帳號已停用",
      "auth/too-many-requests": "登入嘗試過多，請稍後再試",
      "auth/operation-not-allowed": "電子郵件登入未啟用，請至 Firebase Console 開啟",
    };
    return m[code] || "登入失敗，請稍後再試";
  }

  /* ---------- 主介面 ---------- */
  function renderShell() {
    const user = NW.Auth.getUser();
    const role = NW.Auth.getRole();
    const isAdmin = NW.Auth.isAdmin();
    const data = NW.Auth.getUserData() || {};
    const name = data.displayName || user.email;

    const navItems = NAV.filter((n) => !n.admin || isAdmin);

    app.innerHTML = `
      <div class="app-shell">
        <header class="app-header">
          <div class="brand">
            <img src="assets/logo.svg" alt="西北探吉" />
            <span>西北探吉</span>
          </div>
          <div class="user">
            <span>${name}</span>
            <button class="btn btn-ghost btn-sm" id="logout-btn" style="color:#fff;background:rgba(255,255,255,0.2)">登出</button>
          </div>
        </header>
        <div class="app-body">
          <nav class="sidebar" id="sidebar">
            ${navItems.map((n) => `
              <div class="nav-item ${currentRoute === n.id ? "active" : ""}" data-route="${n.id}">
                <span class="nav-icon">${n.icon}</span>
                <span class="nav-label">${n.label}</span>
              </div>`).join("")}
          </nav>
          <main class="main-content" id="main-content"></main>
        </div>
      </div>`;

    document.getElementById("logout-btn").onclick = doLogout;
    document.querySelectorAll(".nav-item[data-route]").forEach((el) => {
      el.onclick = () => NW.App.navigate(el.dataset.route);
    });

    renderRoute();
  }

  async function doLogout() {
    const ok = await NW.confirm({ title: "登出", message: "確定要登出嗎？" });
    if (ok) {
      await NW.Auth.logout();
      NW.toast("已登出", "info");
    }
  }

  function renderRoute() {
    const main = document.getElementById("main-content");
    if (!main) return;
    main.innerHTML = "";
    switch (currentRoute) {
      case "dashboard":
        if (NW.Dashboard) NW.Dashboard.render(main);
        break;
      case "projects":
        if (NW.Projects) NW.Projects.render(main);
        break;
      case "quotes":
        if (NW.Quotes) NW.Quotes.render(main);
        break;
      case "cost":
        if (NW.CostAnalysis) NW.CostAnalysis.render(main);
        break;
      case "settings":
        if (NW.Users) NW.Users.render(main);
        break;
      default:
        main.innerHTML = `<div class="page-title">頁面不存在</div>`;
    }
  }

  // 預設路由
  window.addEventListener("DOMContentLoaded", () => render());
})();
