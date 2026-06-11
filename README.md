# Super Nico World 🍄

A polished Mario-inspired platformer that runs entirely in your browser — no installs, no downloads, no asset files. All graphics are rendered live on an HTML5 canvas (parallax skies, particles, soft shadows, screen shake) and all music and sound effects are synthesized in real time with the Web Audio API.

## How to play

1. Open **Command Prompt** (press `Win`, type `cmd`, press Enter).
2. Go to the game folder — copy-paste this command and press Enter:
   ```
   cd "C:\Users\nafer\github repo\Super Nico World"
   ```
3. Start a local server — copy-paste this command and press Enter:
   ```
   npx --yes http-server -p 8123 -c-1 .
   ```
4. Open your browser (Chrome/Edge) and go to: **http://localhost:8123**
5. Click **START GAME**.

(Alternative with no server: double-click `index.html` in File Explorer — it works directly too.)

## Controls

| Key | Action |
|---|---|
| `←` `→` or `A` `D` | Move |
| `Space` / `↑` / `W` | Jump (hold for higher jumps) |
| `Shift` | Run |
| `P` | Pause |
| `M` | Mute |
| `Enter` | Restart after game over / victory |

## Features

- **3 worlds**: Green Hills, Cavern Climb, Sunset Fortress — each with its own sky palette.
- **Tight platforming feel**: coyote time, jump buffering, variable jump height, squash & stretch.
- **Enemies**: goombas to stomp and koopas whose shells you can kick into other enemies.
- **Power-ups**: question blocks hide coins and mushrooms; grow big to break bricks. Every 50 coins = extra life.
- **Hazards**: spikes, pits, and a countdown timer.
- **Procedural audio**: a chiptune overworld theme plus jump/coin/stomp/power-up/victory sounds, all generated at runtime.

Reach the flag at the end of each world. Good luck! 🚩
