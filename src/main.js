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
const modelBaseOffset = new THREE.Vector3()
const gltfLoader = new GLTFLoader()

// Load 3D Model Function
function load3DModel(path) {
  if (current3DModel) faceGroup.remove(current3DModel)

  gltfLoader.load(path, (gltf) => {
    current3DModel = gltf.scene

    const box = new THREE.Box3().setFromObject(current3DModel)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    
    current3DModel.position.sub(center)
    current3DModel.position.z = -0.4
    modelBaseOffset.copy(current3DModel.position)
    
    const scale = 1.8 / size.x
    current3DModel.scale.set(scale, scale, scale)
    
    faceGroup.add(current3DModel)
  })
}

// Initial load with the model's built-in materials
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
          <div class="stylist-inline" id="recommendationCard" hidden>
            <span class="stylist-inline-label">Stylist:</span>
            <strong id="faceShapeCategory">Analyzing...</strong>
          </div>
          <button id="startButton" class="primary-button">Start Experience</button>
        </div>

        <div class="overlay bottom-overlay">
          <div class="frame-gallery" id="frameGallery">
            <div class="frame-item active"><span>3D</span></div>
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
const recommendationCard = document.querySelector('#recommendationCard')

// Face shape detection state
let shapeDetectTimeout = null
let currentCategoryStr = null
const faceMetricsBuffer = []
const MAX_METRICS_BUFFER = 15
const uBuffer = []
const MAX_U_BUFFER = 10

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

function getPointDist(p1, p2) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y)
}

function pointToLineDist(pt, lineStart, lineEnd) {
  const num = Math.abs((lineEnd.x - lineStart.x) * (lineStart.y - pt.y) - (lineStart.x - pt.x) * (lineEnd.y - lineStart.y))
  const den = getPointDist(lineStart, lineEnd)
  return den === 0 ? 0 : num / den
}

function getAngle(pCenter, p1, p2) {
  const v1 = { x: p1.x - pCenter.x, y: p1.y - pCenter.y }
  const v2 = { x: p2.x - pCenter.x, y: p2.y - pCenter.y }
  const dot = v1.x * v2.x + v1.y * v2.y
  const mag1 = Math.hypot(v1.x, v1.y)
  const mag2 = Math.hypot(v2.x, v2.y)
  if (mag1 === 0 || mag2 === 0) return 0
  const normalizedDot = THREE.MathUtils.clamp(dot / (mag1 * mag2), -1, 1)
  return Math.acos(normalizedDot) * (180 / Math.PI)
}

function getMedian(arr) {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function resetFaceShapeUI() {
  recommendationCard.hidden = true
  faceShapeCategory.textContent = 'Analyzing...'
  currentCategoryStr = null
  faceMetricsBuffer.length = 0
  uBuffer.length = 0
  if (shapeDetectTimeout) clearTimeout(shapeDetectTimeout)
}

function updateFaceShapeRecommendation(landmarks) {
  const getP = (idx) => ({
    x: landmarks[idx].x,
    y: landmarks[idx].y
  })

  const p8 = getP(8)
  const p2 = getP(2)
  const p10 = getP(10)
  const p152 = getP(152)
  const p234 = getP(234)
  const p454 = getP(454)
  const p132 = getP(132)
  const p361 = getP(361)

  const rawU = getPointDist(p8, p2)
  if (uBuffer.length >= MAX_U_BUFFER) uBuffer.shift()
  uBuffer.push(rawU)

  const U = getMedian(uBuffer)
  if (U <= 0) return

  const heightUnits = getPointDist(p10, p152) / U
  const widthUnits = getPointDist(p234, p454) / U
  const jawUnits = getPointDist(p132, p361) / U
  const bezierOffsetPx = pointToLineDist(p132, p234, p152)
  const bezierOffset = bezierOffsetPx / U

  const angleL = getAngle(p132, p234, p152)
  const angleR = getAngle(p361, p454, p152)
  const jawAngle = (angleL + angleR) / 2

  const ratioHW = heightUnits / widthUnits
  const diffWJ = widthUnits - jawUnits
  const scores = {
    Oval: 0,
    Rounded: 0,
    Angular: 0,
    Elongated: 0
  }

  if (ratioHW > 1.26) scores.Elongated += 4
  else if (ratioHW > 1.16) scores.Oval += 2
  else scores.Rounded += 2

  if (jawAngle < 137) scores.Angular += 4
  else if (jawAngle < 142) {
    scores.Angular += 1
    scores.Rounded += 2
  } else {
    scores.Oval += 3
  }

  if (diffWJ > 0.14) scores.Rounded += 4
  else if (diffWJ < 0.07) scores.Angular += 4
  else {
    scores.Oval += 2
    scores.Elongated += 1
  }

  if (widthUnits > 2.65) scores.Rounded += 2
  if (widthUnits < 2.35) scores.Elongated += 2
  if (bezierOffset > 0.28) scores.Rounded += 1
  if (bezierOffset < 0.18) scores.Angular += 1

  let bestShape = Object.keys(scores).reduce((a, b) => scores[a] > scores[b] ? a : b)
  if (scores[bestShape] < 3) bestShape = 'Oval'

  if (faceMetricsBuffer.length >= MAX_METRICS_BUFFER) faceMetricsBuffer.shift()
  faceMetricsBuffer.push(bestShape)

  const counts = faceMetricsBuffer.reduce((acc, shape) => {
    acc[shape] = (acc[shape] || 0) + 1
    return acc
  }, {})
  const currentShapeKey = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b)

  let category = 'Oval (Овальне)'

  if (currentShapeKey === 'Elongated') {
    category = 'Elongated (Подовжене)'
  } else if (currentShapeKey === 'Angular') {
    category = 'Angular (Квадратне/Гостре)'
  } else if (currentShapeKey === 'Rounded') {
    category = 'Rounded (Кругле)'
  }

  recommendationCard.hidden = false
  if (category !== currentCategoryStr) {
    currentCategoryStr = category
    faceShapeCategory.textContent = 'Analyzing...'
    if (shapeDetectTimeout) clearTimeout(shapeDetectTimeout)
    shapeDetectTimeout = setTimeout(() => {
      faceShapeCategory.textContent = category
    }, 600)
  }
}

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
    resetFaceShapeUI()
  }
  
  renderer.render(scene, camera)
  requestAnimationFrame(loop)
}

