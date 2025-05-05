import GUI from "lil-gui";
import * as THREE from "three/webgpu";
import { pass, range, oscSine, time, mix, normalWorld } from "three/tsl";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { bloom } from "three/addons/tsl/display/BloomNode.js";

import Stats from "three/addons/libs/stats.module.js";

/**
 * Base
 */
const raycastPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

// Debug
const gui = new GUI({
  width: 200,
});

/**
 * Loaders
 */

const loader = new GLTFLoader();
let screenPointer = new THREE.Vector2();
let raycaster = new THREE.Raycaster();
let intersectionPoint = new THREE.Vector3();
let pointerInitialized = false;

const PETAL_SETTINGS = {
  count: 1000,
  spawnRate: 2,
  lifeSpan: 5,
  scale: { min: 0.085, max: 0.15 },
  velocity: { min: -0.5, max: 0.1 },
  range: 0.4,
};

const PARAMS = {
  threshold: 0,
  strength: 0.5,
  radius: 0,
  exposure: 1,
};

let instancedMesh;
let pedalGeometry, pedalMaterial;

// Particle data arrays
const particlePositions = new Array(PETAL_SETTINGS.count)
  .fill()
  .map(() => new THREE.Vector3());
const particleScales = new Array(PETAL_SETTINGS.count)
  .fill()
  .map(() => new THREE.Vector3(1, 1, 1));
const particleVelocities = new Array(PETAL_SETTINGS.count)
  .fill()
  .map(() => new THREE.Vector3());
const particleLives = new Float32Array(PETAL_SETTINGS.count);
const particleActive = new Array(PETAL_SETTINGS.count).fill(false);
let nextParticleIndex = 0;

// Add arrays for random rotation axis and speed
const particleRotAxes = new Array(PETAL_SETTINGS.count)
  .fill()
  .map(() => new THREE.Vector3());
const particleRotSpeeds = new Float32Array(PETAL_SETTINGS.count);

// Mouse move event listener
window.addEventListener("pointermove", (event) => {
  screenPointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  screenPointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  pointerInitialized = true;
  instancedMesh.visible = true;
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
  pedalGeometry = mesh.geometry;
  pedalGeometry.rotateX(Math.PI / 2);

  const material = new THREE.MeshBasicMaterial();

  // random colors between instances from 0x000000 to 0xFFFFFF
  const randomColors = range(
    new THREE.Color(0x000000),
    new THREE.Color(0xffffff)
  );

  material.colorNode = mix(normalWorld, randomColors, oscSine(time.mul(0.1)));

  pedalMaterial = mesh.material;

  instancedMesh = new THREE.InstancedMesh(
    pedalGeometry,
    pedalMaterial,
    PETAL_SETTINGS.count
  );
  instancedMesh.material.color.set("#FF0000");
  instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  instancedMesh.visible = false;
  scene.add(instancedMesh);
});

// Declare this before the loader.load call

let katanaControls = {
  x: -0.14353972590668,
  y: -1.07442468752771,
  z: -1.30061935858617,
};

loader.load("./cherry_katana.glb", function (gltf) {
  const katanaModel = gltf.scene;
  katanaModel.scale.set(0.4, 0.4, 0.4);
  // katanaModel.rotateX(Math.PI / 2);
  katanaModel.rotation.x = katanaControls.x;
  katanaModel.rotation.y = katanaControls.y;
  katanaModel.rotation.z = katanaControls.z;
  scene.add(katanaModel);
});

// Canvas
const canvas = document.querySelector("canvas.webgl");

// Scene
const scene = new THREE.Scene();
// const fogColor = uniform(color("#ffffff"));
// scene.fogNode = fog(fogColor, rangeFogFactor(10, 15));

/**
 * Lights
 */
const ambientLight = new THREE.AmbientLight(0xcccccc);
scene.add(ambientLight);

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
const pointLight = new THREE.SpotLight(0xffffff, 50);
camera.add(pointLight);

// Controls
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enableZoom = false;
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
 * Post processing
 */
const postProcessing = new THREE.PostProcessing(renderer);
const scenePass = pass(scene, camera);
const scenePassColor = scenePass.getTextureNode("output");
const bloomPass = bloom(scenePassColor);
postProcessing.outputNode = scenePassColor.add(bloomPass);

