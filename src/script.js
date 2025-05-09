import GUI from "lil-gui";
import * as THREE from "three/webgpu";

import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import VirtualScroll from "virtual-scroll";
import {
  Fn,
  positionLocal,
  modelWorldMatrix,
  length,
  pow,
  float,
} from "three/tsl";

/**
 * Base
 */
// Debug
const gui = new GUI({
  width: 400,
});

// Canvas
const canvas = document.querySelector("canvas.webgl");

// Scene
const scene = new THREE.Scene();

// Loader
const loader = new GLTFLoader();

/**
 * Sizes
 */
const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
};

window.addEventListener("resize", () => {
  // Update sizes
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;

  // Update camera
  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();

  // Update renderer
  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

/**
 * Camera
 */
// Base camera
const camera = new THREE.PerspectiveCamera(
  70,
  sizes.width / sizes.height,
  0.01,
  100
);
camera.position.set(0, 0, 8);
scene.add(camera);

// Controls
// const controls = new OrbitControls(camera, canvas);
// controls.enableDamping = true;

// Scroll
const scroller = new VirtualScroll();
let scrollPosition = 0;
scroller.on((event) => {
  scrollPosition = event.y * 0.001;
});

/**
 * Renderer
 */
const renderer = new THREE.WebGPURenderer({
  canvas: canvas,
  forceWebGL: false,
  antialias: true,
  transparent: true,
});
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000);

/**
 * Dummy
 */

// Mesh

let t1 = new THREE.TextureLoader().load(
  `https://picsum.photos/seed/1/300/200.webp`
);
let t2 = new THREE.TextureLoader().load(
  `https://picsum.photos/seed/2/300/200.webp`
);
let t3 = new THREE.TextureLoader().load(
  `https://picsum.photos/seed/3/300/200.webp`
);
let t4 = new THREE.TextureLoader().load(
  `https://picsum.photos/seed/4/300/200.webp`
);
const tts = [t1, t2, t3, t4];
tts.forEach((t) => {
  t.colorSpace = THREE.SRGBColorSpace;
});
let slides = [];
let mat = new THREE.MeshBasicNodeMaterial();
mat.positionNode = Fn(() => {
  const position = positionLocal.xyz.toVar();
  const positionWorld = modelWorldMatrix.mul(position);

  let distanceFromCenter = length(positionWorld.x);

  position.y.mulAssign(float(1).add(pow(distanceFromCenter.mul(0.1), 2)));

  return position;
})();

const geometry = new THREE.PlaneGeometry(8, 4.5, 10, 10);
for (let i = 0; i < 6; i++) {
  const matClone = mat.clone();
  matClone.map = tts[i % tts.length];
  const slide = new THREE.Mesh(geometry, matClone);
  slide.position.set(i * 8, 0, 0);
  scene.add(slide);
  slides.push({
    mesh: slide,
    index: i,
    originalPosition: slide.position.x,
  });
}

/**
 * Animate
 */
let radius = 12;
let dist = 8;
const tick = () => {
  // Update controls
  //   controls.update();
  slides.forEach((object) => {
    object.mesh.position.x = object.originalPosition + scrollPosition;
    const angle = object.mesh.position.x * 0.08;
    let x = Math.cos(angle) * radius;
    let z = Math.sin(angle) * radius;

    // object.mesh.position.set(x, 0, z);
    // object.mesh.rotation.set(0, -angle - Math.PI * 0.5, 0);
  });

  // Render
  renderer.renderAsync(scene, camera);
};

renderer.setAnimationLoop(tick);
