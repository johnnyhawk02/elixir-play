// ---- elixir-beat: the engine's other five voices (drum 2 as the kick, drum 3 as the tom, the snare, the cymbal and the
// hats) as a drum machine on the synth's clock, with Elixir Mobile's pattern generator and its kits. Three pages:
// pattern (the generator's dials and the randomisers), steps (the pattern as a grid to edit) and kit (the kit, and each
// voice's main settings) ----
// the grid's rows: the engine track each plays, and the mixer channel it's on (both hats share the hat voice)
const BT = [{ t: 1, name: 'kick', ch: 1 }, { t: 2, name: 'tom', ch: 2 }, { t: 3, name: 'snare', ch: 3 },
  { t: 4, name: 'cymbal', ch: 4 }, { t: 5, name: 'cl hat', ch: 5 }, { t: 6, name: 'op hat', ch: 5 }];
const BEAT0 = { style: 0, beat: 0, energy: 60, fills: 40, vel: 100, accent: 6, kit: 0 };
const bs = { ...BEAT0 };
// the pattern: one bar of 16 steps, a row per engine track (row 0 is drum 1, the synth's, and stays empty): on, accent
// and bar condition (0 every bar; n the last of every n; -n all but that; 100 + n the first of every n)
const bPage = () => ({ on: blankFill(), acc: blankFill(), bar: blankFill() });
let bPat = bPage();
// the groove's offsets on the engine's tracks (the generator's rows are kick, low tom, high tom, snare, cymbal, hats)
const bOff = () => { const G = grooveMsg().off; return [new Array(16).fill(0), G[0], G[1], G[3], G[4], G[5], G[6]]; };
function bSend() { send({ type: 'beat', beat: { pages: [bPat] }, off: bOff(), vel: bs.vel, accentDb: bs.accent }); }
sendHooks.push(bSend);

// ---- the generator: each groove gives every step of every row the energy (1..9) at which it comes in; energy picks how
// much plays, fills adds the style's fill every 8, 4 or 2 bars (giving way to it on the rows it takes), with a crash on
// the bar after. As Elixir Mobile's perform page ----
const BROW = ['k', 'lo', 'hi', 's', 'cy', 'ch', 'oh'];
const B_ENERGY = [[1, 'empty'], [15, 'minimal'], [35, 'low'], [60, 'groove'], [85, 'driving'], [101, 'peak']];
const bLevel = () => (bs.energy ? 1 + bs.energy / 100 * 8 : 0);
const bFillNow = () => (bLevel() >= 2 && bs.fills ? { every: bs.fills < 34 ? 8 : bs.fills < 67 ? 4 : 2, len: 2 * Math.round(1 + bs.fills / 100 * 3), busy: bs.fills >= 50 } : null);
const bGrooves = () => STYLES[bs.style].grooves;
function bGenerate() {
  const g = bGrooves()[bs.beat % bGrooves().length], T = bLevel(), fill = bFillNow(), energy = bs.energy;
  const { on: fillOn, yields } = fill ? STYLES[bs.style].fill(fill) : { on: blankFill(), yields: [] };
  const P = bPage();
  for (let t = 0; t < 7; t++) {
    const lv = g[BROW[t]], alt = (g.alt && g.alt[BROW[t]]) || '';
    for (let s = 0; s < 16; s++) {
      const c = lv[s], reg = c !== '.' && Number(c) <= T;
      const win = fill && s >= 16 - fill.len, inFill = win && yields.includes(t);
      const fil = !!fillOn[t][s];
      let on = 0, cond = 0;
      if (inFill) { if (reg && fil) on = 1; else if (reg) { on = 1; cond = -fill.every; } else if (fil) { on = 1; cond = fill.every; } }
      else if (reg) on = 1;
      else if (win && fil) { on = 1; cond = fill.every; }
      else if (!win && alt[s] && alt[s] !== '.' && Number(alt[s]) <= T) { on = 1; cond = 2; }
      if (fill && t === 4 && s === 0 && !on && T >= 3) { on = 1; cond = 100 + fill.every; }
      P.on[t][s] = on; P.bar[t][s] = cond;
      P.acc[t][s] = on && ((c === '1' && energy >= 55) || (t === 6 && energy >= 85) || (fil && cond > 0 && (s % 4 === 0 || s === 15))) ? 1 : 0;
    }
  }
  // onto the engine's tracks: the kick on drum 2, both toms on drum 3 (the high one where both play)
  const E = bPage();
  const from = [null, [0], [2, 1], [3], [4], [5], [6]];
  for (let t = 1; t < 7; t++) for (let s = 0; s < 16; s++) {
    const r = from[t].find((x) => P.on[x][s]);
    if (r === undefined) continue;
    E.on[t][s] = 1; E.acc[t][s] = P.acc[r][s]; E.bar[t][s] = P.bar[r][s];
  }
  bPat = E;
  bSend(); bGridDraw();
}

