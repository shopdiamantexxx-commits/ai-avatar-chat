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

// [検証用/Phase 0] ネイティブ音声出力(responseModalities:["AUDIO"])のままfunction
// calling(tools)を併用できるかを確認するための実験的なツール定義。
// systemInstructionでは「呼び出すように」とはまだ指示しておらず、モデルが自発的に
// 呼ぶかどうかも含めてこの段階の検証対象。VRM側への反映はまだ行わず、
// console.logで受信内容を確認するだけにとどめる。
const EXPRESS_FUNCTION_DECLARATION = {
  name: "express",
  description:
    "話している内容や感情の種類が変わるタイミングで呼び出し、キャラクターの表情・身振りの" +
    "種類と強さを表す。1つの発言(ターン)の中で、感情や話し方の種類が変わるたびに呼んでよい。",
  parameters: {
    type: "OBJECT",
    properties: {
      emotion: {
        type: "STRING",
        description: "現在の感情・話し方の種類",
        enum: ["neutral", "happy", "surprised", "sad", "troubled", "thinking", "explaining", "angry"],
      },
      gesture: {
        type: "STRING",
        description: "添えるとよい身振りの種類(任意)",
        enum: ["none", "nod", "tilt_head", "explain_hands", "point", "shrug", "think_pose", "cover_mouth", "cross_arms", "greeting", "confident_pose", "stretch"],
      },
      intensity: {
        type: "NUMBER",
        description: "感情・身振りの強さ(0.0〜1.0)",
      },
    },
    required: ["emotion"],
  },
};

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
            // [検証用/Phase 0] responseModalities:["AUDIO"]と併用できるかを確認するための
            // tools宣言。既存の音声・文字起こし設定には影響しない。
            tools: [{ functionDeclarations: [EXPRESS_FUNCTION_DECLARATION] }],
            ...(this.enableTranscription
              ? { inputAudioTranscription: {}, outputAudioTranscription: {} }
              : {}),
          },
        };
        console.log("[Gemini Live][Phase0] setup送信(tools付き):", JSON.stringify(setupMessage, null, 2));
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
      this._handleToolCall(msg.toolCall);
    }
    if (msg.goAway) {
      this._emit("goAway", msg.goAway);
    }
  }

  /**
   * [検証用/Phase 0] Gemini Liveからのtool call(関数呼び出し要求)を処理する。
   * まだVRM側には何も反映せず、express()の引数(emotion/gesture/intensity)を
   * console.logで確認できるようにするだけ。Live APIの仕様上、関数呼び出しには
   * toolResponseを返さないと会話が先に進まない(ターンがブロックされる)ため、
   * 内容によらず最低限のtoolResponseを送り返す。
   */
  _handleToolCall(toolCall) {
    console.log("[Gemini Live][Phase0] toolCall受信(生データ):", JSON.stringify(toolCall, null, 2));
    this._emit("toolCall", toolCall);

    const functionCalls = toolCall.functionCalls || [];
    if (functionCalls.length === 0) {
      console.warn("[Gemini Live][Phase0] toolCallにfunctionCallsが含まれていません");
      return;
    }

    const functionResponses = functionCalls.map((call) => {
      if (call.name === "express") {
        const { emotion, gesture, intensity } = call.args || {};
        console.log(
          `[Gemini Live][Phase0] express()呼び出しを検出: emotion=${emotion}, gesture=${gesture}, intensity=${intensity} (id=${call.id})`
        );
      } else {
        console.log(`[Gemini Live][Phase0] 未知の関数呼び出し: ${call.name}(${JSON.stringify(call.args)}) id=${call.id}`);
      }
      // 内容は問わず、呼び出しを受け付けたことだけを返す最小限のtoolResponse
      return { id: call.id, name: call.name, response: { result: "ok" } };
    });

    this._send({ toolResponse: { functionResponses } });
    console.log("[Gemini Live][Phase0] toolResponse送信:", JSON.stringify(functionResponses, null, 2));
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
