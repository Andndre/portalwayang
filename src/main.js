"use strict";

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ARButton } from "three/examples/jsm/webxr/ARButton.js";
import { checkXRSupport } from "./util";
import "./style.css";

// Kelas yang mengelola semua yang terkait dengan scene
class SceneManager {
  /**
   * Inisialisasi semua komponen scene dan menyambungkan ke renderer
   *
   * @param {THREE.WebGLRenderer} renderer - Renderer yang digunakan untuk scene
   */
  constructor(renderer) {
    // Inisialisasi semua komponen scene langsung di constructor
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.01,
      20
    );
    this.reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial()
    );
    this.reticle.matrixAutoUpdate = false;
    this.reticle.visible = false;
    this.scene.add(this.reticle);

    this.planeFound = false;

    // Setup Lighting
    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
    light.position.set(0.5, 1, 0.25);
    this.scene.add(light);

    // Setup XR controller from the renderer
    this.controller = renderer.xr.getController(0);
    this.scene.add(this.controller);

    // Event listener untuk perubahan ukuran window
    window.addEventListener("resize", this.onWindowResize.bind(this));
  }

  /**
   * A callback function type for tracking loading progress.
   * @callback OnSelect
   * @param {THREE.Matrix4} matrix - The progress event object.
   */

  /**
   * Sets the function to be called when the XR controller is selected.
   *
   * @param {OnSelect} onSelect - The function to be called when the XR controller
   * is selected. The function is called with the current matrix of the reticle as
   * the argument.
   */
  setOnSelect(onSelect) {
    this.controller.addEventListener("select", () => {
      if (this.reticle.visible) onSelect(this.reticle.matrix);
    });
  }

  // Menangani perubahan ukuran window
  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}

// Kelas yang mengelola renderer dan interaksi XR
class RendererManager {
  constructor() {
    // Inisialisasi renderer dan mengaktifkan XR langsung di constructor
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.xr.enabled = true;
    document.body.appendChild(this.renderer.domElement);

    this.hitTestSource = null;
    this.hitTestSourceRequested = false;

    // Event listener untuk XR session start
    this.renderer.xr.addEventListener(
      "sessionstart",
      this.onSessionStart.bind(this)
    );
  }

  // Menangani event saat sesi XR dimulai
  onSessionStart() {
    document.getElementById("tracking-prompt").style.display = "block";
  }

  // Memulai animasi scene
  animate(sceneManager) {
    this.renderer.setAnimationLoop((timestamp, frame) =>
      this.render(timestamp, frame, sceneManager)
    );
  }

  // Merender scene AR dan menangani hit-test
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

  // Meminta sumber hit-test untuk AR
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

  // Menangani hasil hit-test
  handleHitTestResults(hitTestResults, referenceSpace, sceneManager) {
    if (hitTestResults.length > 0) {
      if (!sceneManager.planeFound) {
        sceneManager.planeFound = true;
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

// Kelas yang mengelola pemuatan model 3D
class ModelLoader {
  static loader = new GLTFLoader();
  /**
   * A callback function type for tracking loading progress.
   * @callback OnProgress
   * @param {ProgressEvent} event - The progress event object.
   */
  // Menganimasi pertumbuhan mesh bunga
  /**
   * 
   * @param {string} name 
   * @param {OnProgress} onProgress 
   * @returns 
   */
  static async loadModel(name, onProgress) {
    const model = await this.loader.loadAsync(name, onProgress);
    return model.scenes[0];
  }
}

// Kelas yang mengelola UI dan tombol AR
class UIManager {
  constructor(renderer) {
    // Mengatur tombol AR langsung di constructor
    document.body.appendChild(
      ARButton.createButton(renderer, {
        requiredFeatures: ["local", "hit-test", "dom-overlay"],
        domOverlay: { root: document.querySelector("#overlay") },
      })
    );
  }
}

// Fungsi utama untuk menjalankan aplikasi
async function main() {
  const ARSupported = await checkXRSupport();
  if (!ARSupported) {
    document.getElementById("ar-not-supported").style.display = "block";
    return;
  }
  const rendererManager = new RendererManager();
  const sceneManager = new SceneManager(rendererManager.renderer);
  new UIManager(rendererManager.renderer);
  const model = await ModelLoader.loadModel(
    "ruangan.glb",
    (event) => console.log(event)
  );
  sceneManager.scene.add(model);
  model.scale.set(0.01, 0.01, 0.01);
  model.visible = false;
  const plane = model.getObjectByName("plane");
  const textureLoader = new THREE.TextureLoader();
  const texture = await textureLoader.loadAsync(
    "wayang-kamasan.jpg",
  );
  const aspectRatio = texture.image.width / texture.image.height;
  plane.scale.set(1, aspectRatio, 1);
  plane.material.map = texture;
  const mask = model.getObjectByName("mask");
  console.log("red", mask);
  mask.material.colorWrite = false;
  mask.renderOrder = -1;
  console.log(plane);

  sceneManager.setOnSelect((matrix) => {
    console.log("On Select")
    matrix.decompose(model.position, model.quaternion, model.scale);
    // rotate the ruangan to face the sceneManager.camera (y-axis)
    const camera = sceneManager.camera;
    const target = new THREE.Vector3();
    camera.getWorldPosition(target);
    model.lookAt(target);
    model.visible = true;
  })

  rendererManager.animate(sceneManager);
}

main();