// ---- kits: Elixir Mobile's, each a whole LXR kit. The beat takes its voices 3 to 6 as they are and moves its drum 1 (the
// kick) to drum 2; modulation aimed at drum 1 follows it to drum 2, and anything aimed at the kit's own drum 2 (gone)
// is dropped, so nothing in the beat ever moves the synth ----
const B_VNAMES = VOICE_PAGES.map((vp) => vp.groups.flatMap((g) => g.params.map(([, n]) => n)));
const bKitBytes = (k) => Uint8Array.from(atob(k.kit), (c) => c.charCodeAt(0));
function bTarget(t) {
  const [a0, a1] = MOD_TARGET_VOICE_RANGES[0], [b0, b1] = MOD_TARGET_VOICE_RANGES[1];
  if (t >= a0 && t <= a1) return t - a0 + b0;
  if (t >= b0 && t <= b1) return 0;
  return t;
}
function bSetPar(par, v) { values[par] = v; send({ type: 'param', par, value: v }); }
function useKit(i) {
  const N = BEAT_KITS.length;
  if (!N) return;
  bs.kit = ((i % N) + N) % N;
  const src = bKitBytes(BEAT_KITS[bs.kit]), next = values.slice();
  for (let v = 2; v < 6; v++) for (const n of B_VNAMES[v]) next[PAR[n]] = src[PAR[n]];
  B_VNAMES[0].forEach((n, j) => { next[PAR[B_VNAMES[1][j]]] = src[PAR[n]]; });
  for (let v = 2; v <= 6; v++) {
    const own = v === 2 ? 1 : v; // (the kick's come from the kit's drum 1)
    next[PAR['VEL_DEST_' + v]] = bTarget(src[PAR['VEL_DEST_' + own]]);
    next[PAR['TARGET_LFO' + v]] = bTarget(src[PAR['TARGET_LFO' + own]]);
    const r = src[PAR['RETRIGGER_LFO' + own]];
    next[PAR['RETRIGGER_LFO' + v]] = r === 1 ? 2 : r === 2 ? v : r;
    next[PAR['VOICE_LFO' + v]] = v;
  }
  for (const par of BEAT_PARS) if (next[par] !== values[par]) bSetPar(par, next[par]);
}

// ---- the pattern page: nine dials (style, pattern, energy / fills, groove, swing / velocity, accent, tempo) and the
// randomisers ----
const bDial = (label, o) => mFader($('m-beatf'), label, { dial: true, ...o });
const regen = (k) => (v) => { bs[k] = v; bGenerate(); };
bDial('style', { min: 0, max: STYLES.length - 1, get: () => bs.style, set: (v) => { bs.style = v; bs.beat = Math.min(bs.beat, bGrooves().length - 1); bGenerate(); }, show: (v) => STYLES[v].name, dflt: 0 });
bDial('pattern', { min: 0, max: () => bGrooves().length - 1, get: () => bs.beat, set: regen('beat'), show: (v) => `${v + 1} ${bGrooves()[v].name.toLowerCase()}`, dflt: 0 });
bDial('energy', { min: 0, max: 100, get: () => bs.energy, set: regen('energy'), show: (v) => `${B_ENERGY.find(([x]) => v < x)[1]} ${v}`, dflt: BEAT0.energy });
bDial('fills', { min: 0, max: 100, get: () => bs.fills, set: regen('fills'), show: () => { const f = bFillNow(); return f ? `every ${f.every}` : 'off'; }, dflt: BEAT0.fills });
bDial('groove', { min: 0, max: GROOVE_TYPES.length - 1, get: grooveIdx, set: (v) => { groove.type = GROOVE_TYPES[v].name; bSend(); }, show: (v) => GROOVE_TYPES[v].name, dflt: 0 });
bDial('swing', { min: 0, max: 100, get: () => groove.depth, set: (v) => { groove.depth = v; bSend(); }, show: (v) => `${v}%`, dflt: 100 });
bDial('velocity', { min: 1, max: 127, get: () => bs.vel, set: (v) => { bs.vel = v; bSend(); }, show: String, dflt: BEAT0.vel });
bDial('accent', { min: 0, max: 12, get: () => bs.accent, set: (v) => { bs.accent = v; bSend(); }, show: (v) => `+${v} dB`, dflt: BEAT0.accent });
bDial('tempo', { min: 40, max: 240, travel: 2, get: () => tempo, set: (v) => { tempo = v; sendSeq(); }, show: (v) => `${v} bpm`, dflt: 120 });
// pattern: a new one from any style; kit: one of the kits; alter kit: every voice moved a little; everything: both
function bRandomPattern() {
  bs.style = rIn(0, STYLES.length - 1); bs.beat = rIn(0, bGrooves().length - 1);
  bs.energy = rIn(35, 95); bs.fills = rIn(0, 100);
  groove.type = pick(GROOVE_TYPES).name; groove.depth = rIn(40, 100);
  bGenerate();
}
// (the pitch-ish and level ones stay: tune, volume, pan and the menus)
const B_KEEP = /^(COARSE|FINE|VOL\d|PAN|VEL_DEST|TARGET_LFO|VOICE_LFO|RETRIGGER|AUDIO_OUT|OSC_WAVE|WAVE|FILTER_TYPE|TRANS\d_WAVE|MIX_MOD|SYNC_LFO|VOLUME_MOD)/;
function bAlterKit(a = 0.06) {
  for (let v = 1; v < 6; v++) for (const n of B_VNAMES[v]) {
    if (B_KEEP.test(n)) continue;
    const par = PAR[n], sp = spec(par);
    if (sp.max < 20) continue;
    bSetPar(par, Math.max(0, Math.min(sp.max, Math.round(values[par] + (rnd() * 2 - 1) * a * sp.max))));
  }
}
$('m-beverything').addEventListener('click', (e) => mRandomise(e.currentTarget, () => { useKit(rIn(0, BEAT_KITS.length - 1)); bRandomPattern(); }));
$('m-bpat').addEventListener('click', (e) => mRandomise(e.currentTarget, bRandomPattern));
$('m-bkitr').addEventListener('click', (e) => mRandomise(e.currentTarget, () => useKit(rIn(0, BEAT_KITS.length - 1))));
$('m-balter').addEventListener('click', (e) => mRandomise(e.currentTarget, () => bAlterKit()));

