// Gemini Live API (BidiGenerateContent) への最小限のWebSocketクライアント。
//
// 注意: これはブラウザから直接Gemini APIキーを使ってWebSocket接続する
// プロトタイプ実装です。APIキーはこのブラウザのlocalStorageに保存され、
// Gemini(generativelanguage.googleapis.com)以外へは送信しません。
// ただし、ブラウザのJSは原理上キーを完全に隠すことはできないため、
// 本格的に公開するアプリにする場合は、キーをサーバー側(プロキシ)に
// 置く構成に切り替えることを推奨します。

const WS_HOST = "generativelanguage.googleapis.com";
const WS_PATH =
  "/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

export class GeminiLiveClient extends EventTarget {
  /**
   * @param {object} opts
   * @param {string} opts.apiKey Google AI StudioのGemini APIキー
   * @param {string} opts.model 例: "models/gemini-3.1-flash-live-preview"
   * @param {string} opts.systemInstruction キャラクター設定などのシステムインストラクション
   * @param {string} [opts.voiceName] プリセット音声名 (例: "Aoede")
   * @param {string} [opts.languageCode] 例: "ja-JP"
   * @param {boolean} [opts.enableTranscription] 音声の文字起こしを有効にするか
   */
  constructor({ apiKey, model, systemInstruction, voiceName, languageCode, enableTranscription = true }) {
    super();
    this.apiKey = apiKey;
    this.model = model;
    this.systemInstruction = systemInstruction;
    this.voiceName = voiceName;
    this.languageCode = languageCode;
    this.enableTranscription = enableTranscription;
    this.ws = null;
    this.ready = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      if (!this.apiKey) {
        reject(new Error("APIキーが設定されていません"));
        return;
      }
      const url = `wss://${WS_HOST}${WS_PATH}?key=${encodeURIComponent(this.apiKey)}`;
      let ws;
      try {
        ws = new WebSocket(url);
      } catch (e) {
        reject(e);
        return;
      }
      this.ws = ws;
      let settled = false;

      ws.addEventListener("open", () => {
        const setupMessage = {
          setup: {
            model: this.model,
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: this.voiceName } },
                languageCode: this.languageCode,
              },
            },
            systemInstruction: { parts: [{ text: this.systemInstruction }] },
            ...(this.enableTranscription
              ? { inputAudioTranscription: {}, outputAudioTranscription: {} }
              : {}),
          },
        };
        ws.send(JSON.stringify(setupMessage));
      });

      ws.addEventListener("message", async (event) => {
        let text = event.data;
        if (text instanceof Blob) {
          text = await text.text();
        } else if (text instanceof ArrayBuffer) {
          text = new TextDecoder().decode(text);
        }
        let msg;
        try {
          msg = JSON.parse(text);
        } catch {
          this._emit("error", { message: "サーバー応答の解析に失敗しました" });
          return;
        }

        if (msg.setupComplete) {
          this.ready = true;
          if (!settled) {
            settled = true;
            resolve();
          }
          this._emit("open", {});
          return;
        }
        this._handleServerMessage(msg);
      });

      ws.addEventListener("error", () => {
        const err = new Error("WebSocket接続でエラーが発生しました");
        this._emit("error", { message: err.message });
        if (!settled) {
          settled = true;
          reject(err);
        }
      });

      ws.addEventListener("close", (event) => {
        this.ready = false;
        this._emit("close", { code: event.code, reason: event.reason });
        if (!settled) {
          settled = true;
          reject(new Error(`接続がすぐに閉じられました (code=${event.code})`));
        }
      });
    });
  }

  _handleServerMessage(msg) {
    if (msg.serverContent) {
      const sc = msg.serverContent;
      if (sc.modelTurn && sc.modelTurn.parts) {
        for (const part of sc.modelTurn.parts) {
          if (part.inlineData && part.inlineData.data) {
            this._emit("audio", { base64: part.inlineData.data, mimeType: part.inlineData.mimeType });
          }
          if (part.text) {
            this._emit("text", { text: part.text });
          }
        }
      }
      if (sc.inputTranscription && sc.inputTranscription.text) {
        this._emit("inputTranscript", { text: sc.inputTranscription.text });
      }
      if (sc.outputTranscription && sc.outputTranscription.text) {
        this._emit("outputTranscript", { text: sc.outputTranscription.text });
      }
      if (sc.interrupted) {
        this._emit("interrupted", {});
      }
      if (sc.turnComplete) {
        this._emit("turnComplete", {});
      }
    }
    if (msg.toolCall) {
      this._emit("toolCall", msg.toolCall);
    }
    if (msg.goAway) {
      this._emit("goAway", msg.goAway);
    }
  }

  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  /** @param {string} base64Pcm16 16kHz/16bit PCM(リトルエンディアン)のbase64文字列 */
  sendAudioChunk(base64Pcm16) {
    this._send({ realtimeInput: { audio: { data: base64Pcm16, mimeType: "audio/pcm;rate=16000" } } });
  }

  /** @param {string} base64Jpeg JPEG画像のbase64文字列 */
  sendVideoFrame(base64Jpeg) {
    this._send({ realtimeInput: { video: { data: base64Jpeg, mimeType: "image/jpeg" } } });
  }

  /** @param {string} text ユーザーがテキストで入力したメッセージ */
  sendText(text) {
    this._send({ realtimeInput: { text } });
  }

  _send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  close() {
    this.ready = false;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* すでに閉じている場合は無視 */
      }
    }
  }
}
