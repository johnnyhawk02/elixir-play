// ---- presets: everything (the sound, perf macros, notes, tempo, effects, master and the fader sequencers) under a
// two-word name, kept in this browser under elixir-synth's own key. Save new, save over the loaded one, load, delete,
// import and export. While playing, a preset waits for the next bar: until it's heard, the one playing stays marked
// and the new one's row flashes ----
const SAVE_KEY = 'elixir-synth-presets', BPM_KEY = 'elixir-synth-presetbpm';
const fromData = (p, extra) => ({ ...structuredClone(p), ...extra });
const presetList = [{ name: 'Init', ...snapshot(), builtin: true },
  ...BUILTIN_PRESETS.filter((p) => p && p.v === PRESET_V && p.kit).map((p) => fromData(p, { builtin: true }))];
const presetData = (k) => { const { builtin, saved, ...p } = k; return structuredClone(p); };
// one of mine that is now a built-in one, the same in every way, is left out (the built-in one stands for it)
const sameBuiltin = (p) => presetList.some((k) => k.builtin && k.name === p.name && JSON.stringify(presetData(k)) === JSON.stringify(p));
try { for (const p of JSON.parse(localStorage.getItem(SAVE_KEY)) || []) if (p && p.v === PRESET_V && p.kit && !sameBuiltin(p)) presetList.push(fromData(p, { saved: true })); } catch (e) {}
function storePresets() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(presetList.filter((k) => k.saved).map(presetData))); } catch (e) {} }
let pCur = presetList[0], pPending = null, pShown = null;
try { $('m-pbpm').checked = localStorage.getItem(BPM_KEY) !== '0'; } catch (e) {}
$('m-pbpm').addEventListener('change', () => { try { localStorage.setItem(BPM_KEY, $('m-pbpm').checked ? '1' : '0'); } catch (e) {} });
// a new name: two made-up words
const SYL = ['ka', 'zu', 'mo', 'ree', 'vax', 'lo', 'quin', 'tor', 'ba', 'shi', 'nek', 'ul', 'dra', 'po', 'ix', 'fen', 'yo', 'gar', 'mi', 'sol'];
const word = () => { const w = Array.from({ length: rIn(2, 3) }, () => pick(SYL)).join(''); return w[0].toUpperCase() + w.slice(1); };
function newName() { let n; do n = `${word()} ${word()}`; while (presetList.some((k) => k.name === n)); return n; }
// keepTempo: the pads change the synth and drums but leave the tempo where it is
function pLoad(k, keepTempo) {
  startAudio();
  const shown = pPending ? pShown : pCur;
  if (playing) barSync = true;
  try { useSnapshot(k, keepTempo || !$('m-pbpm').checked); } finally { barSync = false; }
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
  b.addEventListener('click', () => { if (held) { held = false; return; } patOn = i; pLoad(patPreset(i), true); });
  // copy: a small button along the pad's top. Pressed, it flashes and reads cancel, and every other pad's reads paste;
  // paste makes a real copy of the copied pad's preset (a new one of mine, "Fenka Shizu 2"), so an edit saved over one
  // pad leaves the other alone, puts it on that pad and plays it, as a tap on the pad would (at the next bar while
  // playing); cancel or a paste ends it
  const c = document.createElement('button'); c.type = 'button'; c.className = 'm-btn m-patc';
  c.addEventListener('click', () => {
    if (patCopy === null) patCopy = i;
    else if (patCopy !== i) { patSet(i, patDup(patPreset(patCopy))); patCopy = null; b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 400); patOn = i; pLoad(patPreset(i), true); }
    else patCopy = null;
    patDraw();
  });
  const w = document.createElement('div'); w.className = 'm-patw'; w.append(b, c);
  $('m-pats').append(w); b.copyBtn = c; return b;
});
let patCopy = null;
// the pad last pressed: the one lit while its preset plays, so two pads on the same preset don't both light
let patOn = null;
function patDraw() {
  const cur = pPending ? pShown : pCur;
  // the pad to light for a preset: the one pressed if it plays that preset, else the first that does
  const padOf = (k) => (k && patOn !== null && patPreset(patOn) === k ? patOn : patBtns.findIndex((_, j) => patPreset(j) === k));
  const on = padOf(cur), wait = pPending ? padOf(pPending) : -1;
  patBtns.forEach((b, i) => {
    const k = patPreset(i);
    b.querySelector('small').textContent = k.name;
    b.setAttribute('aria-label', `pattern ${i + 1}: ${k.name} (hold to change)`);
    b.setAttribute('aria-pressed', i === on); b.classList.toggle('pending', i === wait);
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
// a copy of a preset as a new one of mine, named after it with the next free number
function patDup(src) {
  const base = src.name.replace(/ \d+$/, '');
  let n = 2; while (presetList.some((k) => k.name === `${base} ${n}`)) n++;
  const k = { ...presetData(src), name: `${base} ${n}`, saved: true };
  presetList.push(k); storePresets(); return k;
}
// pad sets: the eight pads' layout saved under a name, in this browser and in the exported file. Pick one in the list
// to put all eight on the pads; save set keeps the pads as a new set, over writes them into the set picked, ✕ deletes it.
// A set holds the presets' names, as the pads do: paste makes real copies, so the pads in a set are sounds of their own
const SETS_KEY = 'elixir-synth-padsets', SETCUR_KEY = 'elixir-synth-padset';
let padSets = [], padSetCur = '';
try { const a = JSON.parse(localStorage.getItem(SETS_KEY)); if (Array.isArray(a)) padSets = a.filter((t) => t && typeof t.name === 'string' && Array.isArray(t.pads)); } catch (e) {}
try { padSetCur = localStorage.getItem(SETCUR_KEY) || ''; } catch (e) {}
function storeSets() { try { localStorage.setItem(SETS_KEY, JSON.stringify(padSets)); localStorage.setItem(SETCUR_KEY, padSetCur); } catch (e) {} }
const setOf = () => padSets.find((t) => t.name === padSetCur);
function setDraw() {
  const sel = $('m-psets'), t = setOf();
  sel.innerHTML = '';
  const o = (v, txt) => { const e = document.createElement('option'); e.value = v; e.textContent = txt; sel.append(e); };
  if (!t) o('', padSets.length ? 'pad sets' : 'pad sets: none yet');
  padSets.forEach((x) => o(x.name, x.name));
  sel.value = t ? t.name : '';
  $('m-psetover').disabled = !t; $('m-psetdel').disabled = !t;
}
$('m-psets').addEventListener('change', (e) => {
  const t = padSets.find((x) => x.name === e.target.value); if (!t) return;
  padSetCur = t.name; patNames = PAT0.map((n, i) => (typeof t.pads[i] === 'string' ? t.pads[i] : n));
  try { localStorage.setItem(PATS_KEY, JSON.stringify(patNames)); } catch (err) {}
  patCopy = null; patOn = null; storeSets(); setDraw(); patDraw();
});
$('m-psetsave').addEventListener('click', () => {
  let n = 1; while (padSets.some((t) => t.name === `set ${n}`)) n++;
  const name = (prompt('Name the pad set', `set ${n}`) || '').trim(); if (!name) return;
  const old = padSets.find((t) => t.name === name);
  if (old && !confirm(`Save the pads over ${name}?`)) return;
  if (old) old.pads = patNames.slice(); else padSets.push({ name, pads: patNames.slice() });
  padSetCur = name; storeSets(); setDraw();
});
$('m-psetover').addEventListener('click', () => {
  const t = setOf(); if (!t || !confirm(`Save the pads over ${t.name}?`)) return;
  t.pads = patNames.slice(); storeSets(); setDraw();
});
$('m-psetdel').addEventListener('click', () => {
  const t = setOf(); if (!t || !confirm(`Delete the pad set ${t.name}?`)) return;
  padSets.splice(padSets.indexOf(t), 1); padSetCur = ''; storeSets(); setDraw();
});
setDraw();
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
  let n = 0, ns = 0, bad = 0;
  for (const f of e.target.files) {
    try {
      const file = JSON.parse(await f.text());
      for (const p of file.presets || []) {
        if (!p || p.v !== PRESET_V || !p.kit || !p.name) { bad++; continue; }
        if (presetList.some((k) => k.saved && k.name === p.name)) continue;
        presetList.push(fromData(p, { saved: true })); n++;
      }
      for (const t of file.padSets || []) {
        if (!t || typeof t.name !== 'string' || !Array.isArray(t.pads) || padSets.some((x) => x.name === t.name)) continue;
        padSets.push({ name: t.name, pads: t.pads.slice(0, 8).map((x) => (typeof x === 'string' ? x : '')) }); ns++;
      }
    } catch (err) { bad++; }
  }
  e.target.value = '';
  if (n) storePresets();
  if (ns) { storeSets(); setDraw(); }
  $('m-pnote').textContent = (n || ns ? `Imported ${n ? `${n} preset${n > 1 ? 's' : ''}` : ''}${n && ns ? ' and ' : ''}${ns ? `${ns} pad set${ns > 1 ? 's' : ''}` : ''}.` : 'Nothing new to import.') + (bad ? ` ${bad} skipped: not elixir-synth presets.` : '');
  pDraw();
});
// the file of mine: my presets and pad sets (null when there are none), and what it holds, in words
function presetsFile() {
  const list = presetList.filter((k) => k.saved).map(presetData);
  if (!list.length && !padSets.length) return null;
  const blob = new Blob([JSON.stringify({ elixirSynth: 1, presets: list, padSets }, null, 1)], { type: 'application/json' });
  return { blob, name: 'elixir-synth-presets.json', what: `${list.length} preset${list.length !== 1 ? 's' : ''}${padSets.length ? ` and ${padSets.length} pad set${padSets.length > 1 ? 's' : ''}` : ''}` };
}
$('m-pexport').addEventListener('click', async () => {
  const f = presetsFile();
  if (!f) { $('m-pnote').textContent = 'No presets or pad sets of yours to export yet.'; return; }
  if (await mOffer(f, 'application/json')) $('m-pnote').textContent = `Exported ${f.what}.`;
});
// preferences: hold the cauldron (a tap still turns the mode). Download my presets saves the file straight to the
// phone's downloads, as export's file
let prefsHold = null, prefsHeld = false;
$('m-mode').addEventListener('pointerdown', () => {
  prefsHeld = false; clearTimeout(prefsHold);
  prefsHold = setTimeout(() => { prefsHeld = true; prefsOpen(); }, 600);
});
for (const t of ['pointerup', 'pointercancel', 'pointerleave']) $('m-mode').addEventListener(t, () => clearTimeout(prefsHold));
$('m-mode').addEventListener('click', (e) => { if (prefsHeld) { prefsHeld = false; e.stopImmediatePropagation(); } }, true);
function prefsOpen() {
  $('m-prefsnote').textContent = 'Your presets and pad sets, in one file. Import it on the presets page.';
  $('m-prefs').hidden = false;
}
// new pads from factory: clears the eight pads and fills them with eight factory presets picked at random (a new
// pick each time); my presets and pad sets stay
$('m-prefspads').addEventListener('click', () => {
  if (!confirm('Clear all eight pads and fill them with new factory presets?')) return;
  const pool = presetList.filter((k) => k.builtin && k.name !== 'Init').map((k) => k.name);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  patNames = PAT0.map((n, i) => pool[i] || n);
  try { localStorage.setItem(PATS_KEY, JSON.stringify(patNames)); } catch (e) {}
  patCopy = null; patOn = null; padSetCur = ''; storeSets(); setDraw(); patDraw();
  $('m-prefsnote').textContent = 'The pads have eight new factory presets.';
});
$('m-prefsx').addEventListener('click', () => { $('m-prefs').hidden = true; });
$('m-prefsdl').addEventListener('click', () => {
  const f = presetsFile();
  if (!f) { $('m-prefsnote').textContent = 'No presets or pad sets of yours to download yet.'; return; }
  mDownload(f); $('m-prefsnote').textContent = `Downloaded ${f.what}.`;
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
