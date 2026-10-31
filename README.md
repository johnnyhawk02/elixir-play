# Elixir Synth

A phone-first mono synth in the browser. **Play it: https://johnnyhawk02.github.io/elixir-synth/**

Elixir Synth is built from [Elixir Mobile](https://github.com/johnnyhawk02/elixir-mobile). It keeps one voice of its
engine, the LXR drum 1 voice (DR1), and plays it as a synth: a note sequencer instead of the drum patterns, and
the same LCD screen. It installs as an app and works offline.

The engine is a JavaScript port of the drum voices and FX bus in the Erica Synths LXR-02 firmware
([erica-synths/lxr-desktop-app](https://github.com/erica-synths/lxr-desktop-app), GPL-3.0, commit a43cd4f).
Elixir Synth is unofficial: it is not made, approved or endorsed by Erica Synths.

## Pages

Swipe across the screen, or tap the page buttons along the bottom. Dragging a fader, the x/y pad or the steps never
turns the page. Play, record and the step light sit at the top.

- **PERF**: tempo, pitch (two octaves either way, in hundredths of a semitone), decay, filter and fm, and the
  randomise column: everything, sound, alter, notes, random fx, alter fx, undo, and *next bar* (while playing, a
  randomise waits for the next bar).
- **SEQ**: the note sequencer. Sixteen steps, each with a note, a gate (from a quarter step to ringing out; the bottom
  rests it), an accent and a slide into the next step. Pick what a touch sets (note, gate, accent, slide), then
  draw across the steps. Root, scale, accent amount and glide time, and random, alter and undo.
- **VOICE**: every DR1 parameter, on four tabs: tone, shape, filter, mod.
- **X/Y**: one pad moving any two DR1 parameters.
- **FX**: the echo (tempo-synced on musical lengths, ping pong, tone, feedback, width) and the ring mod, with random,
  alter and undo.
- **MSTR**: distortion (tube, fold or rat) on the whole mix, then the compressor.
- **PRST**: presets, kept in this browser: save new, save over, load, delete, import and export. While playing, a
  preset comes in at the next bar.

Hold any fader for half a second to open its step sequencer: 2 to 16 steps, depth, slew, speed, draw with a finger,
randomise, on or off. Presets keep them.

**REC** records the finished mix from the moment you press it and downloads a WAV when you press it again.

## The engine

`lxr.js` follows the firmware's C line by line. Elixir Mobile's `verify.mjs` compares it sample for sample with the
firmware's own code built for the Cortex-M7 and run under qemu (see `ref/`). The engine runs as it does there, in
64-sample blocks at the firmware's rate, resampled to the phone's.

Elixir Synth adds one thing to it: `setDrumPitch()`, which moves drum 1 to a note between semitones without a
retrigger, for the pitch fader and for slides. A note on a whole semitone goes through the firmware's own trigger and
is bit-exact; `test/engine.mjs` checks that.

## Files

| Path | What it is |
|---|---|
| `index.html` | the whole app in one file, built by `build.mjs` |
| `index.src.html` | the page's markup |
| `app/` | the page's code: `style.css`, `player.js` (the audio thread), then `core`, `ui`, `noteseq`, `fseq`, `presets`, `record`, `pwa` |
| `lxr.js`, `lxr-tables.js`, `lxr-ui-data.js`, `lxr-clicks.js` | the engine |
| `presets/` | the built-in presets, in the format the presets page exports |
| `sw.js`, `manifest.webmanifest`, `icons/` | the offline app |
| `test/` | `engine.mjs` (sound, in Node) and `smoke.mjs` (the page, in Chromium's phone emulation) |
| `verify.mjs`, `ref/` | the sample-for-sample comparison with the firmware |

## Build and test

```sh
node build.mjs               # rebuild index.html
node test/engine.mjs         # bit-exact semitones, cents, the sequencer, the presets' levels
node test/smoke.mjs          # the page at 412 x 915 and 360 x 640 (needs Playwright)
```

## Licence

GPL-3.0-only, like the firmware it is derived from (see [LICENSE](LICENSE)). "Erica Synths", "LXR" and "LXR-02" are
trademarks of Erica Synths; they are used here only to say where the engine comes from.
