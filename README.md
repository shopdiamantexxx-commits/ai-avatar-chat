# ai-avatar-chat

## AIキャラクター対話アプリ(プロトタイプ)

「ゼタ」というオリジナルキャラクターと、音声・カメラ映像でリアルタイムに対話できるWebアプリです。
Gemini Live API(WebSocket)・Three.js + VRM(`@pixiv/three-vrm`)を使い、ビルド不要でブラウザだけで動作します。

見て・聞いて・話せる体験(CODE27のような3Dキャラクターデバイス)を、独自デザイン・独自実装で目指しています。

### 使い方

AudioWorkletを使うため、`file://`では動作しません。ローカルサーバー経由で開いてください。

```bash
python3 -m http.server 8000
# ブラウザで http://localhost:8000 を開く
```

初回起動時にやること:

1. 右上の「⚙ 設定」を開く
2. [Google AI Studio](https://aistudio.google.com/apikey) で取得したGemini APIキーを入力
3. (任意)モデルID・音声(プリセットボイス)・言語コードを確認/変更
4. (任意)VRoid Studioなどで作成した `.vrm` ファイルを選択すると、キャラクター表示が差し替わります
   (未選択の場合は簡易プレースホルダーが表示されます)
5. 「🎙 会話を始める」を押してマイクの使用を許可すると、音声で会話が始まります

### 主な機能

- Gemini Live API(BidiGenerateContent, WebSocket)によるリアルタイム音声対話
- マイク入力(16kHz PCM16へその場でリサンプリング)・応答音声再生(24kHz PCM16)を AudioWorklet で処理
- カメラ映像入力(`getUserMedia`)。OBS等の仮想カメラも通常のカメラデバイスとして選択可能
- テキスト入力での会話(音声と併用可)
- 発話中の音量に応じた簡易リップシンク(口パク)
- VRMモデルの読み込み・表示(`@pixiv/three-vrm` + Three.js)。読み込んだモデルはブラウザに保存され次回も自動表示
- キャラクター設定(外見・二面性の性格・話し方)を `js/character.js` に集約
- 長期記憶(日記)機能: 会話終了時にセッションの要約をブラウザに保存し、次回以降の会話に軽く反映

### ディレクトリ構成

```
index.html              画面本体
css/style.css            スタイル
js/character.js          キャラクター設定・システムインストラクション生成
js/gemini-live-client.js Gemini Live API WebSocketクライアント
js/camera.js             カメラ映像入力
js/vrm-viewer.js         Three.js + VRM 表示
js/store.js              設定・VRMファイル・日記の保存(localStorage / IndexedDB)
js/main.js               画面の配線(アプリ本体)
js/worklets/             マイク録音・応答音声再生用の AudioWorklet
```

### キャラクター設定を変更する場合

`js/character.js` の `CHARACTER_PROFILE` と `buildSystemInstruction()` を編集してください。
設定画面の「追加の指示」欄からも、コードを触らずに指示を追記できます。

### データの保存先・セキュリティに関する注意

- APIキー・設定・日記はブラウザの `localStorage` に、VRMファイルは `IndexedDB` に保存されます。
- これらは**この端末のこのブラウザにのみ**保存され、Gemini(`generativelanguage.googleapis.com`)への直接通信以外には送信されません。
- 本実装はプロトタイプとして、ブラウザから直接Gemini APIキーを使ってWebSocket接続しています。
  ブラウザJSである以上キーを完全には隠せないため、不特定多数に公開するアプリにする場合は、
  APIキーをサーバー側(プロキシ)に置く構成へ切り替えることを推奨します。

### 既知の制約・今後の展望

- カメラ映像は一定間隔(既定1.2秒ごと)の静止画として送信しています(常時ストリーミングではありません)。
- リップシンクは応答音声の音量から口の開閉量を推定する簡易的なものです。
- 日記(長期記憶)は生の会話ログを短く切り詰めて保存する簡易実装です。将来的にはLLMによる要約に置き換え可能です。
- Live APIのモデルID・音声名は変更される可能性があるため、動作しない場合は設定画面のモデルIDを
  [Google AI Studio](https://aistudio.google.com/) で確認し、最新のものに変更してください。
