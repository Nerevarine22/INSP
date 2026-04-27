import './style.css'

const app = document.querySelector('#app')

app.innerHTML = `
  <main class="mobile-shell">
    <section class="viewer-panel">
      <div class="camera-stage">
        <video id="videoElement" autoplay playsinline hidden></video>
        <canvas id="outputCanvas" class="output-canvas" aria-label="Camera preview"></canvas>

        <div class="overlay top-overlay">
          <div class="status-pill">
            <span class="status-dot" id="statusDot"></span>
            <span id="statusText">Ready to start camera</span>
          </div>
          <button id="startButton" class="primary-button" type="button">
            Start camera
          </button>
        </div>

        <div class="overlay bottom-overlay">
          <div class="recommendation-card" id="recommendationCard" hidden>
            <div class="rec-header">
              <span class="metric-label">Smart Stylist</span>
              <strong id="faceShapeValue">Analyzing...</strong>
            </div>
          </div>
          <div class="metrics-row" style="display: none;">
            <div class="metric-card">
              <span class="metric-label">Tracking</span>
              <strong id="trackingValue">Waiting</strong>
            </div>
            <div class="metric-card">
              <span class="metric-label">Rotation</span>
              <strong id="rotationValue">0 deg, 0 deg, 0 deg</strong>
            </div>
          </div>
        </div>

        <input type="range" id="yOffsetSlider" class="vertical-slider" min="-100" max="100" value="0" orient="vertical" hidden>

        <div id="loadingOverlay" class="loading-overlay" hidden>
          <div class="loading-bar-wrap">
            <div class="loading-bar" id="loadingBar"></div>
          </div>
          <p id="loadingLabel" class="loading-label">Loading…</p>
        </div>
      </div>
    </section>
  </main>
`

const startButton     = document.querySelector('#startButton')
const statusText      = document.querySelector('#statusText')
const trackingValue   = document.querySelector('#trackingValue')
const rotationValue   = document.querySelector('#rotationValue')
const statusDot       = document.querySelector('#statusDot')
const video           = document.querySelector('#videoElement')
const canvas          = document.querySelector('#outputCanvas')
const loadingOverlay  = document.querySelector('#loadingOverlay')
const loadingBar      = document.querySelector('#loadingBar')
const loadingLabel    = document.querySelector('#loadingLabel')
const yOffsetSlider   = document.querySelector('#yOffsetSlider')
const recommendationCard = document.querySelector('#recommendationCard')
const faceShapeValue     = document.querySelector('#faceShapeValue')

let isInitializing = false
let isTracking = false
let faceLandmarker = null
let animationId = null
let lastVideoTime = -1

// ─── Constants & State ───────────────────────────────────────────────────────
const glassesImg = new Image()
glassesImg.src = '/glasses.svg'

// EMA Smoothing state
let smoothedPos = { x: 0, y: 0, w: 0, roll: 0, pitch: 0, yaw: 0 }
let hasPreviousPos = false
const EMA_ALPHA = 0.4 // 0.0 to 1.0 (lower is smoother but lags more)

// The user can fine-tune the offset relative to the glasses width (0 = exact 168 anchor)
let userYOffsetRatio = 0

yOffsetSlider.addEventListener('input', (e) => {
  userYOffsetRatio = -(parseInt(e.target.value, 10) / 100)
})

// ─── UI Helpers ────────────────────────────────────────────────────────────
function setStatus(message, tone = 'idle') {
  statusText.textContent = message
  document.documentElement.dataset.status = tone
  statusDot.dataset.status = tone
}

function setTrackingState(label) {
  trackingValue.textContent = label
}

function showLoading(label, pct) {
  loadingOverlay.hidden = false
  loadingLabel.textContent = label
  loadingBar.style.width = `${pct}%`
}

function hideLoading() {
  loadingOverlay.hidden = true
}

function setRotation(rx, ry, rz) {
  const toDegrees = (v) => `${Math.round((v * 180) / Math.PI)} deg`
  rotationValue.textContent = `${toDegrees(rx)}, ${toDegrees(ry)}, ${toDegrees(rz)}`
}

