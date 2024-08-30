import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ARButton } from "three/examples/jsm/webxr/ARButton.js";
import "./style.css";

let container, camera, scene, renderer, controller, reticle;
let hitTestSource = null;
let hitTestSourceRequested = false;
let planeFound = false;
let flowersGltf;

/**
 * Checks for WebXR session support and initializes the AR experience if supported.
 */
if ("xr" in navigator) {
  navigator.xr.isSessionSupported("immersive-ar").then((supported) => {
    if (supported) {
      document.getElementById("ar-not-supported").style.display = "none";
      initializeScene();
      animate();
    }
  });
}

/**
 * Initializes the AR scene, setting up all necessary components.
 */
function initializeScene() {
  setupContainer();
  setupScene();
  setupCamera();
  setupLighting();
  setupRenderer();
  setupARButton();
  setupReticle();
  loadFlowerModel();
  setupEventListeners();
}

/**
 * Sets up the main container for the AR scene.
 */
function setupContainer() {
  container = document.createElement("div");
  document.body.appendChild(container);
}

/**
 * Initializes the Three.js scene.
 */
function setupScene() {
  scene = new THREE.Scene();
}

/**
 * Initializes the camera for the AR scene.
 */
function setupCamera() {
  camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.01,
    20
  );
}

/**
 * Sets up lighting for the AR scene.
 */
function setupLighting() {
  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  light.position.set(0.5, 1, 0.25);
  scene.add(light);
}

/**
 * Configures the WebGL renderer and enables XR capabilities.
 */
function setupRenderer() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  container.appendChild(renderer.domElement);
  renderer.xr.addEventListener("sessionstart", onSessionStart);
}

/**
 * Adds the AR button to the page, allowing the user to start an AR session.
 */
function setupARButton() {
  document.body.appendChild(
    ARButton.createButton(renderer, {
      requiredFeatures: ["local", "hit-test", "dom-overlay"],
      domOverlay: { root: document.querySelector("#overlay") },
    })
  );
}

/**
 * Handles AR session start, updating the UI accordingly.
 */
function onSessionStart() {
  planeFound = false;
  document.getElementById("tracking-prompt").style.display = "block";
}

/**
 * Sets up the reticle used for hit-testing in the AR scene.
 */
function setupReticle() {
  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial()
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);
}

/**
 * Sets up the AR controller and attaches event listeners for interaction.
 */
function setupController() {
  controller = renderer.xr.getController(0);
  controller.addEventListener("select", onSelect);
  scene.add(controller);
}

/**
 * Handles the selection event, adding a flower model to the scene at the reticle position.
 */
function onSelect() {
  if (!reticle.visible || !flowersGltf) return;

  const flower =
    flowersGltf.children[Math.floor(Math.random() * flowersGltf.children.length)];
  const mesh = flower.clone();

  reticle.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
  const scale = Math.random() * 0.4 + 0.25;
  mesh.scale.set(scale, scale, scale);
  mesh.rotateY(Math.random() * Math.PI * 2);
  scene.add(mesh);

  animateGrowth(mesh);
}

/**
 * Animates the growth of the added flower mesh.
 * @param {THREE.Mesh} mesh - The flower mesh to animate.
 */
function animateGrowth(mesh) {
  const interval = setInterval(() => {
    mesh.scale.multiplyScalar(1.01);
    mesh.rotateY(0.03);
  }, 16);

  setTimeout(() => {
    clearInterval(interval);
  }, 500);
}

/**
 * Loads the 3D model of flowers from a GLTF file.
 */
function loadFlowerModel() {
  const loader = new GLTFLoader();
  loader.load("flowers.glb", (gltf) => {
    flowersGltf = gltf.scene;
  });
}

/**
 * Sets up the necessary event listeners for the AR experience.
 */
function setupEventListeners() {
  setupController();
  window.addEventListener("resize", onWindowResize);
}

/**
 * Handles the window resize event to adjust the camera and renderer.
 */
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/**
 * Starts the animation loop.
 */
function animate() {
  renderer.setAnimationLoop(render);
}

/**
 * Renders the AR scene, handling hit-testing and reticle visibility.
 * @param {DOMHighResTimeStamp} timestamp - The current time for the animation frame.
 * @param {XRFrame} frame - The current XR frame for hit-testing.
 */
function render(timestamp, frame) {
  if (frame) {
    const referenceSpace = renderer.xr.getReferenceSpace();
    const session = renderer.xr.getSession();

    if (!hitTestSourceRequested) {
      requestHitTestSource(session, referenceSpace);
    }

    if (hitTestSource) {
      const hitTestResults = frame.getHitTestResults(hitTestSource);
      handleHitTestResults(hitTestResults, referenceSpace);
    }
  }

  renderer.render(scene, camera);
}

/**
 * Requests a hit-test source for detecting planes in the AR session.
 * @param {XRSession} session - The current XR session.
 * @param {XRReferenceSpace} referenceSpace - The reference space used for hit-testing.
 */
function requestHitTestSource(session, referenceSpace) {
  session.requestReferenceSpace("viewer").then((viewerSpace) => {
    session.requestHitTestSource({ space: viewerSpace }).then((source) => {
      hitTestSource = source;
    });
  });

  session.addEventListener("end", () => {
    hitTestSourceRequested = false;
    hitTestSource = null;
  });

  hitTestSourceRequested = true;
}

/**
 * Handles hit-test results, updating the reticle's position and visibility.
 * @param {XRHitTestResult[]} hitTestResults - The array of hit-test results.
 * @param {XRReferenceSpace} referenceSpace - The reference space used for hit-testing.
 */
function handleHitTestResults(hitTestResults, referenceSpace) {
  if (hitTestResults.length > 0) {
    if (!planeFound) {
      planeFound = true;
      document.getElementById("tracking-prompt").style.display = "none";
      document.getElementById("instructions").style.display = "flex";
    }

    const hit = hitTestResults[0];
    reticle.visible = true;
    reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);
  } else {
    reticle.visible = false;
  }
}
