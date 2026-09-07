import { GeminiLiveClient } from "./gemini-live-client.js";
import { OpenAiRealtimeClient } from "./openai-realtime-client.js";
import { CameraCapture } from "./camera.js";
import { VrmViewer } from "./vrm-viewer.js";
import { settings, diary, saveVrmFile, loadVrmFile, clearVrmFile } from "./store.js";
import {
  buildSystemInstruction,
  VOICE_OPTIONS,
  DEFAULT_MODEL,
  DEFAULT_VOICE,
  DEFAULT_LANGUAGE,
  OPENAI_VOICE_OPTIONS,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENAI_VOICE,
} from "./character.js";

const $ = (id) => document.getElementById(id);

const els = {
  canvas: $("vrm-canvas"),
  cameraVideo: $("camera-video"),
  btnToggleSession: $("btn-toggle-session"),
  btnCameraToggle: $("btn-camera-toggle"),
  cameraDeviceSelect: $("camera-device-select"),
  btnDanceWave: $("btn-dance-wave"),
  btnDanceShadowbox: $("btn-dance-shadowbox"),
  btnDanceBallet: $("btn-dance-ballet"),
  btnTestVrma: $("btn-test-vrma"),
  textInput: $("text-input"),
  btnSendText: $("btn-send-text"),
  transcriptLog: $("transcript-log"),
  statusBadge: $("status-badge"),
  statusText: $("status-text"),
  micLevel: $("mic-level"),

  btnOpenSettings: $("btn-open-settings"),
  btnCloseSettings: $("btn-close-settings"),
  settingsOverlay: $("settings-overlay"),
  aiBackendSelect: $("ai-backend-select"),
  geminiSettingsSection: $("gemini-settings-section"),
  openaiSettingsSection: $("openai-settings-section"),
  apiKeyInput: $("api-key-input"),
  modelInput: $("model-input"),
  voiceSelect: $("voice-select"),
  languageInput: $("language-input"),
  openaiApiKeyInput: $("openai-api-key-input"),
  openaiModelInput: $("openai-model-input"),
  openaiVoiceSelect: $("openai-voice-select"),
  extraNotesInput: $("extra-notes-input"),
  diaryEnabledInput: $("diary-enabled-input"),
  diaryList: $("diary-list"),
  btnClearDiary: $("btn-clear-diary"),
  vrmFileInput: $("vrm-file-input"),
  btnClearVrm: $("btn-clear-vrm"),
  vrmStatusText: $("vrm-status-text"),
  debugToolcall: $("debug-toolcall"), // [検証用/Phase 0]
};

const state = {
  client: null,
  connected: false,
  connecting: false,
  micStream: null,
  micAudioCtx: null,
  micWorkletNode: null,
  playerAudioCtx: null,
  playerWorkletNode: null,
  camera: null,
  cameraOn: false,
  sessionLog: [],
  pendingOutputLine: null,
};

function setStatus(text, kind) {
  els.statusText.textContent = text;
  els.statusBadge.dataset.state = kind || "idle";
}

