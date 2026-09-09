(() => {
  "use strict";

  const STORAGE_KEY = "production-time-records";
  const ACTIVE_SESSIONS_KEY = "production-time-active-sessions";
  const DEVICE_ID_KEY = "production-time-device-id";

  // この端末を識別するID。稼働タイマー欄には自分の端末の進行中セッションだけを表示するために使う
  function getDeviceId() {
    try {
      let id = localStorage.getItem(DEVICE_ID_KEY);
      if (!id) {
        id = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem(DEVICE_ID_KEY, id);
      }
      return id;
    } catch (e) {
      return "dev-unknown";
    }
  }
  const DEVICE_ID = getDeviceId();

  // 選択可能な機種名一覧（重複は自動的に除去される）
  const MODEL_LIST_RAW = [
    "ADF-010J-V2", "ADF-010A-V2", "ADF-010G", "ADF710J", "ADF-720J", "ADP-420TG", "ADP-218VU", "ADP-218TU",
    "AF-700J", "AF-720J", "AF-1000J-V2", "AF-1000E-V2", "AF-1000U-V2", "AHP-218-V2", "AHP-336-V2", "AHP-554-V2",
    "AHP-654-V2", "AHP-642U-V2", "AHP-218G", "AHP-554G", "ASP210", "ALP500J", "DF-050J-V5", "DF-050U-V4",
    "DF-050E-V5", "DF-100A-V3", "DF-100E-V3", "DF-100J-V3", "DF-100U-V3", "DF-200J", "DF-200E", "DF-250J",
    "DF-250U", "DF-250E", "DF550E", "DF-730J-V3", "DF-740U-V3", "DF-740E-V3", "DP-130RJ-V3", "DP-130LJ-V3",
    "DP-130RJ-V4", "DP-230LJ-V3", "DP-400RJ-V3", "DP-420TU-V2", "DP-420TE-V2", "DP-450RE-V3", "DP-445RJ-V3",
    "DP-610TU-V2", "DP-610TE-V2", "DP-830J", "DP-870U", "DP-870E", "DS-300Ｊ", "DS-300A", "DS-300U", "DS-300E",
    "FS-761A", "FS-762A", "FS-763A", "FS-763M", "FS-101", "FS-102", "HDP-420TU-V2", "HDP610TE-V2", "HDP-610TU-V2",
    "LP-1110J", "LP-1210J", "LP-1300J", "LP-1300U", "LP-1300E", "LP-140J-V3", "LP-145A-V3", "LP-145E-V3",
    "LP-145J-V2", "LP-145J-V3", "LP-190E-V2", "LP-190U-V2", "LP-1600U", "LP370E-V2", "LP-370E-V2", "LP-5000J",
    "LP-530A-V3", "LP-550A-V3", "LP-550E-V3", "LP-550J-V3", "LP-5600U", "LP-5570U", "LP-5570E", "LP-570U-V2",
    "LP-570E-V2", "LP-590E", "LP-590U", "LP-6000J", "LP-6000U", "LP-6000E", "LP-660E-V2", "LP-685E", "LP-685J",
    "LP-685U", "LP-690E-V3", "LP-690J-V3", "LP-690U-V3", "LP-695J-V2", "MF-300E", "MF-300J", "MF-300U", "MF-350E",
    "PM-428J", "PM-460E", "PM-460J", "PM-465A", "PM-470J", "PM-470U", "PM-470E", "PS-240E-V2", "PS-290HU",
    "PS-290U-V3", "PS-5000J", "RH750", "SD-035JS", "SD-035JT", "SD-056J", "SD-072J", "SDP-840J", "SDP-880U",
    "SDP-880E", "ST-9100LU", "ST-9100RU", "ST-9100RE", "ST-9100DRU", "ST-9100DLU", "ST-9200LU", "ST-9200RU",
    "ST-9200RJ", "ST-9200RE", "ST-9300RU", "ST-9300LU", "ST-9300RJ", "ST-9300RE", "ST-9300LJ", "ST-9300DRU",
    "ST-9300DLU", "ST-9400LE", "ST-9400RJ", "ST-9400LJ", "ST-9400RE", "ST-9400RU", "ST-9400DRJ", "ST-9400DRE",
    "ST-9400HRE", "ST-9480DRE", "ST-9200RD", "ST-9200DLE", "ST-9200DRE", "ST-9200DRU", "ST-9200DRJ", "ST-9300DRE",
    "ND-8500J", "SR-200U-V2", "SKB-1", "SKB-2", "SP-330T", "SP-3000J", "SP-3300J", "SP-3300U", "SP-3200J",
    "SP-3１00J", "SP-3400J", "SP-3400E", "SP-3400U", "SW100J", "ｸｰﾙﾌｧﾝ", "ADF-740N", "ADF-740NB", "ALP-600B",
    "ALP-600E", "ALP-5400B", "ALP-5400E", "ADF-100N", "ADF-100NB", "ADP-610N", "ALP-600G",
  ];
  const MODEL_LIST = Array.from(new Set(MODEL_LIST_RAW)).sort((a, b) => a.localeCompare(b, "ja"));

  // --- 計画表（計画No. → 機種名・台数）---
  // 計画No.は計画表のA列「№」を参照する（管理No.、行ごとに一意）

  const PLAN_TABLE_KEY = "production-time-plan-table";

  // 初期データ（渡された計画表より）。計画No.入力時の機種名・台数自動入力に使用
  const PLAN_TABLE_SEED = [
    { planNo:"381", itemName:"LP-1600U", quantity:2 }, { planNo:"371", itemName:"LP-690E-V3", quantity:1 }, { planNo:"376", itemName:"ST-9400DRJ", quantity:1 }, { planNo:"377", itemName:"STM-900J", quantity:1 },
    { planNo:"374", itemName:"RH-750J", quantity:1 }, { planNo:"400", itemName:"DF-050J-V5", quantity:1 }, { planNo:"401", itemName:"MF-300U", quantity:2 }, { planNo:"402", itemName:"HDP-610TU-V2", quantity:2 },
    { planNo:"403", itemName:"AF-700J", quantity:1 }, { planNo:"405", itemName:"LP-695J-V2", quantity:3 }, { planNo:"406", itemName:"LP-5570E", quantity:1 }, { planNo:"398", itemName:"SDP-880U", quantity:2 },
    { planNo:"420", itemName:"ST-9200DRU", quantity:1 }, { planNo:"421", itemName:"ST-9200DRU", quantity:1 }, { planNo:"422", itemName:"SKB-2U", quantity:2 }, { planNo:"408", itemName:"ADF-740NB", quantity:1 },
    { planNo:"409", itemName:"DF-740E-V3", quantity:1 }, { planNo:"410", itemName:"ADF-100NB", quantity:1 }, { planNo:"411", itemName:"AHP-654-V2", quantity:1 }, { planNo:"412", itemName:"LP-1300E", quantity:1 },
    { planNo:"413", itemName:"ALP-600B", quantity:2 }, { planNo:"414", itemName:"ALP-600B", quantity:2 }, { planNo:"415", itemName:"ALP-5400B", quantity:2 }, { planNo:"416", itemName:"ALP-5400B", quantity:2 },
    { planNo:"417", itemName:"DP-130RJ-V3", quantity:3 }, { planNo:"418", itemName:"LP-695J-V2", quantity:2 }, { planNo:"419", itemName:"LP-550J-V3", quantity:2 }, { planNo:"423", itemName:"MF-300U", quantity:2 },
    { planNo:"424", itemName:"HDP-420TU-V2", quantity:2 }, { planNo:"407", itemName:"ST-9200DRE", quantity:1 }, { planNo:"425", itemName:"DF-730J-V3", quantity:3 }, { planNo:"431", itemName:"LP-5000J", quantity:3 },
    { planNo:"432", itemName:"DF250J", quantity:3 }, { planNo:"426", itemName:"AHP-654-V2", quantity:1 }, { planNo:"427", itemName:"LP-5570E", quantity:1 }, { planNo:"428", itemName:"DF-740E-V3", quantity:2 },
    { planNo:"429", itemName:"ST-9200RE", quantity:1 }, { planNo:"430", itemName:"ST-9200RE", quantity:1 }, { planNo:"", itemName:"ST-9300DLJ", quantity:1 }, { planNo:"267", itemName:"DF-050E-V4", quantity:4 },
    { planNo:"273", itemName:"AHP-654-V2", quantity:3 }, { planNo:"", itemName:"LP-1300U", quantity:2 }, { planNo:"", itemName:"ST-9300LU", quantity:1 }, { planNo:"274", itemName:"LP-190E-V2", quantity:2 },
    { planNo:"271", itemName:"DF-250E", quantity:2 }, { planNo:"272", itemName:"ADP-218TU", quantity:2 }, { planNo:"275", itemName:"LP-1300E", quantity:3 }, { planNo:"277", itemName:"SDP-880E", quantity:6 },
    { planNo:"404", itemName:"LP-5000J", quantity:2 },
  ];

  function normalizePlanNoText(v) {
    return (v || "").replace(/－/g, "-").trim();
  }

  function lookupPlan(planNoInput) {
    const q = normalizePlanNoText(planNoInput).toLowerCase();
    if (!q) return null;
    return planTable.find((p) => normalizePlanNoText(p.planNo).toLowerCase() === q) || null;
  }

  // 「429, 430」のように複数の計画No.をまとめて入力した場合、それぞれの機種名・台数を
  // 合算して自動入力する（同じ作業者が複数の計画No.を同時に作業するケースに対応）
  function parsePlanNoList(value) {
    return (value || "")
      .split(/[,、]/)
      .map((s) => normalizePlanNoText(s))
      .filter(Boolean);
  }

  function applyPlanAutoFill(planInput, itemNameInput, quantityInput) {
    const matches = parsePlanNoList(planInput.value).map((no) => lookupPlan(no)).filter(Boolean);
    if (matches.length === 0) return;
    const itemNames = Array.from(new Set(matches.map((m) => m.itemName)));
    itemNameInput.value = itemNames.join("・");
    const totalQty = matches.reduce((sum, m) => sum + (m.quantity || 1), 0);
    quantityInput.value = String(totalQty);
  }

  function parsePlanTableText(text) {
    const entries = [];
    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;
      const cells = line.split(/\t|,/).map((c) => c.trim());
      if (cells.length < 3) continue;
      const [planNo, itemName, quantityStr] = cells;
      if (!planNo || !itemName) continue;
      if (planNo === "計画No" || planNo === "計画No." || planNo === "№") continue; // ヘッダー行はスキップ
      const quantity = parseQuantity(quantityStr);
      entries.push({ planNo: normalizePlanNoText(planNo), itemName, quantity });
    }
    return entries;
  }

  // エクセルの計画表（A〜C列、15行目以降）を計画No.・機種名・台数として読み込む
  function parsePlanTableSheetRows(rows) {
    const entries = [];
    for (let i = 14; i < rows.length; i++) {
      const row = rows[i] || [];
      const rawItemName = row[1];
      const itemName = rawItemName === undefined || rawItemName === null ? "" : String(rawItemName).trim();
      if (!itemName || itemName === "機種名") continue; // 空行・見出し行の繰り返しはスキップ
      const rawPlanNo = row[0];
      const planNo = normalizePlanNoText(rawPlanNo === undefined || rawPlanNo === null ? "" : String(rawPlanNo));
      if (planNo === "№" || planNo === "色") continue; // 見出し行の繰り返しはスキップ
      const quantity = parseQuantity(row[2]);
      entries.push({ planNo, itemName, quantity });
    }
    return entries;
  }

  function loadPlanTable() {
    try {
      const raw = localStorage.getItem(PLAN_TABLE_KEY);
      if (raw === null) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function savePlanTable() {
    try { localStorage.setItem(PLAN_TABLE_KEY, JSON.stringify(planTable)); } catch (e) {}
  }

  let planTable = loadPlanTable();
  if (planTable === null) {
    planTable = PLAN_TABLE_SEED;
    savePlanTable();
  }

  /** @typedef {{id: string, itemName: string, quantity: number, date: string, startTime: string, endTime: string, durationMs: number}} Record */

  const els = {
    itemName: document.getElementById("item-name"),
    itemNameList: document.getElementById("item-name-listbox"),
    planNo: document.getElementById("plan-no"),
    planNoList: document.getElementById("plan-no-listbox"),
    itemQuantity: document.getElementById("item-quantity"),
    workerName: document.getElementById("worker-name"),
    workerSuggestions: document.getElementById("worker-suggestions"),
    btnStart: document.getElementById("btn-start"),
    andon: document.getElementById("andon"),
    activeSessions: document.getElementById("active-sessions"),
    sessionsEmpty: document.getElementById("sessions-empty"),
    manualItemName: document.getElementById("manual-item-name"),
    manualItemNameList: document.getElementById("manual-item-name-listbox"),
    manualPlanNo: document.getElementById("manual-plan-no"),
    manualPlanNoList: document.getElementById("manual-plan-no-listbox"),
    manualDuration: document.getElementById("manual-duration"),
    manualStartTime: document.getElementById("manual-start-time"),
    manualEndTime: document.getElementById("manual-end-time"),
    manualDate: document.getElementById("manual-date"),
    manualQuantity: document.getElementById("manual-quantity"),
    manualWorkerName: document.getElementById("manual-worker-name"),
    btnManualAdd: document.getElementById("btn-manual-add"),
    planPdfPanes: document.getElementById("plan-pdf-panes"),
    planPdfPaneB: document.getElementById("plan-pdf-pane-b"),
    btnToggleDualPdf: document.getElementById("btn-toggle-dual-pdf"),
    planPdfViewport: document.getElementById("plan-pdf-viewport"),
    planPdfCanvas: document.getElementById("plan-pdf-canvas"),
    planPdfStatus: document.getElementById("plan-pdf-status"),
    btnPdfZoomIn: document.getElementById("btn-pdf-zoom-in"),
    btnPdfZoomOut: document.getElementById("btn-pdf-zoom-out"),
    btnPdfZoomReset: document.getElementById("btn-pdf-zoom-reset"),
    pdfZoomLevel: document.getElementById("pdf-zoom-level"),
    planPdfViewportB: document.getElementById("plan-pdf-viewport-b"),
    planPdfCanvasB: document.getElementById("plan-pdf-canvas-b"),
    planPdfStatusB: document.getElementById("plan-pdf-status-b"),
    btnPdfZoomInB: document.getElementById("btn-pdf-zoom-in-b"),
    btnPdfZoomOutB: document.getElementById("btn-pdf-zoom-out-b"),
    btnPdfZoomResetB: document.getElementById("btn-pdf-zoom-reset-b"),
    pdfZoomLevelB: document.getElementById("pdf-zoom-level-b"),
    planPdfTabsB: document.getElementById("plan-pdf-tabs-b"),
    recordsTbody: document.getElementById("records-tbody"),
    emptyMessage: document.getElementById("empty-message"),
    filterDate: document.getElementById("filter-date"),
    btnClearFilter: document.getElementById("btn-clear-filter"),
    btnExportCsv: document.getElementById("btn-export-csv"),
    btnClearAll: document.getElementById("btn-clear-all"),
    planTablePanel: document.getElementById("plan-table-panel"),
    planTableInput: document.getElementById("plan-table-input"),
    btnImportPlanTable: document.getElementById("btn-import-plan-table"),
    btnClearPlanTable: document.getElementById("btn-clear-plan-table"),
    planTableStatus: document.getElementById("plan-table-status"),
    planTableExcelFile: document.getElementById("plan-table-excel-file"),
    planTableExcelStatus: document.getElementById("plan-table-excel-status"),
    planPdfFile: document.getElementById("plan-pdf-file"),
    planPdfUploadStatus: document.getElementById("plan-pdf-upload-status"),
    planPdfTabs: document.getElementById("plan-pdf-tabs"),
    planPdfAdminList: document.getElementById("plan-pdf-admin-list"),
    planPdfNewName: document.getElementById("plan-pdf-new-name"),
    btnAddPlanPdf: document.getElementById("btn-add-plan-pdf"),
    breakPeriodsList: document.getElementById("break-periods-list"),
    btnAddBreakPeriod: document.getElementById("btn-add-break-period"),
  };

  function parseQuantity(value) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  // --- 機種名・計画No.の絞り込みコンボボックス ---

  function setupCombobox(input, listEl, options, onSelect, { multi = false } = {}) {
    let matches = [];
    let activeIndex = -1;

    function normalize(str) {
      return str.toLowerCase().replace(/-/g, "");
    }

    // 候補は文字列、または { value, label } （検索対象はvalue、表示はlabel）のどちらでも受け付ける
    function currentOptions() {
      const raw = typeof options === "function" ? options() : options;
      return raw.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
    }

    // 複数選択モードでは「429, 430」のように既に確定した値の後ろに、今入力中の断片だけを
    // 検索クエリとして使う（カンマの後ろの部分）
    function committedValues() {
      if (!multi) return [];
      return input.value.split(/[,、]/).map((s) => s.trim()).filter(Boolean);
    }

    function currentQuery() {
      if (!multi) return input.value;
      const idx = Math.max(input.value.lastIndexOf(","), input.value.lastIndexOf("、"));
      return idx === -1 ? input.value : input.value.slice(idx + 1);
    }

    function getMatches(query) {
      const list = currentOptions();
      const q = normalize(query.trim());
      if (!q) return list;
      const starts = [];
      const contains = [];
      for (const o of list) {
        const norm = normalize(o.value);
        if (norm.startsWith(q)) starts.push(o);
        else if (norm.includes(q)) contains.push(o);
      }
      return [...starts, ...contains];
    }

    function renderList() {
      matches = getMatches(currentQuery());
      activeIndex = -1;
      listEl.innerHTML = "";
      if (matches.length === 0) {
        const li = document.createElement("li");
        li.className = "combobox__empty";
        li.textContent = "一致する候補がありません";
        listEl.appendChild(li);
        return;
      }
      const selected = multi ? committedValues() : [];
      matches.forEach((o) => {
        const li = document.createElement("li");
        li.className = "combobox__option";
        li.textContent = selected.includes(o.value) ? `✓ ${o.label}` : o.label;
        li.setAttribute("role", "option");
        li.addEventListener("mousedown", (e) => {
          e.preventDefault();
          select(o.value);
        });
        listEl.appendChild(li);
      });
    }

    function select(value) {
      if (multi) {
        // 末尾がカンマ区切りで確定済みならそのまま追加、入力途中の断片なら置き換える
        const endsWithDelimiter = /[,、]\s*$/.test(input.value) || input.value.trim() === "";
        const parts = input.value.split(/[,、]/).map((s) => s.trim()).filter(Boolean);
        if (!endsWithDelimiter && parts.length > 0) {
          parts[parts.length - 1] = value;
        } else if (!parts.includes(value)) {
          parts.push(value);
        }
        const seen = new Set();
        const deduped = parts.filter((p) => (seen.has(p) ? false : (seen.add(p), true)));
        input.value = `${deduped.join(", ")}, `;
        if (onSelect) onSelect(value);
        // キーボード・候補一覧は閉じずに続けて選べるようにする（欄の外をタップすると確定）
        renderList();
        return;
      }
      input.value = value;
      closeList();
      if (onSelect) onSelect(value);
      // 選択直後にキーボードを閉じ、自動入力された機種名・台数がすぐ見えるようにする
      input.blur();
    }

    function openList() {
      renderList();
      listEl.hidden = false;
      input.setAttribute("aria-expanded", "true");
    }

    function closeList() {
      listEl.hidden = true;
      input.setAttribute("aria-expanded", "false");
      activeIndex = -1;
    }

    function updateActive() {
      Array.from(listEl.children).forEach((child, i) => {
        child.classList.toggle("is-active", i === activeIndex);
        if (i === activeIndex) child.scrollIntoView({ block: "nearest" });
      });
    }

    input.addEventListener("focus", () => {
      // 複数選択モードで既に確定済みの値がある状態から再度開いた場合は、続けて選べるよう
      // 区切りを補って候補を絞り込まないようにする（未入力の断片が残っている場合はそのまま）
      if (multi && input.value && !/[,、]\s*$/.test(input.value)) {
        input.value += ", ";
      }
      openList();
    });
    input.addEventListener("input", openList);
    input.addEventListener("keydown", (e) => {
      if (listEl.hidden && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        openList();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, matches.length - 1);
        updateActive();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        updateActive();
      } else if (e.key === "Enter") {
        if (activeIndex >= 0 && matches[activeIndex]) {
          e.preventDefault();
          select(matches[activeIndex].value);
        } else {
          closeList();
        }
      } else if (e.key === "Escape") {
        closeList();
      }
    });
    input.addEventListener("blur", closeList);
  }

  // 計画No.の候補には機種名・台数も添えて表示し、タップするだけで計画表から選べるようにする
  function planTableOptions() {
    return [...planTable]
      .filter((p) => p.planNo) // 計画No.未採番の行は選択肢に出さない（表には表示する）
      .sort((a, b) => {
        const na = Number(a.planNo);
        const nb = Number(b.planNo);
        if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
        return String(a.planNo).localeCompare(String(b.planNo));
      })
      .map((p) => ({ value: p.planNo, label: `${p.planNo}　${p.itemName}（${p.quantity}台）` }));
  }

  setupCombobox(els.itemName, els.itemNameList, MODEL_LIST);
  setupCombobox(els.manualItemName, els.manualItemNameList, MODEL_LIST);
  setupCombobox(
    els.planNo,
    els.planNoList,
    planTableOptions,
    () => applyPlanAutoFill(els.planNo, els.itemName, els.itemQuantity),
    { multi: true }
  );
  setupCombobox(
    els.manualPlanNo,
    els.manualPlanNoList,
    planTableOptions,
    () => applyPlanAutoFill(els.manualPlanNo, els.manualItemName, els.manualQuantity),
    { multi: true }
  );
  // 「429, 430,」のように末尾にカンマが残っていたら整えてから自動入力する
  function cleanTrailingPlanNoSeparator(input) {
    input.value = input.value.replace(/[,、]\s*$/, "");
  }
  els.planNo.addEventListener("blur", () => {
    cleanTrailingPlanNoSeparator(els.planNo);
    applyPlanAutoFill(els.planNo, els.itemName, els.itemQuantity);
  });
  els.manualPlanNo.addEventListener("blur", () => {
    cleanTrailingPlanNoSeparator(els.manualPlanNo);
    applyPlanAutoFill(els.manualPlanNo, els.manualItemName, els.manualQuantity);
  });

  // --- タッチ操作用オンスクリーンキーボード（機種名・台数入力欄用） ---

  const vkb = (() => {
    const TEXT_KEY_ROWS = [
      ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
      ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
      ["A", "S", "D", "F", "G", "H", "J", "K", "L", "-"],
      ["Z", "X", "C", "V", "B", "N", "M"],
    ];

    function textKeysHtml() {
      return (
        TEXT_KEY_ROWS.map((row) => `<div class="vkb__row">${row.map((k) => `<button type="button" class="vkb__key" data-key="${k}">${k}</button>`).join("")}</div>`).join("") +
        `<div class="vkb__row">
          <button type="button" class="vkb__key vkb__key--wide" data-vkb="clear">クリア</button>
          <button type="button" class="vkb__key vkb__key--wide" data-vkb="back">⌫ 削除</button>
        </div>`
      );
    }

    function numericKeysHtml(withComma) {
      const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
      const commaKey = withComma ? `<button type="button" class="vkb__key" data-key=",">，</button>` : "";
      return `<div class="vkb__grid">
        ${digits.map((k) => `<button type="button" class="vkb__key" data-key="${k}">${k}</button>`).join("")}
        <button type="button" class="vkb__key" data-vkb="clear">C</button>
        <button type="button" class="vkb__key" data-key="0">0</button>
        <button type="button" class="vkb__key" data-vkb="back">⌫</button>
        ${commaKey}
      </div>`;
    }

    const el = document.createElement("div");
    el.className = "vkb";
    el.hidden = true;
    el.innerHTML = `
      <div class="vkb__header">
        <span class="vkb__label" id="vkb-label"></span>
        <button type="button" class="vkb__close" data-vkb="close">閉じる</button>
      </div>
      <div class="vkb__keys" id="vkb-keys"></div>
    `;
    document.body.appendChild(el);

    const labelEl = el.querySelector("#vkb-label");
    const keysEl = el.querySelector("#vkb-keys");
    let activeInput = null;

    function fireInput() {
      activeInput.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function insert(ch) {
      if (!activeInput) return;
      const start = activeInput.selectionStart ?? activeInput.value.length;
      const end = activeInput.selectionEnd ?? activeInput.value.length;
      const val = activeInput.value;
      activeInput.value = val.slice(0, start) + ch + val.slice(end);
      const pos = start + ch.length;
      activeInput.setSelectionRange(pos, pos);
      fireInput();
    }

    function backspace() {
      if (!activeInput) return;
      const start = activeInput.selectionStart ?? activeInput.value.length;
      const end = activeInput.selectionEnd ?? activeInput.value.length;
      const val = activeInput.value;
      if (start !== end) {
        activeInput.value = val.slice(0, start) + val.slice(end);
        activeInput.setSelectionRange(start, start);
      } else if (start > 0) {
        activeInput.value = val.slice(0, start - 1) + val.slice(start);
        activeInput.setSelectionRange(start - 1, start - 1);
      }
      fireInput();
    }

    function clearAll() {
      if (!activeInput) return;
      activeInput.value = "";
      activeInput.setSelectionRange(0, 0);
      fireInput();
    }

    el.addEventListener("mousedown", (e) => {
      if (e.target.closest("button")) e.preventDefault();
    });

    el.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const action = btn.dataset.vkb;
      if (action === "close") {
        // 複数計画No.選択中などで候補一覧が開いたままにならないよう、入力欄自体も確定させる
        const input = activeInput;
        close();
        if (input) input.blur();
      } else if (action === "clear") {
        clearAll();
      } else if (action === "back") {
        backspace();
      } else if (btn.dataset.key) {
        insert(btn.dataset.key);
      }
    });

    function open(input, label, mode) {
      activeInput = input;
      labelEl.textContent = label || "";
      const isNumericLike = mode === "numeric" || mode === "planno";
      keysEl.innerHTML = isNumericLike ? numericKeysHtml(mode === "planno") : textKeysHtml();
      el.classList.toggle("vkb--numeric", isNumericLike);
      el.hidden = false;
      document.body.classList.add("vkb-open");

      // PC等の広い画面ではテンキーを入力欄の横に浮かせて表示するため、
      // 下部の余白確保やスクロールは不要
      const isFloatingDesktop = isNumericLike && window.matchMedia("(min-width: 901px)").matches;
      if (isFloatingDesktop) {
        document.body.style.paddingBottom = "";
        positionNextToInput(input);
        return;
      }
      el.style.top = "";
      el.style.left = "";
      el.style.transform = "";

      // キーボードの実際の高さに合わせて余白を確保し、隠れないよう入力欄までスクロールする
      document.body.style.paddingBottom = `${el.offsetHeight}px`;
      const inputRect = input.getBoundingClientRect();
      const vkbTop = el.getBoundingClientRect().top;
      if (inputRect.bottom > vkbTop) {
        window.scrollBy({ top: inputRect.bottom - vkbTop + 16, behavior: "smooth" });
      }
    }

    // PC等の広い画面でテンキーを表示する際、入力欄そのものやその下の項目に重ならないよう
    // 入力欄の右横に浮かせる（入っている欄自体は隠れない）
    function positionNextToInput(input) {
      const inputRect = input.getBoundingClientRect();
      const vkbHeight = el.offsetHeight;
      const vkbWidth = el.offsetWidth;
      const margin = 16;
      let left = inputRect.right + margin + vkbWidth / 2;
      if (left + vkbWidth / 2 > window.innerWidth - margin) {
        // 右側に入り切らない場合は左横に表示する
        left = inputRect.left - margin - vkbWidth / 2;
      }
      left = Math.max(margin + vkbWidth / 2, Math.min(left, window.innerWidth - margin - vkbWidth / 2));
      let top = inputRect.top + inputRect.height / 2;
      top = Math.max(margin + vkbHeight / 2, Math.min(top, window.innerHeight - margin - vkbHeight / 2));
      el.style.top = `${top}px`;
      el.style.left = `${left}px`;
      el.style.transform = "translate(-50%, -50%)";
    }

    function close() {
      el.hidden = true;
      document.body.classList.remove("vkb-open");
      document.body.style.paddingBottom = "";
      activeInput = null;
    }

    function bind(input, label, mode) {
      input.addEventListener("focus", () => open(input, label, mode));
      input.addEventListener("blur", () => {
        if (activeInput === input) close();
      });
    }

    return { bind };
  })();

  vkb.bind(els.itemName, "機種名", "text");
  vkb.bind(els.manualItemName, "機種名", "text");
  vkb.bind(els.planNo, "計画No.（複数可）", "planno");
  vkb.bind(els.manualPlanNo, "計画No.（複数可）", "planno");
  vkb.bind(els.itemQuantity, "台数", "numeric");
  vkb.bind(els.manualQuantity, "台数", "numeric");

  function digitsOnly(e) {
    const sanitized = e.target.value.replace(/[^0-9]/g, "");
    if (sanitized !== e.target.value) e.target.value = sanitized;
  }
  els.itemQuantity.addEventListener("input", digitsOnly);
  els.manualQuantity.addEventListener("input", digitsOnly);

  /** @type {Record[]} */
  let records = loadRecords();

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

  function saveRecords() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (e) {
      console.error("記録の保存に失敗しました", e);
      alert("記録の保存に失敗しました。ブラウザのプライベートモードやストレージの空き容量をご確認ください。");
    }
  }

  // --- クラウド同期（Firebase Firestore、js/firebase-config.js で設定）---

  const RECORDS_COLLECTION = "records";
  const PLAN_TABLE_DOC = "planTable/current";
  const PLAN_PDFS_COLLECTION = "planPdfs";
  const BREAK_PERIODS_DOC = "settings/breakPeriods";
  const ACTIVE_SESSIONS_COLLECTION = "activeSessions";
  let dbApi = null;
  let cloudMode = false;

  // Firestoreの日時型を挟まないよう、保存前はISO文字列、読み込み後はDateに戻す
  function sessionToCloudData(session) {
    return { ...session, sessionStart: session.sessionStart.toISOString() };
  }

  function sessionFromCloudData(data) {
    return { ...data, sessionStart: new Date(data.sessionStart) };
  }

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
      dbApi = firebase.firestore();
      cloudMode = true;
      setSyncStatus("cloud", "全端末で共有中");

      dbApi.collection(RECORDS_COLLECTION).onSnapshot(
        (snap) => {
          records = snap.docs.map((d) => d.data());
          render();
        },
        (err) => {
          console.error("db sync error", err);
          cloudMode = false;
          setSyncStatus("local", "共有が中断されました（この端末のみ）");
        }
      );

      dbApi.doc(PLAN_TABLE_DOC).onSnapshot(
        (snap) => {
          if (snap.exists) {
            const data = snap.data();
            planTable = Array.isArray(data && data.entries) ? data.entries : [];
          } else {
            dbApi.doc(PLAN_TABLE_DOC).set({ entries: planTable, updatedAt: new Date().toISOString() }).catch((e) => {
              console.error("plan table seed failed", e);
            });
          }
          updatePlanTableStatus();
        },
        (err) => console.error("plan table sync error", err)
      );

      // 複数の計画表PDFを名前付きで共有する
      dbApi.collection(PLAN_PDFS_COLLECTION).onSnapshot(
        (snap) => {
          planPdfs = snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
          loadPlanPdf();
          renderPlanPdfAdminList();
        },
        (err) => console.error("plan pdfs sync error", err)
      );

      // 休み時間の設定（管理者用）も全端末で共有する
      dbApi.doc(BREAK_PERIODS_DOC).onSnapshot(
        (snap) => {
          if (snap.exists) {
            const data = snap.data();
            BREAK_PERIODS = Array.isArray(data && data.periods) && data.periods.length > 0
              ? data.periods
              : DEFAULT_BREAK_PERIODS.map((p) => ({ ...p }));
          } else {
            dbApi.doc(BREAK_PERIODS_DOC).set({ periods: BREAK_PERIODS, updatedAt: new Date().toISOString() }).catch((e) => {
              console.error("break periods seed failed", e);
            });
          }
          renderBreakPeriodsAdmin();
        },
        (err) => console.error("break periods sync error", err)
      );

      // 進行中の計測（誰が何を計測中か）も全端末で共有する
      dbApi.collection(ACTIVE_SESSIONS_COLLECTION).onSnapshot(
        (snap) => {
          activeSessions = snap.docs.map((d) => sessionFromCloudData(d.data()));
          if (activeSessions.length > 0) ensureTicking();
          else stopTickingIfIdle();
          renderActiveSessions();
          renderTable();
        },
        (err) => console.error("active sessions sync error", err)
      );
    } catch (e) {
      console.error("Firebaseの初期化に失敗しました", e);
      setSyncStatus("local", "この端末のみに保存（クラウド接続エラー）");
    }
  })();

  function uid() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function formatMs(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  }

  function formatDurationMinutes(ms) {
    const totalMinutes = Math.round(ms / 60000);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h > 0) return `${h}時間${m}分`;
    return `${m}分`;
  }

  function toDateStr(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function toTimeStr(date) {
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  }

  // 秒付きで保存された過去の記録（"HH:MM:SS"）でも表示は分単位に揃える
  function formatClockTime(t) {
    if (!t || t === "-") return t;
    return t.slice(0, 5);
  }

  // --- 会社の休み時間（この時間帯にかかった分は自動で作業時間から差し引く） ---
  // 管理画面（?admin=1）の「④ 休み時間の設定」から変更できる

  const BREAK_PERIODS_KEY = "production-time-break-periods";
  const DEFAULT_BREAK_PERIODS = [
    { start: "10:00", end: "10:05" },
    { start: "12:00", end: "12:45" },
    { start: "15:00", end: "15:07" },
    { start: "16:55", end: "17:00" }, // 定時(16:55)を過ぎて残業する場合の休み時間
  ];

  function loadLocalBreakPeriods() {
    try {
      const raw = localStorage.getItem(BREAK_PERIODS_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_BREAK_PERIODS.map((p) => ({ ...p }));
    } catch (e) {
      console.error("休み時間の読み込みに失敗しました", e);
      return DEFAULT_BREAK_PERIODS.map((p) => ({ ...p }));
    }
  }

  function saveLocalBreakPeriods() {
    try {
      localStorage.setItem(BREAK_PERIODS_KEY, JSON.stringify(BREAK_PERIODS));
    } catch (e) {
      console.error("休み時間の保存に失敗しました", e);
    }
  }

  /** @type {{start: string, end: string}[]} */
  let BREAK_PERIODS = cloudMode ? DEFAULT_BREAK_PERIODS.map((p) => ({ ...p })) : loadLocalBreakPeriods();

  function saveBreakPeriods() {
    if (cloudMode && dbApi) {
      dbApi.doc(BREAK_PERIODS_DOC).set({ periods: BREAK_PERIODS, updatedAt: new Date().toISOString() }).catch((e) => {
        console.error("休み時間の保存に失敗しました", e);
        alert("保存に失敗しました。しばらくしてから再度お試しください。");
      });
    } else {
      saveLocalBreakPeriods();
    }
  }

  function renderBreakPeriodsAdmin() {
    if (!els.breakPeriodsList) return;
    els.breakPeriodsList.innerHTML = BREAK_PERIODS.map((p, i) => `
      <div class="break-period-row">
        <input type="time" class="break-period-start" data-index="${i}" value="${escapeHtml(p.start)}">
        <span class="break-period-sep">〜</span>
        <input type="time" class="break-period-end" data-index="${i}" value="${escapeHtml(p.end)}">
        <button type="button" class="btn btn--ghost btn--small" data-action="delete-break-period" data-index="${i}">削除</button>
      </div>
    `).join("");
  }

  els.breakPeriodsList.addEventListener("change", (e) => {
    const input = e.target;
    const index = Number(input.dataset.index);
    if (Number.isNaN(index) || !BREAK_PERIODS[index]) return;
    if (input.classList.contains("break-period-start")) {
      BREAK_PERIODS[index].start = input.value;
    } else if (input.classList.contains("break-period-end")) {
      BREAK_PERIODS[index].end = input.value;
    } else {
      return;
    }
    if (BREAK_PERIODS[index].start >= BREAK_PERIODS[index].end) {
      alert("終了時刻は開始時刻より後にしてください。");
      renderBreakPeriodsAdmin();
      return;
    }
    saveBreakPeriods();
  });

  els.breakPeriodsList.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action='delete-break-period']");
    if (!btn) return;
    const index = Number(btn.dataset.index);
    BREAK_PERIODS.splice(index, 1);
    renderBreakPeriodsAdmin();
    saveBreakPeriods();
  });

  els.btnAddBreakPeriod.addEventListener("click", () => {
    BREAK_PERIODS.push({ start: "12:00", end: "12:30" });
    renderBreakPeriodsAdmin();
    saveBreakPeriods();
  });

  // 指定した時刻(ms)が属する日について、休み時間帯を実際のDate範囲(ms)に変換する
  function breakRangesForDay(ms) {
    const d = new Date(ms);
    const y = d.getFullYear(), mo = d.getMonth(), da = d.getDate();
    return BREAK_PERIODS.map(({ start, end }) => {
      const [sh, sm] = start.split(":").map(Number);
      const [eh, em] = end.split(":").map(Number);
      return {
        start: new Date(y, mo, da, sh, sm, 0, 0).getTime(),
        end: new Date(y, mo, da, eh, em, 0, 0).getTime(),
      };
    });
  }

  function overlapMs(aStart, aEnd, bStart, bEnd) {
    return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
  }

  // 稼働区間（一時停止をまたぐ複数区間）が休み時間帯と重なる分の合計を求める
  function totalBreakOverlapMs(intervals) {
    let total = 0;
    for (const iv of intervals) {
      for (const b of breakRangesForDay(iv.start)) {
        total += overlapMs(iv.start, iv.end, b.start, b.end);
      }
    }
    return total;
  }

  // セッションの実際の稼働区間一覧（完了した一時停止区間 + 現在稼働中の区間）を返す
  function sessionIntervals(session, nowMs) {
    const segments = Array.isArray(session.segments) ? session.segments : [];
    if (session.running) {
      return [...segments, { start: session.startedAt, end: nowMs }];
    }
    return segments;
  }

  function sessionRawDurationMs(session, nowMs) {
    return sessionIntervals(session, nowMs).reduce((sum, iv) => sum + Math.max(0, iv.end - iv.start), 0);
  }

  // 休み時間を自動で差し引いた実稼働時間(ms)を返す
  function sessionNetDurationMs(session, nowMs) {
    const intervals = sessionIntervals(session, nowMs);
    const rawMs = intervals.reduce((sum, iv) => sum + Math.max(0, iv.end - iv.start), 0);
    const breakMs = totalBreakOverlapMs(intervals);
    return Math.max(0, rawMs - breakMs);
  }

  // --- Timer controls（同じ端末で複数人が同時に計測できるよう、進行中セッションを配列で管理） ---

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

  function saveActiveSessions() {
    try {
      localStorage.setItem(ACTIVE_SESSIONS_KEY, JSON.stringify(activeSessions));
    } catch (e) {
      console.error("進行中の記録の保存に失敗しました", e);
    }
  }

  /** @type {{id: string, itemName: string, quantity: number, worker: string, startedAt: number, accumulatedMs: number, running: boolean, sessionStart: Date}[]} */
  let activeSessions = loadActiveSessions();
  let tickInterval = null;

  // --- 長時間計測（止め忘れ）の通知。設定はjs/settings.jsのパネルから行う ---
  const NOTIFY_SETTINGS_KEY = "production-time-notify-settings";
  const notifiedSessionIds = new Set();

  function loadNotifySettings() {
    try {
      const raw = localStorage.getItem(NOTIFY_SETTINGS_KEY);
      if (!raw) return { enabled: false, thresholdMinutes: 600 };
      const data = JSON.parse(raw);
      // 以前のバージョン（時間単位）からの移行
      if (data.thresholdMinutes == null && data.thresholdHours != null) {
        data.thresholdMinutes = Number(data.thresholdHours) * 60;
      }
      const thresholdMinutes = Number(data.thresholdMinutes);
      return { enabled: !!data.enabled, thresholdMinutes: thresholdMinutes > 0 ? thresholdMinutes : 600 };
    } catch (e) {
      return { enabled: false, thresholdMinutes: 600 };
    }
  }

  // 稼働中（一時停止していない）の実働時間が設定した時間を超えたら、この端末で1回だけ通知する
  function checkLongRunningNotifications() {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const settings = loadNotifySettings();
    if (!settings.enabled) return;
    const thresholdMs = settings.thresholdMinutes * 60 * 1000;
    const now = Date.now();
    for (const s of activeSessions) {
      if (!s.running || notifiedSessionIds.has(s.id)) continue;
      if (sessionRawDurationMs(s, now) >= thresholdMs) {
        notifiedSessionIds.add(s.id);
        try {
          new Notification("計測が長時間続いています", {
            body: `${s.worker ? `${s.worker}さんの` : ""}${s.itemName}の計測が${formatDurationMinutes(thresholdMs)}を超えています。止め忘れていませんか？`,
            tag: `long-running-${s.id}`,
          });
        } catch (e) {
          console.error("通知の表示に失敗しました", e);
        }
      }
    }
  }

  function ensureTicking() {
    if (tickInterval) return;
    tickInterval = setInterval(() => {
      renderActiveSessions();
      renderTable();
      checkLongRunningNotifications();
    }, 1000);
  }

  function stopTickingIfIdle() {
    if (activeSessions.length === 0 && tickInterval) {
      clearInterval(tickInterval);
      tickInterval = null;
    }
  }

  function removeActiveSession(id) {
    if (cloudMode && dbApi) {
      dbApi.collection(ACTIVE_SESSIONS_COLLECTION).doc(id).delete().catch((e) => {
        console.error("active session delete failed", e);
        alert("削除に失敗しました。しばらくしてから再度お試しください。");
      });
      return;
    }
    activeSessions = activeSessions.filter((s) => s.id !== id);
    saveActiveSessions();
    stopTickingIfIdle();
    renderActiveSessions();
    renderTable();
  }

  els.btnStart.addEventListener("click", () => {
    const itemName = els.itemName.value.trim();
    if (!itemName) {
      alert("機種名を入力してください。");
      els.itemName.focus();
      return;
    }
    const session = {
      id: uid(),
      itemName,
      planNo: els.planNo.value.trim(),
      quantity: parseQuantity(els.itemQuantity.value),
      worker: els.workerName.value.trim(),
      startedAt: Date.now(),
      accumulatedMs: 0,
      running: true,
      sessionStart: new Date(),
      deviceId: DEVICE_ID,
      segments: [],
    };

    els.itemName.value = "";
    els.planNo.value = "";
    els.itemQuantity.value = "1";
    // 作業者欄はそのまま残す（同じ人が続けて開始しやすいように）

    if (cloudMode && dbApi) {
      dbApi.collection(ACTIVE_SESSIONS_COLLECTION).doc(session.id).set(sessionToCloudData(session)).catch((e) => {
        console.error("active session write failed", e);
        alert("計測の開始に失敗しました。しばらくしてから再度お試しください。");
      });
      return;
    }
    activeSessions.push(session);
    saveActiveSessions();
    ensureTicking();
    renderActiveSessions();
    renderTable();
  });

  els.activeSessions.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const id = btn.dataset.id;
    const session = activeSessions.find((s) => s.id === id);
    if (!session) return;
    const action = btn.dataset.action;

    if (action === "toggle-pause") {
      let accumulatedMs = session.accumulatedMs;
      let running = session.running;
      let startedAt = session.startedAt;
      let segments = Array.isArray(session.segments) ? session.segments : [];
      if (running) {
        const now = Date.now();
        accumulatedMs += now - startedAt;
        segments = [...segments, { start: startedAt, end: now }];
        running = false;
      } else {
        startedAt = Date.now();
        running = true;
      }
      if (cloudMode && dbApi) {
        const updated = { ...session, accumulatedMs, running, startedAt, segments };
        dbApi.collection(ACTIVE_SESSIONS_COLLECTION).doc(id).set(sessionToCloudData(updated)).catch((e) => {
          console.error("active session write failed", e);
          alert("更新に失敗しました。しばらくしてから再度お試しください。");
        });
        return;
      }
      session.accumulatedMs = accumulatedMs;
      session.running = running;
      session.startedAt = startedAt;
      session.segments = segments;
      saveActiveSessions();
      renderActiveSessions();
      renderTable();
    } else if (action === "stop-session") {
      const now = Date.now();
      const rawDurationMs = sessionRawDurationMs(session, now);
      if (rawDurationMs < 1000 && !confirm("作業時間が1分未満です。記録しますか？")) {
        removeActiveSession(id);
        return;
      }
      // 会社の休み時間（10:00-10:05、12:00-12:45、15:00-15:07、16:55-17:00）と
      // 重なった分は自動で作業時間から差し引く
      const durationMs = sessionNetDurationMs(session, now);

      const start = session.sessionStart;
      const end = new Date(start.getTime() + durationMs);
      addRecord({
        id: uid(),
        itemName: session.itemName,
        planNo: session.planNo,
        quantity: session.quantity,
        worker: session.worker,
        date: toDateStr(start),
        startTime: toTimeStr(start),
        endTime: toTimeStr(end),
        durationMs,
      });

      removeActiveSession(id);
    } else if (action === "cancel-session") {
      if (confirm("この進行中の記録を破棄しますか？")) {
        removeActiveSession(id);
      }
    }
  });

  const ICONS = {
    pause: `<svg class="btn-icon" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><rect x="3" y="2" width="3.5" height="12" fill="currentColor"/><rect x="9.5" y="2" width="3.5" height="12" fill="currentColor"/></svg>`,
    play: `<svg class="btn-icon" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 2.5v11l9-5.5-9-5.5z" fill="currentColor"/></svg>`,
    check: `<svg class="btn-icon" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    close: `<svg class="btn-icon" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  };

  // 稼働タイマー欄（カード表示・操作）はこの端末で開始したセッションだけを対象にする。
  // 他の端末で開始されたセッションは記録一覧にのみ表示する。
  function ownActiveSessions() {
    return cloudMode ? activeSessions.filter((s) => s.deviceId === DEVICE_ID) : activeSessions;
  }

  // 稼働状況を行灯(アンドン)ランプでひと目でわかるようにする
  function updateAndon() {
    if (!els.andon) return;
    const own = ownActiveSessions();
    const anyRunning = own.some((s) => s.running);
    const anyPaused = own.some((s) => !s.running);
    els.andon.dataset.state = anyRunning ? "running" : anyPaused ? "paused" : "idle";
  }

  function renderActiveSessions() {
    updateAndon();
    const own = ownActiveSessions();
    els.sessionsEmpty.hidden = own.length !== 0;
    els.activeSessions.innerHTML = own.map((s) => {
      const elapsed = sessionNetDurationMs(s, Date.now());
      const metaParts = [`${s.quantity}台`];
      if (s.planNo) metaParts.push(`計画No.${s.planNo}`);
      if (s.worker) metaParts.push(s.worker);
      return `
        <div class="session-card">
          <div class="session-card__info">
            <strong>${escapeHtml(s.itemName)}</strong>
            <span class="session-card__meta">${escapeHtml(metaParts.join("・"))}</span>
          </div>
          <span class="session-card__time">${formatMs(elapsed)}</span>
          <span class="session-card__badge${s.running ? "" : " session-card__badge--paused"}">${s.running ? "記録中" : "一時停止中"}</span>
          <div class="session-card__controls">
            <button type="button" class="btn btn--danger btn--small" data-action="stop-session" data-id="${escapeHtml(s.id)}">${ICONS.check}終了して記録</button>
            <div class="session-card__controls-row">
              <button type="button" class="btn btn--secondary btn--small" data-action="toggle-pause" data-id="${escapeHtml(s.id)}">${s.running ? ICONS.pause : ICONS.play}${s.running ? "一時停止" : "再開"}</button>
              <button type="button" class="btn btn--ghost btn--small" data-action="cancel-session" data-id="${escapeHtml(s.id)}">${ICONS.close}取消</button>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  // --- Manual entry ---

  els.btnManualAdd.addEventListener("click", () => {
    const itemName = els.manualItemName.value.trim();
    const planNo = els.manualPlanNo.value.trim();
    const dateStr = els.manualDate.value || toDateStr(new Date());
    const quantity = parseQuantity(els.manualQuantity.value);
    const worker = els.manualWorkerName.value.trim();
    const startVal = els.manualStartTime.value;
    const endVal = els.manualEndTime.value;

    if (!itemName) {
      alert("機種名を入力してください。");
      return;
    }

    let durationMs, startTime, endTime;

    if (startVal && endVal) {
      const start = new Date(`${dateStr}T${startVal}`);
      const end = new Date(`${dateStr}T${endVal}`);
      const rawMs = end.getTime() - start.getTime();
      if (rawMs <= 0) {
        alert("終了時刻は開始時刻より後にしてください。");
        return;
      }
      // 会社の休み時間と重なった分は自動で差し引く
      const breakMs = totalBreakOverlapMs([{ start: start.getTime(), end: end.getTime() }]);
      durationMs = Math.max(0, rawMs - breakMs);
      startTime = startVal;
      endTime = endVal;
    } else {
      const minutes = Number(els.manualDuration.value);
      if (!minutes || minutes <= 0) {
        alert("作業時間(分)を正しく入力してください。もしくは開始・終了時刻を入力してください。");
        return;
      }
      durationMs = minutes * 60000;
      startTime = "-";
      endTime = "-";
    }

    addRecord({
      id: uid(),
      itemName,
      planNo,
      quantity,
      worker,
      date: dateStr,
      startTime,
      endTime,
      durationMs,
    });

    els.manualItemName.value = "";
    els.manualPlanNo.value = "";
    els.manualDuration.value = "";
    els.manualStartTime.value = "";
    els.manualEndTime.value = "";
    els.manualQuantity.value = "1";
  });

  // --- Records management ---

  function addRecord(record) {
    if (cloudMode && dbApi) {
      dbApi.collection(RECORDS_COLLECTION).doc(record.id).set(record).catch((e) => {
        console.error("db write failed", e);
        alert("記録の保存に失敗しました。しばらくしてから再度お試しください。");
      });
      return;
    }
    records.push(record);
    saveRecords();
    render();
  }

  function deleteRecord(id) {
    if (cloudMode && dbApi) {
      dbApi.collection(RECORDS_COLLECTION).doc(id).delete().catch((e) => {
        console.error("db delete failed", e);
        alert("削除に失敗しました。しばらくしてから再度お試しください。");
      });
      return;
    }
    records = records.filter((r) => r.id !== id);
    saveRecords();
    render();
  }

  let editingId = null;

  els.recordsTbody.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.dataset.action;
    if (action === "delete") {
      const id = target.dataset.id;
      if (id && confirm("この記録を削除しますか？")) {
        deleteRecord(id);
      }
    } else if (action === "edit") {
      editingId = target.dataset.id;
      renderTable();
    } else if (action === "cancel-edit") {
      editingId = null;
      renderTable();
    } else if (action === "save-edit") {
      const id = target.dataset.id;
      const record = records.find((r) => r.id === id);
      const row = target.closest("tr");
      if (!record || !row || !applyEdit(record, row)) return;

      if (cloudMode && dbApi) {
        dbApi.collection(RECORDS_COLLECTION).doc(id).set(record).catch((e) => {
          console.error("db write failed", e);
          alert("保存に失敗しました。しばらくしてから再度お試しください。");
        });
        editingId = null;
        renderTable();
      } else {
        saveRecords();
        editingId = null;
        render();
      }
    }
  });

  function applyEdit(record, row) {
    const dateStr = row.querySelector(".edit-date").value || record.date;
    const planNo = row.querySelector(".edit-plan-no").value.trim();
    const quantity = parseQuantity(row.querySelector(".edit-quantity").value);
    const worker = row.querySelector(".edit-worker").value.trim();
    const startInput = row.querySelector(".edit-start");
    const endInput = row.querySelector(".edit-end");

    let durationMs, startTime, endTime;
    if (startInput && endInput) {
      const startVal = startInput.value;
      const endVal = endInput.value;
      if (!startVal || !endVal) {
        alert("開始・終了時刻を入力してください。");
        return false;
      }
      const start = new Date(`${dateStr}T${startVal}`);
      const end = new Date(`${dateStr}T${endVal}`);
      const diff = end.getTime() - start.getTime();
      if (diff < 0) {
        alert("終了時刻は開始時刻より後にしてください。");
        return false;
      }
      // 会社の休み時間と重なった分は自動で差し引く
      const breakMs = totalBreakOverlapMs([{ start: start.getTime(), end: end.getTime() }]);
      durationMs = Math.max(0, diff - breakMs);
      startTime = startVal;
      endTime = endVal;
    } else {
      const minutesVal = Number(row.querySelector(".edit-minutes").value);
      if (!minutesVal || minutesVal <= 0) {
        alert("作業時間(分)を正しく入力してください。");
        return false;
      }
      durationMs = minutesVal * 60000;
      startTime = "-";
      endTime = "-";
    }

    record.date = dateStr;
    record.planNo = planNo;
    record.startTime = startTime;
    record.endTime = endTime;
    record.durationMs = durationMs;
    record.quantity = quantity;
    record.worker = worker;
    return true;
  }

  els.btnClearAll.addEventListener("click", () => {
    if (records.length === 0) return;
    if (!confirm("すべての記録を削除します。よろしいですか？")) return;

    if (cloudMode && dbApi) {
      const col = dbApi.collection(RECORDS_COLLECTION);
      Promise.all(records.map((r) => col.doc(r.id).delete())).catch((e) => {
        console.error("db bulk delete failed", e);
        alert("削除に失敗した記録があります。");
      });
      return;
    }
    records = [];
    saveRecords();
    render();
  });

  // --- 計画表の取り込み ---

  function updatePlanTableStatus() {
    els.planTableStatus.textContent = planTable.length > 0 ? `${planTable.length}件を読み込み中` : "未読み込み";
  }

  function savePlanTableCloudAware(entries) {
    planTable = entries;
    if (cloudMode && dbApi) {
      return dbApi.doc(PLAN_TABLE_DOC).set({ entries, updatedAt: new Date().toISOString() });
    }
    savePlanTable();
    return Promise.resolve();
  }

  els.btnImportPlanTable.addEventListener("click", () => {
    const entries = parsePlanTableText(els.planTableInput.value);
    if (entries.length === 0) {
      alert("計画表を読み取れませんでした。「計画No., 機種名, 台数」の順で貼り付けてください。");
      return;
    }
    savePlanTableCloudAware(entries).catch((e) => {
      console.error("plan table write failed", e);
      alert("計画表の保存に失敗しました。");
    });
    updatePlanTableStatus();
    els.planTableInput.value = "";
    alert(`${entries.length}件の計画表を取り込みました。`);
  });

  els.btnClearPlanTable.addEventListener("click", () => {
    if (planTable.length === 0) return;
    if (!confirm("計画表をすべて削除します。よろしいですか？")) return;
    savePlanTableCloudAware([]).catch((e) => {
      console.error("plan table clear failed", e);
      alert("計画表の削除に失敗しました。");
    });
    updatePlanTableStatus();
  });

  els.planTableExcelFile.addEventListener("change", async () => {
    const file = els.planTableExcelFile.files[0];
    if (!file) return;
    if (typeof XLSX === "undefined") {
      els.planTableExcelStatus.textContent = "Excel読み込み機能を利用できませんでした。";
      els.planTableExcelFile.value = "";
      return;
    }
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
      const entries = parsePlanTableSheetRows(rows);
      if (entries.length === 0) {
        els.planTableExcelStatus.textContent = "計画表を読み取れませんでした（A〜C列・15行目以降を確認してください）。";
        return;
      }
      await savePlanTableCloudAware(entries);
      updatePlanTableStatus();
      els.planTableExcelStatus.textContent = `${entries.length}件を取り込みました（${file.name}）`;
    } catch (e) {
      console.error("Excelの読み込みに失敗しました", e);
      els.planTableExcelStatus.textContent = "Excelの読み込みに失敗しました。ファイル形式を確認してください。";
    } finally {
      els.planTableExcelFile.value = "";
    }
  });

  els.btnAddPlanPdf.addEventListener("click", async () => {
    const name = els.planPdfNewName.value.trim();
    const file = els.planPdfFile.files[0];
    if (!name) {
      alert("名前を入力してください。");
      return;
    }
    if (!file) {
      alert("PDFファイルを選んでください。");
      return;
    }
    try {
      const buf = await file.arrayBuffer();
      const base64 = bytesToBase64(new Uint8Array(buf));
      if (cloudMode && dbApi) {
        await dbApi.collection(PLAN_PDFS_COLLECTION).add({ name, base64, createdAt: new Date().toISOString() });
        els.planPdfUploadStatus.textContent = `追加しました（${name}）。全端末に反映されます。`;
      } else {
        planPdfs.push({ id: uid(), name, base64 });
        saveLocalPlanPdfs();
        renderPlanPdfAdminList();
        await loadPlanPdf();
        els.planPdfUploadStatus.textContent = `追加しました（${name}）。この端末のみに反映されます。`;
      }
    } catch (e) {
      console.error("PDFの追加に失敗しました", e);
      els.planPdfUploadStatus.textContent = "PDFの追加に失敗しました。";
    } finally {
      els.planPdfNewName.value = "";
      els.planPdfFile.value = "";
    }
  });

  async function deletePlanPdf(id) {
    if (!confirm("このPDFを削除しますか？")) return;
    try {
      if (cloudMode && dbApi) {
        await dbApi.collection(PLAN_PDFS_COLLECTION).doc(id).delete();
      } else {
        planPdfs = planPdfs.filter((p) => p.id !== id);
        saveLocalPlanPdfs();
        renderPlanPdfAdminList();
      }
      // 削除したPDFが選択されていた枠は、次の読み込み時に自動的に既定の計画表へ戻る
      loadPlanPdf();
    } catch (e) {
      console.error("PDFの削除に失敗しました", e);
      alert("削除に失敗しました。しばらくしてから再度お試しください。");
    }
  }

  els.planPdfAdminList.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action='delete-plan-pdf']");
    if (!btn) return;
    deletePlanPdf(btn.dataset.id);
  });

  function renderPlanPdfAdminList() {
    if (planPdfs.length === 0) {
      els.planPdfAdminList.innerHTML = `<p class="plan-table-panel__hint">まだ追加されたPDFはありません（既定の計画表のみ表示されます）。</p>`;
      return;
    }
    els.planPdfAdminList.innerHTML = planPdfs.map((p) => `
      <div class="plan-pdf-admin-row">
        <span class="plan-pdf-admin-row__name">${escapeHtml(p.name)}</span>
        <button type="button" class="btn btn--ghost btn--small" data-action="delete-plan-pdf" data-id="${escapeHtml(p.id)}">削除</button>
      </div>
    `).join("");
  }

  updatePlanTableStatus();

  // 計画表の取り込み・記録一覧の全削除は管理者専用。URLに ?admin=1 を付けたときのみ表示する
  if (new URLSearchParams(location.search).has("admin")) {
    els.planTablePanel.hidden = false;
    els.btnClearAll.hidden = false;
  }

  els.filterDate.addEventListener("change", () => {
    editingId = null;
    render();
  });
  els.btnClearFilter.addEventListener("click", () => {
    els.filterDate.value = "";
    editingId = null;
    render();
  });

  // --- CSV export ---

  els.btnExportCsv.addEventListener("click", () => {
    const rows = getFilteredRecords();
    if (rows.length === 0) {
      alert("出力する記録がありません。");
      return;
    }
    const header = ["日付", "機種名", "計画No.", "開始", "終了", "作業時間(分)", "台数", "作業者"];
    const lines = [header.join(",")];
    for (const r of rows) {
      const minutes = Math.round(r.durationMs / 60000);
      const cells = [r.date, r.itemName, r.planNo || "", formatClockTime(r.startTime), formatClockTime(r.endTime), String(minutes), String(r.quantity || 1), r.worker || ""];
      lines.push(cells.map(csvEscape).join(","));
    }
    const csvContent = "﻿" + lines.join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `production-time-${toDateStr(new Date())}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  function csvEscape(value) {
    const str = String(value);
    if (/[",\r\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  // --- Rendering ---

  function getFilteredRecords() {
    const filterDate = els.filterDate.value;
    const sorted = [...records].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.startTime < b.startTime ? 1 : -1;
    });
    if (!filterDate) return sorted;
    return sorted.filter((r) => r.date === filterDate);
  }

  function render() {
    renderTable();
    renderWorkerSuggestions();
  }

  function renderWorkerSuggestions() {
    const names = Array.from(new Set(records.map((r) => r.worker).filter(Boolean))).sort();
    els.workerSuggestions.innerHTML = names.map((n) => `<option value="${escapeHtml(n)}"></option>`).join("");
  }

  // 進行中の計測を記録一覧の表示専用データに変換する（CSV出力等が使うgetFilteredRecords()には含めない）
  function activeSessionsAsRows() {
    const filterDate = els.filterDate.value;
    return activeSessions
      .map((s) => ({
        id: s.id,
        __active: true,
        running: s.running,
        date: toDateStr(s.sessionStart),
        itemName: s.itemName,
        planNo: s.planNo,
        startTime: toTimeStr(s.sessionStart),
        durationMs: sessionNetDurationMs(s, Date.now()),
        quantity: s.quantity,
        worker: s.worker,
      }))
      .filter((r) => !filterDate || r.date === filterDate);
  }

  function renderTable() {
    const rows = [...activeSessionsAsRows(), ...getFilteredRecords()];
    els.recordsTbody.innerHTML = "";
    els.emptyMessage.hidden = rows.length !== 0;

    for (const r of rows) {
      const tr = document.createElement("tr");
      if (!r.__active && r.id === editingId) {
        tr.innerHTML = buildEditRowHtml(r);
      } else {
        const statusHtml = r.__active
          ? `<span class="session-card__badge${r.running ? "" : " session-card__badge--paused"}">${r.running ? "計測中" : "一時停止中"}</span>`
          : `<span class="status-muted">完了</span>`;
        const endTimeHtml = r.__active ? "－" : escapeHtml(formatClockTime(r.endTime));
        const actionsHtml = r.__active
          ? ""
          : `
            <button class="row-edit" data-action="edit" data-id="${escapeHtml(r.id)}">編集</button>
            <button class="row-delete" data-action="delete" data-id="${escapeHtml(r.id)}">削除</button>
          `;
        tr.innerHTML = `
          <td>${escapeHtml(r.worker || "-")}</td>
          <td>${statusHtml}</td>
          <td>${escapeHtml(r.date)}</td>
          <td>${escapeHtml(r.itemName)}</td>
          <td>${escapeHtml(r.planNo || "-")}</td>
          <td>${escapeHtml(formatClockTime(r.startTime))}</td>
          <td>${endTimeHtml}</td>
          <td>${escapeHtml(formatDurationMinutes(r.durationMs))}</td>
          <td>${r.quantity || 1}台</td>
          <td>${actionsHtml}</td>
        `;
      }
      els.recordsTbody.appendChild(tr);
    }
  }

  function buildEditRowHtml(r) {
    const hasTimes = r.startTime !== "-" && r.endTime !== "-";
    const minutes = Math.round(r.durationMs / 60000);
    const timeFields = hasTimes
      ? `
        <label class="field"><span class="field__label">開始</span><input type="time" class="edit-start" value="${escapeHtml(formatClockTime(r.startTime))}"></label>
        <label class="field"><span class="field__label">終了</span><input type="time" class="edit-end" value="${escapeHtml(formatClockTime(r.endTime))}"></label>
      `
      : `<label class="field"><span class="field__label">作業時間 (分)</span><input type="number" min="1" step="1" class="edit-minutes" value="${minutes}"></label>`;
    return `
      <td colspan="10">
        <div class="edit-row">
          <label class="field"><span class="field__label">日付</span><input type="date" class="edit-date" value="${escapeHtml(r.date)}"></label>
          <label class="field"><span class="field__label">計画No.</span><input type="text" class="edit-plan-no" value="${escapeHtml(r.planNo || "")}"></label>
          ${timeFields}
          <label class="field"><span class="field__label">台数</span><input type="number" min="1" step="1" class="edit-quantity" value="${r.quantity || 1}"></label>
          <label class="field"><span class="field__label">作業者</span><input type="text" class="edit-worker" list="worker-suggestions" value="${escapeHtml(r.worker || "")}"></label>
          <div class="edit-row__actions">
            <button type="button" class="btn btn--primary btn--small" data-action="save-edit" data-id="${escapeHtml(r.id)}">保存</button>
            <button type="button" class="btn btn--ghost btn--small" data-action="cancel-edit">キャンセル</button>
          </div>
        </div>
      </td>
    `;
  }

  // --- 計画表PDFビューア（ズームイン・ズームアウト対応、PCでは2枚並べて表示可能） ---

  const PDF_ZOOM_STEP = 0.25;
  const PDF_ZOOM_MIN_RATIO = 0.5;
  const PDF_ZOOM_MAX_RATIO = 4;

  const PLAN_PDF_URL = "assets/keikaku.pdf";
  const PLAN_PDFS_KEY = "production-time-plan-pdfs";
  const DEFAULT_PLAN_PDF_ID = "__default__";
  const DUAL_PDF_VIEW_KEY = "production-time-dual-pdf-view";

  function bytesToBase64(bytes) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  function base64ToUint8Array(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function loadLocalPlanPdfs() {
    try {
      const raw = localStorage.getItem(PLAN_PDFS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error("計画表PDF一覧の読み込みに失敗しました", e);
      return [];
    }
  }

  function saveLocalPlanPdfs() {
    try {
      localStorage.setItem(PLAN_PDFS_KEY, JSON.stringify(planPdfs));
    } catch (e) {
      console.error("計画表PDF一覧の保存に失敗しました", e);
    }
  }

  /** @type {{id: string, name: string, base64: string}[]} 管理画面から追加された計画表PDF（既定のPDFは含まない） */
  let planPdfs = cloudMode ? [] : loadLocalPlanPdfs();

  // 既定の計画表（バンドルされたPDF）+ 管理画面から追加されたPDF、の一覧
  function getAllPlanPdfs() {
    return [{ id: DEFAULT_PLAN_PDF_ID, name: "既定の計画表", isDefault: true }, ...planPdfs];
  }

  // 計画表PDFの表示部分を1つ作る（2枚並べて表示する場合は2つ生成する）
  function createPlanPdfViewer({ storageKey, tabsEl, viewportEl, canvasEl, statusEl, zoomLevelEl, zoomInBtn, zoomOutBtn, zoomResetBtn }) {
    let pdfPage = null;
    let pdfScale = 1;
    let pdfBaseScale = 1;
    let selectedId = localStorage.getItem(storageKey) || DEFAULT_PLAN_PDF_ID;

    function renderTabs() {
      const all = getAllPlanPdfs();
      tabsEl.innerHTML = all.map((p) => `
        <button type="button" class="plan-pdf-tab${p.id === selectedId ? " is-active" : ""}" data-id="${escapeHtml(p.id)}">${escapeHtml(p.name)}</button>
      `).join("");
    }

    tabsEl.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      selectedId = btn.dataset.id;
      localStorage.setItem(storageKey, selectedId);
      load();
    });

    // 選択中の計画表PDF（この端末・この枠ごとの選択）を表示する。一覧はこの端末または全端末で共有される
    async function load() {
      renderTabs();
      if (typeof pdfjsLib === "undefined") {
        statusEl.hidden = false;
        statusEl.textContent = "計画表(PDF)を表示できませんでした。";
        return;
      }
      pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      try {
        const all = getAllPlanPdfs();
        let entry = all.find((p) => p.id === selectedId);
        if (!entry) {
          entry = all[0];
          selectedId = entry.id;
          localStorage.setItem(storageKey, selectedId);
          renderTabs();
        }
        const source = entry.isDefault ? PLAN_PDF_URL : { data: base64ToUint8Array(entry.base64) };
        const pdfDoc = await pdfjsLib.getDocument(source).promise;
        pdfPage = await pdfDoc.getPage(1);
        fitToWidth();
        await render();
        statusEl.hidden = true;
      } catch (e) {
        console.error("計画表PDFの読み込みに失敗しました", e);
        statusEl.hidden = false;
        statusEl.textContent = "計画表(PDF)の読み込みに失敗しました。";
      }
    }

    function fitToWidth() {
      const viewport = pdfPage.getViewport({ scale: 1 });
      const containerWidth = viewportEl.clientWidth - 4 || viewport.width;
      pdfBaseScale = containerWidth / viewport.width;
      pdfScale = pdfBaseScale;
    }

    async function render() {
      const dpr = window.devicePixelRatio || 1;
      const viewport = pdfPage.getViewport({ scale: pdfScale * dpr });
      canvasEl.width = viewport.width;
      canvasEl.height = viewport.height;
      canvasEl.style.width = `${viewport.width / dpr}px`;
      canvasEl.style.height = `${viewport.height / dpr}px`;
      const ctx = canvasEl.getContext("2d");
      await pdfPage.render({ canvasContext: ctx, viewport }).promise;
      zoomLevelEl.textContent = `${Math.round((pdfScale / pdfBaseScale) * 100)}%`;
    }

    zoomInBtn.addEventListener("click", () => {
      if (!pdfPage) return;
      pdfScale = Math.min(pdfScale + PDF_ZOOM_STEP * pdfBaseScale, pdfBaseScale * PDF_ZOOM_MAX_RATIO);
      render();
    });
    zoomOutBtn.addEventListener("click", () => {
      if (!pdfPage) return;
      pdfScale = Math.max(pdfScale - PDF_ZOOM_STEP * pdfBaseScale, pdfBaseScale * PDF_ZOOM_MIN_RATIO);
      render();
    });
    zoomResetBtn.addEventListener("click", () => {
      if (!pdfPage) return;
      fitToWidth();
      render();
    });

    // 指2本のピンチ操作でも拡大縮小できるようにする
    let pinch = null;
    function touchDistance(t1, t2) {
      return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    }
    viewportEl.addEventListener("touchstart", (e) => {
      if (!pdfPage || e.touches.length !== 2) return;
      e.preventDefault();
      pinch = { startDist: touchDistance(e.touches[0], e.touches[1]), startScale: pdfScale, liveRatio: 1 };
    }, { passive: false });
    viewportEl.addEventListener("touchmove", (e) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const ratio = touchDistance(e.touches[0], e.touches[1]) / pinch.startDist;
      pinch.liveRatio = ratio;
      canvasEl.style.transformOrigin = "center center";
      canvasEl.style.transform = `scale(${ratio})`;
    }, { passive: false });
    function endPinch() {
      if (!pinch) return;
      const targetScale = Math.min(
        Math.max(pinch.startScale * pinch.liveRatio, pdfBaseScale * PDF_ZOOM_MIN_RATIO),
        pdfBaseScale * PDF_ZOOM_MAX_RATIO
      );
      pinch = null;
      canvasEl.style.transform = "";
      pdfScale = targetScale;
      render();
    }
    viewportEl.addEventListener("touchend", endPinch);
    viewportEl.addEventListener("touchcancel", endPinch);

    // PCのトラックパッドでの2本指ピンチ操作は wheel+ctrlKey として送られてくるため、それでもズームできるようにする
    let wheelZoomFrame = null;
    viewportEl.addEventListener("wheel", (e) => {
      if (!pdfPage || !e.ctrlKey) return;
      e.preventDefault();
      const zoomFactor = Math.exp(-e.deltaY * 0.01);
      pdfScale = Math.min(
        Math.max(pdfScale * zoomFactor, pdfBaseScale * PDF_ZOOM_MIN_RATIO),
        pdfBaseScale * PDF_ZOOM_MAX_RATIO
      );
      if (wheelZoomFrame) return;
      wheelZoomFrame = requestAnimationFrame(() => {
        wheelZoomFrame = null;
        render();
      });
    }, { passive: false });

    return { load };
  }

  const pdfViewerA = createPlanPdfViewer({
    storageKey: "production-time-plan-pdf-selected",
    tabsEl: els.planPdfTabs,
    viewportEl: els.planPdfViewport,
    canvasEl: els.planPdfCanvas,
    statusEl: els.planPdfStatus,
    zoomLevelEl: els.pdfZoomLevel,
    zoomInBtn: els.btnPdfZoomIn,
    zoomOutBtn: els.btnPdfZoomOut,
    zoomResetBtn: els.btnPdfZoomReset,
  });

  const pdfViewerB = createPlanPdfViewer({
    storageKey: "production-time-plan-pdf-selected-b",
    tabsEl: els.planPdfTabsB,
    viewportEl: els.planPdfViewportB,
    canvasEl: els.planPdfCanvasB,
    statusEl: els.planPdfStatusB,
    zoomLevelEl: els.pdfZoomLevelB,
    zoomInBtn: els.btnPdfZoomInB,
    zoomOutBtn: els.btnPdfZoomOutB,
    zoomResetBtn: els.btnPdfZoomResetB,
  });

  function loadPlanPdf() {
    pdfViewerA.load();
    if (!els.planPdfPaneB.hidden) pdfViewerB.load();
  }

  // PCで計画表を2枚並べて表示するかどうか（この端末だけの設定）
  function setDualPdfView(enabled) {
    els.planPdfPanes.classList.toggle("is-dual", enabled);
    els.planPdfPaneB.hidden = !enabled;
    els.btnToggleDualPdf.textContent = enabled ? "1枚表示に戻す" : "2枚表示";
    try {
      localStorage.setItem(DUAL_PDF_VIEW_KEY, enabled ? "1" : "0");
    } catch (e) {
      console.error("表示設定の保存に失敗しました", e);
    }
    if (enabled) pdfViewerB.load();
  }

  els.btnToggleDualPdf.addEventListener("click", () => {
    setDualPdfView(els.planPdfPaneB.hidden);
  });

  if (localStorage.getItem(DUAL_PDF_VIEW_KEY) === "1") {
    setDualPdfView(true);
  }

  loadPlanPdf();
  renderPlanPdfAdminList();
  renderBreakPeriodsAdmin();

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // --- Init ---

  els.manualDate.value = toDateStr(new Date());
  render();
  renderActiveSessions();
  if (activeSessions.length > 0) {
    ensureTicking();
  }
})();
