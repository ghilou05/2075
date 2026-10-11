import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';


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

    return { pivot, gltf }; 
}