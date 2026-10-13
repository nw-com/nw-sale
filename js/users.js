/**
 * 帳號設定模組
 * 管理員：完整帳號列表（新增/編輯/停用/刪除）
 * 一般使用者：檢視與編輯自己的帳號資料
 * 全域暴露 NW.Users
 */
(function () {
  const NW = window.NW || (window.NW = {});
  const db = window.db;
  let unsub = null;

  NW.Users = {
    render(container) {
      if (unsub) { unsub(); unsub = null; }
      const isAdmin = NW.Auth.isAdmin();

      if (!isAdmin) {
        renderSelf(container);
        return;
      }

      container.innerHTML = `
        <div class="page-title">帳號設定</div>
        <div style="margin-bottom:16px"><button class="btn btn-primary" id="add-user">+ 新增帳號</button></div>
        <div class="card">
          <div class="table-wrap"><table>
            <thead><tr><th>姓名</th><th>Email</th><th>角色</th><th>狀態</th><th>建立時間</th><th>操作</th></tr></thead>
            <tbody id="user-body"><tr><td colspan="6" class="empty">載入中...</td></tr></tbody>
          </table></div>
        </div>`;

      document.getElementById("add-user").onclick = showAddForm;

      unsub = db.collection("users").onSnapshot((snap) => {
        const users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const body = document.getElementById("user-body");
        if (!users.length) { body.innerHTML = `<tr><td colspan="6" class="empty">暫無帳號</td></tr>`; return; }
        body.innerHTML = users.map((u) => `
          <tr>
            <td data-label="姓名">${u.displayName || "-"}</td>
            <td data-label="Email">${u.email}</td>
            <td data-label="角色"><span class="badge badge-${u.role}">${u.role === "admin" ? "管理員" : "業務"}</span></td>
            <td data-label="狀態"><span class="badge ${u.disabled ? "badge-cancel" : "badge-done"}">${u.disabled ? "停用" : "啟用"}</span></td>
            <td data-label="建立時間">${NW.formatDT(u.createdAt)}</td>
            <td data-label="操作">
              <button class="btn btn-ghost btn-sm" data-edit="${u.id}">編輯</button>
              <button class="btn ${u.disabled ? "btn-success" : "btn-danger"} btn-sm" data-toggle="${u.id}">${u.disabled ? "啟用" : "停用"}</button>
              <button class="btn btn-danger btn-sm" data-del="${u.id}">刪除</button>
            </td>
          </tr>`).join("");
        body.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => showEditForm(b.dataset.edit));
        body.querySelectorAll("[data-toggle]").forEach((b) => b.onclick = () => toggleDisabled(b.dataset.toggle));
        body.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => deleteUser(b.dataset.del));
      });
    },
  };

  /** 一般使用者：檢視與編輯自己的帳號 */
  function renderSelf(container) {
    const uid = NW.Auth.getUser()?.uid;
    if (!uid) { container.innerHTML = `<div class="empty">未登入</div>`; return; }

    container.innerHTML = `
      <div class="page-title">帳號設定</div>
      <div class="card">
        <div class="profile-row"><span class="profile-label">Email</span><span id="p-email" class="profile-val">載入中...</span></div>
        <div class="profile-row"><span class="profile-label">姓名</span><span id="p-name" class="profile-val">-</span></div>
        <div class="profile-row"><span class="profile-label">角色</span><span id="p-role" class="profile-val">-</span></div>
        <div class="profile-row"><span class="profile-label">狀態</span><span id="p-status" class="profile-val">-</span></div>
        <div style="margin-top:16px">
          <button class="btn btn-primary" id="edit-self">編輯我的資料</button>
        </div>
      </div>`;

    unsub = db.collection("users").doc(uid).onSnapshot((doc) => {
      const u = doc.data();
      if (!u) return;
      document.getElementById("p-email").textContent = u.email;
      document.getElementById("p-name").textContent = u.displayName || "-";
      document.getElementById("p-role").innerHTML = `<span class="badge badge-${u.role}">${u.role === "admin" ? "管理員" : "業務"}</span>`;
      document.getElementById("p-status").innerHTML = `<span class="badge ${u.disabled ? "badge-cancel" : "badge-done"}">${u.disabled ? "停用" : "啟用"}</span>`;
    });

    document.getElementById("edit-self").onclick = () => showEditForm(uid);
  }

  function showAddForm() {
    NW.modal({
      title: "新增帳號",
      body: `
        <div class="form-grid">
          <div class="full"><label>Email *</label><input id="u-email" type="email" placeholder="user@example.com" /></div>
          <div class="full"><label>密碼 *</label><input id="u-pw" type="password" placeholder="至少 6 碼" /></div>
          <div class="full"><label>姓名</label><input id="u-name" placeholder="顯示名稱" /></div>
          <div class="full"><label>角色</label>
            <select id="u-role"><option value="sales">業務</option><option value="admin">管理員</option></select>
          </div>
        </div>`,
      onConfirm: async (close) => {
        const email = document.getElementById("u-email").value.trim();
        const pw = document.getElementById("u-pw").value;
        const name = document.getElementById("u-name").value.trim();
        const role = document.getElementById("u-role").value;
        if (!email || !pw) { NW.toast("請輸入 Email 與密碼", "error"); return; }
        try {
          await NW.Auth.createUser(email, pw, name, role);
          NW.toast("帳號已建立", "success");
          close();
        } catch (e) {
          NW.toast("建立失敗: " + (e.message || e.code), "error");
        }
      },
    });
  }

  async function showEditForm(uid) {
    const doc = await db.collection("users").doc(uid).get();
    const u = doc.data();
    if (!u) { NW.toast("帳號不存在", "error"); return; }
    const isAdmin = NW.Auth.isAdmin();
    const roleField = isAdmin ? `
          <div class="full"><label>角色</label>
            <select id="e-role">
              <option value="sales" ${u.role === "sales" ? "selected" : ""}>業務</option>
              <option value="admin" ${u.role === "admin" ? "selected" : ""}>管理員</option>
            </select>
          </div>` : "";
    NW.modal({
      title: "編輯帳號",
      body: `
        <div class="form-grid">
          <div class="full"><label>Email</label><input id="e-email" type="email" value="${u.email}" disabled /></div>
          <div class="full"><label>姓名</label><input id="e-name" placeholder="顯示名稱" value="${u.displayName || ""}" />${roleField}
        </div>`,
      onConfirm: async (close) => {
        const name = document.getElementById("e-name").value.trim();
        const data = { displayName: name };
        if (isAdmin) data.role = document.getElementById("e-role").value;
        try {
          await NW.Auth.updateUser(uid, data);
          NW.toast("帳號已更新", "success");
          close();
        } catch (e) {
          NW.toast("更新失敗: " + (e.message || e.code), "error");
        }
      },
    });
  }

  async function toggleDisabled(uid) {
    const doc = await db.collection("users").doc(uid).get();
    const cur = doc.data()?.disabled;
    const next = !cur;
    const ok = await NW.confirm({ title: next ? "停用帳號" : "啟用帳號", message: `確定要${next ? "停用" : "啟用"}此帳號嗎？` });
    if (!ok) return;
    await NW.Auth.updateUser(uid, { disabled: next });
    NW.toast(next ? "帳號已停用" : "帳號已啟用", "success");
  }

  async function deleteUser(uid) {
    const doc = await db.collection("users").doc(uid).get();
    const u = doc.data();
    const ok = await NW.confirm({
      title: "刪除帳號",
      message: `確定要刪除帳號「${u?.displayName || u?.email}」嗎？此操作僅刪除平台記錄，無法復原。`,
    });
    if (!ok) return;
    try {
      await db.collection("users").doc(uid).delete();
      NW.toast("帳號已刪除", "success");
    } catch (e) {
      NW.toast("刪除失敗: " + (e.message || e.code), "error");
    }
  }
})();
