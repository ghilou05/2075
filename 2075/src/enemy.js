import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export const MOVES = {
  jab: { windup: 500, damage: 8 },
  hook: { windup: 1000, damage: 12 },
  uppercut: { windup: 1300, damage: 15 },
};

const STRIKE_DELAY = 250;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const FACING = -1.2; // radians; turned to face left, not fully side-on
const HOME_GAP = 1.1; // distance he keeps between attacks
const STRIKE_GAP = 0.5; // distance he attacks from
const REACH = 0.75; // max distance for any hit to land, his or yours
const WALK_SPEED = 1.6; // units per second
const MIN_X = -2.2; // screen edges, so he can't walk off
const MAX_X = 2.2;

export function createArena(container) {
  // Generates the renderer, and clears it with a black color at every frame before drawing on it again
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  Object.assign(renderer.domElement.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
  });
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();

  // not a real camera, basically the 3d landscape i think
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 1.1, 4.2); // x, y, z coords, it's pretty much centered here
  camera.lookAt(0, 0.9, 0); // points the camera at a spot on the robot's chest

  // basically sets up the sun
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 2.2));

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
  keyLight.position.set(2, 4, 3);
  scene.add(keyLight);

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  new ResizeObserver(resize).observe(container); // for resizing the actual window
  resize();

  const raycaster = new THREE.Raycaster();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hitPoint = new THREE.Vector3();

  function screenXToWorld(screenX) {
    raycaster.setFromCamera(new THREE.Vector2(screenX * 2 - 1, 0), camera);
    return raycaster.ray.intersectPlane(floorPlane, hitPoint) ? hitPoint.x : 0;
  }

  const timer = new THREE.Timer();
  const updaters = new Set();

  renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), 0.1);
    for (const fn of updaters) fn(dt);
    renderer.render(scene, camera);
  });

  return {
    scene,
    camera,
    renderer,
    container,
    screenXToWorld,
    onUpdate(fn) {
      updaters.add(fn);
      return () => updaters.delete(fn);
    },
  };
}

// for the 3D models i think
const loader = new GLTFLoader();

