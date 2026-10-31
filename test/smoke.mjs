// Drives the built page in Chromium's phone emulation (Pixel 9a's 412 x 915 and a small 360 x 640): no errors, no page
// scrolls but the presets list, swipes and page buttons turn the page, fader and pad drags don't, holding a fader opens
// its sequencer, MIDI CC 1-12 turn the perf dials, the note grid edits steps on four pages and copies
// page 1 to the others, space plays and stops, play runs the steps, presets save and load, the title steps through the
// synth, beat and mix modes (the beat's dials, grid and kits, the mixer's meters and mutes), and record downloads a WAV.
//   node test/smoke.mjs [index.html]   (needs Playwright)
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const url = pathToFileURL(process.argv[2] || new URL('../index.html', import.meta.url).pathname).href;
let fails = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails++; };
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
for (const [w, h] of [[412, 915], [360, 640]]) {
  console.log(`-- ${w} x ${h}`);
  const c = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true, acceptDownloads: true });
  // a stand-in MIDI controller: one input, its handler kept where the test can call it
  await c.addInitScript(() => {
    const input = { onmidimessage: null };
    window.__midiIn = input;
    navigator.requestMIDIAccess = () => Promise.resolve({ inputs: new Map([['x', input]]), onstatechange: null });
  });
  const pg = await c.newPage(), errs = [];
  pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(url); await pg.waitForTimeout(300);
  const page = () => pg.evaluate(() => document.querySelector('[data-m-tab][aria-selected="true"]').dataset.mTab);
  const box = async (sel) => pg.locator(sel).first().boundingBox();
  // drag with the mouse (pointer events), from one point to another
  const drag = async (x0, y0, x1, y1, steps = 12) => { await pg.mouse.move(x0, y0); await pg.mouse.down(); await pg.mouse.move(x1, y1, { steps }); await pg.mouse.up(); await pg.waitForTimeout(450); };
  const tabs = () => pg.evaluate(() => [...document.querySelectorAll('[data-m-tab]')].filter((x) => !x.hidden).map((x) => x.dataset.mTab).join(' '));
  const fits = (t) => pg.evaluate((t) => { const p = document.querySelector(`[data-m-panel="${t}"]`); return [p.scrollHeight - p.clientHeight, document.documentElement.scrollHeight - innerHeight, document.documentElement.scrollWidth - innerWidth].every((v) => v <= 0); }, t);
  // no page scrolls; every panel fits
  for (const t of ['play', 'seq', 'voice', 'xy', 'presets']) {
    await pg.click(`[data-m-tab="${t}"]`);
    const o = await pg.evaluate((t) => { const p = document.querySelector(`[data-m-panel="${t}"]`); return [p.scrollHeight - p.clientHeight, document.documentElement.scrollHeight - innerHeight, document.documentElement.scrollWidth - innerWidth]; }, t);
    check(o.every((v) => v <= 0), `${t}: fits the screen (${o})`);
  }
  // touch targets: every button at least 36 px high
  const small = await pg.evaluate(() => [...document.querySelectorAll('.m button, .m .m-btn')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.height < 36; }).map((e) => e.textContent.trim()));
  check(!small.length, `buttons at least 36 px high ${small.length ? small.join(', ') : ''}`);
  // swipes
  await pg.click('[data-m-tab="play"]');
  let r = await box('#m-sound');
  await drag(r.x + r.width / 2, r.y + 10, r.x + r.width / 2 - w * 0.6, r.y + 14);
  check(await page() === 'seq', 'swipe left turns to seq');
  r = await box('.m-modes');
  await drag(r.x + 20, r.y + 10, r.x + 20 + w * 0.6, r.y + 10);
  check(await page() === 'play', 'swipe right turns back to perf');
  // a fader dragged sideways and up moves it, and doesn't turn the page
  r = await box('#m-perf .m-vtrack >> nth=3');
  const before = await pg.evaluate(() => macro.filter);
  await drag(r.x + r.width / 2, r.y + r.height / 2, r.x + r.width / 2 - w * 0.5, r.y + r.height / 4);
  check(await page() === 'play' && await pg.evaluate(() => macro.filter) > before, 'a fader drag moves the fader, not the page');
  // MIDI: CC 4 sends the filter dial to the top, CC 11 the lfo rate, on any channel
  await pg.evaluate(() => { window.__midiIn.onmidimessage({ data: [0xb0, 4, 127] }); window.__midiIn.onmidimessage({ data: [0xb3, 11, 127] }); });
  check(await pg.evaluate(() => macro.filter === 200 && values[PAR.FREQ_LFO1] === spec(PAR.FREQ_LFO1).max && document.querySelectorAll('#m-perf .m-dial').length === 12), 'MIDI CC 4 and 11 turn the filter and lfo rate dials');
  // seq: random makes all four pages (page 1 new, 2 to 4 its variations), and the length slider plays fewer steps
  await pg.click('[data-m-tab="seq"]');
  const p1 = await pg.evaluate(() => JSON.stringify(seq.steps.slice(16)));
  await pg.click('#m-nrand');
  check(await pg.evaluate((p1) => JSON.stringify(seq.steps.slice(16)) !== p1 && seq.steps.slice(16, 32).filter((x, i) => JSON.stringify(x) === JSON.stringify(seq.steps[i])).length >= 10, p1), 'seq random fills pages 2 to 4 with variations of page 1');
  await pg.evaluate(() => { seq.len = 12; sendSeq(); drawAll(); });
  check(await pg.evaluate(() => document.querySelectorAll('#m-steps .m-step.out').length === 4 && document.querySelectorAll('#m-npages .m-btn.out').length === 3), 'a 12-step length dims the rest');
  check(await pg.evaluate(() => [...document.querySelectorAll('#m-seqf .m-flab')].some((l) => l.textContent === 'len')), 'seq has a length slider');
  check(await fits('seq'), 'seq: still fits');
  await pg.evaluate(() => { seq.len = 64; sendSeq(); drawAll(); });
  await pg.click('[data-m-tab="play"]');
  // the synth has no effects of its own: no fx dials or randomisers on perf, and its presets leave the mix's effects alone
  check(await pg.evaluate(() => !document.getElementById('m-fxr') && !document.getElementById('m-fxa') && ![...document.querySelectorAll('#m-perf .m-dial')].some((d) => /echo|reverb|rvb|dist/.test(d.textContent))), 'perf has no fx dials or fx randomisers');
  await pg.evaluate(() => { fx.verb = 37; useSnapshot(BUILTIN_PRESETS[0]); });
  check(await pg.evaluate(() => fx.verb === 37), 'a synth preset leaves the reverb alone');
  await pg.evaluate(() => { fx.verb = 0; sendMix(); });
  // fx and master are mix pages
  await pg.click('[data-to-mode="mix"]'); await pg.click('[data-m-tab="fx"]');
  check(await fits('fx'), 'fx: fits the screen');
  await pg.click('[data-m-tab="comp"]');
  check(await fits('comp'), 'mstr: fits the screen');
  await pg.click('[data-m-tab="mix"]');
  await pg.click('[data-to-mode="synth"]'); await pg.click('[data-m-tab="play"]');
  // the x/y pad
  await pg.click('[data-m-tab="xy"]');
  r = await box('.m-xy');
  await drag(r.x + 30, r.y + r.height - 30, r.x + r.width - 16, r.y + 16);
  check(await page() === 'xy' && await pg.evaluate(() => values[PAR.FILTER_FREQ_1] > 115 && values[PAR.RESO_1] > 115), 'the x/y pad moves its two parameters, not the page');
  // holding a fader opens its step sequencer
  await pg.click('[data-m-tab="voice"]');
  r = await box('#m-voice-tone .m-vtrack');
  await pg.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await pg.mouse.down(); await pg.waitForTimeout(650); await pg.mouse.up();
  check(await pg.isVisible('#m-fs') && await pg.textContent('#m-fs-name') === 'note', 'holding a fader opens its sequencer');
  r = await box('#m-fs-rand'); await pg.click('#m-fs-rand'); await pg.click('#m-fs-close');
  check(await pg.evaluate(() => mFaders.find((f) => f.key === 'm-voice-tone:note').seq.vals.some((v) => v)), 'randomise fills its steps');
  // the note grid: in gate mode the bottom of a step rests it; in accent mode a tap switches it
  await pg.click('[data-m-tab="seq"]');
  await pg.click('[data-mode="gate"]');
  r = await box('.m-step >> nth=1');
  await pg.mouse.click(r.x + r.width / 2, r.y + r.height - 3);
  await pg.click('[data-mode="acc"]');
  r = await box('.m-step >> nth=2');
  await pg.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
  check(await pg.evaluate(() => seq.steps[1].gate === 0 && seq.steps[2].acc), 'steps edit: a gate rested, an accent set');
  // pages: page 2's steps are steps 17 to 32; copy makes pages 2 to 4 page 1 with a few steps changed
  await pg.click('#m-npages [data-page="1"]');
  await pg.click('[data-mode="gate"]');
  r = await box('.m-step >> nth=5');
  await pg.mouse.click(r.x + r.width / 2, r.y + r.height - 3);
  check(await pg.evaluate(() => seq.steps.length === 64 && seq.steps[21].gate === 0), 'page 2 edits its own steps');
  await pg.click('#m-ncopy');
  check(await pg.evaluate(() => { const k = [1, 2, 3].map((p) => seq.steps.slice(p * 16, p * 16 + 16).filter((st, i) => JSON.stringify(st) !== JSON.stringify(seq.steps[i])).length); return k.every((n) => n <= 5) && k.some((n) => n > 0); }), 'copy: pages 2 to 4 are page 1, slightly varied');
  // every algorithm makes a valid page
  check(await pg.evaluate(() => SEQ_ALGOS.every((_, a) => { seq.algo = a; for (let k = 0; k < 100; k++) { randomPage(1); const p = seq.steps.slice(16, 32);
    if (p.some((x) => !(x.d >= 0 && x.d <= DEG_MAX && x.gate >= 0 && x.gate <= 5)) || !p.some((x) => x.gate)) return false; } return true; })), 'all eight algorithms make valid pages');
  await pg.evaluate(() => { seq.algo = 0; });
  await pg.click('#m-npages [data-page="0"]');
  // the space bar starts and stops
  await pg.keyboard.press('Space'); await pg.waitForTimeout(300);
  const on = await pg.evaluate(() => playing);
  await pg.keyboard.press('Space'); await pg.waitForTimeout(200);
  check(on && !(await pg.evaluate(() => playing)), 'space starts and stops');
  await pg.click('#m-nrand');
  check(await pg.isEnabled('#m-nalter ~ [data-undo]'), 'random notes can be undone');
  // play runs the steps
  await pg.click('#m-play'); await pg.waitForTimeout(1200);
  check(await pg.evaluate(() => document.querySelectorAll('#m-led i.on').length === 1 && document.querySelectorAll('.m-step.now').length === 1), 'playing lights the step');
  // presets: load a built-in one, save a new one
  await pg.click('[data-m-tab="presets"]');
  const beatWas = await pg.evaluate(() => JSON.stringify([bPat, bs, values[PAR.VELOD4]]));
  await pg.click('.m-pload >> text=Acid Line');
  await pg.waitForTimeout(1500);
  check(await pg.evaluate(() => tempo === 128 && seq.root === 9), 'a built-in preset loads (at the next bar)');
  check(await pg.evaluate(() => JSON.stringify([bPat, bs, values[PAR.VELOD4]])) === beatWas, 'a synth preset leaves the beat alone');
  await pg.click('#m-psave');
  check(await pg.evaluate(() => JSON.parse(localStorage.getItem('elixir-synth-presets')).length === 1), 'save new keeps a preset in its own storage');
  // modes: the title steps elixir-synth → beat → mix → synth, each with its own pages
  await pg.click('#m-mode');
  check(await pg.evaluate(() => mode) === 'beat' && await tabs() === 'beat bsteps kit presets' && await page() === 'beat' && await pg.textContent('#m-modename') === 'beat', 'the title turns to elixir-beat');
  for (const t of ['beat', 'bsteps', 'kit']) { await pg.click(`[data-m-tab="${t}"]`); check(await fits(t), `${t}: fits the screen`); }
  await pg.click('[data-m-tab="beat"]');
  r = await box('#m-beatf .m-vtrack >> nth=2');
  const en = await pg.evaluate(() => bs.energy);
  await drag(r.x + r.width / 2, r.y + r.height / 2, r.x + r.width / 2, r.y - 60);
  check(await page() === 'beat' && await pg.evaluate((en) => bs.energy > en, en), 'the energy dial moves, not the page');
  await pg.click('[data-m-tab="bsteps"]');
  const was = await pg.evaluate(() => !!(bPat.on[1][1] && !bPat.bar[1][1]));
  r = await box('.m-bcell[data-r="0"][data-s="1"]');
  await pg.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
  check(await pg.evaluate((w) => !!bPat.on[1][1] !== w, was) && await page() === 'bsteps', 'a tap on the steps grid switches a kick');
  await pg.click('[data-m-tab="kit"]'); await pg.click('#m-knext');
  check(await pg.evaluate(() => bs.kit === 1 && document.getElementById('m-kitname').textContent.startsWith('2 ')), 'the kit steps to the next one');
  await pg.click('#m-mode');
  check(await pg.evaluate(() => mode) === 'mix' && await tabs() === 'mix fx comp presets' && await page() === 'mix', 'then to elixir-mix');
  check(await fits('mix'), 'mix: fits the screen');
  await pg.waitForTimeout(600);
  check(await pg.evaluate(() => [...document.querySelectorAll('.m-meter b')].filter((x) => parseFloat(x.style.width) > 0).length >= 3), 'the meters show the synth and the beat playing together');
  await pg.click('#m-mixmutes button >> nth=1');
  check(await pg.evaluate(() => chans[1].mute && document.querySelectorAll('#m-mixmutes [aria-pressed="true"]').length === 1), 'mute the kick');
  await pg.click('#m-mixmutes button >> nth=1');
  await pg.click('#m-mode');
  check(await pg.evaluate(() => mode) === 'synth' && await tabs() === 'play seq voice xy presets' && await page() === 'presets', 'and back to elixir-synth, on the page it was on');
  // the buttons at the top go straight to a mode
  await pg.click('[data-to-mode="mix"]');
  check(await pg.evaluate(() => mode === 'mix' && document.querySelector('[data-to-mode="mix"]').getAttribute('aria-selected') === 'true'), 'the mix button goes straight to elixir-mix');
  await pg.click('[data-to-mode="synth"]');
  check(await pg.evaluate(() => mode) === 'synth', 'and the synth button back');
  // each mode its own LCD: blue for the synth, grey-green for the beat, black for the mix (the shared pages follow)
  const lcd = () => pg.evaluate(() => getComputedStyle(document.getElementById('m-screen')).backgroundColor);
  const looks = [await lcd()];
  for (let i = 0; i < 3; i++) { await pg.click('#m-mode'); looks.push(await lcd()); }
  check(looks.join() === 'rgb(34, 56, 230),rgb(167, 181, 140),rgb(0, 0, 0),rgb(34, 56, 230)', `each mode has its own LCD (${looks.join(' / ')})`);
  // record: a take downloads as a WAV
  await pg.click('#m-rec'); await pg.waitForTimeout(1000);
  const dl = pg.waitForEvent('download', { timeout: 10000 }).catch(() => null);
  await pg.click('#m-rec');
  const d = await dl;
  check(!!d && /\.wav$/.test(d.suggestedFilename()), `record downloads ${d ? d.suggestedFilename() : 'nothing'}`);
  check(!errs.length, `no page errors ${errs.join('; ')}`);
  await c.close();
}
await b.close();
process.exit(fails ? 1 : 0);
