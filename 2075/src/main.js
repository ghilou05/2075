import './style.css';
import { createArena, createEnemy } from './enemy.js';
import { startCamera, createPose, drawSkeleton } from "./player/pose.js";
import { createMoveDetector } from "./player/moves.js";
import { createHud } from "./player/hud.js";
import { createGame } from "./player/game.js";

const video = document.getElementById("cam");
const canvas = document.getElementById("skeleton");
const debug = document.getElementById("debug");
const hud = createHud(document.getElementById("hud"));

async function init() {
  // ---- Real enemy (Person B) ----
  const arena = createArena(document.getElementById("stage"));
  const enemy = await createEnemy(arena);
  enemy.say = (text) => hud.showSubtitle(text); // temporary until the voice step

  // ---- Game (Person A) ----
  let game; // set below, since moves needs to call game.handlePunch
  const moves = createMoveDetector({ onPunch: (p) => game.handlePunch(p) });
  game = createGame({
    enemy, moves, hud,
    onEvent: (name, data) => console.log("[game]", name, data),
  });

  await startCamera(video);
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const aspect = video.videoWidth / video.videoHeight;
  const pose = await createPose();
  const s = moves.state;
  game.start();

  let lastVideoTime = -1;
  function loop() {
    if (video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      const now = performance.now();
      const result = pose.detectForVideo(video, now);
      drawSkeleton(canvas, result);
      moves.update(result.landmarks?.[0], result.worldLandmarks?.[0], now, aspect);
      game.tick(now);

      debug.textContent = [
        `phase: ${game.state.phase}  tracking: ${s.tracking}`,
        `ext L:${s.ext.left.toFixed(2)} R:${s.ext.right.toFixed(2)}`,
        `block: ${s.blocking}  dodge: ${s.dodge}`,
        `HP you:${game.state.playerHp} enemy:${game.state.enemyHp}`,
      ].join("\n");
    }
    requestAnimationFrame(loop);
  }
  loop();
}
init();