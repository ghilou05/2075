import { LM } from "./pose.js";

// Tuning knobs: all the thresholds live here
export const CFG = {
  EXT_LOW: 0.65,          // arm counts as "bent / in guard" below this
  EXT_HIGH: 0.88,         // arm counts as "extended" above this
  PUNCH_WINDOW_MS: 350,   // must go bent -> extended within this time
  PUNCH_COOLDOWN_MS: 450, // min gap between punches per hand
  BLOCK_HOLD_MS: 120,     // guard must be held this long to count as a block
  DODGE_X: 0.55,          // sideways lean, in shoulder-widths
  DUCK_Y: 0.45,           // downward drop, in shoulder-widths
  CALIB_FRAMES: 45,       // about 1.5 s of samples
};

const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const median = (arr) => [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)];
const visible = (p) => p && (p.visibility ?? 1) > 0.5;

const SIDES = [
  { name: "left", sh: LM.L_SHOULDER, el: LM.L_ELBOW, wr: LM.L_WRIST },
  { name: "right", sh: LM.R_SHOULDER, el: LM.R_ELBOW, wr: LM.R_WRIST },
];

export function createMoveDetector({ onPunch = () => {} } = {}) {
  const cal = {
    collecting: false,
    samples: [],
    armLen: { left: 0.6, right: 0.6 }, // sane defaults until calibrated
    noseX: 0.5,
    noseY: 0.3,
  };
  const hand = {
    left: { lastLowT: -Infinity, armed: false, lastPunchT: -Infinity },
    right: { lastLowT: -Infinity, armed: false, lastPunchT: -Infinity },
  };
  let blockSince = null;

  const state = {
    tracking: false,
    calibrated: false,
    calibProgress: 0,
    blocking: false,
    dodge: null, // "left" | "right" | "duck" | null (left/right as seen on screen)
    ext: { left: 0, right: 0 },
    lateral: 0,
    duck: 0,
  };

  function startCalibration() {
    cal.collecting = true;
    cal.samples = [];
    state.calibrated = false;
    state.calibProgress = 0;
  }

  function finishCalibration() {
    for (const s of ["left", "right"]) {
      cal.armLen[s] = median(cal.samples.map((x) => x.arm[s]));
    }
    cal.noseX = median(cal.samples.map((x) => x.noseX));
    cal.noseY = median(cal.samples.map((x) => x.noseY));
    cal.collecting = false;
    state.calibrated = true;
  }

  // img = result.landmarks[0], world = result.worldLandmarks[0]
  function update(img, world, t, aspect) {
    const nose = img[LM.NOSE], ls = img[LM.L_SHOULDER], rs = img[LM.R_SHOULDER];
    if (!world || ![nose, ls, rs].every(visible)) {
      state.tracking = false;
      state.blocking = false;
      return state;
    }
    state.tracking = true;

    // shoulder width in "height units" so x and y are comparable
    const sw = Math.hypot((ls.x - rs.x) * aspect, ls.y - rs.y);

    // ---- Calibration: stand in guard, collect bone lengths + neutral head position
    if (cal.collecting) {
      const ok = SIDES.every((s) => [world[s.sh], world[s.el], world[s.wr]].every(visible));
      if (ok) {
        const arm = {};
        for (const s of SIDES) arm[s.name] = dist3(world[s.sh], world[s.el]) + dist3(world[s.el], world[s.wr]);
        cal.samples.push({ arm, noseX: nose.x, noseY: nose.y });
      }
      state.calibProgress = cal.samples.length / CFG.CALIB_FRAMES;
      if (cal.samples.length >= CFG.CALIB_FRAMES) finishCalibration();
      return state;
    }

    // ---- Punches: arm goes from bent to straight quickly
    for (const s of SIDES) {
      const h = hand[s.name];
      const ext = dist3(world[s.wr], world[s.sh]) / cal.armLen[s.name];
      state.ext[s.name] = ext;

      if (ext < CFG.EXT_LOW) {
        h.lastLowT = t;
        h.armed = true;
      } else if (
        ext > CFG.EXT_HIGH &&
        h.armed &&
        t - h.lastLowT < CFG.PUNCH_WINDOW_MS &&
        t - h.lastPunchT > CFG.PUNCH_COOLDOWN_MS
      ) {
        h.armed = false;
        h.lastPunchT = t;
        onPunch({ hand: s.name, t });
      }
    }

    // ---- Block: both hands up near the face, both arms bent
    const lw = img[LM.L_WRIST], rw = img[LM.R_WRIST];
    const shoulderY = (ls.y + rs.y) / 2;
    const handsUp = [lw, rw].every(
      (w) => visible(w) && w.y < shoulderY && w.y > nose.y - 0.6 * sw
    );
    const nearFace = [lw, rw].every((w) => Math.abs((w.x - nose.x) * aspect) < 1.0 * sw);
    const armsBent = state.ext.left < CFG.EXT_LOW + 0.15 && state.ext.right < CFG.EXT_LOW + 0.15;
    const blockPose = handsUp && nearFace && armsBent;

    if (blockPose) {
      blockSince ??= t;
      state.blocking = t - blockSince >= CFG.BLOCK_HOLD_MS;
    } else {
      blockSince = null;
      state.blocking = false;
    }

    // ---- Dodge: head moves sideways or drops, relative to calibrated spot
    // Skipped while guarding - raising your hands to block tucks the chin down
    // enough to look like a duck, so block and dodge would otherwise both fire.
    if (blockPose) {
      state.lateral = 0;
      state.duck = 0;
      state.dodge = null;
    } else {
      // Camera x is unmirrored, so flip it: positive lateral = moving right ON SCREEN
      state.lateral = (-(nose.x - cal.noseX) * aspect) / sw;
      state.duck = (nose.y - cal.noseY) / sw;
      state.dodge =
        state.lateral > CFG.DODGE_X ? "right"
        : state.lateral < -CFG.DODGE_X ? "left"
        : state.duck > CFG.DUCK_Y ? "duck"
        : null;
    }

    return state;
  }

  return { update, startCalibration, state };
}