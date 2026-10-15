/**
 * 項目管理模組
 * 五階段：公告招標(announce)、領標(bid)、結標(close)、簡報(brief)、進場(enter)
 * 全域暴露 NW.Projects
 */
(function () {
  const NW = window.NW || (window.NW = {});
  const db = window.db;
  let unsub = null;
  let currentView = "list"; // list | detail
  let currentProjectId = null;

  NW.Projects = {
    render(container) {
      if (unsub) { unsub(); unsub = null; }
      currentView = "list";
      currentProjectId = null;
      renderList(container);
    },
    /** 唯讀渲染（用於分享頁面，不需登入） */
    renderReadOnly(container, data) {
      renderReadOnlyList(container, data || []);
    },
  };

  const STAGES = [
    { key: "announce", label: "公告招標" },
    { key: "bid", label: "領標" },
    { key: "submitBid", label: "送標" },
    { key: "close", label: "結標" },
    { key: "brief", label: "簡報" },
    { key: "enter", label: "進場" },
  ];

  const MANPOWER_ROLES = ["總幹事", "副總幹事", "機電", "財秘", "行秘", "保全", "清潔"];

  function renderList(container) {
    const isAdmin = NW.Auth.isAdmin();
    const uid = NW.Auth.getUser().uid;

    container.innerHTML = `
      <div class="page-title">項目管理 <span class="proj-hint">（連續點擊列 3 次可編輯）</span></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div style="display:flex;gap:8px">
          <input id="proj-search" placeholder="搜尋項目名稱或客戶..." style="padding:8px 12px;border:1px solid var(--line);border-radius:var(--radius-sm);min-width:220px" />
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost" id="share-proj" title="分享項目列表到 LINE">🔗 分享</button>
          <button class="btn btn-primary" id="add-proj">+ 新增項目</button>
        </div>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>項目名稱</th><th>客戶</th><th>負責人</th><th>階段</th><th>進場日期</th><th>操作</th>
            </tr></thead>
            <tbody id="proj-body"><tr><td colspan="6" class="empty">載入中...</td></tr></tbody>
          </table>
        </div>
      </div>`;

    document.getElementById("add-proj").onclick = () => showProjectForm();
    document.getElementById("share-proj").onclick = () => shareProjects();
    const search = document.getElementById("proj-search");
    let filter = "";
    search.oninput = () => { filter = search.value.trim().toLowerCase(); refreshList(); };

    let q = db.collection("projects").orderBy("updatedAt", "desc");
    if (!isAdmin) q = db.collection("projects").where("ownerUid", "==", uid).orderBy("updatedAt", "desc");

    unsub = q.onSnapshot((snap) => {
      window._projects = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      refreshList();
    }, (err) => {
      document.getElementById("proj-body").innerHTML = `<tr><td colspan="6" class="empty">載入失敗: ${err.message}</td></tr>`;
    });

    function refreshList() {
      const list = (window._projects || []).filter((p) =>
        !filter || (p.name || "").toLowerCase().includes(filter) || (p.client || "").toLowerCase().includes(filter)
      );
      const body = document.getElementById("proj-body");
      if (!list.length) { body.innerHTML = `<tr><td colspan="6" class="empty">暫無項目</td></tr>`; return; }
      body.innerHTML = list.map((p) => {
        const now = new Date();
        const stageDone = p.stageDone || {};
        const stageTags = STAGES.map((st) => {
          const t = p[st.key];
          const autoDone = t && t.toDate && t.toDate() < now;
          const manual = stageDone[st.key];
          const done = !!manual || autoDone;
          // 結標到期未手動完成 → 紅色（過期）；其餘階段完成 → 綠色
          const isExpired = st.key === "close" && autoDone && !manual;
          const badgeCls = isExpired ? "badge-stage-expired" : (done ? "badge-stage-done" : "badge-stage-pending");
          const byName = manual ? manual.by : "";
          return `
            <div class="stage-tag-wrap">
              <span class="badge ${badgeCls} stage-clickable"
                    data-pid="${p.id}" data-stage="${st.key}" title="${st.label}">
                ${st.label}${manual ? " ✓" : ""}
              </span>
              ${byName ? `<span class="stage-by">${byName}</span>` : ""}
            </div>`;
        }).join("");
        return `
        <tr data-id="${p.id}" class="proj-row">
          <td data-label="項目名稱"><a href="#" data-id="${p.id}" class="proj-link">${p.name || "(未命名)"}</a></td>
          <td data-label="客戶">${p.client || "-"}</td>
          <td data-label="負責人">${p.ownerName || "-"}</td>
          <td data-label="階段"><div class="stage-tags">${stageTags}</div></td>
          <td data-label="進場日期">${NW.formatDate(p.enter) || "-"}</td>
          <td data-label="操作" class="col-actions">
            <div class="file-buttons">
              <button class="file-icon-btn info-btn" data-view-info="${p.id}" title="專案資訊">
                <span class="file-icon">ℹ️</span>
                <span class="file-label">資訊</span>
              </button>
              <button class="file-icon-btn ${(p.quoteImages || []).length ? "has-file" : "no-file"}" data-view-quote="${p.id}" title="報價單圖片 (${(p.quoteImages || []).length}/5)">
                <span class="file-icon">📄</span>
                <span class="file-label">報價單</span>
                <span class="file-count">${(p.quoteImages || []).length}/5</span>
              </button>
              <button class="file-icon-btn ${(p.feedbackImages || []).length ? "has-file" : "no-file"}" data-view-feedback="${p.id}" title="回饋項目圖片 (${(p.feedbackImages || []).length}/5)">
                <span class="file-icon">📝</span>
                <span class="file-label">回饋項目</span>
                <span class="file-count">${(p.feedbackImages || []).length}/5</span>
              </button>
            </div>
          </td>
        </tr>`;
      }).join("");
      body.querySelectorAll(".proj-link").forEach((a) => a.onclick = (e) => { e.preventDefault(); showDetail(a.dataset.id); });
      body.querySelectorAll(".proj-row").forEach((tr) => bindTripleClick(tr, () => showProjectForm(tr.dataset.id)));
      body.querySelectorAll(".stage-clickable").forEach((sp) => sp.onclick = (e) => { e.stopPropagation(); showStageModal(sp.dataset.pid, sp.dataset.stage); });
      body.querySelectorAll("[data-view-info]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); showProjectInfo(b.dataset.viewInfo); });
      body.querySelectorAll("[data-view-quote]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); viewProjectImages(b.dataset.viewQuote, "quote"); });
      body.querySelectorAll("[data-view-feedback]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); viewProjectImages(b.dataset.viewFeedback, "feedback"); });
    }
  }

  /** 階段編輯小視窗：日期時間 + 完成勾選 */
  async function showStageModal(pid, stageKey) {
    const doc = await db.collection("projects").doc(pid).get();
    const p = doc.data() || {};
    const stage = STAGES.find((s) => s.key === stageKey);
    const stageDone = p.stageDone || {};
    const manual = stageDone[stageKey];
    const currentDate = p[stageKey];
    const userName = (NW.Auth.getUserData() && NW.Auth.getUserData().displayName) || NW.Auth.getUser().email;

    NW.modal({
      title: stage.label,
      body: `
        <div class="form-grid" style="gap:12px">
          <div>
            <label>日期時間</label>
            <input type="datetime-local" id="stage-date" value="${toLocalInput(currentDate)}" />
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <label style="margin:0;cursor:pointer;display:flex;align-items:center;gap:6px">
              <input type="checkbox" id="stage-done" ${manual ? "checked" : ""} style="width:18px;height:18px" />
              <span>標記為完成</span>
            </label>
          </div>
          ${manual ? `<div class="full" style="font-size:13px;color:var(--ink-2)">完成人：${manual.by}${manual.at ? `（${NW.formatDT(manual.at)}）` : ""}</div>` : ""}
        </div>`,
      confirmText: "儲存",
      cancelText: "取消",
      onConfirm: async (close) => {
        const dateVal = document.getElementById("stage-date").value;
        const doneChecked = document.getElementById("stage-done").checked;
        const update = {};
        update[stageKey] = parseDT(dateVal);
        const newStageDone = { ...stageDone };
        if (doneChecked) {
          newStageDone[stageKey] = {
            by: userName,
            at: firebase.firestore.FieldValue.serverTimestamp(),
          };
        } else {
          delete newStageDone[stageKey];
        }
        update.stageDone = newStageDone;
        update.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
        await db.collection("projects").doc(pid).update(update);
        NW.toast("已更新", "success");
        close();
      },
    });
  }

  /* ---------- 連續快按 3 次輔助 ---------- */
  function bindTripleClick(el, callback, windowMs = 800) {
    let clicks = [];
    let feedbackTimer = null;

    const handle = (e) => {
      if (e.target.closest(".file-icon-btn") || e.target.closest(".proj-link") || e.target.closest(".stage-clickable")) return;

      const now = Date.now();
      clicks = clicks.filter((t) => now - t < windowMs);
      clicks.push(now);

      if (clicks.length >= 3) {
        clicks = [];
        el.classList.remove("triple-clicking");
        if (feedbackTimer) { clearTimeout(feedbackTimer); feedbackTimer = null; }
        callback();
        return;
      }

      el.classList.add("triple-clicking");
      if (feedbackTimer) clearTimeout(feedbackTimer);
      feedbackTimer = setTimeout(() => {
        el.classList.remove("triple-clicking");
        clicks = [];
      }, windowMs);
    };

    el.addEventListener("click", handle);
  }

  /* ---------- 新增/編輯表單 ---------- */
  async function showProjectForm(id) {
    const isEdit = !!id;
    let data = {};
    if (isEdit) {
      const doc = await db.collection("projects").doc(id).get();
      data = doc.data() || {};
    }
    const isAdmin = NW.Auth.isAdmin();

    // 載入所有帳號姓名，供負責人下拉選擇
    const usersSnap = await db.collection("users").get();
    const allUsers = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const currentUserName = (NW.Auth.getUserData() && NW.Auth.getUserData().displayName) || NW.Auth.getUser().email;
    const ownerDefault = data.ownerName || currentUserName;

    // 圖片上傳狀態（正規化：確保每張圖片都是 {url, name} 物件，避免舊格式造成 Firestore 錯誤）
    const quoteImages = (data.quoteImages || []).map(normalizeImage);
    const feedbackImages = (data.feedbackImages || []).map(normalizeImage);
    const pendingQuote = []; // 待上傳的 File 物件
    const pendingFeedback = [];
    const removingQuote = new Set(); // 待刪除的 URL
    const removingFeedback = new Set();

    NW.modal({
      title: isEdit ? "編輯項目" : "新增項目",
      large: true,
      body: `
        <div class="form-grid">
          <div><label>項目名稱 *</label><input id="f-name" value="${data.name || ""}" /></div>
          <div><label>客戶/社區</label><input id="f-client" value="${data.client || ""}" /></div>
          <div><label>戶數</label><input type="number" min="0" id="f-households" value="${data.households || ""}" placeholder="例如：120" /></div>
          <div><label>屋齡 (年)</label><input type="number" min="0" id="f-buildingAge" value="${data.buildingAge || ""}" placeholder="例如：15" /></div>
          <div><label>接洽對象</label><input id="f-contact" value="${data.contact || ""}" placeholder="接洽窗口姓名/職稱" /></div>
          <div><label>社區對象</label><input id="f-community" value="${data.community || ""}" placeholder="社區管理委員會等" /></div>
          <div><label>負責人</label>
            ${isAdmin ? `
              <select id="f-owner">
                ${allUsers.map((u) => {
                  const nm = u.displayName || u.email;
                  return `<option value="${nm}" ${nm === ownerDefault ? "selected" : ""}>${nm}</option>`;
                }).join("")}
              </select>
            ` : `<input value="${currentUserName}" disabled />`}
          </div>
          <div><label>狀態</label>
            <select id="f-status">
              ${["pending", "progress", "done", "cancel"].map((s) => `<option value="${s}" ${data.status === s ? "selected" : ""}>${statusText(s)}</option>`).join("")}
            </select>
          </div>
          <div class="full">
            <label>需求人力</label>
            <div class="manpower-grid">
              ${MANPOWER_ROLES.map((r) => `
                <div class="manpower-item">
                  <label class="manpower-label">${r}</label>
                  <input type="number" min="0" id="f-mp-${r}" value="${(data.manpower && data.manpower[r]) || 0}" />
                </div>
              `).join("")}
            </div>
          </div>
          ${STAGES.map((st) => `
            <div><label>${st.label}</label>
              <input type="datetime-local" id="f-${st.key}" value="${toLocalInput(data[st.key])}" />
            </div>`).join("")}
          <div><label>提醒時間</label><input type="datetime-local" id="f-reminder" value="${toLocalInput(data.reminder)}" /></div>
          <div class="full"><label>備註</label><textarea id="f-note" rows="2">${data.note || ""}</textarea></div>

          <div class="full">
            <label>報價單圖片 <span class="hint">（最多 5 張）</span></label>
            <div class="img-upload-area" id="quote-area">
              <div class="img-grid" id="quote-grid"></div>
              <label class="img-add-btn" id="quote-add">
                <input type="file" accept="image/*" multiple id="quote-input" hidden />
                <span>+ 新增圖片</span>
              </label>
            </div>
          </div>

          <div class="full">
            <label>回饋項目圖片 <span class="hint">（最多 5 張）</span></label>
            <div class="img-upload-area" id="feedback-area">
              <div class="img-grid" id="feedback-grid"></div>
              <label class="img-add-btn" id="feedback-add">
                <input type="file" accept="image/*" multiple id="feedback-input" hidden />
                <span>+ 新增圖片</span>
              </label>
            </div>
          </div>
          ${isEdit && isAdmin ? `
          <div class="full" style="margin-top:16px;text-align:right">
            <button class="btn btn-danger" id="modal-delete-btn" type="button">🗑 刪除項目</button>
          </div>` : ""}
        </div>`,
      onConfirm: async (close) => {
        const name = document.getElementById("f-name").value.trim();
        if (!name) { NW.toast("請輸入項目名稱", "error"); return; }

        try {
          // 上傳新圖片（轉為 Base64 存入 Firestore）
          let quoteList = sanitizeImages(quoteImages.filter((img) => img && !removingQuote.has(img.url)));
          let feedbackList = sanitizeImages(feedbackImages.filter((img) => img && !removingFeedback.has(img.url)));

          if (pendingQuote.length > 0) {
            NW.toast("處理報價單圖片中...", "info");
            const uploaded = await uploadImages(pendingQuote, "quote");
            quoteList = sanitizeImages(quoteList.concat(uploaded));
          }
          if (pendingFeedback.length > 0) {
            NW.toast("處理回饋項目圖片中...", "info");
            const uploaded = await uploadImages(pendingFeedback, "feedback");
            feedbackList = sanitizeImages(feedbackList.concat(uploaded));
          }

          const payload = {
            name,
            client: document.getElementById("f-client").value.trim(),
            households: parseInt(document.getElementById("f-households").value, 10) || 0,
            buildingAge: parseInt(document.getElementById("f-buildingAge").value, 10) || 0,
            contact: document.getElementById("f-contact").value.trim(),
            community: document.getElementById("f-community").value.trim(),
            status: document.getElementById("f-status").value,
            note: document.getElementById("f-note").value,
            reminder: parseDT(document.getElementById("f-reminder").value),
            quoteImages: quoteList,
            feedbackImages: feedbackList,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          };
          // 需求人力
          const manpower = {};
          MANPOWER_ROLES.forEach((r) => { manpower[r] = parseInt(document.getElementById(`f-mp-${r}`).value, 10) || 0; });
          payload.manpower = manpower;
          STAGES.forEach((st) => { payload[st.key] = parseDT(document.getElementById(`f-${st.key}`).value); });
          if (isAdmin) {
            payload.ownerName = document.getElementById("f-owner").value.trim() || currentUserName;
          }
          if (!isEdit) {
            payload.ownerUid = NW.Auth.getUser().uid;
            payload.ownerName = isAdmin ? (payload.ownerName) : NW.Auth.getUserData().displayName;
            payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection("projects").add(payload);
            NW.toast("項目已建立", "success");
          } else {
            await db.collection("projects").doc(id).update(payload);
            NW.toast("項目已更新", "success");
          }
          close();
        } catch (err) {
          console.error("儲存失敗:", err);
          NW.toast("儲存失敗: " + (err.message || err), "error");
        }
      },
    });

    // 綁定圖片上傳事件
    bindImageUpload("quote", quoteImages, pendingQuote, removingQuote);
    bindImageUpload("feedback", feedbackImages, pendingFeedback, removingFeedback);
    renderImgGrid("quote", quoteImages, removingQuote);
    renderImgGrid("feedback", feedbackImages, removingFeedback);

    // 綁定刪除按鈕（僅管理員可見）
    const delBtn = document.getElementById("modal-delete-btn");
    if (delBtn) {
      delBtn.onclick = async () => {
        const ok = await NW.confirm({ title: "刪除項目", message: "確定要刪除此項目嗎？相關報價單與文件將保留。", confirmText: "刪除" });
        if (!ok) return;
        await db.collection("projects").doc(id).delete();
        NW.toast("項目已刪除", "success");
        // 關閉 modal
        const overlay = delBtn.closest(".modal-overlay");
        if (overlay) overlay.remove();
      };
    }
  }

  /** 綁定圖片上傳邏輯 */
  function bindImageUpload(type, existing, pending, removing) {
    const input = document.getElementById(`${type}-input`);
    const addBtn = document.getElementById(`${type}-add`);
    if (!input) return;
    input.onchange = () => {
      const files = Array.from(input.files || []);
      const currentCount = existing.filter((img) => !removing.has(img.url)).length + pending.length;
      const available = 5 - currentCount;
      if (available <= 0) {
        NW.toast(`每個項目最多 5 張${type === "quote" ? "報價單" : "回饋項目"}圖片`, "error");
        input.value = "";
        return;
      }
      const toAdd = files.slice(0, available);
      pending.push(...toAdd);
      renderImgGrid(type, existing, removing, pending);
      input.value = "";
      if (files.length > available) {
        NW.toast(`已超過上限，只保留前 ${available} 張`, "info");
      }
    };
  }

  /** 渲染圖片預覽網格 */
  function renderImgGrid(type, existing, removing, pending = []) {
    const grid = document.getElementById(`${type}-grid`);
    const addBtn = document.getElementById(`${type}-add`);
    if (!grid) return;

    const items = [];
    // 既有圖片
    existing.forEach((img, idx) => {
      if (removing.has(img.url)) return;
      items.push({ url: img.url, idx, source: "existing" });
    });
    // 待上傳圖片（用 blob URL 預覽）
    pending.forEach((file, idx) => {
      items.push({ url: URL.createObjectURL(file), idx, source: "pending", file });
    });

    grid.innerHTML = items.map((it) => `
      <div class="img-thumb" data-source="${it.source}" data-idx="${it.idx}">
        <img src="${it.url}" alt="" />
        <button class="img-remove" data-idx="${it.idx}" data-source="${it.source}">✕</button>
      </div>`).join("");

    // 控制新增按鈕顯示
    const addVisible = items.length < 5;
    addBtn.style.display = addVisible ? "inline-flex" : "none";

    // 綁定刪除
    grid.querySelectorAll(".img-remove").forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const source = btn.dataset.source;
        const idx = parseInt(btn.dataset.idx, 10);
        if (source === "existing") {
          removing.add(existing[idx].url);
        } else {
          pending.splice(idx, 1);
        }
        renderImgGrid(type, existing, removing, pending);
      };
    });
  }

  /** 將圖片檔案轉為 Base64 Data URL（存儲於 Firestore，不使用 Cloud Storage） */
  async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /** 上傳圖片：轉為 Base64 後直接存入 Firestore，回傳 {url, name} 陣列 */
  async function uploadImages(files, folder) {
    const results = [];
    for (const file of files) {
      const base64 = await fileToBase64(file);
      results.push({ url: base64, name: file.name });
    }
    return results;
  }

  function extractName(url) {
    try {
      return decodeURIComponent(url.split("/").pop().split("?")[0]);
    } catch { return ""; }
  }

  /* ---------- 詳情頁 ---------- */
  async function showDetail(id) {
    currentProjectId = id;
    const main = document.getElementById("main-content");
    main.innerHTML = `<div class="empty">載入中...</div>`;
    const doc = await db.collection("projects").doc(id).get();
    if (!doc.exists) { main.innerHTML = `<div class="empty">項目不存在</div>`; return; }
    const p = { id: doc.id, ...doc.data() };
    const now = new Date();

    main.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div>
          <button class="btn btn-ghost btn-sm" id="back">← 返回列表</button>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" id="edit-proj">編輯</button>
          <button class="btn btn-primary btn-sm" id="doc-proposal">企畫書</button>
          <button class="btn btn-primary btn-sm" id="doc-feedback">回饋計畫</button>
          <button class="btn btn-success btn-sm" id="new-quote">新增報價單</button>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <div>
            <h2 style="font-size:20px">${p.name}</h2>
            <div style="color:var(--ink-2);font-size:13px;margin-top:4px">客戶：${p.client || "-"} ｜ 負責人：${p.ownerName || "-"} ｜ <span class="badge badge-${p.status || "pending"}">${statusText(p.status)}</span></div>
          </div>
        </div>
        <div class="timeline">
          ${STAGES.map((st) => {
            const t = p[st.key];
            const stageDone = p.stageDone || {};
            const manual = stageDone[st.key];
            const autoDone = t && t.toDate && t.toDate() < now;
            const done = !!manual || autoDone;
            const isExpired = st.key === "close" && autoDone && !manual;
            return `<div class="stage ${isExpired ? "expired" : (done ? "done" : "")}">
              <div class="stage-name">${st.label}${manual ? " ✓" : ""}</div>
              <div class="stage-date">${NW.formatDT(t) || "未設定"}</div>
              ${manual ? `<div class="stage-by">完成人：${manual.by}</div>` : ""}
            </div>`;
          }).join("")}
        </div>
        ${p.note ? `<div style="margin-top:12px;color:var(--ink-2)">備註：${p.note}</div>` : ""}
      </div>
      <div id="quotes-list"></div>`;

    document.getElementById("back").onclick = () => renderList(main);
    document.getElementById("edit-proj").onclick = () => showProjectForm(id);
    document.getElementById("doc-proposal").onclick = () => NW.Documents.open(id, "proposal");
    document.getElementById("doc-feedback").onclick = () => NW.Documents.open(id, "feedback");
    document.getElementById("new-quote").onclick = () => NW.Quotes.openForm(id);

    // 載入此項目的報價單
    db.collection("quotes").where("projectId", "==", id).get().then((snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const box = document.getElementById("quotes-list");
      if (!list.length) { box.innerHTML = ""; return; }
      box.innerHTML = `
        <div class="card" style="margin-top:16px">
          <div class="card-header"><div class="card-title">報價單 (${list.length})</div></div>
          <div class="table-wrap"><table><thead><tr><th>公司類型</th><th>總價</th><th>建立時間</th><th>操作</th></tr></thead>
          <tbody>${list.map((q) => `<tr>
            <td data-label="公司類型">${q.companyType === "security" ? "西北保全" : "西北公寓大廈管理維護"}</td>
            <td data-label="總價">${NW.formatMoney(q.total)}</td>
            <td data-label="建立時間">${NW.formatDT(q.createdAt)}</td>
            <td data-label="操作"><button class="btn btn-ghost btn-sm" data-view-q="${q.id}">檢視</button></td>
          </tr>`).join("")}</tbody></table></div>
        </div>`;
      box.querySelectorAll("[data-view-q]").forEach((b) => b.onclick = () => NW.Quotes.view(b.dataset.viewQ));
    });
  }

  async function delProject(id) {
    const ok = await NW.confirm({ title: "刪除項目", message: "確定要刪除此項目嗎？相關報價單與文件將保留。", confirmText: "刪除" });
    if (!ok) return;
    await db.collection("projects").doc(id).delete();
    NW.toast("項目已刪除", "success");
  }

  /** 檢視項目的圖片（燈箱模式：單張顯示、可縮放、可左右滑動切換） */
  async function viewProjectImages(id, type) {
    const doc = await db.collection("projects").doc(id).get();
    const p = doc.data() || {};
    const images = sanitizeImages(type === "quote" ? (p.quoteImages || []) : (p.feedbackImages || []));
    const title = type === "quote" ? "報價單圖片" : "回饋項目圖片";
    const approvalField = type === "quote" ? "quoteApproval" : "feedbackApproval";
    const approval = p[approvalField] || { status: "pending" };
    openImageLightbox(images, title, {
      projectId: id,
      type,
      approval,
      canApprove: NW.Auth.canApprove(),
      onApprove: async (status, note) => {
        await db.collection("projects").doc(id).update({
          [approvalField]: {
            status,
            note: note || "",
            by: NW.Auth.getUserData()?.displayName || NW.Auth.getUser()?.email || "",
            at: firebase.firestore.FieldValue.serverTimestamp(),
          },
        });
        NW.toast(status === "approved" ? "已審核通過" : "已標記未通過", "success");
      },
    });
  }

  /** 審核狀態標籤設定 */
  const APPROVAL_STATUS = {
    pending: { label: "審核中", cls: "approval-pending" },
    approved: { label: "審核通過", cls: "approval-approved" },
    rejected: { label: "未通過", cls: "approval-rejected" },
  };

  /** 產生燈箱中的審核列 HTML */
  function renderApprovalBar(opts, lbId) {
    if (!opts.approval) return "";
    const approval = opts.approval;
    const status = approval.status || "pending";
    const st = APPROVAL_STATUS[status] || APPROVAL_STATUS.pending;
    const by = approval.by || "";
    const at = approval.at ? NW.formatDT(approval.at) : "";
    const note = approval.note || "";

    // 可審核者（管理員/主管）顯示操作按鈕；其餘僅顯示狀態
    if (opts.canApprove) {
      return `
        <div class="approval-bar" id="${lbId}-approval">
          <div class="approval-status">
            <span class="approval-badge ${st.cls}">${st.label}</span>
            ${by ? `<span class="approval-meta">${by}${at ? ` · ${at}` : ""}</span>` : ""}
          </div>
          <div class="approval-actions">
            <button class="approval-btn approval-btn-approve" data-approve="approved">✓ 審核通過</button>
            <button class="approval-btn approval-btn-reject" data-approve="rejected">✕ 未通過</button>
          </div>
          ${note ? `<div class="approval-note">備註：${note}</div>` : ""}
        </div>`;
    }
    // 一般使用者（業務）僅顯示狀態
    return `
      <div class="approval-bar" id="${lbId}-approval">
        <div class="approval-status">
          <span class="approval-badge ${st.cls}">${st.label}</span>
          ${by ? `<span class="approval-meta">${by}${at ? ` · ${at}` : ""}</span>` : ""}
        </div>
        ${note ? `<div class="approval-note">備註：${note}</div>` : ""}
      </div>`;
  }

  /** 以圖片陣列直接開啟燈箱（用於分享頁面） */
  function openImageLightbox(images, title, opts) {
    opts = opts || {};
    if (!images || !images.length) {
      NW.modal({
        title: title,
        body: `<div class="empty" style="padding:24px;text-align:center;color:var(--ink-2)">暫無圖片</div>`,
        onConfirm: (close) => close(),
        confirmText: "關閉",
        cancelText: "關閉",
      });
      return;
    }

    // 建立自訂燈箱（90% 視窗大小）
    const lbId = "lb-" + Date.now();
    const overlay = document.createElement("div");
    overlay.className = "lightbox-overlay";
    overlay.id = lbId;
    overlay.innerHTML = `
      <div class="lightbox-shell">
        <div class="lightbox-header">
          <span class="lightbox-title">${title}</span>
          <span class="lightbox-counter"><span class="lb-cur">1</span> / ${images.length}</span>
          <button class="lightbox-close" aria-label="關閉">✕</button>
        </div>
        <div class="lightbox-stage" id="${lbId}-stage">
          <button class="lb-nav lb-prev" aria-label="上一張">‹</button>
          <div class="lightbox-viewport" id="${lbId}-vp">
            <img class="lightbox-img" src="${images[0].url}" alt="${images[0].name || ""}" />
          </div>
          <button class="lb-nav lb-next" aria-label="下一張">›</button>
        </div>
        ${renderApprovalBar(opts, lbId)}
        <div class="lightbox-footer">
          <button class="lb-zoom-out" aria-label="縮小">−</button>
          <span class="lb-zoom-level">100%</span>
          <button class="lb-zoom-in" aria-label="放大">+</button>
          <button class="lb-zoom-reset" aria-label="重設">重設</button>
        </div>
      </div>`;
    document.getElementById("modal-root").appendChild(overlay);

    // 審核按鈕事件（僅管理員/主管可操作）
    if (opts.canApprove && opts.onApprove) {
      const approveBtns = overlay.querySelectorAll("[data-approve]");
      approveBtns.forEach((btn) => {
        btn.onclick = async (e) => {
          e.stopPropagation();
          const status = btn.dataset.approve;
          const ok = await NW.confirm({
            title: status === "approved" ? "審核通過" : "標記未通過",
            message: `確定要將此${opts.type === "quote" ? "報價單" : "回饋項目"}標記為「${status === "approved" ? "審核通過" : "未通過"}」嗎？`,
          });
          if (!ok) return;
          btn.disabled = true;
          try {
            await opts.onApprove(status, "");
            // 更新審核列顯示
            const approvalBar = overlay.querySelector(".approval-bar");
            if (approvalBar) {
              const newApproval = { status, by: NW.Auth.getUserData()?.displayName || NW.Auth.getUser()?.email || "", at: new Date() };
              approvalBar.outerHTML = renderApprovalBar({ ...opts, approval: newApproval }, lbId);
            }
          } catch (err) {
            NW.toast("審核失敗: " + (err.message || err), "error");
            btn.disabled = false;
          }
        };
      });
    }

    // 狀態
    let cur = 0;
    let scale = 1;
    let translateX = 0;
    let translateY = 0;
    const vp = overlay.querySelector(".lightbox-viewport");
    const imgEl = overlay.querySelector(".lightbox-img");
    const counterCur = overlay.querySelector(".lb-cur");
    const zoomLevelEl = overlay.querySelector(".lb-zoom-level");

    function updateImg() {
      imgEl.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
      zoomLevelEl.textContent = Math.round(scale * 100) + "%";
    }

    function showIdx(idx) {
      cur = (idx + images.length) % images.length;
      scale = 1; translateX = 0; translateY = 0;
      imgEl.src = images[cur].url;
      imgEl.alt = images[cur].name || "";
      counterCur.textContent = cur + 1;
      updateImg();
    }

    function zoomBy(factor) {
      scale = Math.min(5, Math.max(0.3, scale * factor));
      updateImg();
    }

    function resetZoom() {
      scale = 1; translateX = 0; translateY = 0;
      updateImg();
    }

    // 關閉
    function close() { overlay.remove(); }
    overlay.querySelector(".lightbox-close").onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };

    // 上下張按鈕
    overlay.querySelector(".lb-prev").onclick = (e) => { e.stopPropagation(); showIdx(cur - 1); };
    overlay.querySelector(".lb-next").onclick = (e) => { e.stopPropagation(); showIdx(cur + 1); };

    // 縮放按鈕
    overlay.querySelector(".lb-zoom-in").onclick = (e) => { e.stopPropagation(); zoomBy(1.25); };
    overlay.querySelector(".lb-zoom-out").onclick = (e) => { e.stopPropagation(); zoomBy(0.8); };
    overlay.querySelector(".lb-zoom-reset").onclick = (e) => { e.stopPropagation(); resetZoom(); };

    // 鍵盤操作
    function onKey(e) {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") showIdx(cur - 1);
      else if (e.key === "ArrowRight") showIdx(cur + 1);
      else if (e.key === "+" || e.key === "=") zoomBy(1.25);
      else if (e.key === "-" || e.key === "_") zoomBy(0.8);
    }
    document.addEventListener("keydown", onKey);
    overlay._onKey = onKey;
    const origClose = close;
    overlay.close = function () { document.removeEventListener("keydown", onKey); origClose(); };

    // 滑鼠滾輪縮放
    vp.addEventListener("wheel", (e) => {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.1 : 0.9);
    }, { passive: false });

    // 雙擊重設縮放
    vp.addEventListener("dblclick", () => resetZoom());

    // 滑動/拖曳手勢（切換圖片 + 拖曳平移 + 雙指縮放）
    let startX = 0, startY = 0, curX = 0, curY = 0;
    let dragging = false, moved = false;
    const SWIPE_THRESHOLD = 60;

    function onStart(x, y) {
      startX = x; startY = y; curX = x; curY = y;
      dragging = true; moved = false;
    }
    function onMove(x, y) {
      if (!dragging) return;
      curX = x; curY = y;
      const dx = curX - startX;
      const dy = curY - startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
      if (scale > 1) {
        imgEl.style.transition = "none";
        imgEl.style.transform = `translate(${translateX + dx}px, ${translateY + dy}px) scale(${scale})`;
      } else {
        imgEl.style.transition = "none";
        imgEl.style.transform = `translateX(${dx}px) scale(${scale})`;
      }
    }
    function onEnd() {
      if (!dragging) return;
      dragging = false;
      const dx = curX - startX;
      const dy = curY - startY;
      if (scale > 1) {
        translateX += dx; translateY += dy;
        updateImg();
      } else {
        imgEl.style.transition = "";
        if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
          if (dx < 0) showIdx(cur + 1);
          else showIdx(cur - 1);
        } else {
          resetZoom();
        }
      }
    }

    // ---------- 觸控手勢（支援單指滑動/拖曳 + 雙指縮放/平移） ----------
    const pointers = new Map(); // touchId -> {x, y}
    let pinchMode = false;
    let pinchStartDist = 0;
    let pinchStartScale = 1;
    let pinchStartMidX = 0, pinchStartMidY = 0;
    let pinchStartTransX = 0, pinchStartTransY = 0;

    function touchDist(t1, t2) {
      const dx = t1.x - t2.x;
      const dy = t1.y - t2.y;
      return Math.sqrt(dx * dx + dy * dy);
    }

    vp.addEventListener("touchstart", (e) => {
      for (const t of e.changedTouches) {
        pointers.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
      if (pointers.size >= 2) {
        // 進入雙指縮放模式
        pinchMode = true;
        const pts = Array.from(pointers.values()).slice(0, 2);
        pinchStartDist = touchDist(pts[0], pts[1]);
        pinchStartScale = scale;
        pinchStartMidX = (pts[0].x + pts[1].x) / 2;
        pinchStartMidY = (pts[0].y + pts[1].y) / 2;
        pinchStartTransX = translateX;
        pinchStartTransY = translateY;
        imgEl.style.transition = "none";
      } else if (pointers.size === 1) {
        const pt = pointers.values().next().value;
        onStart(pt.x, pt.y);
      }
    }, { passive: true });

    vp.addEventListener("touchmove", (e) => {
      for (const t of e.changedTouches) {
        pointers.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
      if (pinchMode && pointers.size >= 2) {
        e.preventDefault();
        const pts = Array.from(pointers.values()).slice(0, 2);
        const dist = touchDist(pts[0], pts[1]);
        // 縮放：以初始距離比例計算新 scale
        const newScale = Math.min(5, Math.max(0.3, pinchStartScale * (dist / pinchStartDist)));
        scale = newScale;
        // 平移：以雙指中心位移平移圖片
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        translateX = pinchStartTransX + (midX - pinchStartMidX);
        translateY = pinchStartTransY + (midY - pinchStartMidY);
        imgEl.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
        zoomLevelEl.textContent = Math.round(scale * 100) + "%";
      } else if (pointers.size === 1 && !pinchMode) {
        e.preventDefault();
        const pt = pointers.values().next().value;
        onMove(pt.x, pt.y);
      }
    }, { passive: false });

    vp.addEventListener("touchend", (e) => {
      for (const t of e.changedTouches) {
        pointers.delete(t.identifier);
      }
      if (pointers.size < 2) {
        // 結束雙指模式
        if (pinchMode) {
          pinchMode = false;
          // 若縮放回到接近 1，則重置平移
          if (scale <= 1.01) resetZoom();
          else updateImg();
        }
      }
      if (pointers.size === 0) {
        // 所有手指離開，若不是雙指模式則處理單指結束
        if (!pinchMode) onEnd();
      } else if (pointers.size === 1 && !pinchMode) {
        // 從雙指變單指（或本來單指），重置單指起點
        const pt = pointers.values().next().value;
        onStart(pt.x, pt.y);
      }
    }, { passive: true });

    vp.addEventListener("touchcancel", () => {
      pointers.clear();
      pinchMode = false;
      if (dragging) onEnd();
    }, { passive: true });

    // 滑鼠拖曳
    vp.addEventListener("mousedown", (e) => { e.preventDefault(); onStart(e.clientX, e.clientY); });
    window.addEventListener("mousemove", (e) => onMove(e.clientX, e.clientY));
    window.addEventListener("mouseup", onEnd);

    // 關閉時移除全域監聽
    const observer = new MutationObserver(() => {
      if (!document.body.contains(overlay)) {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onEnd);
        document.removeEventListener("keydown", onKey);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  /** 顯示專案完整資訊（90% 視窗大小） */
  async function showProjectInfo(id) {
    const doc = await db.collection("projects").doc(id).get();
    if (!doc.exists) { NW.toast("項目不存在", "error"); return; }
    const p = { id: doc.id, ...doc.data() };
    showProjectInfoFromData(p);
  }

  /** 以專案資料物件直接顯示資訊彈窗（用於分享頁面，不需再次查詢 Firestore） */
  function showProjectInfoFromData(p) {
    const now = new Date();
    const stageDone = p.stageDone || {};
    const manpower = p.manpower || {};

    const stageRows = STAGES.map((st) => {
      const t = p[st.key];
      const dt = t ? (t.toDate ? t.toDate() : new Date(t)) : null;
      const manual = stageDone[st.key];
      const autoDone = dt && dt < now;
      const isExpired = st.key === "close" && autoDone && !manual;
      const done = !!manual || autoDone;
      const badgeCls = isExpired ? "badge-stage-expired" : (done ? "badge-stage-done" : "badge-stage-pending");
      const manualAt = manual && manual.at ? NW.formatDT(manual.at) : "";
      return `<tr>
        <td><span class="badge ${badgeCls}">${st.label}${manual ? " ✓" : ""}</span></td>
        <td>${dt ? NW.formatDT(dt) : "未設定"}</td>
        <td>${manual ? `${manual.by || ""}${manualAt ? `（${manualAt}）` : ""}` : "-"}</td>
      </tr>`;
    }).join("");

    const manpowerRows = MANPOWER_ROLES.map((r) => `<tr><td>${r}</td><td>${manpower[r] || 0} 人</td></tr>`).join("");

    NW.modal({
      title: `專案資訊 - ${p.name || "(未命名)"}`,
      body: `
        <div class="info-modal">
          <div class="info-section">
            <h4 class="info-title">基本資料</h4>
            <table class="info-table">
              <tr><th>項目名稱</th><td>${p.name || "-"}</td></tr>
              <tr><th>客戶/社區</th><td>${p.client || "-"}</td></tr>
              <tr><th>戶數</th><td>${p.households || 0} 戶</td></tr>
              <tr><th>屋齡</th><td>${p.buildingAge || 0} 年</td></tr>
              <tr><th>接洽對象</th><td>${p.contact || "-"}</td></tr>
              <tr><th>社區對象</th><td>${p.community || "-"}</td></tr>
              <tr><th>負責人</th><td>${p.ownerName || "-"}</td></tr>
              <tr><th>狀態</th><td><span class="badge badge-${p.status || "pending"}">${statusText(p.status)}</span></td></tr>
              <tr><th>提醒時間</th><td>${NW.formatDT(p.reminder) || "-"}</td></tr>
              <tr><th>建立時間</th><td>${NW.formatDT(p.createdAt) || "-"}</td></tr>
              <tr><th>更新時間</th><td>${NW.formatDT(p.updatedAt) || "-"}</td></tr>
            </table>
          </div>

          <div class="info-section">
            <h4 class="info-title">五階段時程</h4>
            <table class="info-table">
              <thead><tr><th>階段</th><th>日期時間</th><th>完成人</th></tr></thead>
              <tbody>${stageRows}</tbody>
            </table>
          </div>

          <div class="info-section">
            <h4 class="info-title">需求人力</h4>
            <table class="info-table">
              <thead><tr><th>職稱</th><th>人數</th></tr></thead>
              <tbody>${manpowerRows}</tbody>
            </table>
          </div>

          ${p.note ? `
          <div class="info-section">
            <h4 class="info-title">備註</h4>
            <div class="info-note">${p.note}</div>
          </div>` : ""}
        </div>`,
      onConfirm: (close) => close(),
      confirmText: "關閉",
      cancelText: "關閉",
      xlarge: true,
    });
  }

  /** 分享項目列表到 LINE（快照存入 Firestore，分享固定格式網址） */
  async function shareProjects() {
    NW.toast("正在產生分享連結...", "info");

    // 取得目前可見的項目（管理員全部，業務自己的）
    const isAdmin = NW.Auth.isAdmin();
    const uid = NW.Auth.getUser().uid;
    let q = db.collection("projects").orderBy("updatedAt", "desc");
    if (!isAdmin) q = q.where("ownerUid", "==", uid).orderBy("updatedAt", "desc");

    const snap = await q.get();
    const projects = snap.docs.map((d) => {
      const p = d.data();
      // 序列化所有欄位（含圖片 Base64），存入 Firestore 分享快照
      const toISO = (v) => {
        if (!v) return null;
        const dt = v.toDate ? v.toDate() : new Date(v);
        return isNaN(dt.getTime()) ? null : dt.toISOString();
      };
      return {
        id: d.id,
        name: p.name || "",
        client: p.client || "",
        ownerName: p.ownerName || "",
        status: p.status || "pending",
        households: p.households || 0,
        buildingAge: p.buildingAge || 0,
        contact: p.contact || "",
        community: p.community || "",
        manpower: p.manpower || {},
        note: p.note || "",
        announce: toISO(p.announce),
        bid: toISO(p.bid),
        submitBid: toISO(p.submitBid),
        close: toISO(p.close),
        brief: toISO(p.brief),
        enter: toISO(p.enter),
        reminder: toISO(p.reminder),
        createdAt: toISO(p.createdAt),
        updatedAt: toISO(p.updatedAt),
        stageDone: Object.fromEntries(
          Object.entries(p.stageDone || {}).map(([k, v]) => [k, { by: v.by || "", at: toISO(v.at) }])
        ),
        quoteImages: sanitizeImages(p.quoteImages || []),
        feedbackImages: sanitizeImages(p.feedbackImages || []),
      };
    });

    if (!projects.length) { NW.toast("目前沒有項目可分享", "error"); return; }

    try {
      // 將快照存入 Firestore shares 集合，取得固定分享 ID
      const shareDoc = await db.collection("shares").add({
        projects,
        createdBy: uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      const shareId = shareDoc.id;
      const shareUrl = `${window.location.origin}${window.location.pathname}?share=${shareId}`;

      // 優先使用 Web Share API（行動裝置可直接分享到 LINE）
      if (navigator.share) {
        try {
          await navigator.share({
            title: "西北探吉 - 項目管理",
            text: "項目管理列表（唯讀）",
            url: shareUrl,
          });
          NW.toast("已開啟分享", "success");
          return;
        } catch (e) {
          if (e.name !== "AbortError") console.warn(e);
        }
      }

      // 後備：開啟 LINE 分享頁
      const lineUrl = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(shareUrl)}`;
      window.open(lineUrl, "_blank", "noopener,noreferrer");
      NW.toast("已開啟 LINE 分享頁面", "success");
    } catch (err) {
      console.error("分享失敗:", err);
      NW.toast("分享失敗: " + (err.message || err), "error");
    }
  }

  /** 唯讀項目列表（用於分享連結開啟的頁面，含資訊/報價單/回饋項目按鈕） */
  function renderReadOnlyList(container, projects) {
    const now = new Date();
    // 以索引鍵存取專案資料，供按鈕事件使用
    const projMap = {};
    projects.forEach((p, i) => { projMap[i] = p; });

    container.innerHTML = `
      <div class="readonly-wrap">
        <div class="readonly-header">
          <img src="assets/logo.svg" alt="西北探吉" class="readonly-logo" />
          <h1 class="readonly-title">西北探吉 · 項目管理</h1>
          <p class="readonly-sub">唯讀檢視 · 無法編輯或刪除</p>
        </div>
        <div class="card">
          <div class="table-wrap">
            <table>
              <thead><tr>
                <th>項目名稱</th><th>客戶</th><th>負責人</th><th>階段</th><th>進場日期</th><th>狀態</th><th>操作</th>
              </tr></thead>
              <tbody>
                ${projects.length ? projects.map((p, idx) => {
                  const stageTags = STAGES.map((st) => {
                    const t = p[st.key] ? new Date(p[st.key]) : null;
                    const autoDone = t && t < now;
                    const manual = (p.stageDone || {})[st.key];
                    const done = !!manual || autoDone;
                    const isExpired = st.key === "close" && autoDone && !manual;
                    const badgeCls = isExpired ? "badge-stage-expired" : (done ? "badge-stage-done" : "badge-stage-pending");
                    return `<span class="badge ${badgeCls}" title="${st.label}${manual ? " ✓" : ""}">${st.label}${manual ? " ✓" : ""}</span>`;
                  }).join("");
                  const quoteCount = sanitizeImages(p.quoteImages || []).length;
                  const fbCount = sanitizeImages(p.feedbackImages || []).length;
                  return `<tr>
                    <td data-label="項目名稱">${p.name || "(未命名)"}</td>
                    <td data-label="客戶">${p.client || "-"}</td>
                    <td data-label="負責人">${p.ownerName || "-"}</td>
                    <td data-label="階段"><div class="stage-tags">${stageTags}</div></td>
                    <td data-label="進場日期">${p.enter ? NW.formatDate(new Date(p.enter)) : "-"}</td>
                    <td data-label="狀態"><span class="badge badge-${p.status || "pending"}">${statusText(p.status)}</span></td>
                    <td data-label="操作" class="col-actions">
                      <div class="file-buttons">
                        <button class="file-icon-btn info-btn" data-ro-info="${idx}" title="專案資訊">
                          <span class="file-icon">ℹ️</span>
                          <span class="file-label">資訊</span>
                        </button>
                        <button class="file-icon-btn ${quoteCount > 0 ? "has-file" : "no-file"}" data-ro-quote="${idx}" title="報價單圖片 (${quoteCount}/5)">
                          <span class="file-icon">📄</span>
                          <span class="file-label">報價單</span>
                          <span class="file-count">${quoteCount}/5</span>
                        </button>
                        <button class="file-icon-btn ${fbCount > 0 ? "has-file" : "no-file"}" data-ro-feedback="${idx}" title="回饋項目圖片 (${fbCount}/5)">
                          <span class="file-icon">📝</span>
                          <span class="file-label">回饋項目</span>
                          <span class="file-count">${fbCount}/5</span>
                        </button>
                      </div>
                    </td>
                  </tr>`;
                }).join("") : `<tr><td colspan="7" class="empty">暫無項目</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
        <div class="readonly-footer">
          <p>資料更新時間：${projects.length && projects[0].updatedAt ? NW.formatDT(new Date(projects[0].updatedAt)) : "-"}</p>
          <p class="readonly-tip">此頁面為分享快照，資料不會自動更新。</p>
        </div>
      </div>`;

    // 綁定按鈕事件
    container.querySelectorAll("[data-ro-info]").forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        showProjectInfoFromData(projMap[b.dataset.roInfo]);
      };
    });
    container.querySelectorAll("[data-ro-quote]").forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        const p = projMap[b.dataset.roQuote];
        openImageLightbox(sanitizeImages(p.quoteImages || []), "報價單圖片");
      };
    });
    container.querySelectorAll("[data-ro-feedback]").forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        const p = projMap[b.dataset.roFeedback];
        openImageLightbox(sanitizeImages(p.feedbackImages || []), "回饋項目圖片");
      };
    });
  }

  /* ---------- 工具 ---------- */
  function statusText(s) { return { pending: "未開始", progress: "進行中", done: "已完成", cancel: "已取消" }[s] || "未開始"; }
  function parseDT(v) { return v ? new Date(v) : null; }
  function toLocalInput(d) {
    if (!d) return "";
    const dt = d.toDate ? d.toDate() : new Date(d);
    if (isNaN(dt.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  }

  /**
   * 正規化圖片物件，確保儲存到 Firestore 前都是 {url: string, name: string} 格式。
   * 舊資料可能是純字串 URL、缺少 name、或包含無效欄位，需統一處理以避免
   * "Property array contains an invalid nested entity" 錯誤。
   */
  function normalizeImage(img) {
    if (!img) return null;
    let url = "";
    let name = "";
    if (typeof img === "string") {
      url = img;
    } else if (typeof img === "object") {
      url = img.url || "";
      name = img.name || "";
    }
    // 確保 url 與 name 都是字串（過濾 undefined / null / 非字串值）
    return { url: String(url || ""), name: String(name || "") };
  }

  /** 過濾並正規化圖片陣列，移除 url 為空的無效項目 */
  function sanitizeImages(arr) {
    return (arr || [])
      .map(normalizeImage)
      .filter((img) => img && img.url);
  }

  // 大型 Modal 輔助（暴露給其他模組用）
  NW.modal = function ({ title, body, large, xlarge, onConfirm, confirmText = "儲存", cancelText = "取消" }) {
    const root = document.getElementById("modal-root");
    const id = "m-" + Date.now();
    const sizeCls = xlarge ? "xlarge" : (large ? "large" : "");
    root.insertAdjacentHTML("beforeend", `
      <div class="modal-overlay" id="${id}">
        <div class="modal-card ${sizeCls}">
          <h3 class="modal-title">${title}</h3>
          <div class="modal-body">${body}</div>
          <div class="modal-actions">
            <button class="btn btn-ghost" data-cancel>${cancelText}</button>
            <button class="btn btn-primary" data-confirm>${confirmText}</button>
          </div>
        </div>
      </div>`);
    const el = document.getElementById(id);
    const close = () => el.remove();
    el.querySelector("[data-cancel]").onclick = close;
    el.querySelector("[data-confirm]").onclick = () => onConfirm(close);
    el.onclick = (e) => { if (e.target === el) close(); };
  };
})();
