import { seededRandom, clamp } from './world.js';

export const TRACKS = {
  kalimba: { tempo: 76, notes: [0, 7, 12, 4, 9, 7, 4, 2, 0, 4, 7, 14, 12, 9, 7, 4], root: 60 },
  flute: { tempo: 58, notes: [0, null, 4, 7, 9, null, 7, 4, 2, null, 4, 7, 4, null, 2, 0], root: 69 },
  handpan: { tempo: 64, notes: [0, 7, 3, 10, 12, 7, 5, 3, 0, 5, 7, 15, 12, 10, 7, 3], root: 50 },
};
export const noteFrequency = midi => 440 * 2 ** ((midi - 69) / 12);

export class IslandAudio {
  constructor() {
    this.context = null; this.playing = false; this.track = 'kalimba';
    this.musicVolume = 0.42; this.natureVolume = 0.7; this.step = 0;
    this.random = seededRandom(93); this.activeVoices = new Set();
  }
  init() {
    if (this.context) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error('このブラウザでは音を再生できません。');
    const ctx = this.context = new AudioContext();
    const compressor = ctx.createDynamicsCompressor(); compressor.threshold.value = -16; compressor.ratio.value = 5;
    const master = ctx.createGain(); master.gain.value = 0.65; master.connect(compressor); compressor.connect(ctx.destination);
    this.nature = ctx.createGain(); this.nature.gain.value = this.natureVolume * 0.55; this.nature.connect(master);
    this.music = ctx.createGain(); this.music.gain.value = this.musicVolume * 0.30; this.music.connect(master);
    // A modest diffuse echo gives generated instruments a soft, open sound.
    const delay = ctx.createDelay(1); delay.delayTime.value = 0.29;
    const feedback = ctx.createGain(); feedback.gain.value = 0.23;
    const wet = ctx.createGain(); wet.gain.value = 0.16;
    this.music.connect(delay); delay.connect(feedback); feedback.connect(delay); delay.connect(wet); wet.connect(master);
    const buffer = ctx.createBuffer(2, Math.ceil(ctx.sampleRate * 8), ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch); let smooth = 0;
      for (let i = 0; i < data.length; i++) { const white = this.random() * 2 - 1; smooth = (smooth + white * 0.035) / 1.035; data[i] = smooth * 3.8 + white * 0.10; }
    }
    const surf = ctx.createBufferSource(); surf.buffer = buffer; surf.loop = true;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1200;
    const swell = ctx.createGain(); swell.gain.value = 0.42;
    const tide = ctx.createOscillator(); tide.frequency.value = 1 / 8.5;
    const depth = ctx.createGain(); depth.gain.value = 0.25;
    tide.connect(depth); depth.connect(swell.gain); surf.connect(filter); filter.connect(swell); swell.connect(this.nature);
    tide.start(); surf.start();
    const wind = ctx.createBufferSource(); wind.buffer = buffer; wind.loop = true; wind.playbackRate.value = 0.73;
    const windFilter = ctx.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 470; windFilter.Q.value = 0.35;
    const windGain = ctx.createGain(); windGain.gain.value = 0.12;
    wind.connect(windFilter); windFilter.connect(windGain); windGain.connect(this.nature); wind.start();
    this.nextNote = ctx.currentTime + 0.1; this.nextBird = ctx.currentTime + 5;
    this.timer = setInterval(() => this.schedule(), 100);
  }
  async play() {
    this.init();
    await this.context.resume();
    if (this.context.state !== 'running') throw new Error('音を開始するには、もう一度音のボタンをタップしてください。');
    this.playing = true; this.nextNote = this.context.currentTime + 0.08;
  }
  async pause() { this.playing = false; if (this.context) await this.context.suspend(); }
  setVolumes(music, nature) {
    this.musicVolume = clamp(music, 0, 1); this.natureVolume = clamp(nature, 0, 1);
    if (this.context) {
      this.music.gain.setTargetAtTime(this.musicVolume * 0.3, this.context.currentTime, 0.08);
      this.nature.gain.setTargetAtTime(this.natureVolume * 0.55, this.context.currentTime, 0.08);
    }
  }
  setTrack(track) {
    if (!(track in TRACKS) && track !== 'none') return;
    this.track = track; this.step = 0;
    if (this.context) {
      const now = this.context.currentTime;
      for (const voice of this.activeVoices) { voice.gain.cancelScheduledValues(now); voice.gain.setTargetAtTime(0.0001, now, 0.04); }
      this.nextNote = now + 0.15;
    }
  }
  schedule() {
    const ctx = this.context;
    if (!this.playing || ctx.state !== 'running') return;
    if (this.track !== 'none') {
      const track = TRACKS[this.track], beat = 60 / track.tempo;
      if (this.nextNote < ctx.currentTime) this.nextNote = ctx.currentTime + 0.04;
      while (this.nextNote < ctx.currentTime + 0.22) {
        const note = track.notes[this.step % track.notes.length];
        if (note !== null) this.instrument(noteFrequency(track.root + note), this.nextNote, this.track, beat);
        this.nextNote += beat * (this.track === 'flute' ? 1 : 0.5); this.step++;
      }
    }
    if (ctx.currentTime > this.nextBird) {
      this.bird(ctx.currentTime + 0.05); this.nextBird = ctx.currentTime + 11 + this.random() * 16;
    }
  }
  instrument(frequency, at, type, beat) {
    const ctx = this.context, envelope = ctx.createGain();
    const length = type === 'flute' ? beat * 1.7 : 2.7;
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(type === 'flute' ? 0.42 : 0.7, at + (type === 'flute' ? 0.12 : 0.008));
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + length);
    const panner = ctx.createStereoPanner(); panner.pan.value = (this.random() - 0.5) * 0.65;
    envelope.connect(panner); panner.connect(this.music); this.activeVoices.add(envelope);
    const partials = type === 'kalimba' ? [[1, 1], [2.76, 0.12], [5.4, 0.035]] : type === 'handpan' ? [[1, 1], [2, 0.35], [3, 0.11]] : [[1, 1], [2, 0.11], [3, 0.035]];
    let remaining = partials.length;
    for (const [multiple, volume] of partials) {
      const osc = ctx.createOscillator(), gain = ctx.createGain(); osc.type = 'sine'; osc.frequency.value = frequency * multiple;
      gain.gain.value = volume * 0.4; osc.connect(gain); gain.connect(envelope);
      osc.start(at); osc.stop(at + length + 0.05);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); if (--remaining === 0) { envelope.disconnect(); panner.disconnect(); this.activeVoices.delete(envelope); } };
    }
  }
  bird(at) {
    const ctx = this.context;
    for (let i = 0; i < 3; i++) {
      const start = at + i * 0.19, osc = ctx.createOscillator(), gain = ctx.createGain(), pan = ctx.createStereoPanner();
      pan.pan.value = -0.65;
      osc.frequency.setValueAtTime(2200 + this.random() * 600, start); osc.frequency.exponentialRampToValueAtTime(3700, start + 0.055); osc.frequency.exponentialRampToValueAtTime(2400, start + 0.13);
      gain.gain.setValueAtTime(0.0001, start); gain.gain.exponentialRampToValueAtTime(0.018, start + 0.025); gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.15);
      osc.connect(gain); gain.connect(pan); pan.connect(this.nature); osc.start(start); osc.stop(start + 0.17);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); pan.disconnect(); };
    }
  }
  async suspendForBackground() {
    if (this.context && this.context.state === 'running') await this.context.suspend();
  }
  async resumeFromBackground() {
    if (this.context && this.playing) { await this.context.resume(); this.nextNote = this.context.currentTime + 0.1; }
  }
}