// ---- the steps page: the pattern as a grid, a row per track, a column per step. A tap switches a step (hits) or its
// accent (accent); dragging across paints the same way. A step that plays only on some bars (a fill, the crash) is
// drawn hollow; tapping it makes it play every bar. The generator's dials make a fresh pattern over any edits ----
let bMode = 'on';
const bGrid = $('m-bgrid'), bCells = [];
BT.forEach((r, i) => {
  const lab = document.createElement('span'); lab.className = 'm-blab'; lab.textContent = r.name; bGrid.append(lab);
  bCells[i] = Array.from({ length: 16 }, (_, s) => {
    const c = document.createElement('i'); c.className = 'm-bcell'; c.dataset.r = i; c.dataset.s = s; c.setAttribute('role', 'gridcell');
    bGrid.append(c); return c;
  });
});
function bGridDraw() {
  BT.forEach((r, i) => bCells[i].forEach((c, s) => {
    const on = !!bPat.on[r.t][s];
    c.classList.toggle('on', on); c.classList.toggle('acc', on && !!bPat.acc[r.t][s]); c.classList.toggle('cond', on && !!bPat.bar[r.t][s]);
    c.setAttribute('aria-label', `${r.name} step ${s + 1}${on ? (bPat.acc[r.t][s] ? ' accent' : ' on') : ' off'}`);
  }));
}
drawHooks.push(bGridDraw);
document.querySelectorAll('[data-bmode]').forEach((b) => b.addEventListener('click', () => {
  bMode = b.dataset.bmode;
  document.querySelectorAll('[data-bmode]').forEach((x) => x.setAttribute('aria-selected', x === b));
  bGrid.dataset.mode = bMode;
}));
$('m-bclear').addEventListener('click', (e) => mRandomise(e.currentTarget, () => { bPat = bPage(); bSend(); }));
{
  let paint = null;
  const cellAt = (e) => { const el = document.elementFromPoint(e.clientX, e.clientY); return el && el.classList.contains('m-bcell') ? el : null; };
  const apply = (c) => {
    const t = BT[c.dataset.r].t, s = Number(c.dataset.s);
    if (bMode === 'on') { bPat.on[t][s] = paint.v; bPat.bar[t][s] = 0; if (!paint.v) bPat.acc[t][s] = 0; }
    else { bPat.acc[t][s] = paint.v; if (paint.v) { bPat.on[t][s] = 1; } }
    bSend(); bGridDraw();
  };
  bGrid.addEventListener('pointerdown', (e) => {
    const c = cellAt(e); if (!c) return;
    startAudio();
    bGrid.setPointerCapture(e.pointerId);
    const t = BT[c.dataset.r].t, s = Number(c.dataset.s);
    const cur = bMode === 'on' ? bPat.on[t][s] && !bPat.bar[t][s] : bPat.on[t][s] && bPat.acc[t][s];
    paint = { v: cur ? 0 : 1, last: c };
    apply(c);
  });
  bGrid.addEventListener('pointermove', (e) => { if (!paint) return; const c = cellAt(e); if (c && c !== paint.last) { paint.last = c; apply(c); } });
  const end = () => { paint = null; };
  bGrid.addEventListener('pointerup', end); bGrid.addEventListener('pointercancel', end);
}
// the step playing, a column lit
eventHandlers.push((ev) => {
  if (ev.type !== 'step') return;
  const lag = ctx && ctx.outputLatency ? ctx.outputLatency * 1000 : 0;
  setTimeout(() => { if (playing) bCells.forEach((row) => row.forEach((c, s) => c.classList.toggle('now', s === ev.step))); }, lag);
});
stopHooks.push(() => bCells.forEach((row) => row.forEach((c) => c.classList.remove('now'))));