// ─── Math Helpers ──────────────────────────────────────────────────────────
function lerp(start, end, amt) {
  return (1 - amt) * start + amt * end
}

// ─── MediaPipe Initialization ──────────────────────────────────────────────
async function startExperience() {
  if (isInitializing) return
  isInitializing = true
  startButton.disabled = true
  setStatus('Loading AI model…', 'warning')
  setTrackingState('Loading')
  showLoading('Fetching MediaPipe…', 10)

  try {
    // Lazy load MediaPipe Tasks Vision
    const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')
    
    showLoading('Loading Wasm…', 40)
    // Create fileset resolver (using CDN for wasm files to keep bundle size small)
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    )
    
    showLoading('Loading neural net…', 70)
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: '/mediapipe/face_landmarker.task',
        delegate: 'GPU'
      },
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: true,
      runningMode: 'VIDEO',
      numFaces: 1
    })

  } catch (err) {
    isInitializing = false
    hideLoading()
    setStatus(`AI Load Error: ${err.message}`, 'error')
    setTrackingState('Error')
    startButton.disabled = false
    startButton.textContent = 'Try again'
    return
  }

  showLoading('Starting camera…', 90)
  setStatus('Requesting camera access…', 'warning')

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    })
    
    video.srcObject = stream
    video.addEventListener('loadeddata', () => {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      
      hideLoading()
      setStatus('Tracking active', 'success')
      setTrackingState('Active')
      startButton.textContent = 'Camera active'
      yOffsetSlider.hidden = false
      isTracking = true
      isInitializing = false
      
      // Start render loop
      animationId = requestAnimationFrame(renderLoop)
    })
  } catch (err) {
    isInitializing = false
    hideLoading()
    setStatus(`Camera error: ${err.message}`, 'error')
    setTrackingState('Error')
    startButton.disabled = false
    startButton.textContent = 'Try again'
  }
}

startButton.addEventListener('click', startExperience)

