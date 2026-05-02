import './style.css'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

// --- THREE.JS SETUP ---
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000)
camera.position.z = 5

const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
renderer.setClearColor(0x000000, 0)
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.domElement.style.position = 'fixed'
renderer.domElement.style.top = '0'
renderer.domElement.style.left = '0'
renderer.domElement.style.zIndex = '10'
renderer.domElement.style.pointerEvents = 'none'

// UI Wrapper
const uiOverlay = document.createElement('div')
uiOverlay.id = 'uiOverlay'
document.querySelector('#app').appendChild(renderer.domElement)
document.querySelector('#app').appendChild(uiOverlay)

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 1.2))
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
dirLight.position.set(0, 5, 5)
scene.add(dirLight)

const faceGroup = new THREE.Group()
scene.add(faceGroup)

// Head Occluder (Invisible mask)
const occluderGeometry = new THREE.SphereGeometry(1, 32, 32)
// Flatten the sphere in Z so it doesn't protrude forward
occluderGeometry.scale(0.85, 1.15, 0.5) 
const headOccluder = new THREE.Mesh(occluderGeometry, new THREE.MeshBasicMaterial({ colorWrite: false }))
headOccluder.position.z = -0.7 // Push it further back
faceGroup.add(headOccluder)

// Models State
let current3DModel = null
const gltfLoader = new GLTFLoader()

// Glasses Plane (Fallback for PNGs)
const textureLoader = new THREE.TextureLoader()
const glassesMaterial = new THREE.MeshStandardMaterial({ transparent: true, side: THREE.DoubleSide })
const glassesPlane = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.8), glassesMaterial)
glassesPlane.position.z = 0.2 // Adjusted Z-position to sit safely in front of the head
faceGroup.add(glassesPlane)

// Load 3D Model Function
function load3DModel(path) {
  // Hide plane if we load a real model
  glassesPlane.visible = false
  if (current3DModel) faceGroup.remove(current3DModel)

  gltfLoader.load(path, (gltf) => {
    current3DModel = gltf.scene
    
    // Auto-center and scale
    const box = new THREE.Box3().setFromObject(current3DModel)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    
    current3DModel.position.sub(center) // Center the model
    current3DModel.position.z = -0.4     // Much deeper default seating
    
    // Normalize size (assuming 1.8 units is a good width)
    const scale = 1.8 / size.x
    current3DModel.scale.set(scale, scale, scale)
    
    faceGroup.add(current3DModel)
  })
}

// Initial Load
load3DModel('/Glasses.glb')

// --- RENDER UI ---
uiOverlay.innerHTML = `
  <main class="mobile-shell">
    <section class="viewer-panel" id="mainViewer">
      <div class="camera-stage">
        <video id="videoElement" autoplay playsinline></video>
        
        <div class="overlay top-overlay">
          <div class="status-pill">
            <div class="status-dot" id="statusDot"></div>
            <span id="statusText">Ready</span>
          </div>
          <button id="startButton" class="primary-button">Start Experience</button>
        </div>

        <div class="overlay bottom-overlay">
          <div class="recommendation-card" id="recommendationCard" hidden>
            <div class="rec-header">Stylist: <strong id="faceShapeCategory">Analyzing...</strong></div>
            <div class="rec-body" id="recBody" hidden>
              <p id="faceShapeAdvice" class="rec-advice"></p>
              <p class="rec-models"><strong>Models:</strong> <span id="faceShapeModels"></span></p>
            </div>
          </div>

          <div class="frame-gallery" id="frameGallery">
            <div class="frame-item active" data-src="/Glasses.glb"><span>3D</span></div>
            <div class="frame-item" data-src="/glasses.svg"><img src="/glasses.svg"></div>
            <div class="frame-item" data-src="/image-Photoroom.png"><img src="/image-Photoroom.png"></div>
            <div class="frame-item" data-src="/pngwing.com.png"><img src="/pngwing.com.png"></div>
            <div class="frame-item" data-src="/image.png"><img src="/image.png"></div>
          </div>

          <div class="mode-nav">
            <button class="nav-btn active" data-mode="tryon">Try-On</button>
            <button class="nav-btn" data-mode="stylist">Stylist</button>
            <button class="nav-btn" data-mode="calibration">Data</button>
            <button id="toggleSettings" class="nav-btn-stats">⚙️</button>
          </div>

          <!-- Manual Tuning Panel -->
          <div id="settingsPanel" class="settings-panel" hidden>
            <div class="setting-row">
              <label>Size</label>
              <input type="range" id="sliderScale" min="0.5" max="2.0" step="0.05" value="1.0">
            </div>
            <div class="setting-row">
              <label>Height</label>
              <input type="range" id="sliderY" min="-1.0" max="1.0" step="0.05" value="0.0">
            </div>
            <div class="setting-row">
              <label>Depth</label>
              <input type="range" id="sliderZ" min="-5.0" max="5.0" step="0.1" value="0.0">
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="stats-panel" id="statsPanel" style="display: none;">
      <div class="stats-header">
        <h2>Dataset</h2>
        <button id="backToApp" class="primary-button">Back</button>
      </div>
      <div class="stats-content"><table id="statsTable"><thead><tr><th>ID</th><th>Shape</th><th>Angle</th><th>H/W</th></tr></thead><tbody></tbody></table></div>
    </section>
  </main>
`