/**
 * GUI
 */
const bloomFolder = gui.addFolder("bloom");
bloomFolder.add(PARAMS, "threshold", 0.0, 1.0).onChange(function (value) {
  bloomPass.threshold.value = value;
});
bloomFolder.add(PARAMS, "strength", 0.0, 3.0).onChange(function (value) {
  bloomPass.strength.value = value;
});
gui
  .add(PARAMS, "radius", 0.0, 1.0)
  .step(0.01)
  .onChange(function (value) {
    bloomPass.radius.value = value;
  });
bloomFolder.add(PARAMS, "exposure", 0.1, 2).onChange(function (value) {
  renderer.toneMappingExposure = Math.pow(value, 4.0);
});

const petalsFolder = gui.addFolder("petals");
petalsFolder.add(PETAL_SETTINGS, "range", 0.2, 1);
petalsFolder.add(PETAL_SETTINGS.scale, "min", 0.05, 0.99).name("minScale");
petalsFolder.add(PETAL_SETTINGS.scale, "max", 0.1, 0.15).name("maxScale");
petalsFolder.add(PETAL_SETTINGS, "spawnRate", 1, 10);
/**
 * Stats
 */
const stats = new Stats();
document.body.appendChild(stats.dom);

/**
 * Dummy
 */
// Material
const material = new THREE.MeshBasicNodeMaterial();

const clock = new THREE.Clock();

function spawnParticle(position) {
  const index = nextParticleIndex;
  nextParticleIndex = (nextParticleIndex + 1) % PETAL_SETTINGS.count;

  particleActive[index] = true;
  particleLives[index] = 0;

  // Set initial position with random offset
  particlePositions[index].copy(position);
  particlePositions[index].x +=
    Math.random() * 2 * PETAL_SETTINGS.range - PETAL_SETTINGS.range;
  particlePositions[index].y +=
    Math.random() * 2 * PETAL_SETTINGS.range - PETAL_SETTINGS.range;
  particlePositions[index].z +=
    Math.random() * 2 * PETAL_SETTINGS.range - PETAL_SETTINGS.range;

  // Set random scale
  const scale =
    PETAL_SETTINGS.scale.min +
    Math.random() * (PETAL_SETTINGS.scale.max - PETAL_SETTINGS.scale.min);
  particleScales[index].set(scale, scale, scale);

  // Set random velocity
  particleVelocities[index].set(
    PETAL_SETTINGS.velocity.min +
      Math.random() *
        (PETAL_SETTINGS.velocity.max - PETAL_SETTINGS.velocity.min),
    PETAL_SETTINGS.velocity.min +
      Math.random() *
        (PETAL_SETTINGS.velocity.max - PETAL_SETTINGS.velocity.min),
    PETAL_SETTINGS.velocity.min +
      Math.random() *
        (PETAL_SETTINGS.velocity.max - PETAL_SETTINGS.velocity.min)
  );

  // Set random rotation axis and speed
  particleRotAxes[index]
    .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
    .normalize();
  particleRotSpeeds[index] = Math.random() * 2 + 0.5;
}

function updateParticles(deltaTime, elapsedTime) {
  if (!instancedMesh) return;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < PETAL_SETTINGS.count; i++) {
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
    const lifeRatio = 1 - particleLives[i] / PETAL_SETTINGS.lifeSpan;
    dummy.position.copy(particlePositions[i]);
    dummy.scale.copy(particleScales[i]).multiplyScalar(lifeRatio);
    // Apply random rotation
    const axis = particleRotAxes[i];
    const speed = particleRotSpeeds[i];
    dummy.setRotationFromAxisAngle(axis, elapsedTime * speed);
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(i, dummy.matrix);
    // Deactivate if life is over
    if (particleLives[i] >= PETAL_SETTINGS.lifeSpan) {
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
  if (
    raycaster.ray.intersectPlane(raycastPlane, intersectionPoint) &&
    pointerInitialized
  ) {
    for (let i = 0; i < PETAL_SETTINGS.spawnRate; i++) {
      spawnParticle(intersectionPoint);
    }

    // Update all particles
    updateParticles(deltaTime, elapsedTime);
  }

  // Render
  postProcessing.render();
  stats.update();
};
renderer.setAnimationLoop(tick);
