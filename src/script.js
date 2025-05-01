import GUI from "lil-gui";
import * as THREE from "three/webgpu";
import { Timer } from "three/addons/misc/Timer.js";
import {
  color,
  computeSkinning,
  objectWorldMatrix,
  instancedArray,
  instanceIndex,
  Fn,
  shapeCircle,
  uniform,
  storage,
  vec2,
  vec3,
  atan,
  PI,
  PI2,
  sin,
  cos,
  mix,
  float,
  max,
  min,
  mx_fractal_noise_float,
  mx_fractal_noise_vec3,
  If,
  Loop,
  pcurve,
  hash,
  deltaTime,
  time,
  uv,
  hue,
} from "three/tsl";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const gui = new GUI({
  width: 400,
});

let camera, scene, renderer;
let mixer, clock, controls, timer, updateParticles, spawnParticles;
let getInstanceColor; // TSL function
const screenPointer = new THREE.Vector2(0, 0);
const scenePointer = new THREE.Vector3();
const raycastPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const raycaster = new THREE.Raycaster();
let light; // Add this line to define light
let postProcessing = { render: () => {} }; // Add empty postProcessing object with render method
const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
};
const timeScale = uniform(1.0);
const particleLifetime = uniform(0.5);
const particleSize = uniform(1.0);
const linksWidth = uniform(0.005);

const colorOffset = uniform(0.0);
const colorVariance = uniform(2.0);
const colorRotationSpeed = uniform(1.0);

const spawnIndex = uniform(0);
const nbToSpawn = uniform(5);
const spawnPosition = uniform(vec3(0.0));
const previousSpawnPosition = uniform(vec3(0.0));

const turbFrequency = uniform(0.5);
const turbAmplitude = uniform(0.5);
const turbOctaves = uniform(2);
const turbLacunarity = uniform(2.0);
const turbGain = uniform(0.5);
const turbFriction = uniform(0.01);
const nbParticles = Math.pow(2, 13);

init();
timer = new Timer();
timer.connect(document);

function init() {
  camera = new THREE.PerspectiveCamera(70, sizes.width / sizes.height, 1, 1000);
  camera.position.set(2, 2, 2);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);

  // Add axes helper
  const axesHelper = new THREE.AxesHelper(100);
  scene.add(axesHelper);

  camera.lookAt(0, 0, -85);

  scene.add(new THREE.AmbientLight(0xffffff, 10));

  clock = new THREE.Clock();

  const loader = new GLTFLoader();
  loader.load("./michelle.glb", function (gltf) {
    const object = gltf.scene;
    mixer = new THREE.AnimationMixer(object);
    const uSize = uniform(2);

    const action = mixer.clipAction(gltf.animations[0]);
    action.play();

    object.traverse(function (child) {
      if (child.isMesh) {
        child.visible = false;

        const countOfPoints = child.geometry.getAttribute("position").count;

        const pointPositionArray = instancedArray(countOfPoints, "vec3").setPBO(
          true
        );
        const pointSpeedArray = instancedArray(countOfPoints, "vec3").setPBO(
          true
        );

        const pointSpeedAttribute = pointSpeedArray.toAttribute();
        const skinningPosition = computeSkinning(child);

        const materialPoints = new THREE.PointsNodeMaterial();
        materialPoints.colorNode = pointSpeedAttribute
          .mul(100)
          .mix(color(0x0066ff), color(0xff9000));
        materialPoints.opacityNode = shapeCircle();
        materialPoints.sizeNode = pointSpeedAttribute
          .length()
          .exp()
          .min(5)
          .mul(uSize);
        materialPoints.sizeAttenuation = false;

        materialPoints.positionNode = Fn(() => {
          const pointPosition = pointPositionArray.element(instanceIndex);
          const pointSpeed = pointSpeedArray.element(instanceIndex);

          const skinningWorldPosition =
            objectWorldMatrix(child).mul(skinningPosition);

          const skinningSpeed = skinningWorldPosition.sub(pointPosition);

          pointSpeed.assign(skinningSpeed);
          pointPosition.assign(skinningWorldPosition);

          return pointPositionArray.toAttribute();
        })().compute(countOfPoints);

        const pointCloud = new THREE.Sprite(materialPoints);
        pointCloud.count = countOfPoints;
        scene.add(pointCloud);
      }
    });

    object.scale.set(1, 1, 1);

    scene.add(object);
    gui.add(uSize, "value").min(0).max(5).name("uSize");
  });

  //renderer

  renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setAnimationLoop(animate);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.body.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  vfxParticles();
  window.addEventListener("resize", onWindowResize);
}

