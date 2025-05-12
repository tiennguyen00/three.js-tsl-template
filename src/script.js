import GUI from "lil-gui";
import * as THREE from "three/webgpu";

import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import VirtualScroll from "virtual-scroll";
import { gaussianBlur } from "three/examples/jsm/tsl/display/GaussianBlurNode.js";
import {
  Fn,
  positionLocal,
  modelWorldMatrix,
  length,
  pow,
  float,
  abs,
  pass,
  mix,
  screenUV,
  smoothstep,
  vec4,
  time,
  sin,
  vec2,
  cos,
  sign,
  mx_noise_float,
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
// scene.add(new THREE.AxesHelper(10));

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
const controls = new OrbitControls(camera, canvas);
controls.enableZoom = false;
controls.enableDamping = true;

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

  // paraboi for distanceFromCenter
  position.y.mulAssign(float(1).add(pow(distanceFromCenter.mul(0.1), 2)));

  return position;
})();

const geometry = new THREE.PlaneGeometry(8, 4.5, 10, 10);
for (let i = 0; i < 6; i++) {
  const matClone = mat.clone();
  matClone.map = tts[i % tts.length];
  // matClone.side = THREE.DoubleSide;
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
 * Post Processing
 */

const postProcessing = new THREE.PostProcessing(renderer);
const screenPass = pass(scene, camera);
const screenPassColor = screenPass.getTextureNode();
// postProcessing.outputNode = mix(blurPass, normalPass, edge);
// postProcessing.outputNode = vec4(mx_noise_float(screenUV.mul(10)), 0, 0, 1);

const processUV = Fn(([uv]) => {
  let newuv = uv.sub(vec2(0.5, 0.5), 0.5).toVar();

  newuv.x.mulAssign(sign(newuv.x));
  const xx = abs(uv.x.sub(0.5).div(0.5));
  newuv.x.mulAssign(
    float(1).sub(pow(abs(newuv.x), float(0.5)).mul(float(0.6)))
  );

  newuv.y.mulAssign(float(1).sub(float(0.6).mul(pow(xx, float(1.5)))));

  newuv.addAssign(vec2(0.5, 0.5));
  newuv.x.addAssign(time.mul(0.05).mul(sign(uv.x.sub(0.5))));
  newuv.mulAssign(100);

  return newuv;
});

const noiseUV = processUV(screenUV);
const noise = mx_noise_float(noiseUV);
const angle = noise.mul(2 * Math.PI);
const direction = vec2(cos(angle), sin(angle));
const newnewUV = screenUV.add(direction.mul(noise.mul(0.1)));

postProcessing.outputNode = screenPassColor.sample(newnewUV);

/**
 * Animate
 */
let radius = 12;
let dist = 8;
const tick = () => {
  // Update controls
  controls.update();
  slides.forEach((object) => {
    object.mesh.position.x = object.originalPosition + scrollPosition;
    const angle = object.mesh.position.x * 0.08;

    // let x = Math.cos(angle) * radius;
    // let z = Math.sin(angle) * radius;
    // object.mesh.position.set(x, 0, z);
    // object.mesh.rotation.set(0, -angle - Math.PI * 0.5, 0);
  });

  // Render
  // renderer.renderAsync(scene, camera);
  postProcessing.renderAsync();
};

renderer.setAnimationLoop(tick);