// ─── Render Loop ──────────────────────────────────────────────────────────
function renderLoop() {
  if (!isTracking) return
  
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  
  // Draw video frame onto canvas (flipped horizontally)
  ctx.save()
  ctx.translate(canvas.width, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  ctx.restore()

  let startTimeMs = performance.now()
  if (lastVideoTime !== video.currentTime) {
    lastVideoTime = video.currentTime
    const results = faceLandmarker.detectForVideo(video, startTimeMs)
    
    if (results.faceLandmarks && results.faceLandmarks.length > 0) {
      const landmarks = results.faceLandmarks[0]
      const matrix = results.facialTransformationMatrixes ? results.facialTransformationMatrixes[0] : null
      
      drawGlasses(ctx, landmarks, matrix, canvas.width, canvas.height)
    }
  } else {
    // If we didn't process a new video frame, we still draw the last smoothed position to prevent flicker.
    // However, the video isn't redrawn. Actually, we should redraw the last frame here too.
    // The previous drawImage handles this automatically since video content hasn't changed.
  }

  animationId = requestAnimationFrame(renderLoop)
}

function drawGlasses(ctx, landmarks, matrix, w, h) {
  // Landmarks to use:
  // 168: Between eyebrows (center of glasses bridge)
  // 33: Left eye outer corner
  // 263: Right eye outer corner
  // 4: Nose tip (for yaw/pitch fallback)

  const ptCenter = landmarks[168]
  const ptLeftEye = landmarks[33]
  const ptRightEye = landmarks[263]
  
  // Convert normalized coordinates [0, 1] to pixel coordinates
  // Note: the canvas image is flipped horizontally!
  // Since we drew the video flipped, we must also flip the landmark X coordinates.
  const cx = (1 - ptCenter.x) * w
  const cy = ptCenter.y * h
  
  const lx = (1 - ptLeftEye.x) * w
  const ly = ptLeftEye.y * h
  const rx = (1 - ptRightEye.x) * w
  const ry = ptRightEye.y * h

  // Distance between outer eye corners (pixels)
  const eyeDistance = Math.sqrt(Math.pow(rx - lx, 2) + Math.pow(ry - ly, 2))
  
  // Glasses width should be wider than the eye distance. 2.2x is a good starting point.
  const glassesWidth = eyeDistance * 2.2
  const glassesHeight = glassesWidth * (glassesImg.height / glassesImg.width)
  
  // Calculate Roll (tilt left/right). 
  // Angle of the vector from left eye to right eye.
  // Note: Because we flipped X, lx is right on screen and rx is left on screen.
  // Vector from rx to lx gives the tilt.
  const roll = Math.atan2(ly - ry, lx - rx)

  // Calculate Yaw and Pitch from Transformation Matrix if available
  let pitch = 0
  let yaw = 0
  if (matrix && matrix.data) {
    // Matrix is 4x4, column-major.
    const m13 = matrix.data[8]
    const m23 = matrix.data[9]
    const m33 = matrix.data[10]
    
    // Extract Euler angles from rotation matrix (approximate)
    yaw = Math.asin(-m13)
    pitch = Math.atan2(m23, m33)
  } else {
    // Fallback using nose tip relative to eyes center
    const ptNose = landmarks[4]
    const nx = (1 - ptNose.x) * w
    const ny = ptNose.y * h
    const midX = (lx + rx) / 2
    const midY = (ly + ry) / 2
    yaw = (nx - midX) / eyeDistance * Math.PI / 2
    pitch = (ny - midY) / eyeDistance * Math.PI / 2
  }

  setRotation(pitch, yaw, roll)

  // EMA Smoothing
  if (!hasPreviousPos) {
    smoothedPos = { x: cx, y: cy, w: glassesWidth, roll, pitch, yaw }
    hasPreviousPos = true
  } else {
    smoothedPos.x = lerp(smoothedPos.x, cx, EMA_ALPHA)
    smoothedPos.y = lerp(smoothedPos.y, cy, EMA_ALPHA)
    smoothedPos.w = lerp(smoothedPos.w, glassesWidth, EMA_ALPHA)
    smoothedPos.roll = lerp(smoothedPos.roll, roll, EMA_ALPHA)
    smoothedPos.pitch = lerp(smoothedPos.pitch, pitch, EMA_ALPHA)
    smoothedPos.yaw = lerp(smoothedPos.yaw, yaw, EMA_ALPHA)
  }

  // Draw on Canvas
  ctx.save()
  
  // Apply Y offset from slider (userYOffsetRatio is a fraction of the glasses width)
  const yOffset = smoothedPos.w * userYOffsetRatio

  // Move to anchor (pt 168 is exactly on the nose bridge, which is the perfect anchor for glasses)
  ctx.translate(smoothedPos.x, smoothedPos.y - yOffset)
  
  // Rotate
  ctx.rotate(smoothedPos.roll)
  
  // Apply 3D perspective via scaling
  const scaleX = Math.max(0.3, Math.cos(smoothedPos.yaw))
  const scaleY = Math.max(0.3, Math.cos(smoothedPos.pitch))
  ctx.scale(scaleX, scaleY)
  
  // Draw
  ctx.drawImage(
    glassesImg,
    -smoothedPos.w / 2,
    -glassesHeight / 2,
    smoothedPos.w,
    glassesHeight
  )
  
  ctx.restore()
  
  // Face Shape detection (Simple version based on face contour landmarks 10 (top) and 152 (bottom) vs 234 (left) and 454 (right))
  const top = landmarks[10], bottom = landmarks[152]
  const left = landmarks[234], right = landmarks[454]
  const faceHeight = bottom.y - top.y
  const faceWidth = right.x - left.x // normalized coordinates
  
  const faceRatio = faceWidth / faceHeight
  
  if (faceRatio > 0.80) {
    faceShapeValue.textContent = 'Round / Square'
  } else {
    faceShapeValue.textContent = 'Oval / Long'
  }
  recommendationCard.hidden = false
  recommendationCard.style.boxShadow = '0 0 0 2px var(--success), 0 14px 30px rgba(125, 227, 161, 0.15)'
}
