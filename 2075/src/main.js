import "./style.css";
import { createArena, createEnemy } from "./enemy.js";
import { startCamera, createPose, drawSkeleton } from "./player/pose.js";
import { createMoveDetector } from "./player/moves.js";
import { createHud } from "./player/hud.js";
import { createGame } from "./player/game.js";

const video = document.getElementById("cam");
const canvas = document.getElementById("skeleton");
const debug = document.getElementById("debug");
const hud = createHud(document.getElementById("hud"));

function popup(text, color) {
  const el = document.createElement("div");
  el.className = "popup";
  el.textContent = text;
  el.style.color = color;
  document.getElementById("stage").appendChild(el);
  setTimeout(() => el.remove(), 900);
}

async function init() {
  // ---- Real enemy (Person B) ----
  const arena = createArena(document.getElementById("stage"));
  const enemy = await createEnemy(arena);
  window.enemy = enemy; // handy for testing from the browser console

  let currentAudio = null;

  enemy.say = async (text) => {
    hud.showSubtitle(text);
    try {
      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error("speak failed");

      const url = URL.createObjectURL(await res.blob());
      currentAudio?.pause();
      currentAudio = new Audio(url);
      currentAudio.onended = () => URL.revokeObjectURL(url);
      await currentAudio.play();
    } catch {
      const u = new SpeechSynthesisUtterance(text);
      u.pitch = 0.6;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    }
  };

  // ---- Game (Person A) ----
  let game; // set below, since moves needs to call game.handlePunch
  const moves = createMoveDetector({ onPunch: (p) => game.handlePunch(p) });
  game = createGame({
    enemy,
    moves,
    hud,
    onEvent: (name, data) => console.log("[game]", name, data),
  });

  // ---- Block / dodge popups ----
  enemy.onStrike(() => {
    if (moves.state.blocking) popup("BLOCKED!", "#44ccff");
    else if (moves.state.dodge) popup("DODGED!", "#44ff88");
  });
  enemy.onWhiff(() => popup("DODGED!", "#44ff88"));

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
      moves.update(
        result.landmarks?.[0],
        result.worldLandmarks?.[0],
        now,
        aspect,
      );
      const lm = result.landmarks?.[0];
      if (lm) enemy.setPlayerX(1 - (lm[11].x + lm[12].x) / 2);
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