// ---- the kit page: the kit (step through them), then a tab per voice with its main settings ----
const B_VOICES = [['kick', 1], ['tom', 2], ['snare', 3], ['cymbal', 4], ['hats', 5]];
const B_PICK = [['COARSE', 'tune'], ['DECAY', 'decay'], ['DECAY_CLOSED', 'closed'], ['DECAY_OPEN', 'open'], ['ATTACK', 'attack'],
  ['PITCH_DECAY', 'pitch dec'], ['MOD_AMOUNT', 'pitch amt'], ['NOISE', 'noise'], ['MIX', 'noise mix'], ['REPEAT', 'repeat'],
  ['FM_AMOUNT', 'fm amt'], ['MOD_OSC1_FREQ', 'metal'], ['TRANSIENT_VOLUME', 'click'], ['FILTER_F', 'cutoff'], ['FILTER_RESO', 'reso'],
  ['DRIVE', 'drive'], ['VOLUME', 'volume'], ['PAN', 'pan']];
let bVSec = 0;
const bVBoxes = B_VOICES.map(([name, v], k) => {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'm-btn'; b.setAttribute('role', 'tab'); b.textContent = name;
  b.addEventListener('click', () => { bVSec = k; bVoiceShow(); }); $('m-bvsec').append(b);
  const box = document.createElement('div'); box.className = 'm-faders m-vset'; box.id = `m-bvoice-${name}`; $('m-bvsets').append(box);
  const ps = VOICE_PAGES[v].groups.flatMap((g) => g.params);
  const picked = B_PICK.map(([lab, short]) => [ps.find(([l]) => l === lab), short]).filter(([p]) => p).slice(0, 12);
  for (const [[, pn], short] of picked) {
    const par = PAR[pn], sp = spec(par);
    mFader(box, short, { min: 0, max: sp.max, get: () => values[par], set: (x) => bSetPar(par, x), show: (x) => sp.show(x),
      dflt: () => bKitBytes(BEAT_KITS[bs.kit])[v === 1 ? PAR[B_VNAMES[0][B_VNAMES[1].indexOf(pn)]] : par] });
  }
  return box;
});
function bVoiceShow() {
  [...$('m-bvsec').children].forEach((b, k) => b.setAttribute('aria-selected', k === bVSec));
  bVBoxes.forEach((box, k) => { box.hidden = k !== bVSec; });
}
bVoiceShow();
const bKitStep = (d) => { startAudio(); const was = snapshot(); useKit(bs.kit + d); mUndoSnap = was; mUndoDraw(); drawAll(); };
$('m-kprev').addEventListener('click', () => bKitStep(-1));
$('m-knext').addEventListener('click', () => bKitStep(1));
drawHooks.push(() => { $('m-kitname').textContent = BEAT_KITS.length ? `${bs.kit + 1} ${BEAT_KITS[bs.kit].name}` : 'no kits'; });

// ---- presets keep the beat: the generator's settings, the groove and the pattern (the kit's sound is in the preset's
// kit with the synth's) ----
snapParts.push({ key: 'beat', get: () => ({ ...bs, groove: { ...groove }, pattern: structuredClone(bPat) }),
  put: (b) => {
    Object.assign(bs, BEAT0, b);
    bs.style = Math.max(0, Math.min(STYLES.length - 1, bs.style | 0));
    Object.assign(groove, GROOVE0, b.groove || {});
    if (b.pattern && b.pattern.on) bPat = b.pattern; else bGenerate();
  } });
// the start: the first kit and its pattern
{
  const k = BEAT_KITS[0];
  useKit(0);
  if (k) { bs.style = Math.max(0, STYLES.findIndex((s) => s.name === k.style)); bs.beat = k.beat || 0; bs.energy = k.energy ?? 60; bs.fills = k.fills ?? 40; if (k.groove) Object.assign(groove, k.groove); }
  bGenerate();
}
