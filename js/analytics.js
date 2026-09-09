(() => {
  "use strict";

  const STORAGE_KEY = "production-time-records";
  const RECORDS_COLLECTION = "records";

  const els = {
    chartPeriod: document.getElementById("chart-period"),
    btnExportAnalysisCsv: document.getElementById("btn-export-analysis-csv"),
    modelChart: document.getElementById("model-chart"),
    chartEmpty: document.getElementById("chart-empty"),
    plannoChart: document.getElementById("planno-chart"),
    plannoChartEmpty: document.getElementById("planno-chart-empty"),
    btnExportPlannoCsv: document.getElementById("btn-export-planno-csv"),
  };

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function toDateStr(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function formatDurationMinutes(ms) {
    const totalMinutes = Math.round(ms / 60000);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h > 0) return `${h}時間${m}分`;
    return `${m}分`;
  }

  function csvEscape(value) {
    const str = String(value);
    if (/[",\r\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  function loadRecords() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error("記録の読み込みに失敗しました", e);
      return [];
    }
  }

  /** @type {Record[]} */
  let records = loadRecords();

  // --- クラウド同期（Firebase Firestore、js/firebase-config.js で設定）---

  function setSyncStatus(state, text) {
    const badge = document.getElementById("sync-badge");
    const textEl = document.getElementById("sync-badge-text");
    if (badge) badge.dataset.state = state;
    if (textEl) textEl.textContent = text;
  }

  (function initCloudSync() {
    const cfg = window.FIREBASE_CONFIG;
    const configured = !!(cfg && cfg.apiKey && cfg.apiKey.indexOf("REPLACE_WITH") !== 0);
    if (!configured || typeof firebase === "undefined") {
      setSyncStatus("local", "この端末のみに保存（クラウド未設定）");
      return;
    }
    try {
      firebase.initializeApp(cfg);
      const dbApi = firebase.firestore();
      setSyncStatus("cloud", "全端末で共有中");

      dbApi.collection(RECORDS_COLLECTION).onSnapshot(
        (snap) => {
          records = snap.docs.map((d) => d.data());
          renderAll();
        },
        (err) => {
          console.error("db sync error", err);
          setSyncStatus("local", "共有が中断されました（この端末のみ）");
        }
      );
    } catch (e) {
      console.error("Firebaseの初期化に失敗しました", e);
      setSyncStatus("local", "この端末のみに保存（クラウド接続エラー）");
    }
  })();

  // --- 機種別分析（期間フィルタ・作業者内訳）---

  let chartPeriodValue = "all";

  function monthKey(dateStr) {
    return dateStr ? dateStr.slice(0, 7) : "";
  }

  function monthLabel(key) {
    const [y, m] = key.split("-");
    return `${y}年${Number(m)}月`;
  }

  function getAvailableMonths() {
    return Array.from(new Set(records.map((r) => monthKey(r.date)).filter(Boolean))).sort().reverse();
  }

  function renderChartPeriodOptions() {
    const months = getAvailableMonths();
    const options = [`<option value="all">全期間</option>`]
      .concat(months.map((m) => `<option value="${m}">${escapeHtml(monthLabel(m))}</option>`));
    els.chartPeriod.innerHTML = options.join("");
    if (chartPeriodValue !== "all" && !months.includes(chartPeriodValue)) {
      chartPeriodValue = "all";
    }
    els.chartPeriod.value = chartPeriodValue;
  }

  els.chartPeriod.addEventListener("change", () => {
    chartPeriodValue = els.chartPeriod.value;
    renderAll();
  });

  function renderAll() {
    renderChartPeriodOptions();
    renderChart();
    renderPlannoChart();
  }

  function getRecordsForPeriod() {
    if (chartPeriodValue === "all") return records;
    return records.filter((r) => monthKey(r.date) === chartPeriodValue);
  }

  // 機種ごとに合計時間・台数・1台あたりの時間を集計し、関わった作業者ごとの内訳も付与する
  function aggregateByModel(rows) {
    const byModel = new Map();
    for (const r of rows) {
      const qty = r.quantity && r.quantity > 0 ? r.quantity : 1;
      const cur = byModel.get(r.itemName) || { totalMs: 0, totalQty: 0, count: 0, workers: new Map() };
      cur.totalMs += r.durationMs;
      cur.totalQty += qty;
      cur.count += 1;
      const workerName = r.worker || "(未入力)";
      const w = cur.workers.get(workerName) || { totalMs: 0, totalQty: 0, count: 0 };
      w.totalMs += r.durationMs;
      w.totalQty += qty;
      w.count += 1;
      cur.workers.set(workerName, w);
      byModel.set(r.itemName, cur);
    }
    return Array.from(byModel.entries())
      .map(([name, v]) => ({
        name,
        totalMs: v.totalMs,
        totalQty: v.totalQty,
        count: v.count,
        perUnitMs: v.totalMs / v.totalQty,
        workers: Array.from(v.workers.entries())
          .map(([worker, w]) => ({ worker, ...w, perUnitMs: w.totalMs / w.totalQty }))
          .sort((a, b) => b.totalMs - a.totalMs),
      }))
      .sort((a, b) => b.totalMs - a.totalMs);
  }

  function renderChart() {
    const rows = aggregateByModel(getRecordsForPeriod());

    els.chartEmpty.hidden = rows.length !== 0;
    els.modelChart.innerHTML = "";
    if (rows.length === 0) return;

    const maxMs = Math.max(...rows.map((r) => r.totalMs), 1);
    for (const row of rows) {
      const pct = Math.max(3, Math.round((row.totalMs / maxMs) * 100));
      const details = document.createElement("details");
      details.className = "chart-row";
      const membersHtml = row.workers.map((w) => `
        <tr>
          <td>${escapeHtml(w.worker)}</td>
          <td>${w.count}件</td>
          <td>${w.totalQty}台</td>
          <td>${escapeHtml(formatDurationMinutes(w.totalMs))}</td>
          <td>${escapeHtml(formatDurationMinutes(w.perUnitMs))}</td>
        </tr>
      `).join("");
      details.innerHTML = `
        <summary class="chart-row__summary">
          <span class="chart-row__label" title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</span>
          <span class="chart-row__bar-wrap">
            <span class="chart-row__track"><span class="chart-row__fill" style="width:${pct}%"></span></span>
            <span class="chart-row__value">${escapeHtml(formatDurationMinutes(row.totalMs))}（${row.totalQty}台・1台あたり${escapeHtml(formatDurationMinutes(row.perUnitMs))}）</span>
          </span>
        </summary>
        <div class="chart-row__members">
          <table>
            <thead><tr><th>作業者</th><th>件数</th><th>台数</th><th>合計時間</th><th>1台あたり</th></tr></thead>
            <tbody>${membersHtml}</tbody>
          </table>
        </div>
      `;
      els.modelChart.appendChild(details);
    }
  }

  els.btnExportAnalysisCsv.addEventListener("click", () => {
    const rows = aggregateByModel(getRecordsForPeriod());
    if (rows.length === 0) {
      alert("出力する記録がありません。");
      return;
    }
    const header = ["機種名", "記録数", "合計台数", "合計時間(分)", "1台あたり平均(分)", "作業者内訳"];
    const lines = [header.join(",")];
    for (const row of rows) {
      const workerSummary = row.workers
        .map((w) => `${w.worker}:${Math.round(w.totalMs / 60000)}分/${w.totalQty}台`)
        .join(" / ");
      const cells = [
        row.name,
        String(row.count),
        String(row.totalQty),
        String(Math.round(row.totalMs / 60000)),
        String(Math.round(row.perUnitMs / 60000)),
        workerSummary,
      ];
      lines.push(cells.map(csvEscape).join(","));
    }
    const periodLabel = chartPeriodValue === "all" ? "全期間" : chartPeriodValue;
    const csvContent = "﻿" + lines.join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `production-time-analysis-${periodLabel}-${toDateStr(new Date())}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // --- 計画No.別分析（1件1件の作業の合計時間・作業者内訳）---

  // 計画No.ごとに合計時間・台数・1台あたりの時間を集計し、関わった作業者ごとの内訳も付与する
  function aggregateByPlanNo(rows) {
    const byPlan = new Map();
    for (const r of rows) {
      const qty = r.quantity && r.quantity > 0 ? r.quantity : 1;
      const planKey = r.planNo || "(計画No.なし)";
      const cur = byPlan.get(planKey) || { planNo: planKey, itemNames: new Set(), totalMs: 0, totalQty: 0, count: 0, workers: new Map() };
      cur.itemNames.add(r.itemName);
      cur.totalMs += r.durationMs;
      cur.totalQty += qty;
      cur.count += 1;
      const workerName = r.worker || "(未入力)";
      const w = cur.workers.get(workerName) || { totalMs: 0, totalQty: 0, count: 0 };
      w.totalMs += r.durationMs;
      w.totalQty += qty;
      w.count += 1;
      cur.workers.set(workerName, w);
      byPlan.set(planKey, cur);
    }
    return Array.from(byPlan.values())
      .map((v) => ({
        planNo: v.planNo,
        itemName: Array.from(v.itemNames).join("・"),
        totalMs: v.totalMs,
        totalQty: v.totalQty,
        count: v.count,
        perUnitMs: v.totalMs / v.totalQty,
        workers: Array.from(v.workers.entries())
          .map(([worker, w]) => ({ worker, ...w, perUnitMs: w.totalMs / w.totalQty }))
          .sort((a, b) => b.totalMs - a.totalMs),
      }))
      .sort((a, b) => b.totalMs - a.totalMs);
  }

  function renderPlannoChart() {
    const rows = aggregateByPlanNo(getRecordsForPeriod());

    els.plannoChartEmpty.hidden = rows.length !== 0;
    els.plannoChart.innerHTML = "";
    if (rows.length === 0) return;

    const maxMs = Math.max(...rows.map((r) => r.totalMs), 1);
    for (const row of rows) {
      const pct = Math.max(3, Math.round((row.totalMs / maxMs) * 100));
      const details = document.createElement("details");
      details.className = "chart-row";
      const label = `${row.planNo}｜${row.itemName}`;
      const membersHtml = row.workers.map((w) => `
        <tr>
          <td>${escapeHtml(w.worker)}</td>
          <td>${w.count}件</td>
          <td>${w.totalQty}台</td>
          <td>${escapeHtml(formatDurationMinutes(w.totalMs))}</td>
          <td>${escapeHtml(formatDurationMinutes(w.perUnitMs))}</td>
        </tr>
      `).join("");
      details.innerHTML = `
        <summary class="chart-row__summary">
          <span class="chart-row__label" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
          <span class="chart-row__bar-wrap">
            <span class="chart-row__track"><span class="chart-row__fill" style="width:${pct}%"></span></span>
            <span class="chart-row__value">${escapeHtml(formatDurationMinutes(row.totalMs))}（${row.totalQty}台・1台あたり${escapeHtml(formatDurationMinutes(row.perUnitMs))}）</span>
          </span>
        </summary>
        <div class="chart-row__members">
          <table>
            <thead><tr><th>作業者</th><th>件数</th><th>台数</th><th>合計時間</th><th>1台あたり</th></tr></thead>
            <tbody>${membersHtml}</tbody>
          </table>
        </div>
      `;
      els.plannoChart.appendChild(details);
    }
  }

  els.btnExportPlannoCsv.addEventListener("click", () => {
    const rows = aggregateByPlanNo(getRecordsForPeriod());
    if (rows.length === 0) {
      alert("出力する記録がありません。");
      return;
    }
    const header = ["計画No.", "機種名", "記録数", "合計台数", "合計時間(分)", "1台あたり平均(分)", "作業者内訳"];
    const lines = [header.join(",")];
    for (const row of rows) {
      const workerSummary = row.workers
        .map((w) => `${w.worker}:${Math.round(w.totalMs / 60000)}分/${w.totalQty}台`)
        .join(" / ");
      const cells = [
        row.planNo,
        row.itemName,
        String(row.count),
        String(row.totalQty),
        String(Math.round(row.totalMs / 60000)),
        String(Math.round(row.perUnitMs / 60000)),
        workerSummary,
      ];
      lines.push(cells.map(csvEscape).join(","));
    }
    const periodLabel = chartPeriodValue === "all" ? "全期間" : chartPeriodValue;
    const csvContent = "﻿" + lines.join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `production-time-planno-analysis-${periodLabel}-${toDateStr(new Date())}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  renderAll();
})();
