/**
 * 儀表板模組
 * 全域暴露 NW.Dashboard
 */
(function () {
  const NW = window.NW || (window.NW = {});
  const db = window.db;
  let unsub = null;

  NW.Dashboard = {
    render(container) {
      if (unsub) unsub();
      container.innerHTML = `
        <div class="page-title">儀表板</div>
        <div id="reminders"></div>
        <div id="stats-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px;align-items:stretch"></div>
        <div id="calendar-card"></div>
        <div id="recent-projects"></div>`;

      loadStats(container);
      loadReminders(container);
      loadCalendar(container);
      loadRecent(container);
    },
    destroy() { if (unsub) { unsub(); unsub = null; } },
  };

  function loadStats(container) {
    const grid = container.querySelector("#stats-grid");
    const isAdmin = NW.Auth.isAdmin();
    const uid = NW.Auth.getUser().uid;
    let q = db.collection("projects");
    if (!isAdmin) q = q.where("ownerUid", "==", uid);

    unsub = q.onSnapshot((snap) => {
      const projects = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const total = projects.length;
      const inProgress = projects.filter((p) => p.status === "progress").length;
      const done = projects.filter((p) => p.status === "done").length;
      const pending = projects.filter((p) => p.status === "pending").length;

      grid.innerHTML = [
        { label: "項目總數", val: total, color: "#1565c0" },
        { label: "進行中", val: inProgress, color: "#f57c00" },
        { label: "已完成", val: done, color: "#2e7d32" },
        { label: "未開始", val: pending, color: "#757575" },
      ].map((s) => `
        <div class="card" style="text-align:center;padding:10px 4px;display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;margin:0">
          <div style="font-size:28px;font-weight:700;color:${s.color};line-height:1">${s.val}</div>
          <div style="color:var(--ink-2);font-size:12px;margin-top:4px">${s.label}</div>
        </div>`).join("");
    }, (err) => console.error(err));
  }

  function loadReminders(container) {
    const box = container.querySelector("#reminders");
    const isAdmin = NW.Auth.isAdmin();
    const uid = NW.Auth.getUser().uid;
    let q = db.collection("projects");
    if (!isAdmin) q = q.where("ownerUid", "==", uid);

    q.get().then((snap) => {
      const now = Date.now();
      const reminders = [];
      snap.docs.forEach((d) => {
        const p = d.data();
        const stages = ["announce", "bid", "close", "brief", "enter"];
        stages.forEach((st) => {
          if (p[st] && p[st].toDate) {
            const t = p[st].toDate().getTime();
            const diff = t - now;
            if (diff > 0 && diff < 3 * 24 * 3600 * 1000) {
              reminders.push({ project: p.name || d.id, stage: stageName(st), date: NW.formatDT(p[st]) });
            }
          }
        });
      });
      if (reminders.length) {
        box.innerHTML = `<div class="reminder-bar"><span class="text">🔔 近期有 ${reminders.length} 個項目階段將到期</span><span style="font-size:12px;color:var(--muted)">${reminders[0].project} - ${reminders[0].stage}</span></div>`;
      }
    });
  }

  function loadCalendar(container) {
    const box = container.querySelector("#calendar-card");
    const isAdmin = NW.Auth.isAdmin();
    const uid = NW.Auth.getUser().uid;
    let q = db.collection("projects");
    if (!isAdmin) q = q.where("ownerUid", "==", uid);

    q.get().then((snap) => {
      // 收集所有階段日期 -> { "YYYY-MM-DD": [專案名...] }
      const dayMap = {};
      const stageKeys = ["announce", "bid", "close", "brief", "enter"];
      snap.docs.forEach((d) => {
        const p = d.data();
        stageKeys.forEach((sk) => {
          if (p[sk] && p[sk].toDate) {
            const ds = NW.formatDate(p[sk]);
            if (!dayMap[ds]) dayMap[ds] = [];
            dayMap[ds].push(p.name || d.id);
          }
        });
      });

      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth();
      const firstDay = new Date(y, m, 1).getDay();
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const todayStr = NW.formatDate(now);
      const pad = (n) => String(n).padStart(2, "0");
      const monthLabel = `${y}-${pad(m + 1)}`;

      const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
      let cells = weekdays.map((w) => `<div class="cal-wd">${w}</div>`).join("");
      for (let i = 0; i < firstDay; i++) cells += `<div class="cal-cell cal-empty"></div>`;
      for (let d = 1; d <= daysInMonth; d++) {
        const ds = `${y}-${pad(m + 1)}-${pad(d)}`;
        const events = dayMap[ds] || [];
        const isToday = ds === todayStr;
        const hasEvent = events.length > 0;
        const title = events.length ? `${ds}\n${events.join("、")}` : ds;
        cells += `<div class="cal-cell ${isToday ? "today" : ""} ${hasEvent ? "has-event" : ""}" title="${title}">
          <span class="cal-num">${d}</span>
          ${hasEvent ? `<span class="cal-dot"></span>` : ""}
        </div>`;
      }

      box.innerHTML = `
        <div class="card" style="margin-bottom:16px">
          <div class="card-header"><div class="card-title">月曆 ${monthLabel}</div></div>
          <div class="cal-grid">${cells}</div>
          ${hasAnyEvent(dayMap) ? `<div style="margin-top:8px;font-size:12px;color:var(--ink-3)">● 紅點表示當日有項目階段</div>` : ""}
        </div>`;
    }).catch(() => {
      box.innerHTML = "";
    });
  }

  function hasAnyEvent(dayMap) {
    return Object.keys(dayMap).length > 0;
  }

  function loadRecent(container) {
    const box = container.querySelector("#recent-projects");
    const isAdmin = NW.Auth.isAdmin();
    const uid = NW.Auth.getUser().uid;
    let q = db.collection("projects").limit(50);
    if (!isAdmin) q = db.collection("projects").where("ownerUid", "==", uid).limit(50);

    q.get().then((snap) => {
      const stageKeys = ["announce", "bid", "close", "brief", "enter"];
      const list = snap.docs.map((d) => {
        const p = d.data();
        // 找出最近的階段日期
        let latest = null;
        stageKeys.forEach((sk) => {
          if (p[sk] && p[sk].toDate) {
            const t = p[sk].toDate().getTime();
            if (!latest || t > latest.t) latest = { t, sk, val: p[sk] };
          }
        });
        return { id: d.id, p, latestTs: latest ? latest.t : 0, latestDate: latest ? latest.val : null, latestStage: latest ? latest.sk : null };
      });
      // 依最近階段日期遞減排序
      list.sort((a, b) => b.latestTs - a.latestTs);
      const top = list.slice(0, 8);

      const rows = top.map((item) => {
        const p = item.p;
        return `<tr>
          <td data-label="項目名稱">${p.name || "-"}</td>
          <td data-label="客戶">${p.client || "-"}</td>
          <td data-label="狀態"><span class="badge badge-${p.status || "pending"}">${statusText(p.status)}</span></td>
          <td data-label="最近日期">${item.latestDate ? NW.formatDate(item.latestDate) + " " + stageName(item.latestStage) : "-"}</td>
        </tr>`;
      }).join("");
      box.innerHTML = `
        <div class="card">
          <div class="card-header"><div class="card-title">最近項目（依日期）</div></div>
          <div class="table-wrap">
            <table><thead><tr><th>項目名稱</th><th>客戶</th><th>狀態</th><th>最近日期</th></tr></thead>
            <tbody>${rows || `<tr><td colspan="4" class="empty">暫無項目</td></tr>`}</tbody></table>
          </div>
        </div>`;
    }).catch(() => {
      box.innerHTML = `<div class="card"><div class="empty">載入失敗</div></div>`;
    });
  }

  function statusText(s) {
    return { pending: "未開始", progress: "進行中", done: "已完成", cancel: "已取消" }[s] || "未開始";
  }
  function stageName(s) {
    return { announce: "公告招標", bid: "領標", close: "結標", brief: "簡報", enter: "進場" }[s] || s;
  }
})();
