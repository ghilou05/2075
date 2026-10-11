import { startCamera, createPose, drawSkeleton } from "./player/pose.js";
import { createMoveDetector } from "./player/moves.js";

const video = document.getElementById("cam");
const canvas = document.getElementById("skeleton");
const debug = document.getElementById("debug");

// Fake enemy for now: swap for Person B's real one at the checkpoint
export const enemy = {
  playMove: (m) => console.log("enemy.playMove", m),
  takeHit: () => console.log("enemy.takeHit"),
  say: (text) => console.log("enemy.say", text),
  onStrike: (cb) => { window.__strike = cb; }, // call __strike() in the console to simulate
};

let lastPunch = { hand: "-", t: -Infinity };
const moves = createMoveDetector({
  onPunch: (p) => {
    lastPunch = p;
    console.log("PUNCH", p.hand);
  },
});

window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "c") moves.startCalibration();
});

async function init() {
  await startCamera(video);
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const aspect = video.videoWidth / video.videoHeight;
  const pose = await createPose();
  const s = moves.state;

  let lastVideoTime = -1;
  function loop() {
    if (video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      const now = performance.now();
      const result = pose.detectForVideo(video, now);
      drawSkeleton(canvas, result);
      moves.update(result.landmarks?.[0], result.worldLandmarks?.[0], now, aspect);

      const recent = now - lastPunch.t < 300 ? `PUNCH ${lastPunch.hand.toUpperCase()}` : "";
      debug.textContent = [
        s.calibrated ? "calibrated" : `PRESS C to calibrate (guard stance)  ${(s.calibProgress * 100) | 0}%`,
        `tracking: ${s.tracking}`,
        `ext L:${s.ext.left.toFixed(2)} R:${s.ext.right.toFixed(2)}`,
        `block: ${s.blocking}   dodge: ${s.dodge}`,
        `lateral:${s.lateral.toFixed(2)} duck:${s.duck.toFixed(2)}`,
        recent,
      ].join("\n");
    }
    requestAnimationFrame(loop);
  }
  loop();
}
init();