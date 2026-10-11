import { startCamera, createPose, drawSkeleton, LM } from "./player/pose.js";

const video = document.getElementById("cam");
const canvas = document.getElementById("skeleton");
const debug = document.getElementById("debug");

export const player = { landmarks: null, t: 0 }; // detection code reads this next

async function init() {
  await startCamera(video);
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const pose = await createPose();

  let lastVideoTime = -1;
  function loop() {
    if (video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      const now = performance.now();
      const result = pose.detectForVideo(video, now);
      player.landmarks = result.landmarks?.[0] ?? null;
      player.t = now;
      drawSkeleton(canvas, result);
      if (player.landmarks) {
        const w = player.landmarks[LM.R_WRIST];
        debug.textContent = `R wrist x:${w.x.toFixed(2)} y:${w.y.toFixed(2)} z:${w.z.toFixed(2)}`;
      }
    }
    requestAnimationFrame(loop);
  }
  loop();
}
init();