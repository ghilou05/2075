# 2075

**A webcam fighting game where you box a robot with your real body.** MediaPipe tracks your punches, blocks and footwork, while an LLM-driven opponent watches how you fight, adapts its moves, and taunts you out loud with an ElevenLabs voice.

> An AI opponent that watches how you fight, adapts, and tells you about it.

## How it works

The robot stands side-on beside you in your room, rendered over your mirrored webcam feed. You fight it with your actual body:

| You do | The game sees |
|---|---|
| Throw a straight punch toward the camera | A punch (arm goes from bent to extended quickly) |
| Hold both hands up by your face | A block |
| Duck | A duck |
| Step in or out | Your position, which decides whether punches and strikes are in range |

- The robot walks in, winds up, strikes and retreats. Its moves are `jab`, `heavy` (slow wind-up, big damage) and `feint` (a fake that does no damage). The wind-up is your warning to block or step away.
- You can only land punches while it is close enough, so its attacks open a counter-punch window.
- Health bars, rounds (first to 2 wins) and win and lose screens are shown in the HUD.
- Every few attacks, the game sends your fight stats (health, block count, favoured hand and so on) to the backend. The LLM replies with the robot's next moves, how often it blocks, and a taunt, which is spoken aloud and shown as a subtitle. If the call fails or takes over 3 seconds, the game falls back to random moves.

## Tech stack

**Front end**
- [Vite](https://vite.dev) with plain JavaScript (no React: the game loop runs every frame)
- [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker) (`@mediapipe/tasks-vision`) for body tracking
- [Three.js](https://threejs.org) for the robot (`RobotExpressive.glb` from the Three.js examples) on a transparent canvas over the video

**Back end**
- Node and Express, with `/api/ai-turn` (LLM) and `/api/speak` (ElevenLabs)
- Vite proxies `/api` to the backend on port 3001
- API keys live in `.env`, which is git-ignored

## Getting started

### Requirements
- **Node.js 20.19+ or 22.12+** (the current LTS is the safest choice; older Node versions break the latest Vite)
- A webcam
- API keys for your LLM provider and ElevenLabs

### Install
```bash
npm install
```
Run `npm install` again after every pull that changes `package.json`.

### Configure
Create a `.env` file in the project root with your LLM and ElevenLabs API keys (the variable names are in the backend code). Never commit this file.

### Run
Start the backend, then the front end:
```bash
npm run server   # Express backend on http://localhost:3001
npm run dev      # Vite dev server
```
Open the `localhost` URL that Vite prints and allow camera access.

## Playing

1. Stand **1.5 to 2 m** from the camera so your upper body is in frame.
2. Click **Start fight** (this also unlocks browser audio).
3. Hold a relaxed **guard stance** through the 3-2-1 countdown. This calibrates your arm length and neutral position.
4. Fight. Block his heavy attacks, step away from the rest, and counter-punch when he comes in.

### Demo checklist
- Camera level with your chest, not pointing at the ceiling
- Light in front of you, not behind
- Room to step in and out
- LLM and ElevenLabs credits checked
- Backup video recorded
- Click **Start fight** first so audio is allowed

## Project structure

```
index.html              # #stage (1280 x 720), mirrored video, HUD container
public/
  models/RobotExpressive.glb
  audio/                # stock voice clips
src/
  main.js               # wires camera, pose, game and enemy together
  enemy.js              # Three.js arena, robot, animations and movement
  player/
    pose.js             # webcam, MediaPipe setup, skeleton drawing
    moves.js            # calibration and punch / block / duck detection
    game.js             # health, damage timing, rounds, AI calls
    ai.js               # /api/ai-turn client with fallback
    hud.js, hud.css     # health bars, subtitles, messages, hints
```

## The enemy API

The player side and the enemy side meet in a small interface:

```js
const arena = createArena(document.getElementById('stage'));
const enemy = await createEnemy(arena);

enemy.setPlayerX(screenX)                  // every frame: player's horizontal position, 0 = left, 1 = right
enemy.playMove('jab' | 'heavy' | 'feint')  // walk in, wind up, strike, walk back. Returns false if busy
enemy.onStrike(({ move, damage }) => {})   // his punch landed AND the player is in range
enemy.takeHit()                            // true = landed, false = blocked, out of range or KO'd
enemy.setBlocking(true | false)
enemy.knockOut()
enemy.reset()                              // back to idle after a KO
enemy.isBusy()                             // true while attacking
enemy.inRange                              // close enough for hits either way
enemy.say(text, audioUrl)                  // speak a taunt
```

### AI turn

`POST /api/ai-turn` receives the fight stats (`playerHp`, `enemyHp`, `blockCount`, `blockRate`, `dodgeRate`, `favouredHand`, `round`) and returns:

```json
{ "moves": ["jab", "feint", "heavy"], "block_chance": 0.4, "taunt": "You keep stepping back. Scared?" }
```

The LLM is never called from the frame loop.

## Troubleshooting

| Problem | Fix |
|---|---|
| `Cannot find native binding` (rolldown) when running `npm run dev` | Your Node is too old for the latest Vite. Upgrade to Node 22 LTS, then delete `node_modules` and `package-lock.json` and run `npm install` |
| `THREE.Timer is not a constructor` | Your `three` is outdated. Run `npm i three@latest` |
| `Failed to resolve import "@mediapipe/tasks-vision"` | Run `npm install` after pulling |
| `container is null` | `index.html` still has the template's `#app` instead of `#stage` |
| Blank screen, no error | `#stage` has no height, or `style.css` redefines it. Use the 1280 x 720 rule in `index.html` |
| Robot in rest pose and no camera | `init()` crashed partway. Check the browser console |
| HUD or debug text hidden behind the robot | Give them a `z-index` above the robot canvas |
| PowerShell blocks `npm.ps1` | Run `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`, or use Command Prompt |
| Camera blocked | Use `localhost` (or HTTPS) and allow camera access in the browser |

## Team

Built at a hackathon by two people, split along the handshake above:

- **Player side:** webcam, MediaPipe, move detection, game loop, health, rounds and HUD
- **Enemy side:** the Three.js robot and animations, the backend, prompts, voices and stock clips