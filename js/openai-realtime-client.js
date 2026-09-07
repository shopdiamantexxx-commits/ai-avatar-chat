// OpenAI Realtime API への最小限のWebSocketクライアント。
// GeminiLiveClient(js/gemini-live-client.js)と同じ公開インターフェース
// (connect/close/sendAudioChunk/sendVideoFrame/sendText と、
//  open/audio/text/inputTranscript/outputTranscript/interrupted/turnComplete/
//  toolCall/error/close イベント)を実装し、main.js側は使うクライアントの
// クラスを差し替えるだけで動くようにしてある。
//
// 注意: これはブラウザから直接OpenAI APIキーを使ってWebSocket接続する
// プロトタイプ実装です。OpenAI公式はブラウザから直接、生のAPIキーで
// 接続すること(このファイルの実装方式)を推奨しておらず、本来は
// サーバー側で短命の一時トークン(ephemeral key)を発行してブラウザに
// 渡す方式を推奨しています。ただし、この方式には別途サーバーが必要に
// なるため、既存のGemini Live実装(localStorageに生のAPIキーを保存し
// 直接接続する方式)と同じリスク許容度で、まずは動作確認を優先している。
// 本格的に公開するアプリにする場合は、サーバー側でキーを隠す構成に
// 切り替えることを推奨します。
//
// また、OpenAI Realtime APIの正確なイベント名・フィールド名は執筆時点の
// 公開ドキュメントを基にしているが、このサンドボックス環境からは
// platform.openai.comへ接続して実地検証ができていないため、実機での
// 動作確認が必要(細部の名称が変わっている可能性がある)。

const WS_URL_BASE = "wss://api.openai.com/v1/realtime";

// OpenAI Realtime APIのtools(function calling)形式は、Gemini(functionDeclarations)
// とは異なるフラットな形式(type/name/description/parametersを直接持つ)。
// 中身の意味(emotion/gesture/intensity)はGemini側と完全に同じにしてある。
const EXPRESS_TOOL_DECLARATION = {
  type: "function",
  name: "express",
  description:
    "話している内容や感情の種類が変わるタイミングで呼び出し、キャラクターの表情・身振りの" +
    "種類と強さを表す。1つの発言(ターン)の中で、感情や話し方の種類が変わるたびに呼んでよい。",
  parameters: {
    type: "object",
    properties: {
      emotion: {
        type: "string",
        description: "現在の感情・話し方の種類",
        enum: ["neutral", "happy", "surprised", "sad", "troubled", "thinking", "explaining", "angry"],
      },
      gesture: {
        type: "string",
        description: "添えるとよい身振りの種類(任意)",
        enum: ["none", "nod", "tilt_head", "explain_hands", "point", "shrug", "think_pose", "cover_mouth", "cross_arms", "greeting", "confident_pose", "stretch", "presenting", "peace_sign", "finger_gun", "spin_gesture"],
      },
      intensity: {
        type: "number",
        description: "感情・身振りの強さ(0.0〜1.0)",
      },
    },
    required: ["emotion"],
  },
};

export class OpenAiRealtimeClient extends EventTarget {
  /**
   * @param {object} opts
   * @param {string} opts.apiKey OpenAIのAPIキー
   * @param {string} opts.model 例: "gpt-realtime"
   * @param {string} opts.systemInstruction キャラクター設定などのシステムインストラクション
   * @param {string} [opts.voiceName] プリセット音声名 (例: "alloy")
   * @param {boolean} [opts.enableTranscription] 音声の文字起こしを有効にするか
   */
  constructor({ apiKey, model, systemInstruction, voiceName, enableTranscription = true }) {
    super();
    this.apiKey = apiKey;
    this.model = model;
    this.systemInstruction = systemInstruction;
    this.voiceName = voiceName;
    this.enableTranscription = enableTranscription;
    this.ws = null;
    this.ready = false;
    this._videoWarned = false;
  }

  // OpenAI Realtime APIは入出力ともに24kHz PCM16固定(Geminiは入力16kHz/出力24kHzで
  // 非対称)。main.js側でマイクの録音サンプルレートを決めるのに使う。
  get micSampleRate() {
    return 24000;
  }

