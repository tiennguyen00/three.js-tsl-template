import GUI from "lil-gui";
import * as THREE from "three/webgpu";
import {
  sin,
  positionLocal,
  time,
  vec2,
  vec3,
  vec4,
  uv,
  uniform,
  color,
  fog,
  rangeFogFactor,
  pass,
  renderOutput,
} from "three/tsl";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Timer } from "three/addons/misc/Timer.js";

/**
 * Base
 */
const raycastPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

// Debug
const gui = new GUI({
  width: 400,
});

/**
 * Loaders
 */
let position = [];

const loader = new GLTFLoader();
let screenPointer = new THREE.Vector2();
let raycaster = new THREE.Raycaster();
let intersectionPoint = new THREE.Vector3();

const PARTICLE_SETTINGS = {
  count: 1000,
  spawnRate: 5,
  lifeSpan: 10,
  scale: { min: 0.1, max: 0.15 },
  velocity: { min: -0.5, max: 0.1 },
};

let instancedMesh;
let pedalGeometry, pedalMaterial;

// Particle data arrays
const particlePositions = new Array(PARTICLE_SETTINGS.count)
  .fill()
  .map(() => new THREE.Vector3());
const particleScales = new Array(PARTICLE_SETTINGS.count)
  .fill()
  .map(() => new THREE.Vector3(1, 1, 1));
const particleVelocities = new Array(PARTICLE_SETTINGS.count)
  .fill()
  .map(() => new THREE.Vector3());
const particleLives = new Float32Array(PARTICLE_SETTINGS.count);
const particleActive = new Array(PARTICLE_SETTINGS.count).fill(false);
let nextParticleIndex = 0;

// Add arrays for random rotation axis and speed
const particleRotAxes = new Array(PARTICLE_SETTINGS.count)
  .fill()
  .map(() => new THREE.Vector3());
const particleRotSpeeds = new Float32Array(PARTICLE_SETTINGS.count);

// Mouse move event listener
window.addEventListener("pointermove", (event) => {
  screenPointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  screenPointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
});

loader.load("./petals.glb", function (gltf) {
  // Find the first mesh in the loaded scene
  let mesh = null;
  gltf.scene.traverse((child) => {
    if (child.isMesh && !mesh) {
      mesh = child;
    }
  });
  if (!mesh) {
    console.error("No mesh found in GLTF");
    return;
  }
  console.log(mesh.material);
  pedalGeometry = mesh.geometry;
  pedalMaterial = mesh.material;

  // pedalMaterial = mesh.material.clone();
  // pedalMaterial.map = null; // <--- Remove the texture map
  // pedalMaterial.color.set("#FF69B4"); // Set your desired color (e.g., pink)
  // pedalMaterial.needsUpdate = true;

  instancedMesh = new THREE.InstancedMesh(
    pedalGeometry,
    pedalMaterial,
    PARTICLE_SETTINGS.count
  );
  instancedMesh.material.color.set("#FF0000");
  instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(instancedMesh);
});

// Canvas
const canvas = document.querySelector("canvas.webgl");

// Scene
const scene = new THREE.Scene();
// const fogColor = uniform(color("#ffffff"));
// scene.fogNode = fog(fogColor, rangeFogFactor(10, 15));

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
  25,
  sizes.width / sizes.height,
  0.1,
  100
);
camera.position.x = 6;
camera.position.y = 3;
camera.position.z = 10;
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
renderer.setClearColor(0xbdb3be);

/**
 * Post processing
 */

// postProcessing.outputNode = outputPass

/**
 * Dummy
 */
// Material
const material = new THREE.MeshBasicNodeMaterial();

// Uniforms
let range = {
  value: 0.5,
};

// Tweaks
gui.add(range, "value").min(0).max(5).name("range");

const clock = new THREE.Clock();

function spawnParticle(position) {
  const index = nextParticleIndex;
  nextParticleIndex = (nextParticleIndex + 1) % PARTICLE_SETTINGS.count;

  particleActive[index] = true;
  particleLives[index] = 0;

  // Set initial position with random offset
  particlePositions[index].copy(position);
  particlePositions[index].x += Math.random() * 2 * range.value - range.value;
  particlePositions[index].y += Math.random() * 2 * range.value - range.value;
  particlePositions[index].z += Math.random() * 2 * range.value - range.value;

  // Set random scale
  const scale =
    PARTICLE_SETTINGS.scale.min +
    Math.random() * (PARTICLE_SETTINGS.scale.max - PARTICLE_SETTINGS.scale.min);
  particleScales[index].set(scale, scale, scale);

  // Set random velocity
  particleVelocities[index].set(
    PARTICLE_SETTINGS.velocity.min +
      Math.random() *
        (PARTICLE_SETTINGS.velocity.max - PARTICLE_SETTINGS.velocity.min),
    PARTICLE_SETTINGS.velocity.min +
      Math.random() *
        (PARTICLE_SETTINGS.velocity.max - PARTICLE_SETTINGS.velocity.min),
    PARTICLE_SETTINGS.velocity.min +
      Math.random() *
        (PARTICLE_SETTINGS.velocity.max - PARTICLE_SETTINGS.velocity.min)
  );

  // Set random rotation axis and speed
  particleRotAxes[index]
    .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
    .normalize();
  particleRotSpeeds[index] = Math.random() * 2 + 0.5; // random speed between 0.5 and 2.5
}

function updateParticles(deltaTime, elapsedTime) {
  if (!instancedMesh) return;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < PARTICLE_SETTINGS.count; i++) {
    if (!particleActive[i]) {
      // Hide by moving far away
      dummy.position.set(9999, 9999, 9999);
      dummy.scale.set(0, 0, 0);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
      continue;
    }
    particleLives[i] += deltaTime;
    // Update position
    particlePositions[i].addScaledVector(particleVelocities[i], deltaTime);
    // Fade out based on life
    const lifeRatio = 1 - particleLives[i] / PARTICLE_SETTINGS.lifeSpan;
    dummy.position.copy(particlePositions[i]);
    dummy.scale.copy(particleScales[i]).multiplyScalar(lifeRatio);
    // Apply random rotation
    const axis = particleRotAxes[i];
    const speed = particleRotSpeeds[i];
    dummy.setRotationFromAxisAngle(axis, elapsedTime * speed);
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(i, dummy.matrix);
    // Deactivate if life is over
    if (particleLives[i] >= PARTICLE_SETTINGS.lifeSpan) {
      particleActive[i] = false;
    }
  }
  instancedMesh.instanceMatrix.needsUpdate = true;
}

/**
 * Animate
 */
const tick = () => {
  const deltaTime = clock.getDelta();
  const elapsedTime = clock.getElapsedTime();

  // Update controls
  controls.update();

  // Update raycast plane to face camera
  raycastPlane.normal.set(0, 0, 1).applyQuaternion(camera.quaternion);
  raycastPlane.constant = 0;

  // Cast ray and spawn particles
  raycaster.setFromCamera(screenPointer, camera);
  if (raycaster.ray.intersectPlane(raycastPlane, intersectionPoint)) {
    for (let i = 0; i < PARTICLE_SETTINGS.spawnRate; i++) {
      spawnParticle(intersectionPoint);
    }
  }

  // Update all particles
  updateParticles(deltaTime, elapsedTime);

  // Render
  renderer.render(scene, camera);
};
renderer.setAnimationLoop(tick);
