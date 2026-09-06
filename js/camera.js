// ブラウザのカメラAPI(getUserMedia)を使った映像入力。
// OBS等の仮想カメラも、ブラウザからは通常のvideoinputデバイスとして
// enumerateDevices()に列挙されるため、デバイス選択で対応できる。

export class CameraCapture {
  /**
   * @param {object} opts
   * @param {HTMLVideoElement} opts.videoEl プレビュー表示用の<video>
   * @param {(base64Jpeg: string) => void} opts.onFrame 一定間隔で呼ばれるフレームコールバック
   * @param {number} [opts.intervalMs] フレーム送信間隔(ミリ秒)
   * @param {number} [opts.quality] JPEG品質(0-1)
   * @param {number} [opts.maxWidth] 送信画像の最大幅(px)
   */
  constructor({ videoEl, onFrame, intervalMs = 1000, quality = 0.6, maxWidth = 640 }) {
    this.videoEl = videoEl;
    this.onFrame = onFrame;
    this.intervalMs = intervalMs;
    this.quality = quality;
    this.maxWidth = maxWidth;
    this.stream = null;
    this.timer = null;
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
  }

  static async listVideoInputs() {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "videoinput");
  }

  get active() {
    return !!this.stream;
  }

  async start(deviceId) {
    if (this.stream) this.stop();
    const constraints = {
      video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "user" },
      audio: false,
    };
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.videoEl.srcObject = this.stream;
    await this.videoEl.play().catch(() => {});
    this.timer = setInterval(() => this._captureFrame(), this.intervalMs);
  }

  _captureFrame() {
    const v = this.videoEl;
    if (!v.videoWidth || !v.videoHeight) return;
    const scale = Math.min(1, this.maxWidth / v.videoWidth);
    const w = Math.max(1, Math.round(v.videoWidth * scale));
    const h = Math.max(1, Math.round(v.videoHeight * scale));
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx.drawImage(v, 0, 0, w, h);
    const dataUrl = this.canvas.toDataURL("image/jpeg", this.quality);
    const base64 = dataUrl.split(",")[1];
    if (base64) this.onFrame(base64);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.videoEl.srcObject = null;
  }
}