  connect() {
    return new Promise((resolve, reject) => {
      if (!this.apiKey) {
        reject(new Error("OpenAI APIキーが設定されていません"));
        return;
      }
      const url = `${WS_URL_BASE}?model=${encodeURIComponent(this.model)}`;
      // ブラウザのWebSocket APIはAuthorizationヘッダーを送れないため、OpenAIが
      // 用意しているsubprotocol経由の認証方式を使う(公式にも用意されているが、
      // "insecure"という名前の通り、鍵がクライアント側に露出する方式)。
      const protocols = ["realtime", `openai-insecure-api-key.${this.apiKey}`, "openai-beta.realtime-v1"];
      let ws;
      try {
        ws = new WebSocket(url, protocols);
      } catch (e) {
        reject(e);
        return;
      }
      this.ws = ws;
      let settled = false;

      ws.addEventListener("open", () => {
        const sessionUpdate = {
          type: "session.update",
          session: {
            modalities: ["audio", "text"],
            instructions: this.systemInstruction,
            voice: this.voiceName,
            input_audio_format: "pcm16",
            output_audio_format: "pcm16",
            tools: [EXPRESS_TOOL_DECLARATION],
            tool_choice: "auto",
            ...(this.enableTranscription
              ? { input_audio_transcription: { model: "whisper-1" } }
              : {}),
          },
        };
        console.log("[OpenAI Realtime] session.update送信:", JSON.stringify(sessionUpdate, null, 2));
        ws.send(JSON.stringify(sessionUpdate));
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

        if (msg.type === "session.updated") {
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
    switch (msg.type) {
      case "response.audio.delta":
        if (msg.delta) this._emit("audio", { base64: msg.delta, mimeType: "audio/pcm;rate=24000" });
        break;
      case "response.audio_transcript.delta":
        if (msg.delta) this._emit("outputTranscript", { text: msg.delta });
        break;
      case "conversation.item.input_audio_transcription.completed":
        if (msg.transcript) this._emit("inputTranscript", { text: msg.transcript });
        break;
      case "input_audio_buffer.speech_started":
        // ユーザーが話し始めた=AIの発話に割り込んだとみなし、Gemini側の
        // "interrupted"と同じ意味で扱う(再生中の音声を止める)。
        this._emit("interrupted", {});
        break;
      case "response.done":
        this._emit("turnComplete", {});
        break;
      case "response.function_call_arguments.done":
        this._handleFunctionCallDone(msg);
        break;
      case "error":
        console.error("[OpenAI Realtime] エラーイベント:", msg.error);
        this._emit("error", { message: msg.error?.message || "不明なエラー" });
        break;
      default:
        // response.audio.done, response.created, conversation.item.created など
        // 今のところ使わないイベントは無視する。
        break;
    }
  }

  /**
   * OpenAI Realtimeのfunction calling結果を処理する。Gemini版のtoolCallと
   * 同じ形(functionCalls配列)にそろえてイベントを発火することで、main.js側の
   * 既存のtoolCallハンドラをそのまま使い回せるようにしている。
   */
  _handleFunctionCallDone(msg) {
    const { call_id, name, arguments: argsJson } = msg;
    let args = {};
    try {
      args = argsJson ? JSON.parse(argsJson) : {};
    } catch {
      console.warn("[OpenAI Realtime] function_call_argumentsの解析に失敗:", argsJson);
    }
    console.log(`[OpenAI Realtime] 関数呼び出し受信: ${name}(${JSON.stringify(args)}) call_id=${call_id}`);

    const functionCalls = [{ id: call_id, name, args }];
    this._emit("toolCall", { functionCalls });

    // Gemini版のtoolResponseと同様、内容によらず受け付けたことだけを返す。
    this._send({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id,
        output: JSON.stringify({ result: "ok" }),
      },
    });
    // 関数の実行結果を踏まえてAIに続きを話してもらうため、新しい応答を要求する。
    this._send({ type: "response.create" });
  }

  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  /** @param {string} base64Pcm16 24kHz/16bit PCM(リトルエンディアン)のbase64文字列 */
  sendAudioChunk(base64Pcm16) {
    this._send({ type: "input_audio_buffer.append", audio: base64Pcm16 });
  }

  /** OpenAI Realtime APIは映像入力に対応していないため、これは何もしない。 */
  sendVideoFrame(_base64Jpeg) {
    if (!this._videoWarned) {
      console.warn("[OpenAI Realtime] このバックエンドはカメラ映像の送信に対応していません(無視されます)");
      this._videoWarned = true;
    }
  }

  /** @param {string} text ユーザーがテキストで入力したメッセージ */
  sendText(text) {
    this._send({
      type: "conversation.item.create",
      item: { type: "message", role: "user", content: [{ type: "input_text", text }] },
    });
    this._send({ type: "response.create" });
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
