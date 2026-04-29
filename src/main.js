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
          <div style="display: flex; gap: 8px;">
            <button id="startButton" class="primary-button" type="button">
              Start camera
            </button>
            <button id="flipCameraButton" class="secondary-button" style="font-size: 1.2rem; padding: 0.5rem 1rem;" type="button" aria-label="Flip Camera" hidden>
              🔄
            </button>
          </div>
        </div>

        <div class="overlay bottom-overlay">
          <div class="recommendation-card" id="recommendationCard" hidden>
            <div class="rec-header">
              <span class="metric-label">Smart Stylist: <strong id="faceShapeCategory" style="color: var(--accent);">Analyzing...</strong></span>
            </div>
            <div class="rec-body" id="recBody" hidden>
              <p class="rec-advice" id="faceShapeAdvice"></p>
              <p class="rec-models"><strong>Моделі:</strong> <span id="faceShapeModels"></span></p>
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
const flipCameraButton = document.querySelector('#flipCameraButton')
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
const faceShapeCategory  = document.querySelector('#faceShapeCategory')
const recBody            = document.querySelector('#recBody')
const faceShapeAdvice    = document.querySelector('#faceShapeAdvice')
const faceShapeModels    = document.querySelector('#faceShapeModels')

let isInitializing = false
let isTracking = false
let faceLandmarker = null
let animationId = null
let lastVideoTime = -1
let currentFacingMode = 'user'

// Smart Stylist Debounce State
let shapeDetectTimeout = null
let currentCategoryStr = null
let currentShapeKey = null
const faceMetricsBuffer = []
const MAX_METRICS_BUFFER = 15

// ─── Constants & State ───────────────────────────────────────────────────────
const CONTOUR_INDICES = [234, 132, 140, 152, 369, 361, 454]

// Normalized templates (bounding box 0..1, rotated to align eyes)
// Realistic proportions: cheek-to-chin height is usually 70-80% of face width.
const FACE_TEMPLATES = {
  'Rounded': [
    {x: 0.0,  y: 0.0},
    {x: 0.12, y: 0.45},
    {x: 0.28, y: 0.65},
    {x: 0.5,  y: 0.75},
    {x: 0.72, y: 0.65},
    {x: 0.88, y: 0.45},
    {x: 1.0,  y: 0.0}
  ],
  'Angular': [
    {x: 0.0,  y: 0.0},
    {x: 0.05, y: 0.50}, // very wide jaw
    {x: 0.22, y: 0.70}, // sharp turn to chin
    {x: 0.5,  y: 0.75},
    {x: 0.78, y: 0.70},
    {x: 0.95, y: 0.50},
    {x: 1.0,  y: 0.0}
  ],
  'Elongated': [
    {x: 0.0,  y: 0.0},
    {x: 0.15, y: 0.55},
    {x: 0.30, y: 0.80},
    {x: 0.5,  y: 0.95}, // long chin
    {x: 0.70, y: 0.80},
    {x: 0.85, y: 0.55},
    {x: 1.0,  y: 0.0}
  ]
}

const calculateSimilarity = (userPoints, templatePoints) => {
  // Translate so pt0 is at (0,0)
  let pts = userPoints.map(p => ({ x: p.x - userPoints[0].x, y: p.y - userPoints[0].y }))
  // Rotate so pt6 is at (width, 0)
  const angle = Math.atan2(pts[6].y, pts[6].x)
  pts = pts.map(p => ({
    x: p.x * Math.cos(-angle) - p.y * Math.sin(-angle),
    y: p.x * Math.sin(-angle) + p.y * Math.cos(-angle)
  }))
  // Scale so pt6 is at (1, 0)
  const scale = pts[6].x > 0 ? 1 / pts[6].x : 0
  pts = pts.map(p => ({ x: p.x * scale, y: p.y * scale }))
  
  // Calculate Euclidean error
  let error = 0
  for(let i = 0; i < pts.length; i++) {
    const dx = pts[i].x - templatePoints[i].x
    const dy = pts[i].y - templatePoints[i].y
    error += Math.sqrt(dx*dx + dy*dy)
  }
  return error
}

const glassesImg = new Image()
glassesImg.src = '/pngwing.com.png'

