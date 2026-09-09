(() => {
  "use strict";

  const THEME_KEY = "production-time-theme-settings";
  const DEFAULT_COLORS = { bg: "#14181a", surface: "#1b2023", primary: "#ef8038", text: "#eef1f0" };

  // 長時間計測の通知設定（js/app.js側でも同じキーを参照する）
  const NOTIFY_SETTINGS_KEY = "production-time-notify-settings";

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
      return {
        enabled: !!data.enabled,
        thresholdMinutes: thresholdMinutes > 0 ? thresholdMinutes : 600,
      };
    } catch (e) {
      return { enabled: false, thresholdMinutes: 600 };
    }
  }

  function saveNotifySettings(settings) {
    try {
      localStorage.setItem(NOTIFY_SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error("通知設定の保存に失敗しました", e);
    }
  }

  function hexToRgb(hex) {
    hex = String(hex).replace("#", "");
    return { r: parseInt(hex.substr(0, 2), 16), g: parseInt(hex.substr(2, 2), 16), b: parseInt(hex.substr(4, 2), 16) };
  }

  function toHex(n) {
    return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  }

  function mix(hexA, hexB, weight) {
    const a = hexToRgb(hexA), b = hexToRgb(hexB);
    return `#${toHex(a.r + (b.r - a.r) * weight)}${toHex(a.g + (b.g - a.g) * weight)}${toHex(a.b + (b.b - a.b) * weight)}`;
  }

  function luminance(hex) {
    const c = hexToRgb(hex);
    return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
  }

  function defaultPresets() {
    return [{ id: "default", name: "デフォルト", colors: { ...DEFAULT_COLORS } }];
  }

  function loadThemeData() {
    try {
      const raw = localStorage.getItem(THEME_KEY);
      if (!raw) return { activePresetId: "default", presets: defaultPresets() };
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.presets) || data.presets.length === 0) {
        return { activePresetId: "default", presets: defaultPresets() };
      }
      return data;
    } catch (e) {
      return { activePresetId: "default", presets: defaultPresets() };
    }
  }

  function saveThemeData(data) {
    try {
      localStorage.setItem(THEME_KEY, JSON.stringify(data));
    } catch (e) {
      console.error("設定の保存に失敗しました", e);
    }
  }

  // 背景・パネル・メインカラー・文字色の4色から、他の細かい色（枠線・ホバー時の色など）を自動で作る
  function deriveVars(colors) {
    const { bg, surface, primary, text } = colors;
    return {
      "--color-bg": bg,
      "--color-surface": surface,
      "--color-surface-raised": mix(surface, text, 0.06),
      "--color-border": mix(surface, text, 0.14),
      "--color-border-strong": mix(surface, text, 0.24),
      "--color-text": text,
      "--color-text-muted": mix(text, surface, 0.45),
      "--color-primary": primary,
      "--color-primary-hover": mix(primary, "#ffffff", 0.15),
      "--color-primary-ink": luminance(primary) > 0.55 ? mix(primary, "#000000", 0.85) : mix(primary, "#ffffff", 0.92),
    };
  }

  function applyColors(colors) {
    const vars = deriveVars(colors);
    for (const key in vars) {
      document.documentElement.style.setProperty(key, vars[key]);
    }
  }

  const themeData = loadThemeData();

  function getActivePreset() {
    return themeData.presets.find((p) => p.id === themeData.activePresetId) || themeData.presets[0];
  }

  // 画面がちらつかないよう、他のスクリプトより先にこの時点でテーマを適用する
  applyColors(getActivePreset().colors);

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function uid() {
    return `theme-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  document.addEventListener("DOMContentLoaded", () => {
    const navGroup = document.querySelector(".app__nav-group") || document.querySelector(".app__header-top");
    if (!navGroup) return;

    const menuBtn = document.createElement("button");
    menuBtn.type = "button";
    menuBtn.className = "btn btn--ghost btn--icon-only settings-menu-btn";
    menuBtn.setAttribute("aria-label", "設定");
    menuBtn.innerHTML = `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><rect y="3" width="20" height="2" rx="1" fill="currentColor"/><rect y="9" width="20" height="2" rx="1" fill="currentColor"/><rect y="15" width="20" height="2" rx="1" fill="currentColor"/></svg>`;
    navGroup.appendChild(menuBtn);

    const overlay = document.createElement("div");
    overlay.className = "settings-overlay";
    overlay.hidden = true;

    const panel = document.createElement("div");
    panel.className = "settings-panel";
    panel.innerHTML = `
      <div class="settings-panel__head">
        <h2>設定</h2>
        <button type="button" class="settings-panel__close" aria-label="閉じる">✕</button>
      </div>
      <div class="settings-panel__body">
        <h3>長時間計測の通知</h3>
        <p class="settings-panel__hint">計測を止め忘れて長時間動きっぱなしになっている場合に、この端末のブラウザで通知を表示します。</p>
        <label class="field notify-toggle">
          <span class="field__label">通知を有効にする</span>
          <input type="checkbox" id="notify-enabled-input">
        </label>
        <label class="field">
          <span class="field__label">何分経過したら通知するか（例: 10時間なら600）</span>
          <input type="number" id="notify-threshold-input" min="1" step="1" value="600">
        </label>
        <div class="notify-permission-row">
          <span id="notify-permission-status" class="notify-permission-status"></span>
          <button type="button" class="btn btn--secondary btn--small" id="btn-request-notify-permission">通知を許可する</button>
        </div>
        <button type="button" class="btn btn--ghost btn--small" id="btn-test-notify">テスト通知を送る</button>

        <h3>カラーテーマ</h3>
        <p class="settings-panel__hint">この端末の見た目だけが変わります（他の端末には影響しません）。バージョンを複数作って、それぞれ好きな色にカスタマイズできます。</p>
        <div class="theme-preset-list" id="theme-preset-list"></div>
        <button type="button" class="btn btn--secondary btn--small" id="btn-add-preset">＋ 新しいバージョンを追加</button>
        <div class="theme-editor" id="theme-editor"></div>
      </div>
    `;
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // --- 長時間計測の通知設定 ---
    const notifyEnabledInput = panel.querySelector("#notify-enabled-input");
    const notifyThresholdInput = panel.querySelector("#notify-threshold-input");
    const notifyPermissionStatus = panel.querySelector("#notify-permission-status");
    const btnRequestNotifyPermission = panel.querySelector("#btn-request-notify-permission");
    const btnTestNotify = panel.querySelector("#btn-test-notify");

    function renderNotifyPermissionStatus() {
      if (typeof Notification === "undefined") {
        notifyPermissionStatus.textContent = "この端末のブラウザは通知に対応していません";
        btnRequestNotifyPermission.hidden = true;
        btnTestNotify.hidden = true;
        return;
      }
      const labels = { granted: "許可済み", denied: "拒否されています（ブラウザの設定から変更してください）", default: "未許可" };
      notifyPermissionStatus.textContent = `通知の許可状況：${labels[Notification.permission] || Notification.permission}`;
      btnRequestNotifyPermission.hidden = Notification.permission === "granted";
    }

    const notifySettings = loadNotifySettings();
    notifyEnabledInput.checked = notifySettings.enabled;
    notifyThresholdInput.value = notifySettings.thresholdMinutes;
    renderNotifyPermissionStatus();

    notifyEnabledInput.addEventListener("change", () => {
      notifySettings.enabled = notifyEnabledInput.checked;
      saveNotifySettings(notifySettings);
    });

    notifyThresholdInput.addEventListener("change", () => {
      const minutes = Math.round(Number(notifyThresholdInput.value));
      notifySettings.thresholdMinutes = minutes > 0 ? minutes : 600;
      notifyThresholdInput.value = notifySettings.thresholdMinutes;
      saveNotifySettings(notifySettings);
    });

    btnRequestNotifyPermission.addEventListener("click", () => {
      if (typeof Notification === "undefined") return;
      Notification.requestPermission().then(renderNotifyPermissionStatus);
    });

    btnTestNotify.addEventListener("click", () => {
      if (typeof Notification === "undefined") return;
      if (Notification.permission !== "granted") {
        alert("先に「通知を許可する」を押して、通知を許可してください。");
        return;
      }
      new Notification("テスト通知", { body: "この端末で通知が正しく表示されています。" });
    });

    let editingPresetId = null;

    function closePanel() {
      overlay.hidden = true;
    }

    function openPanel() {
      overlay.hidden = false;
      editingPresetId = themeData.activePresetId;
      renderPresetList();
    }

    menuBtn.addEventListener("click", openPanel);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closePanel();
    });
    panel.querySelector(".settings-panel__close").addEventListener("click", closePanel);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.hidden) closePanel();
    });

    function renderPresetList() {
      const listEl = panel.querySelector("#theme-preset-list");
      listEl.innerHTML = themeData.presets.map((p) => {
        const isActive = p.id === themeData.activePresetId;
        return `
          <div class="theme-preset-row${isActive ? " is-active" : ""}" data-id="${p.id}">
            <button type="button" class="theme-preset-row__select" data-action="select" data-id="${p.id}">
              <span class="theme-preset-row__swatches">
                <span class="swatch" style="background:${p.colors.bg}"></span>
                <span class="swatch" style="background:${p.colors.surface}"></span>
                <span class="swatch" style="background:${p.colors.primary}"></span>
              </span>
              <span class="theme-preset-row__name">${escapeHtml(p.name)}</span>
              ${isActive ? '<span class="theme-preset-row__badge">使用中</span>' : ""}
            </button>
            <button type="button" class="theme-preset-row__edit" data-action="edit" data-id="${p.id}" aria-label="編集">✎</button>
            ${themeData.presets.length > 1 ? `<button type="button" class="theme-preset-row__delete" data-action="delete" data-id="${p.id}" aria-label="削除">🗑</button>` : ""}
          </div>
        `;
      }).join("");
      renderEditor(editingPresetId || themeData.activePresetId);
    }

    function renderEditor(presetId) {
      editingPresetId = presetId;
      const preset = themeData.presets.find((p) => p.id === presetId);
      const editorEl = panel.querySelector("#theme-editor");
      if (!preset) {
        editorEl.innerHTML = "";
        return;
      }
      editorEl.innerHTML = `
        <label class="field">
          <span class="field__label">バージョン名</span>
          <input type="text" id="theme-name-input" value="${escapeHtml(preset.name)}">
        </label>
        <div class="theme-editor__colors">
          <label class="field"><span class="field__label">背景</span><input type="color" data-color="bg" value="${preset.colors.bg}"></label>
          <label class="field"><span class="field__label">パネル</span><input type="color" data-color="surface" value="${preset.colors.surface}"></label>
          <label class="field"><span class="field__label">メインカラー</span><input type="color" data-color="primary" value="${preset.colors.primary}"></label>
          <label class="field"><span class="field__label">文字色</span><input type="color" data-color="text" value="${preset.colors.text}"></label>
        </div>
      `;

      editorEl.querySelector("#theme-name-input").addEventListener("input", (e) => {
        preset.name = e.target.value;
        saveThemeData(themeData);
        renderPresetList();
      });

      editorEl.querySelectorAll("input[type=color]").forEach((input) => {
        input.addEventListener("input", () => {
          preset.colors[input.dataset.color] = input.value;
          saveThemeData(themeData);
          if (preset.id === themeData.activePresetId) applyColors(preset.colors);
          renderPresetList();
        });
      });
    }

    panel.querySelector("#theme-preset-list").addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      if (action === "select") {
        themeData.activePresetId = id;
        saveThemeData(themeData);
        applyColors(getActivePreset().colors);
        renderPresetList();
      } else if (action === "edit") {
        renderEditor(id);
      } else if (action === "delete") {
        if (themeData.presets.length <= 1) return;
        if (!confirm("このバージョンを削除しますか？")) return;
        themeData.presets = themeData.presets.filter((p) => p.id !== id);
        if (themeData.activePresetId === id) {
          themeData.activePresetId = themeData.presets[0].id;
          applyColors(getActivePreset().colors);
        }
        if (editingPresetId === id) editingPresetId = null;
        saveThemeData(themeData);
        renderPresetList();
      }
    });

    panel.querySelector("#btn-add-preset").addEventListener("click", () => {
      const base = getActivePreset();
      const newPreset = {
        id: uid(),
        name: `バージョン${themeData.presets.length + 1}`,
        colors: { ...base.colors },
      };
      themeData.presets.push(newPreset);
      themeData.activePresetId = newPreset.id;
      editingPresetId = newPreset.id;
      saveThemeData(themeData);
      applyColors(newPreset.colors);
      renderPresetList();
    });
  });
})();