function vfxParticles() {
  // TSL function
  // current color from index
  getInstanceColor = /*#__PURE__*/ Fn(([i]) => {
    return hue(
      color(0x0000ff),
      colorOffset.add(
        mx_fractal_noise_float(i.toFloat().mul(0.1), 2, 2.0, 0.5, colorVariance)
      )
    );
  });

  // Particles
  // storage buffers
  const particlePositions = storage(
    new THREE.StorageInstancedBufferAttribute(nbParticles, 4),
    "vec4",
    nbParticles
  );
  const particleVelocities = storage(
    new THREE.StorageInstancedBufferAttribute(nbParticles, 4),
    "vec4",
    nbParticles
  );

  // init particles buffers
  renderer.computeAsync(
    /*#__PURE__*/ Fn(() => {
      particlePositions.element(instanceIndex).xyz.assign(vec3(10000.0));
      particlePositions.element(instanceIndex).w.assign(vec3(-1.0)); // life is stored in w component; x<0 means dead
    })().compute(nbParticles)
  );

  // particles output
  const particleQuadSize = 0.05;
  const particleGeom = new THREE.PlaneGeometry(
    particleQuadSize,
    particleQuadSize
  );

  const particleMaterial = new THREE.SpriteNodeMaterial();
  particleMaterial.blending = THREE.AdditiveBlending;
  particleMaterial.depthWrite = false;
  particleMaterial.positionNode = particlePositions.toAttribute();
  particleMaterial.scaleNode = vec2(particleSize);
  particleMaterial.rotationNode = atan(
    particleVelocities.toAttribute().y,
    particleVelocities.toAttribute().x
  );

  particleMaterial.colorNode = /*#__PURE__*/ Fn(() => {
    const life = particlePositions.toAttribute().w;
    const modLife = pcurve(life.oneMinus(), 8.0, 1.0);
    const pulse = pcurve(
      sin(hash(instanceIndex).mul(PI2).add(time.mul(0.5).mul(PI2)))
        .mul(0.5)
        .add(0.5),
      0.25,
      0.25
    )
      .mul(10.0)
      .add(1.0);

    return getInstanceColor(instanceIndex).mul(pulse.mul(modLife));
  })();

  particleMaterial.opacityNode = /*#__PURE__*/ Fn(() => {
    const circle = uv().xy.sub(0.5).length().step(0.5);
    const life = particlePositions.toAttribute().w;

    return circle.mul(life);
  })();

  const particleMesh = new THREE.InstancedMesh(
    particleGeom,
    particleMaterial,
    nbParticles
  );
  particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  particleMesh.frustumCulled = false;

  scene.add(particleMesh);

  // Links between particles
  // first, we define the indices for the links, 2 quads per particle, the indexation is fixed
  const linksIndices = [];
  for (let i = 0; i < nbParticles; i++) {
    const baseIndex = i * 8;
    for (let j = 0; j < 2; j++) {
      const offset = baseIndex + j * 4;
      linksIndices.push(
        offset,
        offset + 1,
        offset + 2,
        offset,
        offset + 2,
        offset + 3
      );
    }
  }

  // storage buffers attributes for the links
  const nbVertices = nbParticles * 8;
  const linksVerticesSBA = new THREE.StorageBufferAttribute(nbVertices, 4);
  const linksColorsSBA = new THREE.StorageBufferAttribute(nbVertices, 4);

  // links output
  const linksGeom = new THREE.BufferGeometry();
  linksGeom.setAttribute("position", linksVerticesSBA);
  linksGeom.setAttribute("color", linksColorsSBA);
  linksGeom.setIndex(linksIndices);

  const linksMaterial = new THREE.MeshBasicNodeMaterial();
  linksMaterial.vertexColors = true;
  linksMaterial.side = THREE.DoubleSide;
  linksMaterial.transparent = true;
  linksMaterial.depthWrite = false;
  linksMaterial.depthTest = false;
  linksMaterial.blending = THREE.AdditiveBlending;
  linksMaterial.opacityNode = storage(
    linksColorsSBA,
    "vec4",
    linksColorsSBA.count
  ).toAttribute().w;

  const linksMesh = new THREE.Mesh(linksGeom, linksMaterial);
  linksMesh.frustumCulled = false;
  scene.add(linksMesh);

  // compute nodes
  updateParticles = /*#__PURE__*/ Fn(() => {
    const position = particlePositions.element(instanceIndex).xyz;
    const life = particlePositions.element(instanceIndex).w;
    const velocity = particleVelocities.element(instanceIndex).xyz;
    const dt = deltaTime.mul(0.1).mul(timeScale);

    If(life.greaterThan(0.0), () => {
      // first we update the particles positions and velocities
      // velocity comes from a turbulence field, and is multiplied by the particle lifetime so that it slows down over time
      const localVel = mx_fractal_noise_vec3(
        position.mul(turbFrequency),
        turbOctaves,
        turbLacunarity,
        turbGain,
        turbAmplitude
      ).mul(life.add(0.01));
      velocity.addAssign(localVel);
      velocity.mulAssign(turbFriction.oneMinus());
      position.addAssign(velocity.mul(dt));

      // then we decrease the lifetime
      life.subAssign(dt.mul(particleLifetime.reciprocal()));

      // then we find the two closest particles and set a quad to each of them
      const closestDist1 = float(10000.0).toVar();
      const closestPos1 = vec3(0.0).toVar();
      const closestLife1 = float(0.0).toVar();
      const closestDist2 = float(10000.0).toVar();
      const closestPos2 = vec3(0.0).toVar();
      const closestLife2 = float(0.0).toVar();

      Loop(nbParticles, ({ i }) => {
        const otherPart = particlePositions.element(i);

        If(i.notEqual(instanceIndex).and(otherPart.w.greaterThan(0.0)), () => {
          // if not self and other particle is alive

          const otherPosition = otherPart.xyz;
          const dist = position.sub(otherPosition).lengthSq();
          const moreThanZero = dist.greaterThan(0.0);

          If(dist.lessThan(closestDist1).and(moreThanZero), () => {
            closestDist1.assign(dist);
            closestPos1.assign(otherPosition.xyz);
            closestLife1.assign(otherPart.w);
          }).ElseIf(dist.lessThan(closestDist2).and(moreThanZero), () => {
            closestDist2.assign(dist);
            closestPos2.assign(otherPosition.xyz);
            closestLife2.assign(otherPart.w);
          });
        });
      });

      // then we update the links correspondingly
      const linksPositions = storage(
        linksVerticesSBA,
        "vec4",
        linksVerticesSBA.count
      );
      const linksColors = storage(linksColorsSBA, "vec4", linksColorsSBA.count);
      const firstLinkIndex = instanceIndex.mul(8);
      const secondLinkIndex = firstLinkIndex.add(4);

      // positions link 1
      linksPositions.element(firstLinkIndex).xyz.assign(position);
      linksPositions.element(firstLinkIndex).y.addAssign(linksWidth);
      linksPositions.element(firstLinkIndex.add(1)).xyz.assign(position);
      linksPositions
        .element(firstLinkIndex.add(1))
        .y.addAssign(linksWidth.negate());
      linksPositions.element(firstLinkIndex.add(2)).xyz.assign(closestPos1);
      linksPositions
        .element(firstLinkIndex.add(2))
        .y.addAssign(linksWidth.negate());
      linksPositions.element(firstLinkIndex.add(3)).xyz.assign(closestPos1);
      linksPositions.element(firstLinkIndex.add(3)).y.addAssign(linksWidth);

      // positions link 2
      linksPositions.element(secondLinkIndex).xyz.assign(position);
      linksPositions.element(secondLinkIndex).y.addAssign(linksWidth);
      linksPositions.element(secondLinkIndex.add(1)).xyz.assign(position);
      linksPositions
        .element(secondLinkIndex.add(1))
        .y.addAssign(linksWidth.negate());
      linksPositions.element(secondLinkIndex.add(2)).xyz.assign(closestPos2);
      linksPositions
        .element(secondLinkIndex.add(2))
        .y.addAssign(linksWidth.negate());
      linksPositions.element(secondLinkIndex.add(3)).xyz.assign(closestPos2);
      linksPositions.element(secondLinkIndex.add(3)).y.addAssign(linksWidth);

      // colors are the same for all vertices of both quads
      const linkColor = getInstanceColor(instanceIndex);

      // store the minimum lifetime of the closest particles in the w component of colors
      const l1 = max(0.0, min(closestLife1, life)).pow(0.8); // pow is here to apply a slight curve to the opacity
      const l2 = max(0.0, min(closestLife2, life)).pow(0.8);

      Loop(4, ({ i }) => {
        linksColors.element(firstLinkIndex.add(i)).xyz.assign(linkColor);
        linksColors.element(firstLinkIndex.add(i)).w.assign(l1);
        linksColors.element(secondLinkIndex.add(i)).xyz.assign(linkColor);
        linksColors.element(secondLinkIndex.add(i)).w.assign(l2);
      });
    });
  })().compute(nbParticles);

  spawnParticles = /*#__PURE__*/ Fn(() => {
    const particleIndex = spawnIndex
      .add(instanceIndex)
      .mod(nbParticles)
      .toInt();
    const position = particlePositions.element(particleIndex).xyz;
    const life = particlePositions.element(particleIndex).w;
    const velocity = particleVelocities.element(particleIndex).xyz;

    life.assign(1.0); // sets it alive

    // random spherical direction
    const rRange = float(0.01);
    const rTheta = hash(particleIndex).mul(PI2);
    const rPhi = hash(particleIndex.add(1)).mul(PI);
    const rx = sin(rTheta).mul(cos(rPhi));
    const ry = sin(rTheta).mul(sin(rPhi));
    const rz = cos(rTheta);
    const rDir = vec3(rx, ry, rz);

    // position is interpolated between the previous cursor position and the current one over the number of particles spawned
    const pos = mix(
      previousSpawnPosition,
      spawnPosition,
      instanceIndex.toFloat().div(nbToSpawn.sub(1).toFloat()).clamp()
    );
    position.assign(pos.add(rDir.mul(rRange)));

    // start in that direction
    velocity.assign(rDir.mul(5.0));
  })().compute(nbToSpawn.value);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

function updatePointer() {
  raycaster.setFromCamera(screenPointer, camera);
  raycaster.ray.intersectPlane(raycastPlane, scenePointer);
}

// pointer handling
window.addEventListener("pointermove", (event) => {
  screenPointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  screenPointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
});

function animate() {
  if (timer) timer.update();

  // compute particles
  if (updateParticles) renderer.compute(updateParticles);
  if (spawnParticles) renderer.compute(spawnParticles);

  // update particle index for next spawn
  if (spawnIndex && nbToSpawn) {
    spawnIndex.value = (spawnIndex.value + nbToSpawn.value) % nbParticles;
  }

  // update raycast plane to face camera
  raycastPlane.normal.applyEuler(camera.rotation);
  updatePointer();

  // lerping spawn position
  if (previousSpawnPosition && spawnPosition) {
    previousSpawnPosition.value.copy(spawnPosition.value);
    spawnPosition.value.lerp(scenePointer, 0.1);
  }

  // rotating colors
  if (colorOffset && timer && timeScale && colorRotationSpeed) {
    colorOffset.value +=
      timer.getDelta() * colorRotationSpeed.value * timeScale.value;
  }

  //   const elapsedTime = timer ? timer.getElapsed() : 0;

  //   if (light) {
  //     light.position.set(
  //       Math.sin(elapsedTime * 0.5) * 30,
  //       Math.cos(elapsedTime * 0.3) * 30,
  //       Math.sin(elapsedTime * 0.2) * 30
  //     );
  //   }

  //   if (postProcessing) postProcessing.render();
  const delta = clock.getDelta();

  if (mixer) mixer.update(delta);

  controls.update();
  renderer.render(scene, camera);
}
