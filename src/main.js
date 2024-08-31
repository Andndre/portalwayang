import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ARButton } from "three/examples/jsm/webxr/ARButton.js";
import "./style.css";

let container, camera, scene, renderer, controller, reticle;
let hitTestSource = null;
let hitTestSourceRequested = false;
let planeFound = false;
let ruanganGltf;

/**
 * Memeriksa dukungan sesi WebXR dan menginisialisasi pengalaman AR jika didukung.
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
 * Menginisialisasi scene AR, dengan mengatur semua komponen yang diperlukan.
 */
function initializeScene() {
  setupContainer();
  setupScene();
  setupCamera();
  setupLighting();
  setupRenderer();
  setupARButton();
  setupReticle();
  loadModelRuangan();
  setupEventListeners();
}

/**
 * Mengatur kontainer utama untuk scene AR.
 */
function setupContainer() {
  container = document.createElement("div");
  document.body.appendChild(container);
}

/**
 * Menginisialisasi scene Three.js.
 */
function setupScene() {
  scene = new THREE.Scene();
}

/**
 * Menginisialisasi kamera untuk scene AR.
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
 * Mengatur pencahayaan untuk scene AR.
 */
function setupLighting() {
  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  light.position.set(0.5, 1, 0.25);
  scene.add(light);
}

/**
 * Mengonfigurasi renderer WebGL dan mengaktifkan kemampuan XR.
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
 * Menambahkan tombol AR ke halaman, memungkinkan pengguna untuk memulai sesi AR.
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
 * Menangani awal sesi AR, memperbarui UI sesuai.
 */
function onSessionStart() {
  planeFound = false;
  document.getElementById("tracking-prompt").style.display = "block";
}

/**
 * Mengatur reticle yang digunakan untuk hit-testing dalam scene AR.
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
 * Mengatur controller AR dan menambahkan event listener untuk interaksi.
 */
function setupController() {
  controller = renderer.xr.getController(0);
  controller.addEventListener("select", onSelect);
  scene.add(controller);
}

/**
 * Menangani event seleksi, menambahkan model bunga ke scene di posisi reticle.
 */
function onSelect() {
  if (!reticle.visible || !ruanganGltf) return;

  const flower =
    ruanganGltf.children[Math.floor(Math.random() * ruanganGltf.children.length)];
  const mesh = flower.clone();

  reticle.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
  scene.add(mesh);
}

/**
 * Memuat model 3D model dari file GLTF.
 */
function loadModelRuangan() {
  const loader = new GLTFLoader();
  loader.load("ruangan.glb", (gltf) => {
    console.log(gltf);
    ruanganGltf = gltf.scene;
  });
}

/**
 * Mengatur event listener yang diperlukan untuk pengalaman AR.
 */
function setupEventListeners() {
  setupController();
  window.addEventListener("resize", onWindowResize);
}

/**
 * Menangani event resize window untuk menyesuaikan kamera dan renderer.
 */
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/**
 * Memulai loop animasi.
 */
function animate() {
  renderer.setAnimationLoop(render);
}

/**
 * Merender scene AR, menangani hit-testing dan visibilitas reticle.
 * @param {DOMHighResTimeStamp} timestamp - Waktu saat ini untuk frame animasi.
 * @param {XRFrame} frame - Frame XR saat ini untuk hit-testing.
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
 * Meminta sumber hit-test untuk mendeteksi plane dalam sesi AR.
 * @param {XRSession} session - Sesi XR saat ini.
 * @param {XRReferenceSpace} referenceSpace - Ruang referensi yang digunakan untuk hit-testing.
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
 * Menangani hasil hit-test, memperbarui posisi dan visibilitas reticle.
 * @param {XRHitTestResult[]} hitTestResults - Array hasil hit-test.
 * @param {XRReferenceSpace} referenceSpace - Ruang referensi yang digunakan untuk hit-testing.
 */
function handleHitTestResults(hitTestResults, referenceSpace) {
  // Selama belum ditemukan plane ground, tampilkan tracking-prompt
  // Jika ditemukan, hilangkan tracking-prompt dan tampilkan instructions
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