// Smoothing State
let smoothedAnchor = new THREE.Vector3()
let smoothedPos = new THREE.Vector3()
let smoothedQuat = new THREE.Quaternion()
let smoothedScale = new THREE.Vector3(1, 1, 1)
let hasSmoothedAnchor = false
const POSITION_LERP = 0.18
const ROTATION_LERP = 0.34
const SCALE_LERP = 0.14
const ANCHOR_LERP = 0.22
const POSITION_DEADZONE = 0.012
const SCALE_DEADZONE = 0.008
const ROTATION_DEADZONE_DOT = 0.9996

function update3D(landmarks, matrix) {
  faceGroup.visible = true
  const anchor = landmarks[168]
  const aspect = window.innerWidth / window.innerHeight
  const vH = 2 * Math.tan((45 * Math.PI / 180) / 2) * 5
  const vW = vH * aspect

  const rawAnchorPos = new THREE.Vector3(
    (0.5 - anchor.x) * vW,
    (0.5 - anchor.y) * vH,
    0
  )
  rawAnchorPos.y += (manualY * 0.5) // Manual Height from slider

  if (!hasSmoothedAnchor) {
    smoothedAnchor.copy(rawAnchorPos)
    hasSmoothedAnchor = true
  } else {
    smoothedAnchor.lerp(rawAnchorPos, ANCHOR_LERP)
  }

  const targetQuat = new THREE.Quaternion()
  if (matrix) {
    const m = new THREE.Matrix4().fromArray(matrix.data)
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3()
    m.decompose(pos, quat, scl)
    quat.y = -quat.y
    quat.z = -quat.z
    targetQuat.copy(quat)
  }

  const targetPos = smoothedAnchor.clone()

  const p33 = landmarks[33]
  const p263 = landmarks[263]
  const eyeDist = Math.hypot(p33.x - p263.x, p33.y - p263.y)
  const s = eyeDist * 2.45 * manualScale
  const targetScale = new THREE.Vector3(s, s, s)

  const positionDelta = smoothedPos.distanceTo(targetPos)
  if (positionDelta > POSITION_DEADZONE) {
    smoothedPos.lerp(targetPos, POSITION_LERP)
  }

  const rotationAlignment = Math.abs(smoothedQuat.dot(targetQuat))
  if (rotationAlignment < ROTATION_DEADZONE_DOT) {
    smoothedQuat.slerp(targetQuat, ROTATION_LERP)
  } else {
    smoothedQuat.copy(targetQuat)
  }

  const scaleDelta = smoothedScale.distanceTo(targetScale)
  if (scaleDelta > SCALE_DEADZONE) {
    smoothedScale.lerp(targetScale, SCALE_LERP)
  }

  if (current3DModel) {
    // Apply depth in the model's local space so the face anchor stays stable
    // while head rotation still carries the glasses naturally.
    const depthLocalOffset = manualZ * 0.3 / Math.max(smoothedScale.z, 0.001)
    current3DModel.position.copy(modelBaseOffset)
    current3DModel.position.z = modelBaseOffset.z + depthLocalOffset
  }

  faceGroup.position.copy(smoothedPos)
  faceGroup.quaternion.copy(smoothedQuat)
  faceGroup.scale.copy(smoothedScale)

  updateFaceShapeRecommendation(landmarks)
}
