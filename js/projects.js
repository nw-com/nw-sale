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
  };

  const STAGES = [
    { key: "announce", label: "公告招標" },
    { key: "bid", label: "領標" },
    { key: "close", label: "結標" },
    { key: "brief", label: "簡報" },
    { key: "enter", label: "進場" },
  ];

  function renderList(container) {
    const isAdmin = NW.Auth.isAdmin();
    const uid = NW.Auth.getUser().uid;

    container.innerHTML = `
      <div class="page-title">項目管理 <span class="proj-hint">（長按列 3 秒可編輯）</span></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div style="display:flex;gap:8px">
          <input id="proj-search" placeholder="搜尋項目名稱或客戶..." style="padding:8px 12px;border:1px solid var(--line);border-radius:var(--radius-sm);min-width:220px" />
        </div>
        <button class="btn btn-primary" id="add-proj">+ 新增項目</button>
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
          const byName = manual ? manual.by : "";
          return `
            <div class="stage-tag-wrap">
              <span class="badge ${done ? "badge-stage-done" : "badge-stage-pending"} stage-clickable"
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
      body.querySelectorAll(".proj-row").forEach((tr) => bindLongPress(tr, () => showProjectForm(tr.dataset.id)));
      body.querySelectorAll(".stage-clickable").forEach((sp) => sp.onclick = (e) => { e.stopPropagation(); showStageModal(sp.dataset.pid, sp.dataset.stage); });
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

  /* ---------- 長按 3 秒輔助 ---------- */
  function bindLongPress(el, callback, duration = 3000) {
    let timer = null;
    let pressed = false;
    const start = (e) => {
      if (e.target.closest(".file-icon-btn") || e.target.closest(".proj-link") || e.target.closest(".stage-clickable")) return;
      pressed = true;
      el.classList.add("long-pressing");
      timer = setTimeout(() => {
        if (pressed) {
          el.classList.remove("long-pressing");
          callback();
        }
      }, duration);
    };
    const end = () => {
      pressed = false;
      el.classList.remove("long-pressing");
      if (timer) { clearTimeout(timer); timer = null; }
    };
    el.addEventListener("mousedown", start);
    el.addEventListener("mouseup", end);
    el.addEventListener("mouseleave", end);
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
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
          <div><label>負責人</label>
            ${isAdmin ? `<input id="f-owner" value="${data.ownerName || ""}" placeholder="業務姓名" />` : `<input value="${NW.Auth.getUserData().displayName}" disabled />`}
          </div>
          <div><label>狀態</label>
            <select id="f-status">
              ${["pending", "progress", "done", "cancel"].map((s) => `<option value="${s}" ${data.status === s ? "selected" : ""}>${statusText(s)}</option>`).join("")}
            </select>
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
          status: document.getElementById("f-status").value,
          note: document.getElementById("f-note").value,
          reminder: parseDT(document.getElementById("f-reminder").value),
          quoteImages: quoteUrls.map((url) => ({ url, name: extractName(url) })),
          feedbackImages: feedbackUrls.map((url) => ({ url, name: extractName(url) })),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        };
        STAGES.forEach((st) => { payload[st.key] = parseDT(document.getElementById(`f-${st.key}`).value); });
        if (isAdmin) {
          payload.ownerName = document.getElementById("f-owner").value.trim() || (NW.Auth.getUserData().displayName);
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
            const done = !!manual || (t && t.toDate && t.toDate() < now);
            return `<div class="stage ${done ? "done" : ""}">
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
  NW.modal = function ({ title, body, large, onConfirm, confirmText = "儲存", cancelText = "取消" }) {
    const root = document.getElementById("modal-root");
    const id = "m-" + Date.now();
    root.insertAdjacentHTML("beforeend", `
      <div class="modal-overlay" id="${id}">
        <div class="modal-card ${large ? "large" : ""}">
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
