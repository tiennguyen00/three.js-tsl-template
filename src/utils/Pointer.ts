/**
 * Modified version of Christophe Choffel's Pointer class
 *
 * https://github.com/ULuIQ12/webgpu-tsl-linkedparticles/blob/main/src/lib/utils/Pointer.ts
 */
import { uniform } from "three/tsl";
import {
  Camera,
  Plane,
  Raycaster,
  Vector2,
  Vector3,
  WebGPURenderer,
  Euler,
  Object3D,
  UniformNode,
} from "three/webgpu";

export interface PointerController {
  camera: Camera;
  renderer: WebGPURenderer;
  delta: number;
  rayCaster: Raycaster;
  initPlane: Plane;
  iPlane: Plane;
  clientPointer: Vector2;
  pointer: Vector2;
  scenePointer: Vector3;
  pointerDown: boolean;
  uPointerDown: UniformNode;
  uPointer: UniformNode;
  uPointerVelocity: UniformNode;
  update: (delta?: number) => void;
  destroy: () => void;
}

export function createPointer(
  renderer: WebGPURenderer,
  camera: Camera,
  plane: Plane
): PointerController {
  const pointerController: PointerController = {
    camera,
    renderer,
    delta: 0,
    rayCaster: new Raycaster(),
    initPlane: plane,
    iPlane: plane.clone(),
    clientPointer: new Vector2(-999),
    pointer: new Vector2(),
    scenePointer: new Vector3(),
    pointerDown: false,
    uPointerDown: uniform(0),
    uPointer: uniform(new Vector3()),
    uPointerVelocity: uniform(new Vector3()),
    update,
    destroy,
  };

  function onPointerDown(e: Event): void {
    const pointerEvent = e as PointerEvent;
    if (pointerEvent.pointerType !== "mouse" || pointerEvent.button === 0) {
      pointerController.pointerDown = true;
      pointerController.uPointerDown.value = 1;
    }

    pointerController.clientPointer.set(
      pointerEvent.clientX,
      pointerEvent.clientY
    );
    updateScreenPointer(pointerEvent);
  }

  function onPointerUp(e: Event): void {
    const pointerEvent = e as PointerEvent;
    pointerController.clientPointer.set(
      pointerEvent.clientX,
      pointerEvent.clientY
    );
    updateScreenPointer(pointerEvent);
    pointerController.pointerDown = false;
    pointerController.uPointerDown.value = 0;
  }

  function onPointerMove(e: Event): void {
    const pointerEvent = e as PointerEvent;
    pointerController.clientPointer.set(
      pointerEvent.clientX,
      pointerEvent.clientY
    );
    updateScreenPointer(pointerEvent);
  }

  function updateScreenPointer(e?: PointerEvent): void {
    if (e == null || e == undefined) {
      e = {
        clientX: pointerController.clientPointer.x,
        clientY: pointerController.clientPointer.y,
      } as PointerEvent;
    }

    const canvas = pointerController.renderer.domElement;
    const width =
      canvas instanceof HTMLCanvasElement ? canvas.offsetWidth : canvas.width;
    const height =
      canvas instanceof HTMLCanvasElement ? canvas.offsetHeight : canvas.height;

    pointerController.pointer.set(
      (e.clientX / width) * 2 - 1,
      -(e.clientY / height) * 2 + 1
    );
    pointerController.rayCaster.setFromCamera(
      pointerController.pointer,
      pointerController.camera
    );
    pointerController.rayCaster.ray.intersectPlane(
      pointerController.iPlane,
      pointerController.scenePointer
    );
    pointerController.uPointerVelocity.value.addScalar(
      pointerController.scenePointer.distanceTo(
        pointerController.uPointer.value
      )
    );
    const damp =
      1 - Math.exp(-0.55 * 1000 * Math.max(0.001, pointerController.delta));
    pointerController.uPointerVelocity.value.multiplyScalar(damp);
    pointerController.uPointer.value.x = pointerController.scenePointer.x;
    pointerController.uPointer.value.y = pointerController.scenePointer.y;
    pointerController.uPointer.value.z = pointerController.scenePointer.z;
  }

  function update(delta?: number): void {
    if (typeof delta === "number") {
      pointerController.delta = delta;
    }

    // Get rotation from camera (safely checking if camera is an Object3D with rotation)
    const cameraRotation = new Euler();
    const cameraObj = pointerController.camera as unknown as Object3D;
    if (cameraObj && cameraObj.rotation) {
      cameraRotation.copy(cameraObj.rotation);
    }

    pointerController.iPlane.normal
      .copy(pointerController.initPlane.normal)
      .applyEuler(cameraRotation);
    updateScreenPointer();
  }

  function destroy(): void {
    const canvas = pointerController.renderer.domElement;
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointermove", onPointerMove);
  }

  // Set up event listeners
  const canvas = renderer.domElement;
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointermove", onPointerMove);

  return pointerController;
}