// Manual Tuning State
let manualScale = 1.0
let manualY = 0.0
let manualZ = 0.0

const settingsPanel = document.querySelector('#settingsPanel')
const toggleSettings = document.querySelector('#toggleSettings')

toggleSettings.addEventListener('click', () => {
  settingsPanel.hidden = !settingsPanel.hidden
})

document.querySelector('#sliderScale').addEventListener('input', (e) => { manualScale = parseFloat(e.target.value) })
document.querySelector('#sliderY').addEventListener('input', (e) => { manualY = parseFloat(e.target.value) })
document.querySelector('#sliderZ').addEventListener('input', (e) => { manualZ = parseFloat(e.target.value) })

// Selectors
const video = document.querySelector('#videoElement')
const startButton = document.querySelector('#startButton')
const faceShapeCategory = document.querySelector('#faceShapeCategory')
const faceShapeAdvice = document.querySelector('#faceShapeAdvice')
const faceShapeModels = document.querySelector('#faceShapeModels')
const recBody = document.querySelector('#recBody')
const recommendationCard = document.querySelector('#recommendationCard')

// Mode Switching
const navButtons = document.querySelectorAll('.nav-btn')
const panels = {
  tryon: document.querySelector('#frameGallery'),
  stylist: document.querySelector('#recommendationCard'),
  calibration: document.querySelector('#calibrationPanel')
}

function switchMode(mode) {
  navButtons.forEach(b => b.classList.toggle('active', b.dataset.mode === mode))
  Object.keys(panels).forEach(p => { if(panels[p]) panels[p].hidden = (p !== mode) })
}
navButtons.forEach(b => b.addEventListener('click', () => switchMode(b.dataset.mode)))

// Frame Switching
document.querySelectorAll('.frame-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.frame-item').forEach(f => f.classList.remove('active'))
    item.classList.add('active')
    const src = item.dataset.src
    
    if (src.endsWith('.glb')) {
      load3DModel(src)
    } else {
      if (current3DModel) current3DModel.visible = false
      glassesPlane.visible = true
      glassesMaterial.map = textureLoader.load(src)
    }
  })
})

// Mediapipe
let faceLandmarker
let isTracking = false

async function start() {
  const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')
  const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm')
  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', delegate: 'GPU' },
    runningMode: 'VIDEO', outputFacialTransformationMatrixes: true
  })
  
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 1280, height: 720 } })
  video.srcObject = stream
  video.onloadedmetadata = () => {
    video.play()
    isTracking = true
    requestAnimationFrame(loop)
  }
  startButton.style.display = 'none'
}
startButton.addEventListener('click', start)

function loop() {
  if (!isTracking) return
  const now = performance.now()
  const results = faceLandmarker.detectForVideo(video, now)
  
  if (results.faceLandmarks && results.faceLandmarks.length > 0) {
    update3D(results.faceLandmarks[0], results.facialTransformationMatrixes ? results.facialTransformationMatrixes[0] : null)
  } else {
    faceGroup.visible = false
  }
  
  renderer.render(scene, camera)
  requestAnimationFrame(loop)
}

function update3D(landmarks, matrix) {
  faceGroup.visible = true
  const p6 = landmarks[6]
  const aspect = window.innerWidth / window.innerHeight
  const vH = 2 * Math.tan((45 * Math.PI / 180) / 2) * 5
  const vW = vH * aspect

  // Apply manual Y offset (multiplied by scale for consistency)
  const tx = (0.5 - p6.x) * vW
  const ty = (0.5 - p6.y) * vH + (manualY * 0.5) 
  const tz = manualZ * 1.5 // Increased depth multiplier
  
  faceGroup.position.set(tx, ty, tz)

  if (matrix) {
    const m = new THREE.Matrix4().fromArray(matrix.data)
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3()
    m.decompose(pos, quat, scl)
    quat.y = -quat.y
    quat.z = -quat.z
    faceGroup.quaternion.copy(quat)
  }

  const p33 = landmarks[33]
  const p263 = landmarks[263]
  const eyeDist = Math.sqrt(Math.pow(p33.x - p263.x, 2) + Math.pow(p33.y - p263.y, 2))
  
  // Base scale 2.45 * manual slider
  const s = eyeDist * 2.45 * manualScale
  faceGroup.scale.set(s, s, s)
}
