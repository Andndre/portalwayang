"use strict";

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { ARButton } from "three/examples/jsm/webxr/ARButton.js";
import { checkXRSupport } from "./util";
import "./style.css";
import { variantLaunch } from "./qr";

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const planes = ["lukisan-demo", "lukisan-2", "lukisan-3", "lukisan-4", "lukisan-5"];

/**
 * Handles the click event on the scene and changes the color of the intersected object if it is in the planes array.
 *
 * @param {MouseEvent} event - The mouse event triggered by the click.
 * @param {THREE.Camera} camera - The camera used to render the scene.
 * @param {THREE.Scene} scene - The scene containing the objects to be intersected.
 */
function onClick(event, camera, scene) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObjects(scene.children, true);

  if (intersects.length > 0) {
    const intersectedObject = intersects[0].object;

    if (planes.includes(intersectedObject.name)) {
      console.log('Object clicked:', intersectedObject);
      intersectedObject.material.color.set(0xff0000);
    }
  }
}

class SceneManager {
  constructor(renderer) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.01,
      999
    );

    this.reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial()
    );
    this.reticle.matrixAutoUpdate = false;
    this.reticle.visible = false;
    this.scene.add(this.reticle);

    /**
     * The model to be placed in the scene.
     * @type {THREE.Object3D | null}
     */
    this.model = null;
    this.planeFound = false;
    this.placed = false;

    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
    light.position.set(0.5, 1, 0.25);
    this.scene.add(light);

    this.controller = renderer.xr.getController(0);
    this.scene.add(this.controller);

    window.addEventListener("resize", this.onWindowResize.bind(this));
    window.addEventListener('click', (event) => onClick(event, this.camera, this.scene), false);
  }

  setOnSelect(onSelect) {
    this.controller.addEventListener("select", () => {
      if (this.reticle.visible) onSelect(this.reticle.matrix);
    });
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}

/**
 * Manages the rendering process and XR session for the application.
 */
class RendererManager {
  /**
   * Creates an instance of RendererManager.
   * Initializes the WebGLRenderer and sets up XR session event listeners.
   */
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.xr.enabled = true;
    document.body.appendChild(this.renderer.domElement);

    this.hitTestSource = null;
    this.hitTestSourceRequested = false;

    this.renderer.xr.addEventListener(
      "sessionstart",
      this.onSessionStart.bind(this)
    );
  }

  /**
   * Handles the start of an XR session.
   * Displays the tracking prompt.
   */
  onSessionStart() {
    document.getElementById("tracking-prompt").style.display = "block";
  }

  /**
   * Starts the animation loop for rendering.
   * @param {Object} sceneManager - The scene manager containing the scene and camera.
   */
  animate(sceneManager) {
    this.renderer.setAnimationLoop((timestamp, frame) =>
      this.render(timestamp, frame, sceneManager)
    );
  }

  /**
   * Renders the scene for each frame.
   * Handles hit test source requests and hit test results.
   * @param {number} timestamp - The current timestamp.
   * @param {XRFrame} frame - The current XR frame.
   * @param {Object} sceneManager - The scene manager containing the scene and camera.
   */
  render(timestamp, frame, sceneManager) {
    if (frame) {
      const referenceSpace = this.renderer.xr.getReferenceSpace();
      const session = this.renderer.xr.getSession();

      if (!this.hitTestSourceRequested) {
        this.requestHitTestSource(session, referenceSpace);
      }

      if (this.hitTestSource) {
        const hitTestResults = frame.getHitTestResults(this.hitTestSource);
        this.handleHitTestResults(hitTestResults, referenceSpace, sceneManager);
      }
    }

    this.renderer.render(sceneManager.scene, sceneManager.camera);
  }

  /**
   * Requests a hit test source for the XR session.
   * @param {XRSession} session - The current XR session.
   * @param {XRReferenceSpace} referenceSpace - The reference space for the XR session.
   */
  requestHitTestSource(session, referenceSpace) {
    session.requestReferenceSpace("viewer").then((viewerSpace) => {
      session.requestHitTestSource({ space: viewerSpace }).then((source) => {
        this.hitTestSource = source;
      });
    });

    session.addEventListener("end", () => {
      this.hitTestSourceRequested = false;
      this.hitTestSource = null;
    });

    this.hitTestSourceRequested = true;
  }

  /**
   * Handles the results of a hit test.
   * Updates the visibility and position of the reticle based on hit test results.
   * @param {Array<XRHitTestResult>} hitTestResults - The results of the hit test.
   * @param {XRReferenceSpace} referenceSpace - The reference space for the XR session.
   * @param {Object} sceneManager - The scene manager containing the scene and camera.
   */
  handleHitTestResults(hitTestResults, referenceSpace, sceneManager) {
    if (sceneManager.placed) {
      return;
    }
    if (hitTestResults.length > 0) {
      if (!sceneManager.planeFound) {
        sceneManager.reticle.visible = false;
        document.getElementById("tracking-prompt").style.display = "none";
        document.getElementById("instructions").style.display = "flex";
      }

      const hit = hitTestResults[0];
      sceneManager.reticle.visible = true;
      sceneManager.reticle.matrix.fromArray(
        hit.getPose(referenceSpace).transform.matrix
      );
    } else {
      sceneManager.reticle.visible = false;
    }
  }
}

