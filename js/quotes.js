/**
 * 報價單模組
 * 兩類公司：
 *  - security: 西北保全股份有限公司（保全類）
 *  - property: 西北公寓大廈管理維護股份有限公司（物業類）
 * 全域暴露 NW.Quotes
 */
(function () {
  const NW = window.NW || (window.NW = {});
  const db = window.db;
  let unsub = null;

  // 各公司類型的預設角色與單價
  const ROLE_PRESETS = {
    security: [
      { role: "保全人員", unitPrice: 32000 },
    ],
    property: [
      { role: "總幹事/經理", unitPrice: 45000 },
      { role: "秘書", unitPrice: 30000 },
      { role: "清潔人員", unitPrice: 26000 },
      { role: "機電人員", unitPrice: 35000 },
    ],
  };

  const COMPANY_LABEL = {
    security: "西北保全股份有限公司",
    property: "西北公寓大廈管理維護股份有限公司",
  };

  NW.Quotes = {
    render(container) {
      if (unsub) { unsub(); unsub = null; }
      const isAdmin = NW.Auth.isAdmin();
      const uid = NW.Auth.getUser().uid;

      container.innerHTML = `
        <div class="page-title">報價單管理</div>
        <div style="margin-bottom:16px">
          <button class="btn btn-primary" id="new-quote">+ 新增報價單</button>
        </div>
        <div class="card">
          <div class="table-wrap">
            <table>
              <thead><tr><th>公司類型</th><th>關聯項目</th><th>總價</th><th>建立時間</th><th>操作</th></tr></thead>
              <tbody id="q-body"><tr><td colspan="5" class="empty">載入中...</td></tr></tbody>
            </table>
          </div>
        </div>`;

      document.getElementById("new-quote").onclick = () => openForm();

      let q = db.collection("quotes").orderBy("createdAt", "desc");
      unsub = q.onSnapshot((snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const filtered = isAdmin ? list : list.filter((x) => x.ownerUid === uid);
        const body = document.getElementById("q-body");
        if (!filtered.length) { body.innerHTML = `<tr><td colspan="5" class="empty">暫無報價單</td></tr>`; return; }
        body.innerHTML = filtered.map((q) => `
          <tr>
            <td data-label="公司類型">${COMPANY_LABEL[q.companyType] || q.companyType}</td>
            <td data-label="關聯項目">${q.projectName || "-"}</td>
            <td data-label="總價">${NW.formatMoney(q.total)}</td>
            <td data-label="建立時間">${NW.formatDT(q.createdAt)}</td>
            <td data-label="操作">
              <button class="btn btn-ghost btn-sm" data-view="${q.id}">檢視</button>
              <button class="btn btn-danger btn-sm" data-del="${q.id}">刪除</button>
            </td>
          </tr>`).join("");
        body.querySelectorAll("[data-view]").forEach((b) => b.onclick = () => view(b.dataset.view));
        body.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => del(b.dataset.del));
      });
    },

    openForm(projectId) { openForm(projectId); },
    view(id) { view(id); },
  };

  /* ---------- 新增報價單 ---------- */
  async function openForm(projectId) {
    // 載入項目列表供選擇
    const isAdmin = NW.Auth.isAdmin();
    const uid = NW.Auth.getUser().uid;
    let pq = db.collection("projects");
    if (!isAdmin) pq = pq.where("ownerUid", "==", uid);
    const pSnap = await pq.get();
    const projects = pSnap.docs.map((d) => ({ id: d.id, name: d.data().name || d.id }));

    NW.modal({
      title: "新增報價單",
      large: true,
      body: `
        <div class="form-grid">
          <div><label>公司類型 *</label>
            <select id="q-company">
              <option value="security">${COMPANY_LABEL.security}（保全類）</option>
              <option value="property">${COMPANY_LABEL.property}（物業類）</option>
            </select>
          </div>
          <div><label>關聯項目</label>
            <select id="q-project">
              <option value="">（不關聯）</option>
              ${projects.map((p) => `<option value="${p.id}" ${p.id === projectId ? "selected" : ""}>${p.name}</option>`).join("")}
            </select>
          </div>
          <div><label>戶數（條件）</label><input type="number" id="q-households" min="0" value="100" /></div>
          <div><label>服務時數/月（條件）</label><input type="number" id="q-hours" min="0" value="160" /></div>
          <div><label>服務等級</label>
            <select id="q-level">
              <option value="basic">基本</option>
              <option value="standard" selected>標準</option>
              <option value="premium">高級</option>
            </select>
          </div>
        </div>
        <div style="margin-top:16px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <strong>報價項目</strong>
            <button class="btn btn-ghost btn-sm" id="add-item">+ 新增項目</button>
          </div>
          <div id="q-items"></div>
          <div class="quote-total" id="q-total">總計：NT$ 0</div>
        </div>`,
      onConfirm: async (close) => {
        const companyType = document.getElementById("q-company").value;
        const pid = document.getElementById("q-project").value;
        const items = collectItems();
        if (!items.length) { NW.toast("請至少新增一個報價項目", "error"); return; }
        const total = items.reduce((s, i) => s + i.subtotal, 0);
        const projName = projects.find((p) => p.id === pid)?.name || "";
        await db.collection("quotes").add({
          companyType,
          projectId: pid || null,
          projectName: projName,
          items,
          total,
          conditions: {
            households: +document.getElementById("q-households").value,
            hours: +document.getElementById("q-hours").value,
            level: document.getElementById("q-level").value,
          },
          ownerUid: NW.Auth.getUser().uid,
          ownerName: NW.Auth.getUserData().displayName,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        NW.toast("報價單已建立", "success");
        close();
      },
    });

    // 初始化項目
    renderItems("security");
    document.getElementById("q-company").onchange = (e) => renderItems(e.target.value);
    document.getElementById("add-item").onclick = () => addItemRow();
    ["q-households", "q-hours", "q-level"].forEach((id) => {
      document.getElementById(id).oninput = recalc;
    });
  }

  function renderItems(companyType) {
    const box = document.getElementById("q-items");
    box.innerHTML = "";
    const presets = ROLE_PRESETS[companyType] || [];
    presets.forEach((p) => addItemRow(p.role, p.unitPrice));
    recalc();
  }

  function addItemRow(role = "", unitPrice = 0) {
    const box = document.getElementById("q-items");
    const row = document.createElement("div");
    row.className = "quote-item-row";
    row.innerHTML = `
      <input class="i-role" placeholder="角色/項目" value="${role}" />
      <input class="i-price" type="number" min="0" placeholder="單價" value="${unitPrice}" />
      <input class="i-qty" type="number" min="0" placeholder="數量" value="1" />
      <input class="i-sub" readonly placeholder="小計" value="0" />
      <button class="btn btn-danger btn-sm col-del">✕</button>`;
    box.appendChild(row);
    row.querySelector(".col-del").onclick = () => { row.remove(); recalc(); };
    row.querySelectorAll(".i-price, .i-qty").forEach((el) => el.oninput = recalc);
    recalc();
  }

  function collectItems() {
    const rows = document.querySelectorAll("#q-items .quote-item-row");
    return Array.from(rows).map((r) => {
      const role = r.querySelector(".i-role").value.trim();
      const price = +r.querySelector(".i-price").value || 0;
      const qty = +r.querySelector(".i-qty").value || 0;
      return { role, unitPrice: price, quantity: qty, subtotal: price * qty };
    }).filter((i) => i.role);
  }

  function recalc() {
    const rows = document.querySelectorAll("#q-items .quote-item-row");
    let total = 0;
    rows.forEach((r) => {
      const price = +r.querySelector(".i-price").value || 0;
      const qty = +r.querySelector(".i-qty").value || 0;
      const sub = price * qty;
      r.querySelector(".i-sub").value = sub;
      total += sub;
    });
    document.getElementById("q-total").textContent = `總計：${NW.formatMoney(total)}`;
  }

  /* ---------- 檢視報價單 ---------- */
  async function view(id) {
    const doc = await db.collection("quotes").doc(id).get();
    if (!doc.exists) return;
    const q = { id: doc.id, ...doc.data() };
    const itemsRows = (q.items || []).map((i) => `
      <tr><td>${i.role}</td><td style="text-align:right">${NW.formatMoney(i.unitPrice)}</td><td style="text-align:right">${i.quantity}</td><td style="text-align:right">${NW.formatMoney(i.subtotal)}</td></tr>
    `).join("");

    NW.modal({
      title: `${COMPANY_LABEL[q.companyType]} - 報價單`,
      large: true,
      body: `
        <div style="margin-bottom:12px;color:var(--ink-2);font-size:13px">
          關聯項目：${q.projectName || "（無）"} ｜
          條件：戶數 ${q.conditions?.households || "-"}、時數 ${q.conditions?.hours || "-"}、等級 ${q.conditions?.level || "-"}
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>項目</th><th style="text-align:right">單價</th><th style="text-align:right">數量</th><th style="text-align:right">小計</th></tr></thead>
          <tbody>${itemsRows}</tbody>
          <tfoot><tr><td colspan="3" style="text-align:right;font-weight:700">總計</td><td style="text-align:right;font-weight:700;color:var(--brand)">${NW.formatMoney(q.total)}</td></tr></tfoot>
        </table></div>`,
      confirmText: "關閉",
      onConfirm: (close) => close(),
    });
  }

  async function del(id) {
    const ok = await NW.confirm({ title: "刪除報價單", message: "確定要刪除此報價單嗎？", confirmText: "刪除" });
    if (!ok) return;
    await db.collection("quotes").doc(id).delete();
    NW.toast("報價單已刪除", "success");
  }
})();
