// ---- the seq page: the note sequencer. Sixteen steps in two rows of eight; the strip over them picks what a touch
// sets: note (the step's height is its note in the scale; a resting step comes on), gate (bottom rests, top rings),
// accent or slide (tap, or drag across, to switch). Under them: root, scale, accent and glide, and random, alter, undo ----
let nsMode = 'note';
const nsCells = Array.from({ length: 16 }, (_, i) => {
  const c = document.createElement('div'); c.className = 'm-step'; c.dataset.i = i; c.setAttribute('role', 'gridcell');
  c.innerHTML = '<span class="m-sn"></span><i class="m-sbar"></i><span class="m-sm"><b class="a">A</b><b class="s">S</b></span>';
  $('m-steps').append(c); return c;
});
function nsDraw() {
  nsCells.forEach((c, i) => {
    const st = seq.steps[i];
    c.querySelector('.m-sn').textContent = st.gate ? noteName(stepNote(st)) : '—';
    const f = nsMode === 'gate' ? st.gate / 5 : nsMode === 'note' ? (st.d + 1) / (DEG_MAX + 1) : 0;
    c.style.setProperty('--f', f);
    c.classList.toggle('rest', !st.gate); c.classList.toggle('acc', st.acc); c.classList.toggle('slide', st.slide);
    c.setAttribute('aria-label', `step ${i + 1}: ${st.gate ? noteName(stepNote(st)) : 'rest'}${st.acc ? ', accent' : ''}${st.slide ? ', slide' : ''}`);
  });
  $('m-steps').dataset.mode = nsMode;
  [...$('m-modes').children].forEach((b) => b.setAttribute('aria-selected', b.dataset.mode === nsMode));
}
drawHooks.push(nsDraw);
$('m-modes').addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (b) { nsMode = b.dataset.mode; nsDraw(); } });
// hear a note as it's set, while stopped
function nsHear(st) { if (!playing && st.gate) { startAudio(); send({ type: 'note', n: degSemis(st.d), acc: st.acc, gate: st.gate }); } }
{
  const box = $('m-steps');
  let paint = null;
  const cellAt = (e) => {
    const r = box.getBoundingClientRect();
    const col = Math.max(0, Math.min(7, Math.floor((e.clientX - r.left) / r.width * 8)));
    const row = Math.max(0, Math.min(1, Math.floor((e.clientY - r.top) / r.height * 2)));
    return row * 8 + col;
  };
  const at = (e, first) => {
    const i = cellAt(e), st = seq.steps[i], c = nsCells[i], cr = c.getBoundingClientRect();
    const y = Math.max(0, Math.min(1, (cr.bottom - e.clientY) / cr.height));
    let hear = false;
    if (nsMode === 'note') {
      const d = Math.min(DEG_MAX, Math.floor(y * (DEG_MAX + 1)));
      if (d !== st.d || !st.gate) { st.d = d; if (!st.gate) st.gate = 4; hear = true; }
    } else if (nsMode === 'gate') {
      const g = Math.min(5, Math.floor(y * 6));
      if (g !== st.gate) { st.gate = g; hear = true; }
    } else {
      const k = nsMode === 'acc' ? 'acc' : 'slide';
      if (first) paint.to = !st[k];
      if (paint.seen.has(i)) return;
      st[k] = paint.to;
    }
    paint.seen.add(i);
    if (hear || first) nsHear(st);
    sendSeq(); nsDraw();
  };
  box.addEventListener('pointerdown', (e) => { box.setPointerCapture(e.pointerId); paint = { seen: new Set(), to: true }; at(e, true); });
  box.addEventListener('pointermove', (e) => { if (paint) at(e, false); });
  const stop = () => { paint = null; };
  box.addEventListener('pointerup', stop); box.addEventListener('pointercancel', stop);
}
// the step playing, marked as it's heard
eventHandlers.push((ev) => {
  if (ev.type !== 'step') return;
  setTimeout(() => { if (playing) nsCells.forEach((c, i) => c.classList.toggle('now', i === ev.step)); }, ctx && ctx.outputLatency ? ctx.outputLatency * 1000 : 0);
});
stopHooks.push(() => nsCells.forEach((c) => c.classList.remove('now')));

const ROOTS = NOTE_NAMES;
mFader($('m-seqf'), 'root', { min: 0, max: 11, get: () => seq.root, set: (v) => { seq.root = v; sendSeq(); nsDraw(); }, show: (v) => ROOTS[v], dflt: 0 });
mFader($('m-seqf'), 'scale', { min: 0, max: SCALES.length - 1, get: () => seq.scale, set: (v) => { seq.scale = v; sendSeq(); nsDraw(); }, show: (v) => SCALES[v][0], dflt: SEQ0.scale });
mFader($('m-seqf'), 'accent', { min: 0, max: 12, get: () => seq.accent, set: (v) => { seq.accent = v; sendSeq(); }, show: (v) => `+${v}dB`, dflt: SEQ0.accent });
mFader($('m-seqf'), 'glide', { min: 0, max: 100, step: 5, get: () => seq.glide, set: (v) => { seq.glide = v; sendSeq(); }, show: (v) => v + '%', dflt: SEQ0.glide });

// random: a new line in the key: mostly the root and the notes near it, now and then an octave up; about one step in
// five rests, one in five accented and one in six sliding. The first step always plays
function randomNotes() {
  const n = SCALES[seq.scale][1].length;
  const near = [0, 0, 0, 1, 2, 2, 3, 4, 4, n - 1, n - 2].map((d) => (d + n) % n);
  seq.steps = seq.steps.map((_, i) => {
    let d = pick(near);
    if (chance(0.18)) d += n;
    if (chance(0.06)) d += n;
    return { d: Math.min(DEG_MAX, d), gate: i && chance(0.22) ? 0 : pick([2, 3, 4, 4, 5]), acc: chance(0.2), slide: chance(0.17) };
  });
  sendSeq();
}
// alter: two to four steps changed a little: a note a step or two up or down the scale, a rest played or a note rested,
// an accent or a slide switched
function alterNotes() {
  const k = rIn(2, 4);
  for (let j = 0; j < k; j++) {
    const st = seq.steps[rIn(0, 15)], what = rIn(0, 3);
    if (what === 0 || (what === 1 && !st.gate)) { st.d = Math.max(0, Math.min(DEG_MAX, st.d + pick([-2, -1, 1, 2]))); if (!st.gate) st.gate = 4; }
    else if (what === 1) st.gate = chance(0.4) ? 0 : rIn(1, 5);
    else if (what === 2) st.acc = !st.acc;
    else st.slide = !st.slide;
  }
  sendSeq();
}
$('m-nrand').addEventListener('click', (e) => mRandomise(e.currentTarget, randomNotes));
$('m-nalter').addEventListener('click', (e) => mRandomise(e.currentTarget, alterNotes));