class ModelLoader {
  static loader = new GLTFLoader();
  static dracoLoader = new DRACOLoader();

  static async loadModel(name, onProgress) {
    this.dracoLoader.setDecoderConfig({ type: "js" });
    this.dracoLoader.setDecoderPath(
      "https://www.gstatic.com/draco/v1/decoders/"
    );
    this.loader.setDRACOLoader(this.dracoLoader);
    const model = await this.loader.loadAsync(name, onProgress);
    return model.scenes[0];
  }
}

class UIManager {
  constructor(renderer) {
    document.body.appendChild(
      ARButton.createButton(renderer, {
        requiredFeatures: ["local", "hit-test", "dom-overlay"],
        domOverlay: { root: document.querySelector("#overlay") },
      })
    );
  }
}

async function main() {
  const ARSupported = await checkXRSupport();
  if (!ARSupported) {
    variantLaunch();
    document.getElementById("ar-not-supported").style.display = "block";
    return;
  }

  document.getElementById("ar-not-supported").style.display = "none";
  const rendererManager = new RendererManager();
  const sceneManager = new SceneManager(rendererManager.renderer);

  const model = await ModelLoader.loadModel(
    "ruangan newcil1_4.0.glb",
    (event) => {
      const progress = (event.loaded / event.total) * 100;
      document.getElementById("loading-container").style.display = "block";
      document.getElementById("loading-bar").style.width = `${progress}%`;
      if (progress >= 100) {
        new UIManager(rendererManager.renderer);
      }
    }
  );

  model.scale.set(0.01, 0.01, 0.01);
  model.visible = false;

  var lukisans = ["wayang-kamasan.jpg"];

  const planesObject = [];

  for (let i = 0; i < lukisans.length; i++) {
    const plane = model.getObjectByName(planes[i]);
    planesObject.push(plane);
    const textureLoader = new THREE.TextureLoader();
    const texture = await textureLoader.loadAsync(lukisans[i]);
    if (plane) {
      console.log("Event assigned")
      plane.material.transparent = false;
      plane.material.depthTest = true;
      plane.material.depthWrite = true;
      plane.material.map = texture;
      plane.geometry.computeBoundingBox();
      plane.updateMatrixWorld(true);
      plane.rotation.y = 0;
    }
  }

  sceneManager.scene.add(model);
  sceneManager.model = model;

  sceneManager.setOnSelect((matrix) => {
    if (model.visible) return;
    matrix.decompose(model.position, model.quaternion, model.scale);

    const targetPosition = new THREE.Vector3();
    sceneManager.camera.getWorldPosition(targetPosition);

    const direction = new THREE.Vector3();
    direction.subVectors(targetPosition, model.position);
    direction.y = 0; 
    model.lookAt(direction.add(model.position));
    model.visible = true;
    sceneManager.reticle.visible = false;
    sceneManager.placed = true;
  });

  rendererManager.animate(sceneManager);
}

main();
