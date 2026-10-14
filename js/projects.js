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

    // 圖片上傳狀態
    const quoteImages = [...(data.quoteImages || [])];
    const feedbackImages = [...(data.feedbackImages || [])];
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

        // 上傳新圖片
        let quoteUrls = quoteImages.filter((img) => !removingQuote.has(img.url)).map((img) => img.url);
        let feedbackUrls = feedbackImages.filter((img) => !removingFeedback.has(img.url)).map((img) => img.url);

        if (pendingQuote.length > 0) {
          NW.toast("上傳報價單圖片中...", "info");
          const uploaded = await uploadImages(pendingQuote, "quote");
          quoteUrls = quoteUrls.concat(uploaded);
        }
        if (pendingFeedback.length > 0) {
          NW.toast("上傳回饋項目圖片中...", "info");
          const uploaded = await uploadImages(pendingFeedback, "feedback");
          feedbackUrls = feedbackUrls.concat(uploaded);
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
          quoteImages: quoteUrls.map((url) => ({ url, name: extractName(url) })),
          feedbackImages: feedbackUrls.map((url) => ({ url, name: extractName(url) })),
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

  /** 上傳圖片到 Firebase Storage，回傳 download URL 陣列 */
  async function uploadImages(files, folder) {
    const uid = NW.Auth.getUser().uid;
    const urls = [];
    for (const file of files) {
      const ext = file.name.split(".").pop() || "jpg";
      const fname = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const ref = window.storage.ref(`projects/${uid}/${folder}/${fname}`);
      await ref.put(file);
      const url = await ref.getDownloadURL();
      urls.push(url);
    }
    return urls;
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

  /** 檢視項目的圖片（報價單或回饋項目） */
  async function viewProjectImages(id, type) {
    const doc = await db.collection("projects").doc(id).get();
    const p = doc.data() || {};
    const images = type === "quote" ? (p.quoteImages || []) : (p.feedbackImages || []);
    const title = type === "quote" ? "報價單圖片" : "回饋項目圖片";

    NW.modal({
      title: `${title} (${images.length}/5)`,
      large: true,
      body: images.length
        ? `<div class="img-grid-view">${images.map((img) => `
            <a href="${img.url}" target="_blank" class="img-view-item">
              <img src="${img.url}" alt="${img.name || ""}" />
            </a>`).join("")}
          </div>`
        : `<div class="empty" style="padding:24px;text-align:center;color:var(--ink-2)">暫無圖片，請至「編輯項目」上傳</div>`,
      onConfirm: (close) => close(),
      confirmText: "關閉",
      cancelText: "關閉",
    });
  }

  /** 顯示專案完整資訊（90% 視窗大小） */
  async function showProjectInfo(id) {
    const doc = await db.collection("projects").doc(id).get();
    if (!doc.exists) { NW.toast("項目不存在", "error"); return; }
    const p = { id: doc.id, ...doc.data() };
    const now = new Date();
    const stageDone = p.stageDone || {};
    const manpower = p.manpower || {};

    const stageRows = STAGES.map((st) => {
      const t = p[st.key];
      const manual = stageDone[st.key];
      const autoDone = t && t.toDate && t.toDate() < now;
      const isExpired = st.key === "close" && autoDone && !manual;
      const done = !!manual || autoDone;
      const badgeCls = isExpired ? "badge-stage-expired" : (done ? "badge-stage-done" : "badge-stage-pending");
      return `<tr>
        <td><span class="badge ${badgeCls}">${st.label}${manual ? " ✓" : ""}</span></td>
        <td>${NW.formatDT(t) || "未設定"}</td>
        <td>${manual ? `${manual.by}${manual.at ? `（${NW.formatDT(manual.at)}）` : ""}` : "-"}</td>
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

  /** 分享項目列表到 LINE */
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
      // 只序列化唯讀頁面需要的欄位，縮短 URL
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
        // 五階段日期（轉為 ISO 字串）
        announce: p.announce ? p.announce.toDate().toISOString() : null,
        bid: p.bid ? p.bid.toDate().toISOString() : null,
        submitBid: p.submitBid ? p.submitBid.toDate().toISOString() : null,
        close: p.close ? p.close.toDate().toISOString() : null,
        brief: p.brief ? p.brief.toDate().toISOString() : null,
        enter: p.enter ? p.enter.toDate().toISOString() : null,
        stageDone: p.stageDone || {},
        updatedAt: p.updatedAt ? p.updatedAt.toDate().toISOString() : null,
      };
    });

    if (!projects.length) { NW.toast("目前沒有項目可分享", "error"); return; }

    // 序列化資料並嵌入 URL
    const payload = { v: 1, projects, ts: Date.now() };
    const encoded = encodeURIComponent(JSON.stringify(payload));
    const shareUrl = `${window.location.origin}${window.location.pathname}?share=projects&data=${encoded}`;

    // 檢查 URL 長度（部分瀏覽器/伺服器有上限）
    if (shareUrl.length > 60000) {
      NW.toast("項目資料過多，無法產生分享連結", "error");
      return;
    }

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
        // 使用者取消，不顯示錯誤
        if (e.name !== "AbortError") console.warn(e);
      }
    }

    // 後備：開啟 LINE 分享頁
    const lineUrl = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(shareUrl)}`;
    window.open(lineUrl, "_blank", "noopener,noreferrer");
    NW.toast("已開啟 LINE 分享頁面", "success");
  }

  /** 唯讀項目列表（用於分享連結開啟的頁面） */
  function renderReadOnlyList(container, projects) {
    const now = new Date();
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
                <th>項目名稱</th><th>客戶</th><th>負責人</th><th>階段</th><th>進場日期</th><th>狀態</th>
              </tr></thead>
              <tbody>
                ${projects.length ? projects.map((p) => {
                  const stageTags = STAGES.map((st) => {
                    const t = p[st.key] ? new Date(p[st.key]) : null;
                    const autoDone = t && t < now;
                    const manual = (p.stageDone || {})[st.key];
                    const done = !!manual || autoDone;
                    const isExpired = st.key === "close" && autoDone && !manual;
                    const badgeCls = isExpired ? "badge-stage-expired" : (done ? "badge-stage-done" : "badge-stage-pending");
                    return `<span class="badge ${badgeCls}" title="${st.label}${manual ? " ✓" : ""}">${st.label}${manual ? " ✓" : ""}</span>`;
                  }).join("");
                  return `<tr>
                    <td data-label="項目名稱">${p.name || "(未命名)"}</td>
                    <td data-label="客戶">${p.client || "-"}</td>
                    <td data-label="負責人">${p.ownerName || "-"}</td>
                    <td data-label="階段"><div class="stage-tags">${stageTags}</div></td>
                    <td data-label="進場日期">${p.enter ? NW.formatDate(new Date(p.enter)) : "-"}</td>
                    <td data-label="狀態"><span class="badge badge-${p.status || "pending"}">${statusText(p.status)}</span></td>
                  </tr>`;
                }).join("") : `<tr><td colspan="6" class="empty">暫無項目</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
        <div class="readonly-footer">
          <p>資料更新時間：${projects.length && projects[0].updatedAt ? NW.formatDT(new Date(projects[0].updatedAt)) : "-"}</p>
          <p class="readonly-tip">此頁面為分享快照，資料不會自動更新。</p>
        </div>
      </div>`;
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
