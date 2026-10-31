// ---- elixir-mix: a channel each for the synth and the beat's five voices (kick, tom, snare, cymbal, hats): its level
// (0 dB at 100, up to +4 dB), a meter, mute, and its echo and reverb sends (the synth's are the same as its fx page's).
// The echo and reverb themselves, and the master, are the fx and mstr pages, shared with the synth ----
const MIX_CH = ['synth', 'kick', 'tom', 'snare', 'cymbal', 'hats'];
const CHAN0 = () => MIX_CH.map(() => ({ lvl: 100, mute: false, echo: 0, verb: 0 }));
const chans = CHAN0();
// the crossfader on the patterns page: -100 is the beat alone, 100 the synth alone, both at full in the middle (not kept
// in presets: it's played live)
let xf = 0;
const xfGain = (n) => (n ? Math.min(1, 1 - xf / 100) : Math.min(1, 1 + xf / 100));
function sendChans() {
  send({ type: 'chans', chans: chans.map((c, n) => ({ lvl: (c.lvl / 100) ** 2 * xfGain(n), mute: c.mute, echo: n ? c.echo / 100 : 0, verb: n ? c.verb / 100 : 0 })) });
}
sendHooks.push(sendChans);
const lvlDb = (v) => { if (!v) return '-∞'; const d = 40 * Math.log10(v / 100); return (d > 0.05 ? '+' : '') + (Math.abs(d) < 0.05 ? '0.0' : d.toFixed(1)); };
MIX_CH.forEach((name, n) => {
  mFader($('m-mixlvl'), name, { min: 0, max: 127, get: () => chans[n].lvl, set: (v) => { chans[n].lvl = v; sendChans(); }, show: lvlDb, dflt: 100 });
  // the synth's sends are its own (fx.send, fx.verb); the beat's are the mixer's
  const echo = n ? { get: () => chans[n].echo, set: (v) => { chans[n].echo = v; sendChans(); } } : { get: () => fx.send, set: (v) => { fx.send = v; sendMix(); } };
  const verb = n ? { get: () => chans[n].verb, set: (v) => { chans[n].verb = v; sendChans(); } } : { get: () => fx.verb, set: (v) => { fx.verb = v; sendMix(); } };
  mFader($('m-mixecho'), name, { min: 0, max: 100, ...echo, show: sendPct, dflt: 0 });
  mFader($('m-mixverb'), name, { min: 0, max: 100, ...verb, show: sendPct, dflt: 0 });
  const m = document.createElement('button'); m.type = 'button'; m.className = 'm-toggle m-mute'; m.textContent = 'mute';
  m.setAttribute('aria-label', `mute ${name}`);
  m.addEventListener('click', () => { chans[n].mute = !chans[n].mute; sendChans(); drawAll(); });
  $('m-mixmutes').append(m);
  const meter = document.createElement('i'); meter.className = 'm-meter'; meter.append(document.createElement('b')); $('m-mixmeters').append(meter);
});
drawHooks.push(() => [...$('m-mixmutes').children].forEach((b, n) => b.setAttribute('aria-pressed', chans[n].mute)));
// the meters: each channel's peak, falling back slowly, from the audio thread's readings
{
  const bars = [...$('m-mixmeters').children].map((m) => m.firstChild), held = new Float32Array(6);
  let last = 0;
  const draw = (l) => {
    const now = performance.now(), fall = Math.min(1, (now - last) / 1000) * 1.5; last = now;
    l.forEach((v, n) => {
      const db = v > 1e-5 ? 20 * Math.log10(v) : -60, f = Math.max(0, Math.min(1, (db + 48) / 48));
      held[n] = Math.max(f, held[n] - fall);
      bars[n].style.width = `${(held[n] * 100).toFixed(1)}%`;
    });
  };
  eventHandlers.push((ev) => { if (ev.type === 'lvl') draw(ev.l); });
  stopHooks.push(() => setTimeout(() => { held.fill(0); bars.forEach((b) => { b.style.width = '0%'; }); }, 400));
}
// presets keep the mixer
snapParts.push({ key: 'mix', get: () => structuredClone(chans),
  put: (c) => { const d = CHAN0(); chans.forEach((ch, n) => Object.assign(ch, d[n], (Array.isArray(c) && c[n]) || {})); } });
{
  const el = $('m-xf');
  const show = () => { $('m-xfv').textContent = Math.abs(xf) < 3 ? 'beat + synth' : xf < 0 ? `beat ${100 + xf < 1 ? 'only' : '+ synth ' + (100 + xf) + '%'}` : `synth ${100 - xf < 1 ? 'only' : '+ beat ' + (100 - xf) + '%'}`; };
  el.addEventListener('input', () => { xf = +el.value; if (Math.abs(xf) < 3) xf = 0; sendChans(); show(); });
  el.addEventListener('dblclick', () => { xf = 0; el.value = 0; sendChans(); show(); });
  show();
}
// the synth rotate slider: the note sequence played 0 to 15 steps on, the beat staying where it is
{
  const el = $('m-rotx');
  const show = () => { $('m-rotv').textContent = seqRot ? `+${seqRot} step${seqRot > 1 ? 's' : ''}` : '0'; };
  el.addEventListener('input', () => { seqRot = +el.value; sendSeq(); show(); });
  el.addEventListener('dblclick', () => { seqRot = 0; el.value = 0; sendSeq(); show(); });
  show();
}
