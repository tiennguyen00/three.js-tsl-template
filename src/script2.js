import GUI from "lil-gui";
import * as THREE from "three/webgpu";
import {
  positionLocal,
  vec2,
  vec3,
  vec4,
  uv,
  uniform,
  color,
  fog,
  rangeFogFactor,
} from "three/tsl";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

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
const fogColor = uniform(color("#ffffff"));
scene.fogNode = fog(fogColor, rangeFogFactor(10, 15));

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
  0.1,
  100
);
camera.position.x = 3;
camera.position.y = 1.5;
camera.position.z = 6;
scene.add(camera);

// Controls
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

/**
 * Renderer
 */
const renderer = new THREE.WebGPURenderer({
  canvas: canvas,
  forceWebGL: false,
});
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000);

/**
 * Dummy
 */
// Material
const material = new THREE.MeshBasicNodeMaterial();

// Position

material.positionNode = vec3(positionLocal.x, positionLocal.y, positionLocal.z);

// Color
material.colorNode = vec4(uv().mul(vec2(32, 8)).fract(), 1, 1);

// Mesh
const torusKnot = new THREE.Mesh(
  new THREE.TorusKnotGeometry(1, 0.35, 128, 32),
  material
);
scene.add(torusKnot);

// gui.add(timeFrequency, 'value').min(0).max(5).name('timeFrequency')

/**
 * Animate
 */
const tick = () => {
  // Update controls
  controls.update();

  // Render
  renderer.render(scene, camera);
};
renderer.setAnimationLoop(tick);
