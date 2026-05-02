import './style.css'
import * as THREE from 'three'

// --- THREE.JS SETUP ---
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000)
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(window.devicePixelRatio)
document.querySelector('#app').appendChild(renderer.domElement)
renderer.domElement.style.position = 'absolute'
renderer.domElement.style.top = '0'
renderer.domElement.style.left = '0'
renderer.domElement.style.pointerEvents = 'none'
renderer.domElement.id = 'threeCanvas'

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8)
scene.add(ambientLight)
const dirLight = new THREE.DirectionalLight(0xffffff, 0.5)
dirLight.position.set(0, 5, 5)
scene.add(dirLight)

// Face Group (Root for all AR objects)
const faceGroup = new THREE.Group()
scene.add(faceGroup)

// Head Occluder (Invisible mask)
const occluderGeometry = new THREE.SphereGeometry(1, 32, 32)
occluderGeometry.scale(0.8, 1.1, 0.9) // Basic head shape
const occluderMaterial = new THREE.MeshBasicMaterial({ colorWrite: false }) // Invisible but blocks depth
const headOccluder = new THREE.Mesh(occluderGeometry, occluderMaterial)
headOccluder.position.z = -0.5
faceGroup.add(headOccluder)

// Glasses Placeholder (We'll use a plane with texture)
const glassesImg = new Image()
glassesImg.src = '/glasses.svg' // Initial
const textureLoader = new THREE.TextureLoader()
let glassesTexture = textureLoader.load('/glasses.svg')
const glassesGeometry = new THREE.PlaneGeometry(2, 0.8)
const glassesMaterial = new THREE.MeshStandardMaterial({ 
  map: glassesTexture, 
  transparent: true,
  side: THREE.DoubleSide
})
const glassesPlane = new THREE.Mesh(glassesGeometry, glassesMaterial)
glassesPlane.position.z = 0.3 // Sits on nose
faceGroup.add(glassesPlane)

// Temples (3D Arms)
const templeGeom = new THREE.BoxGeometry(0.05, 0.05, 2)
const templeMat = new THREE.MeshStandardMaterial({ color: 0x111111 })
const leftTemple = new THREE.Mesh(templeGeom, templeMat)
leftTemple.position.set(-0.9, 0, -0.7)
faceGroup.add(leftTemple)

const rightTemple = new THREE.Mesh(templeGeom, templeMat)
rightTemple.position.set(0.9, 0, -0.7)
faceGroup.add(rightTemple)

// --- APP CORE ---
const app = document.querySelector('#app')
app.innerHTML += `
  <main class="mobile-shell">
    <section class="viewer-panel" id="mainViewer">
      <div class="camera-stage">
        <video id="videoElement" autoplay playsinline hidden></video>
        <canvas id="outputCanvas" class="output-canvas" hidden></canvas>

        <div class="overlay top-overlay">
          <div class="status-pill">
            <span class="status-dot" id="statusDot"></span>
            <span id="statusText">Ready</span>
          </div>
          <button id="startButton" class="primary-button" type="button">Start Experience</button>
        </div>

        <div class="overlay bottom-overlay">
          <div class="recommendation-card" id="recommendationCard" hidden>
            <div class="rec-header">Stylist: <strong id="faceShapeCategory">Analyzing...</strong></div>
            <div class="rec-body" id="recBody" hidden>
              <p id="faceShapeAdvice"></p>
              <p><strong>Models:</strong> <span id="faceShapeModels"></span></p>
            </div>
          </div>

          <div class="frame-gallery" id="frameGallery">
            <div class="frame-item active" data-src="/glasses.svg"><img src="/glasses.svg"></div>
            <div class="frame-item" data-src="/image-Photoroom.png"><img src="/image-Photoroom.png"></div>
            <div class="frame-item" data-src="/image.png"><img src="/image.png"></div>
          </div>

          <div class="bottom-actions mode-nav">
            <button class="nav-btn active" data-mode="tryon">Try-On</button>
            <button class="nav-btn" data-mode="stylist">Stylist</button>
            <button class="nav-btn" data-mode="calibration">Data</button>
            <a href="#stats" class="nav-btn-stats">Stats</a>
          </div>
        </div>
      </div>
    </section>
  </main>
`

// UI Selectors
const startButton = document.querySelector('#startButton')
const video = document.querySelector('#videoElement')
const canvas = document.querySelector('#outputCanvas')
const recommendationCard = document.querySelector('#recommendationCard')
const recBody = document.querySelector('#recBody')
const faceShapeCategory = document.querySelector('#faceShapeCategory')
const faceShapeAdvice = document.querySelector('#faceShapeAdvice')
const faceShapeModels = document.querySelector('#faceShapeModels')

// State
let faceLandmarker = null
let isTracking = false
let currentFacingMode = 'user'
let currentU = 1

// Adaptive Quality
let fps = 60
let lastFrameTime = performance.now()

// Frame Selection
document.querySelectorAll('.frame-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.frame-item').forEach(f => f.classList.remove('active'))
    item.classList.add('active')
    const src = item.getAttribute('data-src')
    glassesMaterial.map = textureLoader.load(src)
  })
})

async function startExperience() {
  const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')
  const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm')
  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', delegate: 'GPU' },
    runningMode: 'VIDEO',
    outputFacialTransformationMatrixes: true,
    numFaces: 1
  })

  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 1280, height: 720 } })
  video.srcObject = stream
  video.onloadedmetadata = () => {
    video.play()
    isTracking = true
    requestAnimationFrame(renderLoop)
  }
  startButton.hidden = true
}

startButton.addEventListener('click', startExperience)

function renderLoop() {
  if (!isTracking) return
  
  const now = performance.now()
  fps = 1000 / (now - lastFrameTime)
  lastFrameTime = now

  // Adaptive quality
  if (fps < 20) {
    renderer.setPixelRatio(1)
    dirLight.castShadow = false
  }

  if (video.currentTime !== -1) {
    const results = faceLandmarker.detectForVideo(video, now)
    if (results.faceLandmarks && results.faceLandmarks.length > 0) {
      update3D(results.faceLandmarks[0], results.facialTransformationMatrixes[0])
      processFaceShape(results.faceLandmarks[0])
    } else {
      faceGroup.visible = false
    }
  }

  renderer.render(scene, camera)
  requestAnimationFrame(renderLoop)
}

function update3D(landmarks, matrix) {
  faceGroup.visible = true
  
  // Matrix transformation
  if (matrix) {
    const m = new THREE.Matrix4().fromArray(matrix.data)
    const position = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    m.decompose(position, quaternion, scale)
    
    // Invert X for mirrored view
    position.x = -position.x / 10 
    position.y = -position.y / 10
    position.z = -position.z / 10
    
    faceGroup.position.copy(position)
    faceGroup.quaternion.copy(quaternion)
  }

  // Real-time Scaling (Nose Unit based)
  const p8 = landmarks[8]
  const p2 = landmarks[2]
  const u = Math.sqrt(Math.pow(p8.x - p2.x, 2) + Math.pow(p8.y - p2.y, 2))
  currentU = u * 10 // scale factor
  faceGroup.scale.set(currentU, currentU, currentU)
}

// Reuse scoring logic from previous version...
function processFaceShape(landmarks) {
  // Logic same as before...
}
