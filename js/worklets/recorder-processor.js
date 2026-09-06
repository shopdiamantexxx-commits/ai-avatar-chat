// マイク入力をGemini Live APIが要求する 16kHz / 16bit PCM (mono) にその場で
// リサンプリングし、一定量たまるごとにメインスレッドへ転送するAudioWorklet。
//
// ブラウザ・OSによってAudioContextの実サンプルレート(`sampleRate`, AudioWorklet
// グローバル)はまちまち(44100/48000など)なので、常にここで線形補間による
// リサンプリングを行い、常に16kHzのPCMを出力する。

class RecorderProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { targetSampleRate = 16000, chunkMs = 100 } = options.processorOptions || {};
    this.targetRate = targetSampleRate;
    // 入力(このAudioContextの実レート)1サンプルあたり、出力何サンプル分進むか
    this.ratio = sampleRate / this.targetRate;
    this.buffer = new Float32Array(0);
    this.readPos = 0;
    this.chunkSize = Math.max(1, Math.round(this.targetRate * (chunkMs / 1000)));
    this.outAccum = [];
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0 || !input[0] || input[0].length === 0) {
      return true;
    }

    // マルチチャンネルならモノラルにダウンミックス
    let mono;
    if (input.length === 1) {
      mono = input[0];
    } else {
      mono = new Float32Array(input[0].length);
      for (let ch = 0; ch < input.length; ch++) {
        const c = input[ch];
        for (let i = 0; i < c.length; i++) mono[i] += c[i] / input.length;
      }
    }

    // これまでの未消費サンプル + 新規サンプルを1本につなげる
    const keepFrom = Math.floor(this.readPos);
    const remaining = this.buffer.subarray(keepFrom);
    const merged = new Float32Array(remaining.length + mono.length);
    merged.set(remaining, 0);
    merged.set(mono, remaining.length);
    this.buffer = merged;
    this.readPos -= keepFrom;

    // 線形補間でtargetRateにリサンプリング
    while (true) {
      const i0 = Math.floor(this.readPos);
      const i1 = i0 + 1;
      if (i1 >= this.buffer.length) break;
      const frac = this.readPos - i0;
      const sample = this.buffer[i0] * (1 - frac) + this.buffer[i1] * frac;
      this.outAccum.push(sample);
      this.readPos += this.ratio;
    }

    if (this.outAccum.length >= this.chunkSize) {
      const n = this.outAccum.length;
      const int16 = new Int16Array(n);
      for (let i = 0; i < n; i++) {
        const v = Math.max(-1, Math.min(1, this.outAccum[i]));
        int16[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
      }
      this.outAccum.length = 0;
      this.port.postMessage(int16.buffer, [int16.buffer]);
    }

    return true;
  }
}

registerProcessor("recorder-processor", RecorderProcessor);
