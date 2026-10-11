import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const MOVES = {
    jab: { windup: 500, damage: 8 },
    hook: { windup: 1000, damage: 12 },
    uppercut: { windup: 1300, damage: 15 },
};

const STRIKE_DELAY = 250;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createArena(container) {

    // Generates the renderer, and clears it with a black color at every frame before drawing on it again
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    Object.assign(renderer.domElement.style, {
        position: 'absolute',
        inset: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
    });
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    // not a real camera, basically the 3d landscape i think
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 1.35, 3.4); // x, y, z coords, it's pretty much centered here
    camera.lookAt(0, 1.15, 0); // points the camera at a spot on the robot's chest

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
        onUpdate(fn) {
        updaters.add(fn);
        return () => updaters.delete(fn);
        },
    };
}

// for the 3D models i think
const loader = new GLTFLoader();

export async function createEnemy(arena, { height = 1.8 } = {}) {
    const gltf = await loader.loadAsync('/models/RobotExpressive.glb');
    const model = gltf.scene;

    const box = new THREE.Box3().setFromObject(model);
    const scale = height / (box.max.y - box.min.y);
    model.scale.setScalar(scale);
    model.position.y = -box.min.y * scale;

    const pivot = new THREE.Group();
    pivot.add(model);
    arena.scene.add(pivot);

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
    const current_ = { lean: 0, z: 0, glow: 0 };
    const target = { lean: 0, z: 0, glow: 0 };

    arena.onUpdate((dt) => {
        const ease = 1 - Math.exp(-dt * 12);
        for (const key in target) {
            current_[key] += (target[key] - current_[key]) * ease;
        }

        pivot.rotation.x = current_.lean;
        pivot.position.z = current_.z;

        for (const m of materials) {
            if (m.emissive) {
                m.emissive.setRGB(
                    glowColor.r * current_.glow,
                    glowColor.g * current_.glow,
                    glowColor.b * current_.glow,
                );
            }
        }
    });

    let state = 'idle';
    const strikeListeners = new Set();

    function onStrike(fn) {
        strikeListeners.add(fn);
        return () => strikeListeners.delete(fn);
    }

    async function playMove(name) {
        const move = MOVES[name];
        if (!move || state !== 'idle') return false;

        // 1. Telegraph: lean back and glow
        state = 'windup';
        target.lean = -0.18;
        target.glow = name === 'uppercut' ? 0.9 : 0.55;
        await wait(move.windup);

        // 2. Strike: punch, lunge forward, announce the hit
        state = 'strike';
        target.lean = 0.12;
        target.z = 0.45;
        target.glow = 0;
        const duration = playAnim('Punch', { once: true, fade: 0.08 });
        await wait(STRIKE_DELAY);
        for (const fn of strikeListeners) fn({ move: name, damage: move.damage });

        // 3. Recover back to idle
        await wait(Math.max(0, duration - STRIKE_DELAY - 150));
        target.lean = 0;
        target.z = 0;
        playAnim('Idle');
        state = 'idle';
        return true;
    }

    function takeHit() {
        target.glow = 1;
        setTimeout(() => { target.glow = 0; }, 120);
    }

    return { pivot, gltf, playAnim, playMove, onStrike, takeHit, isBusy: () => state !== 'idle' };
}