function appendTranscript(speaker, text, cls) {
  const line = document.createElement("p");
  line.className = `transcript-line ${cls || ""}`;
  const who = document.createElement("span");
  who.className = "transcript-line__who";
  who.textContent = speaker;
  line.appendChild(who);
  line.appendChild(document.createTextNode(text));
  els.transcriptLog.appendChild(line);
  els.transcriptLog.scrollTop = els.transcriptLog.scrollHeight;
  return line;
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// ---------- VRMビューア ----------
const viewer = new VrmViewer(els.canvas);
viewer
  .init()
  .then(() => restoreSavedVrm())
  .catch((err) => {
    console.error(err);
    setStatus("3D表示の初期化に失敗しました(コンソール参照)", "error");
  });

els.btnDanceWave.addEventListener("click", () => viewer.startDance("wave"));
els.btnDanceShadowbox.addEventListener("click", () => viewer.startDance("shadowbox"));
els.btnDanceBallet.addEventListener("click", () => viewer.startDance("ballet", 10000));

// [検証用] VRMA最小再生テスト。assets/motions/ 以下にVRMAファイルを置いて確認する。
els.btnTestVrma.addEventListener("click", async () => {
  try {
    await viewer.playTestVrma("assets/motions/test.vrma");
  } catch (err) {
    console.error(err);
    setStatus(`VRMAテスト再生エラー: ${err.message}`, "error");
  }
});

async function restoreSavedVrm() {
  try {
    const record = await loadVrmFile();
    if (record?.blob) {
      const buf = await record.blob.arrayBuffer();
      await viewer.loadVrm(buf);
      els.vrmStatusText.textContent = `読み込み済み: ${record.name || "VRMモデル"}`;
    } else {
      els.vrmStatusText.textContent = "未読み込み(プレースホルダー表示中)";
    }
  } catch (err) {
    console.warn("保存済みVRMの復元に失敗しました", err);
    els.vrmStatusText.textContent = "保存済みVRMの読み込みに失敗しました";
  }
}

els.vrmFileInput.addEventListener("change", async () => {
  const file = els.vrmFileInput.files?.[0];
  if (!file) return;
  els.vrmStatusText.textContent = "読み込み中…";
  try {
    const buf = await file.arrayBuffer();
    await viewer.loadVrm(buf.slice(0)); // slice: parseAsyncに渡した後も再利用できるようコピーを渡す
    await saveVrmFile(file, file.name);
    els.vrmStatusText.textContent = `読み込み済み: ${file.name}`;
  } catch (err) {
    console.error(err);
    els.vrmStatusText.textContent = `読み込みエラー: ${err.message}`;
  }
});

els.btnClearVrm.addEventListener("click", async () => {
  await clearVrmFile();
  await viewer.unloadVrm();
  els.vrmFileInput.value = "";
  els.vrmStatusText.textContent = "未読み込み(プレースホルダー表示中)";
});

// ---------- 設定パネル ----------
function updateBackendSectionVisibility() {
  const backend = settings.getAiBackend();
  els.geminiSettingsSection.hidden = backend !== "gemini";
  els.openaiSettingsSection.hidden = backend !== "openai";
}

function loadSettingsIntoForm() {
  els.aiBackendSelect.value = settings.getAiBackend();
  els.apiKeyInput.value = settings.getApiKey();
  els.modelInput.value = settings.getModel(DEFAULT_MODEL);
  els.languageInput.value = settings.getLanguage(DEFAULT_LANGUAGE);
  els.extraNotesInput.value = settings.getExtraNotes();
  els.diaryEnabledInput.checked = settings.getDiaryEnabled();

  els.voiceSelect.innerHTML = "";
  for (const voice of VOICE_OPTIONS) {
    const opt = document.createElement("option");
    opt.value = voice;
    opt.textContent = voice;
    els.voiceSelect.appendChild(opt);
  }
  els.voiceSelect.value = settings.getVoice(DEFAULT_VOICE);

  els.openaiApiKeyInput.value = settings.getOpenaiApiKey();
  els.openaiModelInput.value = settings.getOpenaiModel(DEFAULT_OPENAI_MODEL);
  els.openaiVoiceSelect.innerHTML = "";
  for (const voice of OPENAI_VOICE_OPTIONS) {
    const opt = document.createElement("option");
    opt.value = voice;
    opt.textContent = voice;
    els.openaiVoiceSelect.appendChild(opt);
  }
  els.openaiVoiceSelect.value = settings.getOpenaiVoice(DEFAULT_OPENAI_VOICE);

  updateBackendSectionVisibility();
  renderDiaryList();
}

function renderDiaryList() {
  const entries = diary.list().slice().reverse();
  els.diaryList.innerHTML = "";
  if (entries.length === 0) {
    const li = document.createElement("li");
    li.textContent = "(まだ記録がありません)";
    li.className = "diary-empty";
    els.diaryList.appendChild(li);
    return;
  }
  for (const entry of entries) {
    const li = document.createElement("li");
    li.textContent = `[${entry.date.slice(0, 10)}] ${entry.text}`;
    els.diaryList.appendChild(li);
  }
}

els.btnOpenSettings.addEventListener("click", () => {
  els.settingsOverlay.hidden = false;
});
els.btnCloseSettings.addEventListener("click", () => {
  els.settingsOverlay.hidden = true;
});

for (const [el, save] of [
  [els.apiKeyInput, (v) => settings.setApiKey(v)],
  [els.modelInput, (v) => settings.setModel(v)],
  [els.languageInput, (v) => settings.setLanguage(v)],
  [els.extraNotesInput, (v) => settings.setExtraNotes(v)],
  [els.openaiApiKeyInput, (v) => settings.setOpenaiApiKey(v)],
  [els.openaiModelInput, (v) => settings.setOpenaiModel(v)],
]) {
  el.addEventListener("change", () => save(el.value));
}
els.voiceSelect.addEventListener("change", () => settings.setVoice(els.voiceSelect.value));
els.openaiVoiceSelect.addEventListener("change", () => settings.setOpenaiVoice(els.openaiVoiceSelect.value));
els.aiBackendSelect.addEventListener("change", () => {
  settings.setAiBackend(els.aiBackendSelect.value);
  updateBackendSectionVisibility();
});
els.diaryEnabledInput.addEventListener("change", () => settings.setDiaryEnabled(els.diaryEnabledInput.checked));
els.btnClearDiary.addEventListener("click", () => {
  diary.clear();
  renderDiaryList();
});

loadSettingsIntoForm();

// ---------- カメラ ----------
async function refreshCameraDeviceList() {
  try {
    const devices = await CameraCapture.listVideoInputs();
    els.cameraDeviceSelect.innerHTML = "";
    const defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.textContent = "既定のカメラ";
    els.cameraDeviceSelect.appendChild(defaultOpt);
    devices.forEach((d, i) => {
      const opt = document.createElement("option");
      opt.value = d.deviceId;
      opt.textContent = d.label || `カメラ ${i + 1}`;
      els.cameraDeviceSelect.appendChild(opt);
    });
    const saved = settings.getCameraDeviceId();
    if (saved) els.cameraDeviceSelect.value = saved;
  } catch (err) {
    console.warn("カメラデバイス一覧の取得に失敗しました", err);
  }
}
refreshCameraDeviceList();
els.cameraDeviceSelect.addEventListener("change", () => {
  settings.setCameraDeviceId(els.cameraDeviceSelect.value);
});

state.camera = new CameraCapture({
  videoEl: els.cameraVideo,
  intervalMs: 1200,
  onFrame: (base64) => {
    if (state.connected && state.client) {
      state.client.sendVideoFrame(base64);
    }
  },
});

async function startCamera() {
  try {
    await state.camera.start(els.cameraDeviceSelect.value || undefined);
    state.cameraOn = true;
    els.cameraVideo.hidden = false;
    els.btnCameraToggle.classList.add("is-active");
    els.btnCameraToggle.textContent = "📷 カメラ ON";
    await refreshCameraDeviceList(); // ラベル権限が付与された後に再取得
  } catch (err) {
    console.error(err);
    setStatus(`カメラの起動に失敗しました: ${err.message}`, "error");
  }
}
function stopCamera() {
  state.camera.stop();
  state.cameraOn = false;
  els.cameraVideo.hidden = true;
  els.btnCameraToggle.classList.remove("is-active");
  els.btnCameraToggle.textContent = "📷 カメラ OFF";
}
els.btnCameraToggle.addEventListener("click", () => {
  if (state.cameraOn) stopCamera();
  else startCamera();
});

// ---------- マイク入力(録音) ----------
// targetSampleRate: バックエンドが要求するレート(Gemini=16000, OpenAI=24000)。
// client.micSampleRateを呼び出し元(startSession)から渡してもらう。
async function startMic(targetSampleRate = 16000) {
  state.micStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const ctx = new AudioContext();
  state.micAudioCtx = ctx;
  await ctx.audioWorklet.addModule("js/worklets/recorder-processor.js");
  const source = ctx.createMediaStreamSource(state.micStream);
  const node = new AudioWorkletNode(ctx, "recorder-processor", {
    processorOptions: { targetSampleRate, chunkMs: 100 },
  });
  node.port.onmessage = (event) => {
    if (!state.connected || !state.client) return;
    const base64 = arrayBufferToBase64(event.data);
    state.client.sendAudioChunk(base64);
    // 簡易的な入力音量メーター表示
    const int16 = new Int16Array(event.data);
    let sum = 0;
    for (let i = 0; i < int16.length; i++) sum += Math.abs(int16[i]);
    const avg = int16.length ? sum / int16.length / 32768 : 0;
    if (els.micLevel) els.micLevel.style.setProperty("--level", Math.min(1, avg * 6).toFixed(3));
  };
  source.connect(node);
  state.micWorkletNode = node;
}

function stopMic() {
  if (state.micWorkletNode) {
    state.micWorkletNode.port.onmessage = null;
    state.micWorkletNode.disconnect();
    state.micWorkletNode = null;
  }
  if (state.micAudioCtx) {
    state.micAudioCtx.close().catch(() => {});
    state.micAudioCtx = null;
  }
  if (state.micStream) {
    state.micStream.getTracks().forEach((t) => t.stop());
    state.micStream = null;
  }
  if (els.micLevel) els.micLevel.style.setProperty("--level", 0);
}

// ---------- 応答音声の再生 ----------
async function ensurePlayerReady() {
  if (state.playerAudioCtx) return;
  const ctx = new AudioContext();
  state.playerAudioCtx = ctx;
  await ctx.audioWorklet.addModule("js/worklets/player-processor.js");
  const node = new AudioWorkletNode(ctx, "player-processor", {
    outputChannelCount: [1],
    processorOptions: { sourceSampleRate: 24000 },
  });
  node.connect(ctx.destination);
  node.port.onmessage = (event) => {
    const data = event.data;
    if (data?.type === "level") {
      const rms = data.playing ? Math.min(1, data.rms * 5) : 0;
      viewer.setMouthLevel(rms);
    }
  };
  state.playerWorkletNode = node;
}

function playAudioChunk(base64) {
  if (!state.playerWorkletNode) return;
  const buffer = base64ToArrayBuffer(base64);
  state.playerWorkletNode.port.postMessage(buffer, [buffer]);
}

function clearPlayback() {
  if (state.playerWorkletNode) {
    state.playerWorkletNode.port.postMessage({ type: "clear" });
  }
  viewer.setMouthLevel(0);
}

// ---------- Gemini Live 接続 ----------
function finalizePendingOutputLine() {
  if (state.pendingOutputLine?.text) {
    state.sessionLog.push(`ゼタ: ${state.pendingOutputLine.text}`);
  }
  state.pendingOutputLine = null;
}

async function startSession() {
  const backend = settings.getAiBackend();
  const apiKey = backend === "openai" ? settings.getOpenaiApiKey() : settings.getApiKey();
  if (!apiKey) {
    const label = backend === "openai" ? "OpenAI" : "Gemini";
    setStatus(`設定画面で${label} APIキーを入力してください`, "error");
    els.settingsOverlay.hidden = false;
    return;
  }

  state.connecting = true;
  setStatus("接続中…", "connecting");
  els.btnToggleSession.disabled = true;

  const diaryEntries = settings.getDiaryEnabled() ? diary.recentTexts(5) : [];
  const systemInstruction = buildSystemInstruction({
    diaryEntries,
    extraNotes: settings.getExtraNotes(),
  });

  const client =
    backend === "openai"
      ? new OpenAiRealtimeClient({
          apiKey,
          model: settings.getOpenaiModel(DEFAULT_OPENAI_MODEL),
          systemInstruction,
          voiceName: settings.getOpenaiVoice(DEFAULT_OPENAI_VOICE),
        })
      : new GeminiLiveClient({
          apiKey,
          model: settings.getModel(DEFAULT_MODEL),
          systemInstruction,
          voiceName: settings.getVoice(DEFAULT_VOICE),
          languageCode: settings.getLanguage(DEFAULT_LANGUAGE),
        });

  client.addEventListener("audio", (e) => playAudioChunk(e.detail.base64));
  client.addEventListener("inputTranscript", (e) => {
    appendTranscript("あなた", e.detail.text, "transcript-line--user");
    state.sessionLog.push(`あなた: ${e.detail.text}`);
  });
  client.addEventListener("outputTranscript", (e) => {
    if (!state.pendingOutputLine) {
      state.pendingOutputLine = { text: "", el: appendTranscript("ゼタ", "", "transcript-line--char") };
    }
    state.pendingOutputLine.text += e.detail.text;
    state.pendingOutputLine.el.lastChild.textContent = state.pendingOutputLine.text;
  });
  client.addEventListener("turnComplete", () => finalizePendingOutputLine());
  client.addEventListener("interrupted", () => {
    clearPlayback();
    finalizePendingOutputLine();
  });
  // AIからのexpress()呼び出しを、実際のジェスチャー再生に繋ぐ。
  // 画面左下の表示は[検証用/Phase 0]の名残り(DevToolsなしで確認できるよう残してある)。
  client.addEventListener("toolCall", (e) => {
    const time = new Date().toLocaleTimeString("ja-JP");
    const calls = (e.detail.functionCalls || [])
      .map((c) => `${c.name}(${JSON.stringify(c.args)})`)
      .join("\n");
    let debugText = `[${time}] toolCall受信:\n${calls || JSON.stringify(e.detail)}`;
    for (const call of e.detail.functionCalls || []) {
      if (call.name === "express" && call.args?.gesture) {
        viewer.playGesture(call.args.gesture);
        debugText += `\n→ playGesture("${call.args.gesture}") 呼び出し済み`;
      }
    }
    if (els.debugToolcall) {
      els.debugToolcall.textContent = debugText;
    }
  });
  client.addEventListener("error", (e) => {
    console.error(`${backend === "openai" ? "OpenAI Realtime" : "Gemini Live"}エラー:`, e.detail);
    setStatus(`エラー: ${e.detail.message}`, "error");
  });
  client.addEventListener("close", (e) => {
    if (state.connected) {
      setStatus(`接続が終了しました (code=${e.detail.code})`, "idle");
      endSessionCleanup();
    }
  });

  try {
    await ensurePlayerReady();
    await client.connect();
    await startMic(client.micSampleRate);
    state.client = client;
    state.connected = true;
    state.connecting = false;
    setStatus("会話中…", "live");
    els.btnToggleSession.textContent = "⏹ 会話を終了";
    els.btnToggleSession.classList.add("is-active");
  } catch (err) {
    console.error(err);
    setStatus(`接続に失敗しました: ${err.message}`, "error");
    state.connecting = false;
    client.close();
  } finally {
    els.btnToggleSession.disabled = false;
  }
}

function endSessionCleanup() {
  state.connected = false;
  stopMic();
  clearPlayback();
  els.btnToggleSession.textContent = "🎙 会話を始める";
  els.btnToggleSession.classList.remove("is-active");

  if (settings.getDiaryEnabled() && state.sessionLog.length > 0) {
    const summary = state.sessionLog.join(" / ").slice(0, 480);
    diary.add(summary);
    renderDiaryList();
  }
  state.sessionLog = [];
  finalizePendingOutputLine();
}

function stopSession() {
  if (state.client) {
    state.client.close();
    state.client = null;
  }
  setStatus("待機中", "idle");
  endSessionCleanup();
}

els.btnToggleSession.addEventListener("click", () => {
  if (state.connected || state.connecting) stopSession();
  else startSession();
});

// ---------- テキスト送信 ----------
function sendTypedText() {
  const text = els.textInput.value.trim();
  if (!text) return;
  if (!state.connected || !state.client) {
    setStatus("先に「会話を始める」で接続してください", "error");
    return;
  }
  state.client.sendText(text);
  appendTranscript("あなた", text, "transcript-line--user");
  state.sessionLog.push(`あなた: ${text}`);
  els.textInput.value = "";
}
els.btnSendText.addEventListener("click", sendTypedText);
els.textInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendTypedText();
  }
});

setStatus("待機中", "idle");