// EMA Smoothing state
let smoothedPos = { x: 0, y: 0, w: 0, roll: 0, pitch: 0, yaw: 0 }
let hasPreviousPos = false
const EMA_ALPHA = 0.4 // 0.0 to 1.0 (lower is smoother but lags more)

// The user can fine-tune the offset relative to the glasses width (0 = exact 168 anchor)
let userYOffsetRatio = 0

yOffsetSlider.addEventListener('input', (e) => {
  // Divisor increased to 400 to make the slider 4x tighter/slower for fine micro-adjustments
  userYOffsetRatio = -(parseInt(e.target.value, 10) / 400)
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

async function startCameraStream(facingMode) {
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop())
  }
  
  const constraints = {
    video: {
      facingMode: facingMode === 'environment' ? { ideal: 'environment' } : 'user',
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  }
  
  const stream = await navigator.mediaDevices.getUserMedia(constraints)
  video.srcObject = stream
  
  return new Promise(resolve => {
    video.onloadeddata = async () => {
      try {
        await video.play()
      } catch (e) {
        console.warn('Auto-play failed:', e)
      }
      resolve()
    }
  })
}

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
    await startCameraStream(currentFacingMode)
    
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    
    hideLoading()
    setStatus('Tracking active', 'success')
    setTrackingState('Active')
    startButton.textContent = 'Camera active'
    yOffsetSlider.hidden = false
    flipCameraButton.hidden = false
    isTracking = true
    isInitializing = false
    
    // Start render loop
    animationId = requestAnimationFrame(renderLoop)
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

flipCameraButton.addEventListener('click', async () => {
  if (!isTracking) return
  isTracking = false
  if (animationId) cancelAnimationFrame(animationId)
  
  currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user'
  flipCameraButton.disabled = true
  setStatus('Switching camera...', 'warning')
  
  try {
    await startCameraStream(currentFacingMode)
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    setStatus('Tracking active', 'success')
  } catch (e) {
    setStatus('Camera flip error', 'error')
  }
  
  flipCameraButton.disabled = false
  isTracking = true
  lastVideoTime = -1
  animationId = requestAnimationFrame(renderLoop)
})

// ─── Render Loop ──────────────────────────────────────────────────────────
function renderLoop() {
  if (!isTracking) return
  
  if (video.readyState < 2) {
    animationId = requestAnimationFrame(renderLoop)
    return
  }
  
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  
  // Draw video frame onto canvas (conditionally flipped horizontally)
  ctx.save()
  if (currentFacingMode === 'user') {
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
  }
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  ctx.restore()

  let startTimeMs = performance.now()
  if (lastVideoTime !== video.currentTime) {
    lastVideoTime = video.currentTime
    let results = null
    try {
      results = faceLandmarker.detectForVideo(video, startTimeMs)
    } catch (e) {
      console.warn("MediaPipe detection skipped frame")
    }
    
    if (results && results.faceLandmarks && results.faceLandmarks.length > 0) {
      const landmarks = results.faceLandmarks[0]
      const matrix = results.facialTransformationMatrixes ? results.facialTransformationMatrixes[0] : null
      
      drawGlasses(ctx, landmarks, matrix, canvas.width, canvas.height)
    } else {
      recommendationCard.hidden = true;
      recBody.hidden = true;
      faceShapeCategory.textContent = 'Analyzing...';
      currentCategoryStr = null;
      faceMetricsBuffer.length = 0;
      if (shapeDetectTimeout) clearTimeout(shapeDetectTimeout);
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
  // 6: Nose bridge (sits lower and closer to the face than 168)
  // 33: Left eye outer corner
  // 263: Right eye outer corner
  // 4: Nose tip (for yaw/pitch fallback)

  const ptCenter = landmarks[6]
  const ptLeftEye = landmarks[33]
  const ptRightEye = landmarks[263]
  
  const flipX = currentFacingMode === 'user';
  
  // Convert normalized coordinates [0, 1] to pixel coordinates
  const cx = (flipX ? (1 - ptCenter.x) : ptCenter.x) * w
  const cy = ptCenter.y * h
  
  const lx = (flipX ? (1 - ptLeftEye.x) : ptLeftEye.x) * w
  const ly = ptLeftEye.y * h
  const rx = (flipX ? (1 - ptRightEye.x) : ptRightEye.x) * w
  const ry = ptRightEye.y * h

  // Distance between outer eye corners (pixels)
  const eyeDistance = Math.sqrt(Math.pow(rx - lx, 2) + Math.pow(ry - ly, 2))
  
  // Glasses width should be wider than the eye distance.
  const glassesWidth = eyeDistance * 1.55
  const glassesHeight = glassesWidth * (glassesImg.height / glassesImg.width)
  
  // Calculate Roll (tilt left/right).
  const roll = flipX 
    ? Math.atan2(ly - ry, lx - rx) 
    : Math.atan2(ry - ly, rx - lx)

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

  // Move to anchor (pt 6 is lower on the nose bridge, closer to where glasses naturally rest)
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
  
  // Face Shape detection using Template Similarity
  const userPts = CONTOUR_INDICES.map(idx => ({
    x: flipX ? (1 - landmarks[idx].x) : landmarks[idx].x,
    y: landmarks[idx].y
  }))
  
  const errors = {
    'Rounded': calculateSimilarity(userPts, FACE_TEMPLATES['Rounded']),
    'Angular': calculateSimilarity(userPts, FACE_TEMPLATES['Angular']),
    'Elongated': calculateSimilarity(userPts, FACE_TEMPLATES['Elongated'])
  }

  // Add to buffer
  if (faceMetricsBuffer.length >= MAX_METRICS_BUFFER) {
    faceMetricsBuffer.shift()
  }
  faceMetricsBuffer.push(errors)

  // Average the errors over the buffer
  const avgErrors = { 'Rounded': 0, 'Angular': 0, 'Elongated': 0 }
  faceMetricsBuffer.forEach(e => {
    avgErrors['Rounded'] += e['Rounded']
    avgErrors['Angular'] += e['Angular']
    avgErrors['Elongated'] += e['Elongated']
  })
  const count = faceMetricsBuffer.length
  avgErrors['Rounded'] /= count
  avgErrors['Angular'] /= count
  avgErrors['Elongated'] /= count

  // Find minimum error
  let bestShape = Object.keys(avgErrors).reduce((a, b) => avgErrors[a] < avgErrors[b] ? a : b)

  // Soft transition (5% hysteresis margin)
  if (currentShapeKey && currentShapeKey !== bestShape) {
    const currentError = avgErrors[currentShapeKey]
    const bestError = avgErrors[bestShape]
    // If the new shape isn't at least 5% better than the current one, stick with the current one
    if (bestError > currentError * 0.95) {
      bestShape = currentShapeKey
    }
  }
  currentShapeKey = bestShape

  let category, advice
  let recommendedModels = []

  // Assign based on best shape template
  if (bestShape === 'Elongated') {
    category = 'Elongated (Подовжене)'
    advice = 'Обличчя витягнуте: обирайте виключно великі оправи (Oversized, Авіатори).'
    recommendedModels = ['Aviator (Авіатори)', 'Oversized', 'Wayfarer']
  } else if (bestShape === 'Angular') {
    category = 'Angular (Квадратне/Гостре)'
    advice = 'Виражені кути щелепи: пом\'якшуйте лінію обличчя коло/овалом.'
    recommendedModels = ['Round (Круглі)', 'Oval (Овальні)', 'Panto']
  } else {
    category = 'Rounded (Кругле/Серце)'
    advice = 'Плавні лінії обличчя: додайте кутів за допомогою прямокутних оправ.'
    recommendedModels = ['Square (Квадратні)', 'Rectangular (Прямокутні)', 'Cat-eye (Котяче око)']
  }

  let models = recommendedModels.join(', ')

  if (category !== currentCategoryStr) {
    currentCategoryStr = category
    faceShapeCategory.textContent = 'Analyzing...'
    recBody.hidden = true
    
    if (shapeDetectTimeout) clearTimeout(shapeDetectTimeout)
    
    shapeDetectTimeout = setTimeout(() => {
      faceShapeCategory.textContent = category
      faceShapeAdvice.textContent = advice
      faceShapeModels.textContent = models
      recBody.hidden = false
    }, 2000)
  }

  recommendationCard.hidden = false
  recommendationCard.style.boxShadow = '0 0 0 2px var(--success), 0 14px 30px rgba(125, 227, 161, 0.15)'
}
