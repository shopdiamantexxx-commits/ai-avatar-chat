// Geminiから届く24kHz/16bit PCM(mono)の応答音声を、このAudioContextの実サンプル
// レートに線形補間でリサンプリングしながら再生するAudioWorklet。
// バージイン(ユーザーの発話による割り込み)時は "clear" メッセージで即座に
// 再生中バッファを空にする。

class PlayerProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { sourceSampleRate = 24000 } = options.processorOptions || {};
    this.ratio = sourceSampleRate / sampleRate; // 出力1サンプルあたり進む入力サンプル数
    this.buffer = new Float32Array(0);
    this.readPos = 0;
    this.levelReportCounter = 0;

    this.port.onmessage = (event) => {
      const data = event.data;
      if (data && data.type === "clear") {
        this.buffer = new Float32Array(0);
        this.readPos = 0;
        return;
      }
      // dataはInt16PCMのArrayBuffer
      const int16 = new Int16Array(data);
      const f32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 0x8000;

      const keepFrom = Math.floor(this.readPos);
      const remaining = this.buffer.subarray(keepFrom);
      const merged = new Float32Array(remaining.length + f32.length);
      merged.set(remaining, 0);
      merged.set(f32, remaining.length);
      this.buffer = merged;
      this.readPos -= keepFrom;
    };
  }

  process(_inputs, outputs) {
    const channel = outputs[0][0];
    const buf = this.buffer;
    let playing = false;
    let sumSq = 0;
    for (let i = 0; i < channel.length; i++) {
      const i0 = Math.floor(this.readPos);
      const i1 = i0 + 1;
      if (i1 < buf.length) {
        const frac = this.readPos - i0;
        const sample = buf[i0] * (1 - frac) + buf[i1] * frac;
        channel[i] = sample;
        sumSq += sample * sample;
        this.readPos += this.ratio;
        playing = true;
      } else {
        channel[i] = 0;
      }
    }
    for (let ch = 1; ch < outputs[0].length; ch++) outputs[0][ch].set(channel);

    // 口パク(リップシンク的な表現)用に、数フレームおきにRMS音量を通知する
    // (毎フレーム通知するとメインスレッドへの負荷が高いため間引く)
    this.levelReportCounter++;
    if (this.levelReportCounter >= 6) {
      this.levelReportCounter = 0;
      const rms = Math.sqrt(sumSq / channel.length);
      this.port.postMessage({ type: "level", playing, rms });
    }
    return true;
  }
}

registerProcessor("player-processor", PlayerProcessor);
