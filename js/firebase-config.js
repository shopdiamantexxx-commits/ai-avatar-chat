// クラウド共有（全端末でのリアルタイム同期）を有効にするための設定です。
//
// 【設定手順】
// 1. https://console.firebase.google.com/ にアクセスし、Googleアカウントでログイン
// 2. 「プロジェクトを作成」→ 名前を入力（例: production-time-tool）→ 作成
//    （Googleアナリティクスは無効のままでOK）
// 3. 左メニュー「構築」→「Firestore Database」→「データベースの作成」
//    → ロケーションを選択（例: asia-northeast1）→ 開始
//    → 「Firestoreセキュリティルール」を以下に書き換えて公開:
//        rules_version = '2';
//        service cloud.firestore {
//          match /databases/{database}/documents {
//            match /{document=**} {
//              allow read, write: if true;
//            }
//          }
//        }
//    ※ログイン不要のツールのため、あえて全公開のルールにしています。
//      現場の作業時間データのみを扱う想定で、外部に公開しない前提での設定です。
// 4. プロジェクトの概要画面で「</>」（ウェブアプリを追加）をクリック
//    → アプリのニックネームを入力 → アプリを登録
//    → 表示される firebaseConfig の中身を、下の window.FIREBASE_CONFIG に
//      そのまま貼り付けて保存してください。
//
// 未設定（apiKeyが "REPLACE_WITH_YOUR_API_KEY" のまま）の場合は、
// 今まで通りこの端末のブラウザにのみ保存される動作になります。

window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyCmb83bNZ6c77u2Kpt36mu8RBUNTT7LbkM",
  authDomain: "production-time-tool.firebaseapp.com",
  projectId: "production-time-tool",
  storageBucket: "production-time-tool.firebasestorage.app",
  messagingSenderId: "588292977449",
  appId: "1:588292977449:web:e8a71dd787db6e7bd53d38",
};
