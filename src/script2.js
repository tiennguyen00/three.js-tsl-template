import GUI from "lil-gui";

import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import {
  Discard,
  Fn,
  If,
  deltaTime,
  distance,
  float,
  hash,
  instanceIndex,
  min,
  mx_fractal_noise_vec3,
  normalize,
  pass,
  screenUV,
  smoothstep,
  storage,
  time,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  color,
} from "three/tsl";
import {
  ACESFilmicToneMapping,
  ComputeNode,
  InstancedMesh,
  Mesh,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  PostProcessing,
  Scene,
  SpriteNodeMaterial,
  StorageBufferNode,
  StorageInstancedBufferAttribute,
  Vector3,
  WebGPURenderer,
} from "three/webgpu";
import { createPointer } from "./utils/Pointer";
import { curlNoise4d } from "./utils/curlNoise4d";

// Debug
const gui = new GUI({
  width: 400,
});

// Loaders
const gltfLoader = new GLTFLoader();

// Scene
const scene = new Scene();

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
const camera = new PerspectiveCamera(45, sizes.width / sizes.height, 0.1, 500);
camera.position.set(0, 0, 50);
scene.add(camera);
scene.backgroundNode = Fn(() => {
  const color = vec3(
    mx_fractal_noise_vec3(vec3(screenUV, time.mul(0.3)))
  ).toVar();
  color.mulAssign(0.03);

  return vec4(color, 1);
})();

// Model handling
let amount = 0;

let particlesBasePositionsBuffer;
let particlesPositionsBuffer;
let particlesVelocitiesBuffer;
let particlesLifeBuffer;
let updateParticlesCompute;

const params = {
  cursorRadius: 10,
  baseParticleScale: 1,
  pointerAttractionStrength: 0.015,
  hoverPower: 1,
  hoverDuration: 1,
  wanderingSpeed: 0.003,
  contactParticleScaleMultiplier: 1,

  usePostprocessing: true,

  turbFrequency: 0.5,
  turbAmplitude: 0.5,
  turbOctaves: 2,
  turbLacunarity: 2.0,
  turbGain: 0.5,
  turbFriction: 0.01,
};

const uniforms = {
  cursorRadius: uniform(params.cursorRadius),
  scale: uniform(params.baseParticleScale),
  pointerAttractionStrength: uniform(params.pointerAttractionStrength),
  hoverPower: uniform(params.hoverPower),
  hoverDuration: uniform(params.hoverDuration),
  wanderingSpeed: uniform(params.wanderingSpeed),
  contactScale: uniform(params.contactParticleScaleMultiplier),
};

// Canvas
const canvas = document.querySelector("canvas.webgl");

/**
 * Renderer
 */
const renderer = new WebGPURenderer({
  canvas: canvas,
  forceWebGL: false,
  powerPreference: "high-performance",
});
renderer.setSize(canvas.offsetWidth, canvas.offsetHeight);
renderer.toneMapping = ACESFilmicToneMapping;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000);

const pointerHandler = createPointer(
  renderer,
  camera,
  new Plane(new Vector3(0, 0, 1), 0)
);

