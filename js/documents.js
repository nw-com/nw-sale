/**
 * 文檔生成模組：企畫書、回饋計畫
 * 全域暴露 NW.Documents
 */
(function () {
  const NW = window.NW || (window.NW = {});
  const db = window.db;

  NW.Documents = {
    /**
     * 開啟文檔編輯器
     * @param {string} projectId
     * @param {"proposal"|"feedback"} type
     */
    async open(projectId, type) {
      const typeLabel = type === "proposal" ? "企畫書" : "回饋計畫";
      // 查詢既有文檔
      const snap = await db.collection("documents")
        .where("projectId", "==", projectId)
        .where("type", "==", type)
        .limit(1).get();
      let existing = null;
      if (!snap.empty) {
        const d = snap.docs[0];
        existing = { id: d.id, ...d.data() };
      }

      NW.modal({
        title: `${typeLabel} - ${existing ? "編輯" : "新增"}`,
        large: true,
        body: `
          <div class="form-grid">
            <div class="full"><label>標題</label><input id="doc-title" value="${existing?.title || ""}" /></div>
            <div class="full">
              <label>內容</label>
              <div id="doc-editor" contenteditable="true" style="min-height:300px;border:1px solid var(--line);border-radius:var(--radius-sm);padding:12px;outline:none;line-height:1.7">${existing?.content || ""}</div>
              <div style="margin-top:6px;font-size:12px;color:var(--muted)">支援基本文字編輯，內容將自動儲存至雲端</div>
            </div>
          </div>`,
        onConfirm: async (close) => {
          const title = document.getElementById("doc-title").value.trim() || typeLabel;
          const content = document.getElementById("doc-editor").innerHTML;
          const payload = {
            projectId,
            type,
            title,
            content,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          };
          if (existing) {
            await db.collection("documents").doc(existing.id).update(payload);
          } else {
            payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection("documents").add(payload);
          }
          NW.toast(`${typeLabel}已儲存`, "success");
          close();
        },
      });
    },
  };
})();
