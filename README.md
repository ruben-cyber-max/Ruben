# VOID RAIDERS

A retro arcade shooter in the style of the 1978 coin-ops — hand-drawn pixel art,
destructible bunkers, a swarm that speeds up as you thin it out, and a chiptune
soundtrack synthesised on the fly.

No build step, no dependencies, no asset files. Just open `index.html`.

```
git clone <this repo> && cd Ruben
open index.html          # macOS
xdg-open index.html      # Linux
start index.html         # Windows
```

Everything works straight off the filesystem (`file://`) — the scripts are plain
classic scripts rather than ES modules for exactly that reason. If you prefer a
server: `npx http-server .`

## Controls

| Action | Keys |
| --- | --- |
| Move | `←` `→` or `A` `D` |
| Fire | `Space`, `↑` or `W` |
| Start / restart | `Enter` or Fire |
| Pause | `P` or `Esc` |
| Sound on/off | `M` |

On phones and tablets an on-screen D-pad and FIRE button appear automatically.

## How it plays

- **Five rows, eleven columns.** The top row (squid) scores 30, the middle two
  (crab) 20, the bottom two (octopus) 10.
- **The swarm accelerates.** Fewer invaders left means less time between steps,
  so the last few move alarmingly fast. Each wave starts faster and lower down.
- **One shot at a time.** Just like the original — your next shot waits until the
  current one hits something or leaves the screen.
- **Bunkers are destructible per pixel.** Enemy bombs chew craters from above,
  your own shots erode them from below, and descending invaders grind straight
  through them.
- **The mystery ship** drifts past at the top for 50–300 points.
- **Wave bonus** of 100 × wave number on clearing the screen; an extra life at
  1,500 points and every 10,000 after that.
- **Shooting down a bomb** in mid-air is possible, and worth practising.
- Lose all three ships — or let the swarm reach your line — and it's over. The
  hi-score is kept in `localStorage`.

## Project layout

```
index.html        markup and the cabinet shell
css/style.css     bezel, scanlines and CRT glare
js/sprites.js     pixel-art sprites + 5x7 bitmap font, rasterised once
js/audio.js       WebAudio chiptune synth (no sample files)
js/shield.js      per-pixel destructible bunkers
js/input.js       keyboard and touch, edge- and level-triggered
js/game.js        rules, fleet AI, collisions, rendering
js/main.js        boot, integer-scaled letterboxing
```

## Notes on the implementation

- The playfield is a **224×256 canvas**, the arcade original's resolution, scaled
  up with nearest-neighbour filtering. Whole-number scaling is preferred so no
  pixel ends up taller than its neighbour; below 2× (phones) it takes the
  fractional fit rather than leaving a postage stamp on screen.
- The simulation runs on a **fixed 60Hz step** with an accumulator, so the game
  behaves identically on a 60Hz and a 144Hz display. A separate render clock
  keeps blinking prompts alive while the game itself is paused.
- Every graphic is a string of `#` and `.` in `js/sprites.js`, rasterised once
  per colour into an offscreen canvas — the main loop only ever does `drawImage`.
- Sound is synthesised from oscillators and a small noise buffer. The
  `AudioContext` is created on the first key or tap, because browsers refuse to
  start audio before a user gesture.
