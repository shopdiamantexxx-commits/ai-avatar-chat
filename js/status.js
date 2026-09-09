(() => {
  "use strict";

  const STORAGE_KEY = "production-time-records";
  const ACTIVE_SESSIONS_KEY = "production-time-active-sessions";
  const RECORDS_COLLECTION = "records";
  const ACTIVE_SESSIONS_COLLECTION = "activeSessions";

  const els = {
    liveStatusChart: document.getElementById("live-status-chart"),
    liveStatusList: document.getElementById("live-status-list"),
    liveStatusEmpty: document.getElementById("live-status-empty"),
    dailyChartPeriod: document.getElementById("daily-chart-period"),
    dailyChart: document.getElementById("daily-chart"),
    dailyChartEmpty: document.getElementById("daily-chart-empty"),
    hourlyChart: document.getElementById("hourly-chart"),
    hourlyChartEmpty: document.getElementById("hourly-chart-empty"),
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

  function loadActiveSessions() {
    try {
      const raw = localStorage.getItem(ACTIVE_SESSIONS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((s) => ({ ...s, sessionStart: new Date(s.sessionStart) }));
    } catch (e) {
      console.error("進行中の記録の読み込みに失敗しました", e);
      return [];
    }
  }

  function sessionFromCloudData(data) {
    return { ...data, sessionStart: new Date(data.sessionStart) };
  }

  /** @type {Record[]} */
  let records = loadRecords();
  let activeSessions = loadActiveSessions();

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
          renderDailyChartPeriodOptions();
          renderDailyChart();
          renderHourlyChart();
        },
        (err) => {
          console.error("db sync error", err);
          setSyncStatus("local", "共有が中断されました（この端末のみ）");
        }
      );

      dbApi.collection(ACTIVE_SESSIONS_COLLECTION).onSnapshot(
        (snap) => {
          activeSessions = snap.docs.map((d) => sessionFromCloudData(d.data()));
          renderLiveStatus();
        },
        (err) => console.error("active sessions sync error", err)
      );
    } catch (e) {
      console.error("Firebaseの初期化に失敗しました", e);
      setSyncStatus("local", "この端末のみに保存（クラウド接続エラー）");
    }
  })();

  // --- 縦棒グラフの共通描画 ---

  // bars: [{ label, value, title, barClass }]
  function renderVerticalBars(container, bars, formatValue) {
    container.innerHTML = "";
    const maxValue = Math.max(...bars.map((b) => b.value), 1);
    for (const bar of bars) {
      const pct = bar.value > 0 ? Math.max(4, Math.round((bar.value / maxValue) * 100)) : 0;
      const col = document.createElement("div");
      col.className = "vbar-chart__col";
      col.title = bar.title || "";
      col.innerHTML = `
        <div class="vbar-chart__bar-wrap">
          <div class="vbar-chart__bar${bar.barClass ? " " + bar.barClass : ""}" style="height:${pct}%"></div>
        </div>
        <div class="vbar-chart__value">${bar.value > 0 ? escapeHtml(formatValue(bar.value)) : ""}</div>
        <div class="vbar-chart__label">${escapeHtml(bar.label)}</div>
      `;
      container.appendChild(col);
    }
  }

  // --- ① リアルタイム稼働状況 ---

  function renderLiveStatus() {
    const running = activeSessions.filter((s) => s.running);
    const paused = activeSessions.filter((s) => !s.running);

    renderVerticalBars(
      els.liveStatusChart,
      [
        { label: "計測中", value: running.length, barClass: "vbar-chart__bar--good", title: `計測中: ${running.length}件` },
        { label: "一時停止中", value: paused.length, barClass: "vbar-chart__bar--warn", title: `一時停止中: ${paused.length}件` },
      ],
      (v) => `${v}件`
    );

    els.liveStatusEmpty.hidden = activeSessions.length !== 0;
    els.liveStatusList.innerHTML = activeSessions
      .slice()
      .sort((a, b) => (a.running === b.running ? 0 : a.running ? -1 : 1))
      .map((s) => `
        <div class="live-status-item">
          <span class="session-card__badge${s.running ? "" : " session-card__badge--paused"}">${s.running ? "計測中" : "一時停止中"}</span>
          <span class="live-status-item__worker">${escapeHtml(s.worker || "(未入力)")}</span>
          <span class="live-status-item__meta">${escapeHtml(s.itemName)}${s.planNo ? `・計画No.${escapeHtml(s.planNo)}` : ""}</span>
        </div>
      `).join("");
  }

  // --- ② 日別・③ 時間帯別 稼働時間（期間フィルタは共通）---

  let periodValue = "all";

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

  function renderDailyChartPeriodOptions() {
    const months = getAvailableMonths();
    const options = [`<option value="all">全期間（直近14日）</option>`]
      .concat(months.map((m) => `<option value="${m}">${escapeHtml(monthLabel(m))}</option>`));
    els.dailyChartPeriod.innerHTML = options.join("");
    if (periodValue !== "all" && !months.includes(periodValue)) {
      periodValue = "all";
    }
    els.dailyChartPeriod.value = periodValue;
  }

  els.dailyChartPeriod.addEventListener("change", () => {
    periodValue = els.dailyChartPeriod.value;
    renderDailyChart();
    renderHourlyChart();
  });

  function getRecordsForPeriod() {
    if (periodValue === "all") return records;
    return records.filter((r) => monthKey(r.date) === periodValue);
  }

  function daysInMonth(year, month1to12) {
    return new Date(year, month1to12, 0).getDate();
  }

  function renderDailyChart() {
    const periodRecords = getRecordsForPeriod();
    const totalsByDate = new Map();
    for (const r of periodRecords) {
      if (!r.date) continue;
      totalsByDate.set(r.date, (totalsByDate.get(r.date) || 0) + (r.durationMs || 0));
    }

    let dateList;
    if (periodValue === "all") {
      dateList = [];
      const today = new Date();
      for (let i = 13; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
        dateList.push(toDateStr(d));
      }
    } else {
      const [y, m] = periodValue.split("-").map(Number);
      const count = daysInMonth(y, m);
      dateList = Array.from({ length: count }, (_, i) => `${periodValue}-${pad2(i + 1)}`);
    }

    const hasAnyData = dateList.some((d) => totalsByDate.has(d));
    els.dailyChartEmpty.hidden = hasAnyData;
    if (!hasAnyData) {
      els.dailyChart.innerHTML = "";
      return;
    }

    const bars = dateList.map((dateStr) => {
      const ms = totalsByDate.get(dateStr) || 0;
      const day = Number(dateStr.slice(8, 10));
      return {
        label: String(day),
        value: ms,
        title: `${dateStr}: ${formatDurationMinutes(ms)}`,
      };
    });
    renderVerticalBars(els.dailyChart, bars, formatDurationMinutes);
  }

  function renderHourlyChart() {
    const periodRecords = getRecordsForPeriod();
    const totalsByHour = new Array(24).fill(0);
    let hasTimedRecord = false;
    for (const r of periodRecords) {
      if (!r.startTime || r.startTime === "-") continue;
      const hour = Number(r.startTime.slice(0, 2));
      if (Number.isNaN(hour) || hour < 0 || hour > 23) continue;
      totalsByHour[hour] += r.durationMs || 0;
      hasTimedRecord = true;
    }

    els.hourlyChartEmpty.hidden = hasTimedRecord;
    if (!hasTimedRecord) {
      els.hourlyChart.innerHTML = "";
      return;
    }

    const bars = totalsByHour.map((ms, hour) => ({
      label: `${hour}`,
      value: ms,
      title: `${hour}時台: ${formatDurationMinutes(ms)}`,
    }));
    renderVerticalBars(els.hourlyChart, bars, formatDurationMinutes);
  }

  renderLiveStatus();
  renderDailyChartPeriodOptions();
  renderDailyChart();
  renderHourlyChart();
})();
