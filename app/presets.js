// ---- presets: everything (the sound, perf macros, notes, tempo, effects, master and the fader sequencers) under a
// two-word name, kept in this browser under elixir-synth's own key. Save new, save over the loaded one, load, delete,
// import and export. While playing, a preset waits for the next bar: until it's heard, the one playing stays marked
// and the new one's row flashes ----
const SAVE_KEY = 'elixir-synth-presets', BPM_KEY = 'elixir-synth-presetbpm';
const fromData = (p, extra) => ({ ...structuredClone(p), ...extra });
const presetList = [{ name: 'Init', ...snapshot(), builtin: true },
  ...BUILTIN_PRESETS.filter((p) => p && p.v === PRESET_V && p.kit).map((p) => fromData(p, { builtin: true }))];
const presetData = (k) => { const { builtin, saved, ...p } = k; return structuredClone(p); };
try { for (const p of JSON.parse(localStorage.getItem(SAVE_KEY)) || []) if (p && p.v === PRESET_V && p.kit) presetList.push(fromData(p, { saved: true })); } catch (e) {}
function storePresets() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(presetList.filter((k) => k.saved).map(presetData))); } catch (e) {} }
let pCur = presetList[0], pPending = null, pShown = null;
try { $('m-pbpm').checked = localStorage.getItem(BPM_KEY) !== '0'; } catch (e) {}
$('m-pbpm').addEventListener('change', () => { try { localStorage.setItem(BPM_KEY, $('m-pbpm').checked ? '1' : '0'); } catch (e) {} });
// a new name: two made-up words
const SYL = ['ka', 'zu', 'mo', 'ree', 'vax', 'lo', 'quin', 'tor', 'ba', 'shi', 'nek', 'ul', 'dra', 'po', 'ix', 'fen', 'yo', 'gar', 'mi', 'sol'];
const word = () => { const w = Array.from({ length: rIn(2, 3) }, () => pick(SYL)).join(''); return w[0].toUpperCase() + w.slice(1); };
function newName() { let n; do n = `${word()} ${word()}`; while (presetList.some((k) => k.name === n)); return n; }
function pLoad(k) {
  startAudio();
  const shown = pPending ? pShown : pCur;
  if (playing) barSync = true;
  try { useSnapshot(k, !$('m-pbpm').checked); } finally { barSync = false; }
  pShown = shown; pCur = k; pPending = playing ? k : null;
  mUndoSnap = null; mUndoDraw();
  pDraw();
}
eventHandlers.push((ev) => {
  if (ev.type !== 'step' || ev.step !== 0 || !pPending) return;
  const p = pPending; setTimeout(() => { if (pPending === p) { pPending = null; pDraw(); } }, ctx && ctx.outputLatency ? ctx.outputLatency * 1000 : 0);
});
stopHooks.push(() => { if (pPending) { pPending = null; pDraw(); } });
let pDraw = function () {
  const over = !pPending && pCur.saved ? pCur : null;
  $('m-pover').disabled = !over; $('m-pover').textContent = over ? `save over ${over.name}` : 'save over';
  const list = $('m-plist'), cur = pPending ? pShown : pCur;
  list.innerHTML = '';
  const group = (t) => { const li = document.createElement('li'); li.className = 'm-pgroup'; li.textContent = t; list.append(li); };
  const row = (k) => {
    const li = document.createElement('li'); li.classList.toggle('cur', k === cur); li.classList.toggle('pending', k === pPending);
    li.innerHTML = '<button class="m-pload" type="button"><b></b><small></small></button>';
    li.querySelector('b').textContent = k.name; li.querySelector('small').textContent = `${k.tempo} bpm`;
    li.querySelector('.m-pload').addEventListener('click', () => pLoad(k));
    if (k.saved) {
      const d = document.createElement('button'); d.className = 'm-pdel'; d.type = 'button'; d.textContent = '✕';
      d.setAttribute('aria-label', `Delete ${k.name}`);
      d.addEventListener('click', () => {
        if (!confirm(`Delete ${k.name}?`)) return;
        presetList.splice(presetList.indexOf(k), 1); storePresets();
        if (pCur === k) pCur = presetList[0];
        pDraw();
      });
      li.append(d);
    } else { const gap = document.createElement('span'); gap.className = 'm-pdel'; li.append(gap); }
    list.append(li);
  };
  const mine = presetList.filter((k) => k.saved);
  if (mine.length) { group('mine'); mine.slice().reverse().forEach(row); } else group('mine: none yet, save makes one');
  group('built in');
  presetList.filter((k) => k.builtin).forEach(row);
};
pageHooks.push((t) => { if (t === 'presets') pDraw(); });
// mix's patterns page: eight pads, each loading a preset (at the next bar while playing): the one playing is lit, the
// one waiting flashes. They start as the first eight built-in presets; a long press on a pad opens a list of every
// preset (mine and built in) to pick the one it loads, with save preset and save over. The picks are kept in this
// browser, by name
const PATS_KEY = 'elixir-synth-pats';
const PAT0 = presetList.filter((k) => k.builtin && k.name !== 'Init').slice(0, 8).map((k) => k.name);
let patNames = PAT0.slice();
try { const n = JSON.parse(localStorage.getItem(PATS_KEY)); if (Array.isArray(n)) n.slice(0, 8).forEach((x, i) => { if (typeof x === 'string') patNames[i] = x; }); } catch (e) {}
// a pad whose preset has gone (deleted) falls back to its built-in one
const patPreset = (i) => presetList.find((k) => k.name === patNames[i]) || presetList.find((k) => k.name === PAT0[i]) || presetList[0];
let patPicking = -1;
const patBtns = PAT0.map((_, i) => {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'm-btn m-pat';
  b.innerHTML = `<b>${i + 1}</b><small></small>`;
  let hold = null, held = false;
  const cancel = () => { clearTimeout(hold); hold = null; };
  b.addEventListener('pointerdown', (e) => {
    held = false; const x = e.clientX, y = e.clientY;
    hold = setTimeout(() => { hold = null; held = true; patPick(i); }, 550);
    const move = (m) => { if (Math.hypot(m.clientX - x, m.clientY - y) > 12) cancel(); };
    b.addEventListener('pointermove', move);
    const up = () => { cancel(); b.removeEventListener('pointermove', move); };
    b.addEventListener('pointerup', up, { once: true }); b.addEventListener('pointercancel', up, { once: true });
  });
  b.addEventListener('contextmenu', (e) => e.preventDefault());
  b.addEventListener('click', () => { if (held) { held = false; return; } pLoad(patPreset(i)); });
  // copy: a small button along the pad's top. Pressed, it flashes and reads cancel, and every other pad's reads paste;
  // paste puts the copied pad's preset on that pad (the same preset, as picking it would), cancel or a paste ends it
  const c = document.createElement('button'); c.type = 'button'; c.className = 'm-btn m-patc';
  c.addEventListener('click', () => {
    if (patCopy === null) patCopy = i;
    else if (patCopy !== i) { patSet(i, patPreset(patCopy)); patCopy = null; b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 400); }
    else patCopy = null;
    patDraw();
  });
  const w = document.createElement('div'); w.className = 'm-patw'; w.append(b, c);
  $('m-pats').append(w); b.copyBtn = c; return b;
});
let patCopy = null;
function patDraw() {
  const cur = pPending ? pShown : pCur;
  patBtns.forEach((b, i) => {
    const k = patPreset(i);
    b.querySelector('small').textContent = k.name;
    b.setAttribute('aria-label', `pattern ${i + 1}: ${k.name} (hold to change)`);
    b.setAttribute('aria-pressed', k === cur); b.classList.toggle('pending', k === pPending);
    const c = b.copyBtn, m = patCopy === null ? 'copy' : patCopy === i ? 'cancel' : 'paste';
    c.textContent = m; c.classList.toggle('on', patCopy === i); c.classList.toggle('paste', m === 'paste');
    c.setAttribute('aria-label', m === 'copy' ? `copy pad ${i + 1}` : m === 'cancel' ? 'cancel the copy' : `paste pad ${patCopy + 1} onto pad ${i + 1}`);
  });
}
// the picker: over the pads, a list of every preset; a tap puts it on the pad (without loading it)
function patPick(i) {
  patPicking = i;
  $('m-pickt').textContent = `pad ${i + 1} plays`;
  const list = $('m-picklist'); list.innerHTML = '';
  const group = (t) => { const li = document.createElement('li'); li.className = 'm-pgroup'; li.textContent = t; list.append(li); };
  const row = (k) => {
    const li = document.createElement('li'); li.classList.toggle('cur', k === patPreset(i));
    li.innerHTML = '<button class="m-pload" type="button"><b></b><small></small></button>';
    li.querySelector('b').textContent = k.name; li.querySelector('small').textContent = `${k.tempo} bpm`;
    li.querySelector('button').addEventListener('click', () => {
      patSet(patPicking, k); patClose(); patDraw();
    });
    list.append(li);
  };
  const mine = presetList.filter((k) => k.saved);
  if (mine.length) { group('mine'); mine.slice().reverse().forEach(row); }
  group('built in'); presetList.filter((k) => k.builtin).forEach(row);
  const k = patPreset(i);
  $('m-picksover').disabled = !k.saved; $('m-picksover').textContent = k.saved ? `save over ${k.name}` : 'save over';
  $('m-pick').hidden = false;
  const c = list.querySelector('.cur'); if (c) c.scrollIntoView({ block: 'center' });
}
function patClose() { patPicking = -1; $('m-pick').hidden = true; }
$('m-pickx').addEventListener('click', patClose);
// save preset: what's playing now as a new preset (two made-up words), on this pad; save over: what's playing now into
// the pad's own preset (only one of mine; a built-in one can't be written over)
const patSet = (i, k) => { patNames[i] = k.name; try { localStorage.setItem(PATS_KEY, JSON.stringify(patNames)); } catch (e) {} };
$('m-picksave').addEventListener('click', () => {
  const k = { name: newName(), ...snapshot(), saved: true };
  presetList.push(k); storePresets(); pCur = k; pPending = null;
  patSet(patPicking, k); patClose(); pDraw();
});
$('m-picksover').addEventListener('click', () => {
  const k = patPreset(patPicking);
  if (!k.saved || !confirm(`Save what's playing over ${k.name}?`)) return;
  Object.assign(k, snapshot()); storePresets(); pCur = k; pPending = null;
  patClose(); pDraw();
});
modeHooks.push(patClose);
{ const d = pDraw; pDraw = function () { d(); patDraw(); }; }
patDraw();
$('m-psave').addEventListener('click', () => {
  const k = { name: newName(), ...snapshot(), saved: true };
  presetList.push(k); storePresets(); pCur = k; pPending = null;
  $('m-pnote').textContent = `Saved as ${k.name}.`;
  pDraw();
});
$('m-pover').addEventListener('click', () => {
  const k = pCur;
  if (!k.saved || !confirm(`Save the current sound over ${k.name}?`)) return;
  Object.assign(k, snapshot()); storePresets();
  $('m-pnote').textContent = `Saved over ${k.name}.`;
  pDraw();
});
// files: { elixirSynth: 1, presets: [...] }; a name already saved here is skipped
$('m-pimport').addEventListener('change', async (e) => {
  let n = 0, bad = 0;
  for (const f of e.target.files) {
    try {
      for (const p of JSON.parse(await f.text()).presets || []) {
        if (!p || p.v !== PRESET_V || !p.kit || !p.name) { bad++; continue; }
        if (presetList.some((k) => k.saved && k.name === p.name)) continue;
        presetList.push(fromData(p, { saved: true })); n++;
      }
    } catch (err) { bad++; }
  }
  e.target.value = '';
  if (n) storePresets();
  $('m-pnote').textContent = (n ? `Imported ${n}.` : 'Nothing new to import.') + (bad ? ` ${bad} skipped: not elixir-synth presets.` : '');
  pDraw();
});
$('m-pexport').addEventListener('click', async () => {
  const list = presetList.filter((k) => k.saved).map(presetData);
  if (!list.length) { $('m-pnote').textContent = 'No presets of yours to export yet.'; return; }
  const blob = new Blob([JSON.stringify({ elixirSynth: 1, presets: list }, null, 1)], { type: 'application/json' });
  if (await mOffer({ blob, name: 'elixir-synth-presets.json' }, 'application/json')) $('m-pnote').textContent = `Exported ${list.length} preset${list.length > 1 ? 's' : ''}.`;
});
pDraw();
// ---- mix's patterns page, under the pads: seven dials, the synth's groove switch and six randomisers. The crossfader (beat to synth, both in the
// middle), the beat's energy and the synth's density (the same settings as their own pages' dials), rotate (the note
// sequence played 0 to 15 steps on against the beat, live) tempo, and the beat's groove and its depth (the beat page's groove and swing
// dials). rnd drm randomises the whole beat (a kit and a
// pattern), alt drm only the pattern on the same kit, rnd syn the whole synth (sound and notes), alt syn only
// its notes, rnd fx all the effects and alt fx a nudge to them, as their own pages' buttons. Each can be undone, as on their own pages ----
{
  const pDial = (label, o) => mFader($('m-patsf'), label, { dial: true, ...o });
  pDial('x-fade', { min: -100, max: 100, get: () => xf, set: (v) => { xf = Math.abs(v) < 4 ? 0 : v; sendChans(); },
    show: (v) => (v === 0 ? 'both' : v <= -100 ? 'beat' : v >= 100 ? 'synth' : `${v < 0 ? 'beat' : 'synth'} ${Math.abs(v)}`), dflt: 0 });
  pDial('energy', { min: 0, max: 100, get: () => bs.energy, set: (v) => { bs.energy = v; bGenerate(); drawAll(); }, show: (v) => `${B_ENERGY.find(([x]) => v < x)[1]} ${v}`, dflt: BEAT0.energy });
  pDial('density', { min: 0, max: 100, get: () => seq.dens, set: (v) => { seq.dens = v; sendSeq(); drawAll(); }, show: densName, dflt: 50 });
  pDial('rotate', { min: 0, max: 15, get: () => seqRot, set: (v) => { seqRot = v; sendSeq(); drawAll(); }, show: (v) => (v ? `+${v}` : '0'), dflt: 0 });
  pDial('groove', { min: 0, max: GROOVE_TYPES.length - 1, get: grooveIdx, set: (v) => { groove.type = GROOVE_TYPES[v].name; bSend(); drawAll(); }, show: (v) => GROOVE_TYPES[v].name, dflt: 0 });
  pDial('depth', { min: 0, max: 100, get: () => groove.depth, set: (v) => { groove.depth = v; bSend(); drawAll(); }, show: (v) => `${v}%`, dflt: 100 });
  pDial('tempo', { min: 40, max: 240, travel: 2, get: () => tempo, set: (v) => { tempo = v; sendSeq(); drawAll(); }, show: (v) => `${v} bpm`, dflt: 120 });
  $('m-pfollow').addEventListener('click', () => followSet(seq.follow === false));
  drawHooks.push(() => { const b = $('m-pfollow'); b.setAttribute('aria-pressed', seq.follow !== false); b.textContent = `syn groove ${seq.follow !== false ? 'on' : 'off'}`; });
  $('m-prdrum').addEventListener('click', (e) => mRandomise(e.currentTarget, () => { useKit(rIn(0, BEAT_KITS.length - 1)); bRandomPattern(); }));
  $('m-pralt').addEventListener('click', (e) => mRandomise(e.currentTarget, bRandomPattern));
  $('m-prsynth').addEventListener('click', (e) => mRandomise(e.currentTarget, () => { randomSound(); randomNotes(); }));
  $('m-pralts').addEventListener('click', (e) => mRandomise(e.currentTarget, randomNotes));
  $('m-prfx').addEventListener('click', (e) => mRandomise(e.currentTarget, randomFx));
  $('m-praltfx').addEventListener('click', (e) => mRandomise(e.currentTarget, () => alterFx()));
}
