// The audio thread: runs the engine's drum 1 voice as a mono synth with the note sequencer, the other five voices as the
// beat with its pattern (on the same clock), the mixer's channels, the echo, reverb and ring mod sends, the distortion and
// compressor on the mix and the recorder, and resamples the engine's rate to the output's.
// Used inside the AudioWorklet (or a ScriptProcessor fallback).
// the tempo-synced echo: 1/128 of a bar at 0, a whole bar at 1, evenly in octaves between
const delaySamples = (pos, bpm) => 240 / bpm * Math.pow(2, -7 * (1 - pos)) * LXR.REAL_FS;
const RING_MAKEUP = 3;
// a step's gate: 0 rests, 1 to 4 close after a quarter to all of the step, 5 lets the note ring out
const GATE_RING = 5;
// a beat step's bar condition: 0 every bar; n only the last bar of every n; -n every bar but that one; 100 + n only the
// first bar of every n (the bar after a fill)
function barOk(b, bar) {
  if (!b) return true;
  if (b > 100) return bar % (b - 100) === 0;
  if (b > 0) return bar % b === b - 1;
  return bar % -b !== -b - 1;
}
class Player {
  constructor(outRate) {
    this.e = new LXR.LxrEngine();
    this.e.loadInitKit();
    this.ratio = LXR.REAL_FS / outRate;
    this.A = [new Float32Array(64), new Float32Array(64)];
    this.B = [new Float32Array(64), new Float32Array(64)];
    this.idx = 0; this.frac = 0;
    // the sequence: 16 steps a page (up to 4 pages) of { n: semitones from middle C, gate, acc, slide }
    this.steps = Array.from({ length: 16 }, () => ({ n: 0, gate: 0, acc: false, slide: false }));
    this.playing = false; this.bpm = 120; this.vel = 100; this.accGain = 0.5; this.glide = 0.35;
    this.step = 0; this.bar = 0; this.toNext = 0; this.atBar = []; this.clock = 0;
    // pitch: the perf page's pitch, in semitones (hundredths), added to every note
    this.pitch = 0;
    // the note sounding (in semitones from middle C, before pitch), where a slide has it now (cur), its slide and where its gate closes
    this.note = 0; this.cur = 0; this.slideFrom = null; this.slideAt = 0; this.slideLen = 1; this.cutAt = Infinity;
    // the voice's gain: the accent (an unaccented note is turned down by the accent amount) times the gate
    this.gain = 1; this.gainTo = 1; this.gate = 1;
    this.rec = null;
    // the master: the distortion as an insert on the mix, then a compressor, the same design as the LXR-02's FX compressor
    this.master = { comp: true, thresh: -12, ratio: 3, attack: 5, release: 120, makeup: 0 };
    // the echo is the engine's own FX bus (the firmware's delay, tempo-synced, all wet as a send); the ring mod a send bus
    this.delayPos = 1 + Math.log2(3 / 16) / 7;
    this.dist = new LXR.FxBus(); this.dist.fxType = LXR.FX_DISTORTION; this.dist.forceWet = true;
    this.ring = new LXR.FxBus(); this.ring.fxType = LXR.FX_RING; this.ring.forceWet = true;
    // the reverb: the firmware's own (compiled out of the LXR-02, switched back on in the engine), a send bus
    this.verb = new LXR.FxBus(); this.verb.fxType = LXR.FX_REVERB; this.verb.forceWet = true;
    this.fxRng = new LXR.Rng(0x2545f491);
    this.sendE = 0; this.sendR = 0; this.sendV = 0; this.verbQuiet = 256; this.echoWidth = 1; this.fxGain = new Float32Array(6);
    this.distMix = 0; this.distAt = 0;
    this.busIn = new Float32Array(128); this.busOut = new Int16Array(128);
    this.compEnv = 0; this.gr = 0;
    // the beat: the engine's other voices (drum 2, drum 3, snare, cymbal, hats) as a drum machine on the same clock.
    // Its pattern has seven rows, one per engine track (row 0, drum 1, is the synth's and stays empty; 5 and 6 are the
    // closed and open hat), in pages of 16 steps played a bar each; boff moves each row's hits off the grid (in 16ths).
    // Hits are booked a step ahead, so one pushed early still comes in before its grid time
    this.beat = { pages: [] }; this.boff = null; this.bVel = 100; this.bAccGain = 0.5;
    this.queue = []; this.fresh = false;
    this.bGain = new Float32Array(6).fill(1); this.bGainTo = new Float32Array(6).fill(1);
    // the mixer, channel 0 the synth and 1 to 5 the beat's voices: level (0..1.4), mute, and the beat's echo and reverb
    // sends (the synth's are sendE and sendV); the channel gains ramp across a block so a move never clicks
    this.chLvl = new Float32Array(6).fill(1); this.chMute = new Uint8Array(6);
    this.chAt = new Float32Array(6).fill(1); this.bSendE = new Float32Array(6); this.bSendV = new Float32Array(6);
    this.vIn = new Float32Array(128);
    // level meters: each channel's peak after its fader, sent every 16 blocks while anything sounds
    this.lvl = new Float32Array(6); this.lvlN = 0; this.lvlOn = false;
    this.events = [];
    this._render(this.A); this._render(this.B);
  }
  // the hits of beat step s in the given bar, each due `at0` samples from now plus its groove offset
  schedule(s, bar, at0) {
    const pages = this.beat.pages;
    if (!pages.length) return;
    const P = pages[bar % pages.length], len = LXR.REAL_FS * 60 / this.bpm / 4;
    for (let t = 1; t < 7; t++) {
      if (!P.on[t][s] || !barOk(P.bar[t][s], bar)) continue;
      const off = this.boff ? this.boff[t][s] : 0;
      this.queue.push({ at: Math.max(0, at0 + off * len), t, acc: !!P.acc[t][s] });
    }
  }
  msg(m) {
    if (m.type === 'param') this.e.setParam(m.par, m.value);
    else if (m.type === 'kit') this.e.loadKit(m.values);
    else if (m.type === 'pitch') { this.pitch = m.v; this.setPitch(this.cur); }
    else if (m.type === 'note') this.play(m.n, m.acc, m.gate, false);
    else if (m.type === 'delay') this.delayPos = m.pos;
    else if (m.type === 'beat') {
      this.atBar = this.atBar.filter((q) => q.type !== 'beat');
      this.beat = m.beat; this.boff = m.off; this.bVel = m.vel; this.bAccGain = Math.pow(10, -m.accentDb / 20);
    } else if (m.type === 'chans') {
      m.chans.forEach((c, n) => { this.chLvl[n] = c.lvl; this.chMute[n] = c.mute ? 1 : 0; this.bSendE[n] = c.echo || 0; this.bSendV[n] = c.verb || 0; });
    } else if (m.type === 'trig') { this.e.trigger(m.t, m.vel || 127, 60); this.bGainTo[Math.min(m.t, 5)] = 1; }
    else if (m.type === 'atBar') { if (this.playing) this.atBar.push(m.m); else this.msg(m.m); }
    else if (m.type === 'mix') {
      Object.assign(this.master, m.master);
      this.dist.distortion.type = m.dist.type;
      m.dist.p.forEach((v, i) => this.dist.setParameter(i, v / 127));
      this.distMix = (m.dist.mix || 0) / 100;
      this.ring.ringmod.osc.waveform = m.ring.wave;
      this.ring.setParameter(0, m.ring.freq / 127);
      if (m.verb) m.verb.forEach((v, i) => this.verb.setParameter(i, v / 127));
      this.sendE = m.sendE; this.sendR = m.sendR; this.sendV = m.sendV || 0; this.echoWidth = m.width / 100;
    } else if (m.type === 'rec') {
      this.rec = { L: new Float32Array(16384), R: new Float32Array(16384), n: 0 };
      this.events.push({ type: 'rec', state: 'on' });
    } else if (m.type === 'recStop') { if (this.rec) this.recEnd(); }
    else if (m.type === 'seq') {
      // a live change wins over one still waiting for the bar
      this.atBar = this.atBar.filter((q) => q.type !== 'seq');
      this.steps = m.steps; this.bpm = m.bpm; this.e.bpm = m.bpm; this.vel = m.vel; this.glide = m.glide;
      this.accGain = Math.pow(10, -m.accentDb / 20);
      if (m.playing && !this.playing) { this.sPos = 0; this.step = 0; this.bar = 0; this.toNext = 0; this.cutAt = Infinity; this.slideFrom = null; this.queue = []; this.fresh = true; }
      this.playing = m.playing;
      if (!this.playing) { this.flushBar(); this.cutAt = this.clock; this.queue = []; }
    }
  }
  recFlush() {
    const r = this.rec;
    if (r.n) this.events.push({ type: 'recData', L: r.L.slice(0, r.n), R: r.R.slice(0, r.n) });
    r.n = 0;
  }
  recEnd() { this.recFlush(); this.events.push({ type: 'rec', state: 'done', bpm: this.bpm }); this.rec = null; }
  // a preset (or a randomise) waiting for the bar: its messages come in on the first step of the next one
  flushBar() {
    const q = this.atBar; this.atBar = [];
    for (const m of q) this.msg(m.type === 'seq' ? { ...m, playing: this.playing } : m);
  }
  // the voice to semitone n (from middle C) plus pitch, without a retrigger: a whole note is set exactly as a trigger sets it
  setPitch(n) { this.e.setDrumPitch(0, Math.max(0, Math.min(127, 60 + n + this.pitch))); }
  // a note: a trigger on its whole semitone, then (only if pitch puts it between semitones) the rest of the way.
  // slide: glide there from the note sounding instead, without a retrigger
  play(n, acc, gate, slide) {
    if (slide) { this.slideFrom = this.cur; this.slideAt = 0; }
    else {
      this.slideFrom = null;
      const p = Math.max(0, Math.min(127, 60 + n + this.pitch)), base = Math.floor(p);
      this.e.trigger(0, acc ? 127 : this.vel, base);
      if (p !== base) this.e.setDrumPitch(0, p);
      this.gainTo = acc ? 1 : this.accGain; this.gate = 1; this.cur = n;
    }
    this.note = n;
    const len = LXR.REAL_FS * 60 / this.bpm / 4;
    this.slideLen = Math.max(64, this.glide * len);
    this.cutAt = gate >= GATE_RING ? Infinity : this.clock + gate / 4 * len;
  }
  // step s (of all the pages): its note, slid into from the step before when that one slides and both play; a step that slides on
  // keeps its gate open into the next
  doStep(s) {
    const S = this.steps, N = S.length, cur = S[s], prev = S[(s + N - 1) % N], next = S[(s + 1) % N];
    if (!cur.gate) return;
    const slideIn = prev.slide && prev.gate > 0 && this.cutAt === Infinity && this.gate > 0;
    this.play(cur.n, cur.acc, cur.slide && next.gate ? GATE_RING : cur.gate, slideIn);
    if (slideIn && cur.acc) this.gainTo = 1;
  }
  _render(dst) {
    if (this.playing) {
      if (this.toNext <= 0) {
        if (this.step === 0 && this.atBar.length) this.flushBar();
        const len = LXR.REAL_FS * 60 / this.bpm / 4;
        // the note sequence: its own place, round its length (up to four pages of 16), so a short one cycles against the bar
        const sp = (this.sPos || 0) % this.steps.length;
        this.doStep(sp);
        this.sPos = sp + 1;
        // the beat: this step's hits on starting, then each step books the next one's
        if (this.fresh) { this.fresh = false; this.schedule(this.step, this.bar, this.toNext); }
        const next = (this.step + 1) % 16;
        this.schedule(next, next ? this.bar : this.bar + 1, this.toNext + len);
        const bp = this.beat.pages.length || 1;
        this.events.push({ type: 'step', step: this.step, page: sp >> 4, nstep: sp & 15, bar: this.bar, bpage: this.bar % bp, gr: this.gr });
        this.gr = 0;
        this.step = next;
        if (this.step === 0) this.bar++;
        this.toNext += len;
      }
      this.toNext -= 64;
    }
    // the beat's hits due in this block (a muted channel's are skipped)
    if (this.queue.length) {
      const keep = [];
      for (const q of this.queue) {
        if (q.at >= 64) { q.at -= 64; keep.push(q); continue; }
        const n = Math.min(q.t, 5);
        if (this.chMute[n]) continue;
        this.e.trigger(q.t, q.acc ? 127 : this.bVel, 60);
        this.bGainTo[n] = q.acc ? 1 : this.bAccGain;
      }
      this.queue = keep;
    }
    // a slide: the pitch glides from the note before over the glide time
    if (this.slideFrom !== null) {
      this.slideAt += 64;
      const k = Math.min(1, this.slideAt / this.slideLen);
      this.cur = this.slideFrom + (this.note - this.slideFrom) * k;
      this.setPitch(this.cur);
      if (k >= 1) { this.slideFrom = null; this.cur = this.note; }
    }
    // the gate closes: the voice fades out over three blocks (about 4 ms)
    if (this.clock >= this.cutAt) this.gate = Math.max(0, this.gate - 0.34);
    this.clock += 64;
    const e = this.e;
    // the beat's voices go to the echo bus while their send is up (the synth's routing is its own AUDIO_OUT1)
    for (let n = 1; n < 6; n++) e.audioRouting[n] = this.bSendE[n] > 0 ? LXR.MIXER_ROUTING_FX_BUS : 0;
    const out = e.renderBlock(), v = e.drums[0];
    const [L, R] = dst;
    const isDelay = e.fx.fxType === LXR.FX_DELAY;
    e.fx.forceWet = isDelay;
    e.fx.setDelaySync(isDelay ? delaySamples(this.delayPos, this.bpm) : null);
    // the channel gains (the mixer's level, or 0 muted), ramped from the last block's
    const c0 = this.chAt, c1 = this.chLvl.map((l, n) => (this.chMute[n] ? 0 : l));
    // the synth: the voice, its gain (accent, gate and channel) ramped over the block
    const g0 = this.gain * c0[0], g1 = this.gainTo * this.gate * c1[0], dg = (g1 - g0) / 64;
    const pl = v.triggeredPanL / 32768, pr = v.triggeredPanR / 32768, o = out[0];
    let pk = 0;
    for (let i = 0; i < 64; i++) { const s = o[i] * (g0 + dg * i); L[i] = s * pl; R[i] = s * pr; const a = s < 0 ? -s : s; if (a > pk) pk = a; }
    this.gain = this.gainTo * this.gate;
    pk *= Math.max(pl, pr); if (pk > this.lvl[0]) this.lvl[0] = pk;
    // the echo: the firmware's FX bus, sample-exact, fed at the echo send when the voice is routed to it
    this.fxGain[0] = e.audioRouting[0] === LXR.MIXER_ROUTING_FX_BUS ? g1 * this.sendE : 0;
    // the beat's voices: accent gain times the channel, ramped; each feeds the echo at its send
    const pans = [v, e.drums[1], e.drums[2], e.snare, e.cymbal, e.hat];
    for (let n = 1; n < 6; n++) {
      const b0 = this.bGain[n] * c0[n], b1 = this.bGainTo[n] * c1[n], db = (b1 - b0) / 64, ob = out[n];
      const ql = pans[n].triggeredPanL / 32768, qr = pans[n].triggeredPanR / 32768;
      let lv = 0;
      if (b0 || b1) for (let i = 0; i < 64; i++) { const s = ob[i] * (b0 + db * i); L[i] += s * ql; R[i] += s * qr; const a = s < 0 ? -s : s; if (a > lv) lv = a; }
      lv *= Math.max(ql, qr); if (lv > this.lvl[n]) this.lvl[n] = lv;
      this.bGain[n] = this.bGainTo[n];
      this.fxGain[n] = b1 * this.bSendE[n];
    }
    this.chAt = c1;
    if (++this.lvlN >= 16) {
      this.lvlN = 0;
      const on = this.lvl.some((x) => x > 1e-4);
      if (on || this.lvlOn) this.events.push({ type: 'lvl', l: Array.from(this.lvl) });
      this.lvlOn = on; this.lvl.fill(0);
    }
    const fx = e.renderFx(this.fxGain, this.echoWidth);
    // the ring mod (the synth's alone) and reverb buses, saturated to int16; the firmware's ring mod carrier is quiet, so
    // it gets makeup gain. The reverb takes every channel at its send and runs every block, sent to or not, so its tail rings out
    const bi = this.busIn, bo = this.busOut;
    const busFeed = (bus, gain) => {
      for (let i = 0; i < 64; i++) {
        bi[2 * i] = gain ? Math.max(-32768, Math.min(32767, Math.round(o[i] * v.triggeredPanL * gain))) : 0;
        bi[2 * i + 1] = gain ? Math.max(-32768, Math.min(32767, Math.round(o[i] * v.triggeredPanR * gain))) : 0;
      }
      bus.input.set(bi); bo.fill(0);
      bus.process(bo, 64, this.fxRng);
    };
    busFeed(this.ring, this.sendR * g1);
    for (let i = 0; i < 64; i++) {
      L[i] += (bo[2 * i] * RING_MAKEUP + fx[2 * i]) / 32768; R[i] += (bo[2 * i + 1] * RING_MAKEUP + fx[2 * i + 1]) / 32768;
    }
    // (once nothing is sent and its tail has been silent for a while, it rests until something is sent again)
    const vg = this.sendV * g1;
    let vAny = !!vg;
    const vi = this.vIn; vi.fill(0);
    for (let n = 1; n < 6; n++) {
      const g = this.bSendV[n] * this.bGainTo[n] * c1[n];
      if (!g) continue;
      vAny = true;
      const ob = out[n], gl = pans[n].triggeredPanL * g, gr = pans[n].triggeredPanR * g;
      for (let i = 0; i < 64; i++) { vi[2 * i] += ob[i] * gl; vi[2 * i + 1] += ob[i] * gr; }
    }
    if (vAny || this.verbQuiet < 256) {
      for (let i = 0; i < 64; i++) {
        bi[2 * i] = Math.max(-32768, Math.min(32767, Math.round(o[i] * v.triggeredPanL * vg + vi[2 * i])));
        bi[2 * i + 1] = Math.max(-32768, Math.min(32767, Math.round(o[i] * v.triggeredPanR * vg + vi[2 * i + 1])));
      }
      this.verb.input.set(bi); bo.fill(0);
      this.verb.process(bo, 64, this.fxRng);
      let quiet = !vAny;
      for (let i = 0; i < 64; i++) { L[i] += bo[2 * i] / 32768; R[i] += bo[2 * i + 1] / 32768; if (bo[2 * i]) quiet = false; }
      this.verbQuiet = quiet ? this.verbQuiet + 1 : 0;
    }
    // the distortion, a master insert: the whole mix through the firmware's distortion, blended in at its mix amount,
    // ramped across the block; at 0 it's bypassed
    if (this.distMix || this.distAt) {
      const di = this.dist.input;
      for (let i = 0; i < 64; i++) { di[2 * i] = Math.max(-32768, Math.min(32767, Math.round(L[i] * 32768))); di[2 * i + 1] = Math.max(-32768, Math.min(32767, Math.round(R[i] * 32768))); }
      bo.fill(0);
      this.dist.process(bo, 64, this.fxRng);
      const m0 = this.distAt, m1 = this.distMix;
      for (let i = 0; i < 64; i++) { const m = m0 + (m1 - m0) * (i + 1) / 64; L[i] += (bo[2 * i] / 32768 - L[i]) * m; R[i] += (bo[2 * i + 1] / 32768 - R[i]) * m; }
      this.distAt = m1;
    }
    const M = this.master;
    if (M.comp) {
      // peak detector in dB, attack/release smoothing, gain = over * (1/ratio - 1) + makeup
      const ca = Math.exp(-1000 / (M.attack * LXR.REAL_FS)), cr = Math.exp(-1000 / (M.release * LXR.REAL_FS));
      const slope = 1 / M.ratio - 1, mk = Math.pow(10, M.makeup / 20);
      let env = this.compEnv, gr = this.gr;
      for (let i = 0; i < 64; i++) {
        const peak = Math.max(Math.abs(L[i]), Math.abs(R[i])) + 1e-9;
        const over = Math.max(0, 20 * Math.log10(peak) - M.thresh);
        env = over + (over > env ? ca : cr) * (env - over);
        const g = Math.pow(10, env * slope / 20) * mk;
        L[i] *= g; R[i] *= g;
        gr = Math.max(gr, -env * slope);
      }
      this.compEnv = env; this.gr = gr;
    }
    // the recorder takes the finished mix at the engine's own rate
    const r = this.rec;
    if (r) { r.L.set(L, r.n); r.R.set(R, r.n); r.n += 64; if (r.n === r.L.length) this.recFlush(); }
  }
  process(L, R) {
    for (let n = 0; n < L.length; n++) {
      while (this.idx >= 64) {
        const t = this.A; this.A = this.B; this.B = t;
        this._render(this.B);
        this.idx -= 64;
      }
      const i = this.idx, fr = this.frac;
      const l0 = this.A[0][i], r0 = this.A[1][i];
      const l1 = i < 63 ? this.A[0][i + 1] : this.B[0][0];
      const r1 = i < 63 ? this.A[1][i + 1] : this.B[1][0];
      L[n] = l0 + (l1 - l0) * fr;
      R[n] = r0 + (r1 - r0) * fr;
      this.frac += this.ratio;
      const k = Math.floor(this.frac);
      this.idx += k; this.frac -= k;
    }
  }
}
