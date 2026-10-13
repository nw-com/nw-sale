/**
 * UI 工具模組：自訂 Modal、Toast、日期格式化
 * 全域暴露 NW.UI
 */
(function () {
  const NW = window.NW || (window.NW = {});
  const modalRoot = () => document.getElementById("modal-root");
  const toastRoot = () => document.getElementById("toast-root");

  /**
   * 自訂確認彈窗（取代原生 confirm）
   * @param {{title: string, message: string, confirmText?: string, cancelText?: string}} opts
   * @returns {Promise<boolean>}
   */
  NW.confirm = function (opts) {
    return new Promise((resolve) => {
      const root = modalRoot();
      const id = "modal-" + Date.now();
      root.insertAdjacentHTML("beforeend", `
        <div class="modal-overlay" id="${id}">
          <div class="modal-card">
            <h3 class="modal-title">${opts.title || "確認"}</h3>
            <p class="modal-msg">${opts.message || ""}</p>
            <div class="modal-actions">
              <button class="btn btn-ghost" data-action="cancel">${opts.cancelText || "取消"}</button>
              <button class="btn btn-primary" data-action="confirm">${opts.confirmText || "確定"}</button>
            </div>
          </div>
        </div>`);
      const el = document.getElementById(id);
      const close = (val) => { el.remove(); resolve(val); };
      el.querySelector('[data-action="cancel"]').onclick = () => close(false);
      el.querySelector('[data-action="confirm"]').onclick = () => close(true);
      el.onclick = (e) => { if (e.target === el) close(false); };
    });
  };

  /**
   * 自訂輸入彈窗（取代原生 prompt）
   * @param {{title: string, message?: string, defaultValue?: string, placeholder?: string}} opts
   * @returns {Promise<string|null>}
   */
  NW.prompt = function (opts) {
    return new Promise((resolve) => {
      const root = modalRoot();
      const id = "modal-" + Date.now();
      root.insertAdjacentHTML("beforeend", `
        <div class="modal-overlay" id="${id}">
          <div class="modal-card">
            <h3 class="modal-title">${opts.title || "輸入"}</h3>
            ${opts.message ? `<p class="modal-msg">${opts.message}</p>` : ""}
            <input class="modal-input" type="text" value="${opts.defaultValue || ""}" placeholder="${opts.placeholder || ""}" />
            <div class="modal-actions">
              <button class="btn btn-ghost" data-action="cancel">取消</button>
              <button class="btn btn-primary" data-action="confirm">確定</button>
            </div>
          </div>
        </div>`);
      const el = document.getElementById(id);
      const input = el.querySelector(".modal-input");
      input.focus();
      const close = (val) => { el.remove(); resolve(val); };
      el.querySelector('[data-action="cancel"]').onclick = () => close(null);
      el.querySelector('[data-action="confirm"]').onclick = () => close(input.value);
      input.onkeydown = (e) => { if (e.key === "Enter") close(input.value); };
      el.onclick = (e) => { if (e.target === el) close(null); };
    });
  };

  /**
   * Toast 輕量通知
   * @param {string} msg
   * @param {"success"|"error"|"info"} [type="info"]
   */
  NW.toast = function (msg, type = "info") {
    const root = toastRoot();
    const id = "toast-" + Date.now();
    root.insertAdjacentHTML("beforeend", `<div class="toast toast-${type}" id="${id}">${msg}</div>`);
    const el = document.getElementById(id);
    setTimeout(() => el.classList.add("show"), 10);
    setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 300); }, 2600);
  };

  /** 格式化 Date 為 YYYY-MM-DD HH:mm */
  NW.formatDT = function (d) {
    if (!d) return "";
    const dt = d instanceof Date ? d : d.toDate ? d.toDate() : new Date(d);
    if (isNaN(dt.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  };

  /** 格式化為 YYYY-MM-DD */
  NW.formatDate = function (d) {
    if (!d) return "";
    const dt = d instanceof Date ? d : d.toDate ? d.toDate() : new Date(d);
    if (isNaN(dt.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  };

  /** 金額格式化（千分位） */
  NW.formatMoney = function (n) {
    return "NT$ " + Number(n || 0).toLocaleString("zh-TW");
  };
})();
