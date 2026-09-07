// 設定値(localStorage)とVRMモデルファイル(IndexedDB)の保存を担当するモジュール。
// APIキーはこのブラウザのlocalStorageにのみ保存され、Gemini Live APIへの直接接続
// (WebSocket)にのみ使用する。サーバーへの送信は行わない。

const LS_KEYS = {
  apiKey: "aiavatar.apiKey",
  model: "aiavatar.model",
  voice: "aiavatar.voice",
  language: "aiavatar.language",
  extraNotes: "aiavatar.extraNotes",
  diaryEnabled: "aiavatar.diaryEnabled",
  diary: "aiavatar.diary",
  cameraEnabled: "aiavatar.cameraEnabled",
  cameraDeviceId: "aiavatar.cameraDeviceId",
  aiBackend: "aiavatar.aiBackend",
  openaiApiKey: "aiavatar.openaiApiKey",
  openaiModel: "aiavatar.openaiModel",
  openaiVoice: "aiavatar.openaiVoice",
};

function getStr(key, fallback = "") {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function setStr(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* localStorageが使えない環境(プライベートモード等)では無視する */
  }
}
function getBool(key, fallback) {
  const v = getStr(key, null);
  if (v === null) return fallback;
  return v === "1";
}
function setBool(key, value) {
  setStr(key, value ? "1" : "0");
}

export const settings = {
  getApiKey: () => getStr(LS_KEYS.apiKey, ""),
  setApiKey: (v) => setStr(LS_KEYS.apiKey, v),
  getModel: (fallback) => getStr(LS_KEYS.model, fallback),
  setModel: (v) => setStr(LS_KEYS.model, v),
  getVoice: (fallback) => getStr(LS_KEYS.voice, fallback),
  setVoice: (v) => setStr(LS_KEYS.voice, v),
  getLanguage: (fallback) => getStr(LS_KEYS.language, fallback),
  setLanguage: (v) => setStr(LS_KEYS.language, v),
  getExtraNotes: () => getStr(LS_KEYS.extraNotes, ""),
  setExtraNotes: (v) => setStr(LS_KEYS.extraNotes, v),
  getDiaryEnabled: () => getBool(LS_KEYS.diaryEnabled, true),
  setDiaryEnabled: (v) => setBool(LS_KEYS.diaryEnabled, v),
  getCameraEnabled: () => getBool(LS_KEYS.cameraEnabled, false),
  setCameraEnabled: (v) => setBool(LS_KEYS.cameraEnabled, v),
  getCameraDeviceId: () => getStr(LS_KEYS.cameraDeviceId, ""),
  setCameraDeviceId: (v) => setStr(LS_KEYS.cameraDeviceId, v),

  // AIバックエンドの切り替え("gemini" | "openai")。既存のGemini実装は
  // 変更していないので、"gemini"のままなら今まで通り動く。
  getAiBackend: () => getStr(LS_KEYS.aiBackend, "gemini"),
  setAiBackend: (v) => setStr(LS_KEYS.aiBackend, v),
  getOpenaiApiKey: () => getStr(LS_KEYS.openaiApiKey, ""),
  setOpenaiApiKey: (v) => setStr(LS_KEYS.openaiApiKey, v),
  getOpenaiModel: (fallback) => getStr(LS_KEYS.openaiModel, fallback),
  setOpenaiModel: (v) => setStr(LS_KEYS.openaiModel, v),
  getOpenaiVoice: (fallback) => getStr(LS_KEYS.openaiVoice, fallback),
  setOpenaiVoice: (v) => setStr(LS_KEYS.openaiVoice, v),
};

const MAX_DIARY_ENTRIES = 30;

export const diary = {
  list() {
    try {
      return JSON.parse(getStr(LS_KEYS.diary, "[]"));
    } catch {
      return [];
    }
  },
  add(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const list = diary.list();
    list.push({ date: new Date().toISOString(), text: trimmed.slice(0, 500) });
    while (list.length > MAX_DIARY_ENTRIES) list.shift();
    setStr(LS_KEYS.diary, JSON.stringify(list));
  },
  recentTexts(n = 5) {
    return diary
      .list()
      .slice(-n)
      .map((e) => `[${e.date.slice(0, 10)}] ${e.text}`);
  },
  clear() {
    setStr(LS_KEYS.diary, "[]");
  },
};

// --- VRMモデルファイルの保存(IndexedDB) ---
// VRMは数十MB程度になり得るためlocalStorageではなくIndexedDBに保存する。

const DB_NAME = "ai-avatar-chat";
const DB_VERSION = 1;
const STORE_NAME = "files";
const VRM_KEY = "vrm";

function openDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("このブラウザはIndexedDBに対応していません"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const result = fn(store);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function saveVrmFile(blob, name) {
  await withStore("readwrite", (store) => {
    store.put({ blob, name, savedAt: Date.now() }, VRM_KEY);
  });
}

export async function loadVrmFile() {
  let record;
  await withStore("readonly", (store) => {
    const req = store.get(VRM_KEY);
    req.onsuccess = () => {
      record = req.result || null;
    };
  });
  return record;
}

export async function clearVrmFile() {
  await withStore("readwrite", (store) => {
    store.delete(VRM_KEY);
  });
}