gltfLoader.load("/face2.glb", (gltf) => {
  console.log("totoro: ", gltf);
  gltf.scene.traverse((node) => {
    if (node instanceof Mesh) {
      node.geometry.toNonIndexed();
      node.geometry.center();
      node.geometry.rotateX(-Math.PI / 2);
      amount = node.geometry.attributes.position.array.length / 3;

      particlesBasePositionsBuffer = storage(
        new StorageInstancedBufferAttribute(
          node.geometry.attributes.position.array,
          3
        ),
        "vec3",
        amount
      ).setPBO(true);

      particlesPositionsBuffer = storage(
        new StorageInstancedBufferAttribute(
          node.geometry.attributes.position.array,
          3
        ),
        "vec3",
        amount
      );

      particlesLifeBuffer = storage(
        new StorageInstancedBufferAttribute(amount, 1),
        "float",
        amount
      );

      particlesVelocitiesBuffer = storage(
        new StorageInstancedBufferAttribute(amount, 3),
        "vec3",
        amount
      );

      const strengthBuffer = storage(
        new StorageInstancedBufferAttribute(amount, 1),
        "float",
        amount
      );

      const initParticlesCompute = Fn(() => {
        particlesVelocitiesBuffer.element(instanceIndex).xyz.assign(vec3(0));
        particlesLifeBuffer
          .element(instanceIndex)
          .assign(hash(instanceIndex).mul(10));
        strengthBuffer.element(instanceIndex).assign(0);
      })().compute(amount);

      renderer.computeAsync(initParticlesCompute);

      updateParticlesCompute = Fn(() => {
        const position = particlesPositionsBuffer.element(instanceIndex);
        const basePosition =
          particlesBasePositionsBuffer.element(instanceIndex);
        const velocity = particlesVelocitiesBuffer.element(instanceIndex);
        const life = particlesLifeBuffer.element(instanceIndex);
        const strength = strengthBuffer.element(instanceIndex);

        // velocity
        const vel = mx_fractal_noise_vec3(
          position.mul(params.turbFrequency),
          params.turbOctaves,
          params.turbLacunarity,
          params.turbGain,
          params.turbAmplitude
        ).mul(life.add(0.015));
        velocity.addAssign(vel);
        velocity.mulAssign(float(params.turbFriction).oneMinus());
        // position.addAssign(velocity.mul(deltaTime));

        // Cursor based strength
        const distanceToCursor = pointerHandler.uPointer.distance(basePosition);
        const cursorStrength = float(uniforms.cursorRadius)
          .sub(distanceToCursor)
          .smoothstep(0, 1);

        strength.assign(
          strength
            .add(cursorStrength)
            .sub(deltaTime.mul(uniforms.hoverDuration))
            .clamp(0, 1)
        );

        const pointerAttractionDirection = normalize(
          position.sub(pointerHandler.uPointer)
        );
        const pointerAttraction = pointerAttractionDirection.mul(
          uniforms.pointerAttractionStrength
        );

        position.subAssign(pointerAttraction);

        const flowField = curlNoise4d(vec4(position, time)).toVar();
        const wandering = flowField.mul(uniforms.wanderingSpeed);

        position.addAssign(
          wandering.add(flowField.mul(deltaTime).mul(strength))
        );
        position.xy.addAssign(
          velocity.mul(strength).mul(deltaTime).mul(uniforms.hoverPower)
        );

        // Life
        const decayFrequency = 1;
        const distanceDecay = basePosition
          .distance(position)
          .remapClamp(0, 1, 0.2, 1);
        const newLife = life
          .add(deltaTime.mul(decayFrequency).mul(distanceDecay))
          .toVar();

        If(newLife.greaterThan(1), () => {
          position.assign(basePosition);
        });

        life.assign(newLife.mod(1));
      })().compute(amount);

      const geometry = new PlaneGeometry();

      const material = new SpriteNodeMaterial({
        depthWrite: false,
        sizeAttenuation: true,
      });

      material.positionNode = particlesPositionsBuffer.element(instanceIndex);

      material.scaleNode = Fn(() => {
        const strength = strengthBuffer.element(instanceIndex);
        const life = particlesLifeBuffer.element(instanceIndex);

        const scale = min(
          smoothstep(0, 0.1, life),
          smoothstep(0.7, 1, life).oneMinus()
        );
        scale.mulAssign(
          hash(instanceIndex)
            .remap(0.5, 1)
            .mul(
              float(0.3)
                .mul(uniforms.scale)
                .add(strength.mul(0.3).mul(uniforms.contactScale))
            )
        );

        return scale;
      })();

      material.colorNode = Fn(() => {
        const strength = strengthBuffer.element(instanceIndex);

        Discard(distance(uv(), vec2(0.5)).greaterThan(0.5));

        return vec4(
          hash(instanceIndex).add(strength),
          hash(instanceIndex.add(1)),
          hash(instanceIndex.add(2)),
          1
        );
      })();

      const mesh = new InstancedMesh(geometry, material, amount);
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      scene.add(mesh);
    }
  });
  // scene.add(gltf.scene);
});

// Controls
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.1;

// Processing
const postProcessing = new PostProcessing(renderer);
const scenePass = pass(scene, camera);
const scenePassColor = scenePass.getTextureNode("output");

const bloomPass = bloom(scenePassColor, 0.12, 0.05, 0.25);
postProcessing.outputNode = scenePassColor.add(bloomPass);
// gui.add(timeFrequency, 'value').min(0).max(5).name('timeFrequency')

/**
 * Animate
 */
const tick = async () => {
  // Update controls
  controls.update();
  pointerHandler.update();
  if (updateParticlesCompute instanceof ComputeNode) {
    await renderer.computeAsync(updateParticlesCompute);
  }

  // Render
  // renderer.renderAsync(scene, camera);
  postProcessing.renderAsync();
};
renderer.setAnimationLoop(tick);
