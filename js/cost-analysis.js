/**
 * 成本分析模組
 * 彙整報價單數據，SVG 圖表可視化，CSV 匯出
 * 全域暴露 NW.CostAnalysis
 */
(function () {
  const NW = window.NW || (window.NW = {});
  const db = window.db;
  let unsub = null;

  const COLORS = ["#d32f2f", "#1565c0", "#2e7d32", "#f57c00", "#7b1fa2", "#00838f", "#6d4c41", "#546e7a"];

  NW.CostAnalysis = {
    render(container) {
      if (unsub) { unsub(); unsub = null; }
      const isAdmin = NW.Auth.isAdmin();
      const uid = NW.Auth.getUser().uid;

      container.innerHTML = `
        <div class="page-title">成本分析</div>
        <div style="margin-bottom:16px">
          <button class="btn btn-primary" id="export-csv">⬇ 匯出 CSV</button>
        </div>
        <div id="summary" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:20px"></div>
        <div class="chart-container">
          <div class="chart-box"><div class="chart-title">人員類別成本佔比</div><div id="pie-chart"></div></div>
          <div class="chart-box"><div class="chart-title">各項目成本</div><div id="bar-chart"></div></div>
        </div>
        <div class="card" style="margin-top:20px">
          <div class="card-header"><div class="card-title">成本明細</div></div>
          <div class="table-wrap"><table>
            <thead><tr><th>項目</th><th>公司類型</th><th>人員類別</th><th>小計</th></tr></thead>
            <tbody id="detail-body"></tbody>
          </table></div>
        </div>`;

      document.getElementById("export-csv").onclick = exportCSV;

      let q = db.collection("quotes");
      unsub = q.onSnapshot((snap) => {
        let quotes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (!isAdmin) quotes = quotes.filter((q) => q.ownerUid === uid);
        renderAnalysis(quotes);
      });
    },
  };

  function renderAnalysis(quotes) {
    const totalCost = quotes.reduce((s, q) => s + (q.total || 0), 0);
    const count = quotes.length;

    // 人員類別彙整
    const roleMap = {};
    quotes.forEach((q) => {
      (q.items || []).forEach((i) => {
        roleMap[i.role] = (roleMap[i.role] || 0) + (i.subtotal || 0);
      });
    });
    const roles = Object.entries(roleMap).sort((a, b) => b[1] - a[1]);

    // 項目成本彙整
    const projMap = {};
    quotes.forEach((q) => {
      const name = q.projectName || "(未關聯項目)";
      projMap[name] = (projMap[name] || 0) + (q.total || 0);
    });
    const projs = Object.entries(projMap).sort((a, b) => b[1] - a[1]);

    // Summary
    document.getElementById("summary").innerHTML = [
      { label: "總成本", val: NW.formatMoney(totalCost), color: "#d32f2f" },
      { label: "報價單數", val: count, color: "#1565c0" },
      { label: "人員類別", val: roles.length, color: "#2e7d32" },
      { label: "項目數", val: projs.length, color: "#f57c00" },
    ].map((s) => `<div class="card" style="text-align:center"><div style="font-size:24px;font-weight:700;color:${s.color}">${s.val}</div><div style="color:var(--ink-2);font-size:13px;margin-top:4px">${s.label}</div></div>`).join("");

    // 圓餅圖
    renderPie(roles, totalCost);
    // 長條圖
    renderBar(projs);

    // 明細表
    const body = document.getElementById("detail-body");
    const rows = [];
    quotes.forEach((q) => {
      (q.items || []).forEach((i) => {
        rows.push(`<tr><td data-label="項目">${q.projectName || "(未關聯)"}</td><td data-label="公司類型">${q.companyType === "security" ? "西北保全" : "西北物業"}</td><td data-label="人員類別">${i.role}</td><td data-label="小計" style="text-align:right">${NW.formatMoney(i.subtotal)}</td></tr>`);
      });
    });
    body.innerHTML = rows.join("") || `<tr><td colspan="4" class="empty">暫無數據</td></tr>`;

    // 快取給匯出用
    window._costData = { quotes, roles, projs, totalCost };
  }

  function renderPie(roles, total) {
    const box = document.getElementById("pie-chart");
    if (!roles.length || !total) { box.innerHTML = `<div class="empty">暫無數據</div>`; return; }
    const size = 240, cx = size / 2, cy = size / 2, r = 90;
    let angle = -Math.PI / 2;
    const slices = roles.map(([name, val], idx) => {
      const frac = val / total;
      const a0 = angle, a1 = angle + frac * Math.PI * 2;
      angle = a1;
      const large = frac > 0.5 ? 1 : 0;
      const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
      const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
      const path = `M${cx},${cy} L${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} Z`;
      return `<path d="${path}" fill="${COLORS[idx % COLORS.length]}" stroke="#fff" stroke-width="2"/>`;
    }).join("");
    const legend = roles.map(([name, val], idx) =>
      `<div style="display:flex;align-items:center;gap:6px;font-size:12px;margin:2px 0">
        <span style="width:12px;height:12px;background:${COLORS[idx % COLORS.length]};display:inline-block;border-radius:2px"></span>
        ${name}: ${NW.formatMoney(val)} (${((val / total) * 100).toFixed(1)}%)
      </div>`).join("");
    box.innerHTML = `<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <svg class="chart" viewBox="0 0 ${size} ${size}" style="width:${size}px;height:${size}px">${slices}</svg>
      <div>${legend}</div></div>`;
  }

  function renderBar(projs) {
    const box = document.getElementById("bar-chart");
    if (!projs.length) { box.innerHTML = `<div class="empty">暫無數據</div>`; return; }
    const max = Math.max(...projs.map((p) => p[1]));
    const w = 400, h = 240, pad = 40;
    const barW = (w - pad * 2) / projs.length * 0.7;
    const bars = projs.map(([name, val], idx) => {
      const bh = (val / max) * (h - pad * 2);
      const x = pad + idx * ((w - pad * 2) / projs.length) + ((w - pad * 2) / projs.length - barW) / 2;
      const y = h - pad - bh;
      return `<rect x="${x}" y="${y}" width="${barW}" height="${bh}" fill="${COLORS[idx % COLORS.length]}" rx="3"/>
        <text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle" font-size="10" fill="#555">${(val / 10000).toFixed(1)}萬</text>
        <text x="${x + barW / 2}" y="${h - pad + 14}" text-anchor="middle" font-size="10" fill="#555">${name.length > 6 ? name.slice(0, 6) + "…" : name}</text>`;
    }).join("");
    box.innerHTML = `<svg class="chart" viewBox="0 0 ${w} ${h}"><line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" stroke="#ccc"/>${bars}</svg>`;
  }

  function exportCSV() {
    const data = window._costData;
    if (!data || !data.quotes.length) { NW.toast("暫無數據可匯出", "error"); return; }
    const rows = [["項目", "公司類型", "人員類別", "單價", "數量", "小計"]];
    data.quotes.forEach((q) => {
      (q.items || []).forEach((i) => {
        rows.push([q.projectName || "(未關聯)", q.companyType === "security" ? "西北保全" : "西北物業", i.role, i.unitPrice, i.quantity, i.subtotal]);
      });
    });
    rows.push(["", "", "", "", "總成本", data.totalCost]);
    const csv = "\ufeff" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `成本分析_${NW.formatDate(new Date()).replace(/-/g, "")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    NW.toast("CSV 已匯出", "success");
  }
})();