export async function createEnemy(arena, { height = 1.8 } = {}) {
  const gltf = await loader.loadAsync("/models/RobotExpressive.glb");
  const model = gltf.scene;

  const box = new THREE.Box3().setFromObject(model);
  const scale = height / (box.max.y - box.min.y);
  model.scale.setScalar(scale);
  model.position.y = -box.min.y * scale;

  const pivot = new THREE.Group();
  pivot.add(model);
  arena.scene.add(pivot);

  pivot.rotation.order = "YXZ";
  pivot.rotation.y = FACING;

  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const clip of gltf.animations) {
    actions[clip.name] = mixer.clipAction(clip);
  }

  let current = actions.Idle;
  current?.play();

  arena.onUpdate((dt) => mixer.update(dt));

  function playAnim(name, { once = false, fade = 0.15 } = {}) {
    const next = actions[name];
    if (!next || next === current) return 0;

    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    next.fadeIn(fade).play();
    current?.fadeOut(fade);
    current = next;

    return next.getClip().duration * 1000;
  }

  const materials = [];
  model.traverse((obj) => {
    if (obj.isMesh) {
      obj.material = obj.material.clone();
      materials.push(obj.material);
    }
  });

  const glowColor = new THREE.Color(0xff2a00);
  const current_ = { lean: 0, z: 0, glow: 0, shield: 0 };
  const target = { lean: 0, z: 0, glow: 0 };

  const shield = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 32),
    new THREE.MeshBasicMaterial({
      color: 0x33aaff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  shield.position.set(0, 0.9, 0.35);
  pivot.add(shield);

  let state = "idle";
  let playerX = 0;
  let gap = HOME_GAP;
  let posX = HOME_GAP;
  let walking = false;
  let flash = 0;
  let blocking = false;

  const distance = () => Math.abs(posX - playerX);
  const inRange = () => distance() <= REACH;

  function setPlayerX(screenX) {
    const worldX = arena.screenXToWorld(screenX);
    playerX += (worldX - playerX) * 0.3;
  }

  async function until(condition, timeoutMs) {
    const start = performance.now();
    while (!condition() && performance.now() - start < timeoutMs) {
      await wait(50);
    }
  }

  arena.onUpdate((dt) => {
    const ease = 1 - Math.exp(-dt * 12);
    for (const key in target)
      current_[key] += (target[key] - current_[key]) * ease;
    flash = Math.max(0, flash - dt * 4);
    current_.shield = Math.max(0, current_.shield - dt * 3);

    // Walk towards (player + gap) at a constant speed
    let direction = 0;
    const canMove =
      state === "idle" || state === "approach" || state === "retreat";
    if (canMove) {
      const goal = THREE.MathUtils.clamp(playerX + gap, MIN_X, MAX_X);
      const diff = goal - posX;
      const threshold = walking ? 0.02 : 0.12;
      if (Math.abs(diff) > threshold) {
        posX += Math.sign(diff) * Math.min(Math.abs(diff), WALK_SPEED * dt);
        direction = Math.sign(diff);
      }
    }
    walking = direction !== 0;

    // Walk or idle animation, but only when not punching, feinting or KO'd
    if (canMove) {
      if (walking) {
        playAnim("Walking");
        actions.Walking.timeScale = direction < 0 ? 1 : -1;
      } else {
        playAnim("Idle");
      }
    }

    // Position, with the lunge pushing along the direction he faces
    pivot.position.x = posX + Math.sin(FACING) * current_.z;
    pivot.position.z = Math.cos(FACING) * current_.z;
    pivot.rotation.x = current_.lean;
    shield.material.opacity = current_.shield * 0.4;

    for (const m of materials) {
      if (m.emissive) {
        m.emissive.setRGB(
          glowColor.r * current_.glow + flash,
          glowColor.g * current_.glow + flash,
          glowColor.b * current_.glow + flash,
        );
      }
    }
  });
  const strikeListeners = new Set();

  function onStrike(fn) {
    strikeListeners.add(fn);
    return () => strikeListeners.delete(fn);
  }

  async function playMove(name) {
    const move = MOVES[name];
    if (!move || state !== "idle") return false;

    // 0. Close the distance (gives up after 2s if the player keeps backing off)
    state = "approach";
    gap = STRIKE_GAP;
    await until(() => distance() <= STRIKE_GAP + 0.1, 2000);
    if (state !== "approach") return false;

    // 1. Telegraph (planted, can't move)
    state = "windup";
    actions.Walking.timeScale = 1;
    playAnim("Idle");
    target.lean = -0.18;
    target.glow = name === "heavy" ? 0.9 : 0.55;
    await wait(move.windup);
    if (state !== "windup") return false;

    if (move.fake) {
      // 2a. Feint
      state = "feint";
      target.lean = 0;
      target.glow = 0;
      const duration = playAnim("No", { once: true });
      await wait(Math.min(duration, 900));
    } else {
      // 2b. Strike: only lands if the player is still in range
      state = "strike";
      target.lean = 0.12;
      target.z = 0.45;
      target.glow = 0;
      const duration = playAnim("Punch", { once: true, fade: 0.08 });
      await wait(STRIKE_DELAY);
      if (state === "strike" && inRange()) {
        for (const fn of strikeListeners)
          fn({ move: name, damage: move.damage });
      }
      await wait(duration - STRIKE_DELAY - 150);
      target.lean = 0;
      target.z = 0;
    }
    if (state === "ko") return false;

    // 3. Back off to the normal gap
    state = "retreat";
    gap = HOME_GAP;
    await until(() => distance() >= HOME_GAP - 0.1, 1500);
    if (state === "ko") return false;
    state = "idle";
    return true;
  }

  function setBlocking(value) {
    blocking = value;
  }

  function knockOut() {
    state = "ko";
    target.lean = 0;
    target.z = 0;
    playAnim("Death", { once: true });
  }

  function takeHit() {
    if (state === "ko" || !inRange()) return false;
    if (blocking) {
      current_.shield = 1.5;
      return false;
    }
    flash = 0.9;
    current_.lean = -0.25;
    posX = Math.min(posX + 0.3, MAX_X);
    return true;
  }

  return {
    pivot,
    gltf,
    playAnim,
    playMove,
    onStrike,
    takeHit,
    setBlocking,
    knockOut,
    setPlayerX,
    isBusy: () => state !== "idle",
    get blocking() {
      return blocking;
    },
    get inRange() {
      return inRange();
    },
  };
}
