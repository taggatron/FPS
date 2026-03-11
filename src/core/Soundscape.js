export class Soundscape {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.ambience = null;
  }

  ensureContext() {
    if (this.ctx) return;

    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.14;
    this.master.connect(this.ctx.destination);

    this.startAmbience();
  }

  startAmbience() {
    const noiseNode = this.createNoiseNode();
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 500;

    const rumbleGain = this.ctx.createGain();
    rumbleGain.gain.value = 0.22;

    noiseNode.connect(noiseFilter);
    noiseFilter.connect(rumbleGain);
    rumbleGain.connect(this.master);
    noiseNode.start();

    const drone = this.ctx.createOscillator();
    drone.type = 'sawtooth';
    drone.frequency.value = 38;
    const droneGain = this.ctx.createGain();
    droneGain.gain.value = 0.05;
    drone.connect(droneGain);
    droneGain.connect(this.master);
    drone.start();

    this.ambience = { noiseNode, drone };
  }

  createNoiseNode() {
    const length = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return source;
  }

  shot() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'square';
    osc.frequency.setValueAtTime(220, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.06);

    filter.type = 'highpass';
    filter.frequency.value = 160;

    gain.gain.setValueAtTime(0.45, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.09);
  }

  roar(size = 'small') {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    const start = size === 'large' ? 120 : size === 'medium' ? 160 : 210;
    const end = size === 'large' ? 44 : size === 'medium' ? 72 : 110;
    const dur = size === 'large' ? 1 : 0.6;

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(start, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(end, this.ctx.currentTime + dur);

    filter.type = 'lowpass';
    filter.frequency.value = 800;

    gain.gain.setValueAtTime(0.001, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, this.ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);

    osc.start();
    osc.stop(this.ctx.currentTime + dur + 0.04);
  }

  reload() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(360, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(780, this.ctx.currentTime + 0.12);

    gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }

  damage() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.value = 70;

    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.16);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.17);
  }
}
