# Elixir Synth

A phone-first mono synth in the browser. **Play it: https://johnnyhawk02.github.io/elixir-synth/**

Elixir Synth is built from [Elixir Mobile](https://github.com/johnnyhawk02/elixir-mobile). It keeps one voice of its
engine, the LXR drum 1 voice (DR1), and plays it as a synth: a note sequencer instead of the drum patterns, and
the same LCD screen. It installs as an app and works offline.

The engine is a JavaScript port of the drum voices and FX bus in the Erica Synths LXR-02 firmware
([erica-synths/lxr-desktop-app](https://github.com/erica-synths/lxr-desktop-app), GPL-3.0, commit a43cd4f).
Elixir Synth is unofficial: it is not made, approved or endorsed by Erica Synths.

## Modes

Three modes run at once on the one engine and clock, so play, tempo, record and the step light are shared and
everything stays in sync. **The synth, beat and mix buttons at the top** go straight to one; a tap on the title steps from one to the next:
elixir-synth → elixir-beat → elixir-mix → elixir-synth. Each mode keeps the page it was on.

- **elixir-synth**: the mono synth on drum 1 (the pages below), on a blue backlit LCD.
- **elixir-beat**, on Elixir Mobile's original grey-green LCD: the engine's other five voices as a drum machine: drum 2 as the kick, drum 3 as the tom, the
  snare, the cymbal and the hats (closed and open). Its pattern comes from Elixir Mobile's generator.
  - **BEAT**: nine dials: style (electro, techno, broken beat, IDM, breakcore), pattern (32 grooves each), energy,
    fills, groove (straight, swing, triplet, shuffle, drunk and more), swing (how much of the groove plays), velocity,
    accent and tempo; randomise everything, the pattern, the kit, alter the kit, undo.
  - **STEPS**: the pattern as a grid, a row per track. Tap or drag to switch hits, or accents in accent mode. Hatched
    steps play only on some bars (fills, the crash after one). Moving a BEAT dial makes a fresh pattern over edits.
  - **KIT**: step through Elixir Mobile's 33 kits, and each voice's main settings.
- **elixir-mix**, white on black: **MIX** has a channel each for the synth, kick, tom, snare, cymbal and hats: level, meter, mute, and
  echo and reverb sends (the synth's are the same as its FX page's). **FX** and **MSTR** live only in mix: the
  echo, reverb and master are shared by everything.

Presets keep all three. A preset saved before the modes leaves the beat and the mixer as they are.

## Synth pages

Swipe across the screen, or tap the page buttons along the bottom. The space bar starts and stops. Dragging a fader, the x/y pad or the steps never
turns the page. Play, record and the step light sit at the top.

- **PERF**: twelve dials, and the randomise column: everything, sound, alter, notes, undo, and
  *next bar* (while playing, a randomise waits for the next bar). Drag a dial up or down to turn it. A MIDI controller
  turns them too: CC 1 to 12, on any channel, in reading order:

  | CC | dial | | CC | dial | | CC | dial |
  |---|---|---|---|---|---|---|---|
  | 1 | tempo | | 5 | reso | | 9 | filter drive |
  | 2 | pitch (two octaves either way) | | 6 | fm | | 10 | pitch mod amount |
  | 3 | decay | | 7 | drive | | 11 | lfo rate |
  | 4 | filter | | 8 | attack | | 12 | lfo amount |

  Chrome asks for MIDI access at the first touch. The synth has no effects of its own: echo, reverb and master are
  all in mix, and a synth preset leaves them as they are.
- **SEQ**: the note sequencer. Up to four pages of sixteen steps, played in turn; each step has a note, a gate
  (from a quarter step to ringing out; the bottom rests it), an accent and a slide into the next step. Pick the page
  (the one playing is underlined) and what a touch sets (note, gate, accent, slide), then draw across the steps.
  *Copy 1 → 2-4* copies page 1 onto the other three, each with a few steps changed. Root, scale, accent amount (acc),
  length (len: 1 to 64 steps; the steps past it are dimmed and skipped, so a short line cycles against the bar), glide
  time, and random (a new page 1 and pages 2 to 4 as its variations), alter (the page shown) and undo. The algo fader
  picks how random writes a page: 1 dice,
  2 acid, 3 euclid, 4 arp, 5 walk, 6 motif, 7 groove, 8 phrase. Presets from before there were pages play their one page
  on all four.
- **VOICE**: every DR1 parameter, on four tabs: tone, shape, filter, mod.
- **X/Y**: one pad moving any two DR1 parameters.
- **FX**: the echo (tempo-synced on musical lengths, ping pong, tone, feedback, width), the reverb (send, predelay,
  decay, tone, early reflections; at the top its decay holds) and the ring mod, with random, alter and undo.
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

Elixir Synth adds two things to it. `setDrumPitch()` moves drum 1 to a note between semitones without a retrigger,
for the pitch dial and for slides. A note on a whole semitone goes through the firmware's own trigger and is
bit-exact; `test/engine.mjs` checks that.

And the reverb: the firmware has one (`FX/Reverb.c` and `FX/VerbTools/`), compiled out of the LXR-02 with
`USE_REVERB 0`. `lxr.js` ports it line by line as the FX bus's `FX_REVERB`, with its quirks (a mono output, loop 2
running through loop 1's allpass, a modulated allpass whose depth is never set). It hasn't been compared sample for
sample with the firmware, since the firmware never builds it.

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
