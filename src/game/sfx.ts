/** WebAudio 合成音效，零素材（移植自 app/game.js 的 Sfx 模块） */
class SfxImpl {
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  private ensure(): AudioContext | null {
    if (!this.ac) {
      try {
        this.ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        this.master = this.ac.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ac.destination);
      } catch {
        this.ac = null;
      }
    }
    if (this.ac && this.ac.state === 'suspended') void this.ac.resume();
    return this.ac;
  }

  unlock() { this.ensure(); }

  private tone(freqA: number, freqB: number, dur: number, type: OscillatorType, vol: number, delay = 0) {
    if (this.muted || !this.ensure()) return;
    const ac = this.ac!;
    const t0 = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freqA, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(freqB, 1), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.master!);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  private noiseBufs = new Map<number, AudioBuffer>();

  /** 噪声缓冲按时长缓存复用（后期密集击杀/爆炸时避免每次分配 AudioBuffer） */
  private noiseBuf(dur: number): AudioBuffer | null {
    if (!this.ac) return null;
    const key = Math.round(dur * 100);
    let buf = this.noiseBufs.get(key);
    if (!buf) {
      const len = Math.max(1, Math.floor(this.ac.sampleRate * dur));
      buf = this.ac.createBuffer(1, len, this.ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      this.noiseBufs.set(key, buf);
    }
    return buf;
  }

  private noise(dur: number, vol: number, filterFreq: number, type: BiquadFilterType = 'lowpass', delay = 0) {
    if (this.muted || !this.ensure()) return;
    const ac = this.ac!;
    const buf = this.noiseBuf(dur);
    if (!buf) return;
    const t0 = ac.currentTime + delay;
    const src = ac.createBufferSource(); src.buffer = buf;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master!);
    src.start(t0);
  }

  shoot()    { this.tone(760, 180, 0.08, 'square', 0.10); }
  uzi()      { this.tone(900, 300, 0.05, 'square', 0.07); }
  shotgun()  { this.noise(0.16, 0.22, 900); this.tone(220, 60, 0.14, 'sawtooth', 0.12); }
  rocket()   { this.noise(0.25, 0.16, 500); this.tone(160, 50, 0.3, 'sawtooth', 0.10); }
  throwG()   { this.tone(500, 700, 0.09, 'sine', 0.08); }
  place()    { this.tone(300, 180, 0.08, 'triangle', 0.10); }
  explode()  { this.noise(0.55, 0.34, 320); this.tone(90, 30, 0.5, 'sine', 0.30); }
  zdie()     { this.noise(0.10, 0.14, 700, 'bandpass'); this.tone(160, 60, 0.09, 'sawtooth', 0.07); }
  zattack()  { this.tone(140, 70, 0.2, 'sawtooth', 0.09); }
  devil()    { this.tone(880, 220, 0.35, 'sawtooth', 0.08); this.tone(660, 180, 0.3, 'square', 0.05, 0.05); }
  fireball() { this.noise(0.22, 0.14, 1600, 'bandpass'); this.tone(320, 120, 0.18, 'sawtooth', 0.08); }
  fhit()     { this.noise(0.25, 0.18, 500); this.tone(120, 50, 0.22, 'sine', 0.12); }
  hurt()     { this.tone(200, 90, 0.16, 'sawtooth', 0.14); this.noise(0.08, 0.10, 1200, 'highpass'); }
  pickup()   { this.tone(660, 660, 0.07, 'sine', 0.10); this.tone(990, 990, 0.09, 'sine', 0.10, 0.07); }
  newWeap()  { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.1, 'square', 0.09, i * 0.08)); }
  levelup()  { [392, 523, 659].forEach((f, i) => this.tone(f, f, 0.12, 'triangle', 0.10, i * 0.09)); }
  ui()       { this.tone(440, 440, 0.05, 'square', 0.07); }
  over()     { [330, 262, 196, 131].forEach((f, i) => this.tone(f, f * 0.9, 0.25, 'triangle', 0.12, i * 0.18)); }
  count()    { this.tone(520, 520, 0.09, 'square', 0.10); }
  go()       { this.tone(780, 780, 0.18, 'square', 0.12); }

  toggleMute() { this.muted = !this.muted; return this.muted; }
  isMuted() { return this.muted; }
}

export const Sfx = new SfxImpl();
