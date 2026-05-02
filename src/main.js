import './style.css'

const app = document.querySelector('#app')

app.innerHTML = `
  <main class="mobile-shell">
    <section class="viewer-panel" id="mainViewer">
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
          
          <!-- Calibration Controls -->
          <div class="calibration-panel" id="calibrationPanel" hidden>
             <p class="calibration-title">Capture Data for Weight Tuning</p>
             <div class="calibration-buttons">
                <button class="cal-btn" data-shape="Elongated">Elongated</button>
                <button class="cal-btn" data-shape="Angular">Angular</button>
                <button class="cal-btn" data-shape="Rounded">Rounded</button>
                <button class="cal-btn" data-shape="Oval">Oval</button>
             </div>
             <p class="calibration-status" id="calStatus">No samples yet</p>
          </div>

          <!-- Frame Selector Gallery -->
          <div class="frame-gallery" id="frameGallery">
            <div class="frame-item active" data-src="/glasses.svg">
              <img src="/glasses.svg" alt="Frame 1">
            </div>
            <div class="frame-item" data-src="/image-Photoroom.png">
              <img src="/image-Photoroom.png" alt="Frame 2">
            </div>
            <div class="frame-item" data-src="/pngwing.com.png">
              <img src="/pngwing.com.png" alt="Frame 3">
            </div>
            <div class="frame-item" data-src="/image.png">
              <img src="/image.png" alt="Frame 4">
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

          <div class="bottom-actions">
            <button id="toggleModeButton" class="primary-button" style="flex: 2;">Switch to Calibration</button>
            <a href="#stats" id="statsLink" class="secondary-button" style="flex: 1;">Stats</a>
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

    <!-- Stats View -->
    <section class="stats-panel" id="statsPanel" style="display: none;">
      <div class="stats-header">
        <h2>Collected Dataset</h2>
        <div style="display: flex; gap: 10px;">
          <button id="refreshStats" class="secondary-button">Refresh</button>
          <button id="downloadJson" class="primary-button">Download JSON</button>
          <button id="backToApp" class="secondary-button">Back</button>
        </div>
      </div>
      <div class="stats-content">
         <table id="statsTable">
            <thead>
              <tr>
                <th>ID</th>
                <th>Label</th>
                <th>Angle</th>
                <th>Height</th>
                <th>Jaw</th>
                <th>Width</th>
              </tr>
            </thead>
            <tbody></tbody>
         </table>
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

// Frame Gallery Logic
document.querySelectorAll('.frame-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.frame-item').forEach(f => f.classList.remove('active'));
    item.classList.add('active');
    const newSrc = item.getAttribute('data-src');
    glassesImg.src = newSrc;
  });
});

// Calibration State
let currentMetrics = null;
let savedSamplesCount = 0;

// Smart Stylist Debounce State
let shapeDetectTimeout = null
let currentCategoryStr = null
let currentShapeKey = null
let isAutoDetectionEnabled = true
const faceMetricsBuffer = []
const MAX_METRICS_BUFFER = 15

// ─── Constants & State ───────────────────────────────────────────────────────
// Face Shape Points:
// 8: Between eyebrows
// 2: Base of nose
// 10: Top forehead
// 152: Chin
// 234, 454: Cheekbones (left/right)
// 132, 361: Jaw angles (left/right)

const uBuffer = []
const MAX_U_BUFFER = 10

function getPointDist(p1, p2) {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2))
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
  const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y)
  const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y)
  return Math.acos(dot / (mag1 * mag2)) * (180 / Math.PI)
}

function getMedian(arr) {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
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
  setStatus('Loading AI model...', 'warning')
  setTrackingState('Loading')
  showLoading('Fetching MediaPipe...', 10)

  try {
    // Lazy load MediaPipe Tasks Vision
    const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')
    
    showLoading('Loading Wasm...', 40)
    // Create fileset resolver (using CDN for wasm files to keep bundle size small)
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
    )
    
    showLoading('Loading neural net...', 70)
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

  showLoading('Starting camera...', 90)
  setStatus('Requesting camera access...', 'warning')

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

// ─── Calibration & Routing Logic ──────────────────────────────────────────
const mainViewer = document.querySelector('#mainViewer');
const statsPanel = document.querySelector('#statsPanel');
const calibrationPanel = document.querySelector('#calibrationPanel');
const toggleModeButton = document.querySelector('#toggleModeButton');
const calStatus = document.querySelector('#calStatus');
const statsTableBody = document.querySelector('#statsTable tbody');

function syncRoute() {
  if (window.location.hash === '#stats') {
    mainViewer.style.display = 'none';
    statsPanel.style.display = 'flex';
    loadStats();
  } else {
    mainViewer.style.display = 'block';
    statsPanel.style.display = 'none';
  }
}

window.addEventListener('hashchange', syncRoute);
syncRoute();

let currentAppMode = 'stylist'; // 'stylist' or 'calibration'

toggleModeButton.addEventListener('click', () => {
  if (currentAppMode === 'stylist') {
    currentAppMode = 'calibration';
    toggleModeButton.textContent = 'Switch to Stylist';
    recommendationCard.hidden = true;
    calibrationPanel.hidden = false;
  } else {
    currentAppMode = 'stylist';
    toggleModeButton.textContent = 'Switch to Calibration';
    recommendationCard.hidden = false;
    calibrationPanel.hidden = true;
  }
});

document.querySelector('#backToApp').addEventListener('click', () => { window.location.hash = ''; });
document.querySelector('#refreshStats').addEventListener('click', loadStats);

document.querySelectorAll('.cal-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    if (!currentMetrics) {
      alert("No face detected!");
      return;
    }
    
    const label = btn.dataset.shape;
    const data = {
      label,
      metrics: currentMetrics,
      device: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        isTouch: 'ontouchstart' in window
      },
      env: window.location.hostname
    };
    
    try {
      btn.disabled = true;
      const res = await fetch('/api/save-calibration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await res.json();
      savedSamplesCount = result.count;
      calStatus.textContent = `Saved! Total samples: ${savedSamplesCount}`;
      btn.style.background = 'var(--success)';
      setTimeout(() => { 
        btn.style.background = '';
        btn.disabled = false;
      }, 500);
    } catch (e) {
      console.error(e);
      alert("Failed to save to server. Make sure you are running 'npm run dev' on PC.");
      btn.disabled = false;
    }
  });
});

async function loadStats() {
  try {
    const res = await fetch('/calibration_data.json');
    if (!res.ok) throw new Error("File not found");
    const data = await res.json();
    
    statsTableBody.innerHTML = data.reverse().map(s => `
      <tr>
        <td>${s.id.toString().slice(-6)}</td>
        <td><strong>${s.label}</strong></td>
        <td>${s.metrics.angle.toFixed(2)}°</td>
        <td>${s.metrics.h.toFixed(2)}</td>
        <td>${s.metrics.j.toFixed(2)}</td>
        <td>${s.metrics.w.toFixed(2)}</td>
      </tr>
    `).join('');
  } catch (e) {
    statsTableBody.innerHTML = '<tr><td colspan="6">No data yet. Start scanning on phone!</td></tr>';
  }
}

document.querySelector('#downloadJson').addEventListener('click', async () => {
  try {
    const res = await fetch('/calibration_data.json');
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'face_calibration_dataset.json';
    a.click();
  } catch (e) {
    alert("Nothing to download yet.");
  }
});

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
      uBuffer.length = 0;
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
  
  // Apply Y offset from slider
  const yOffset = smoothedPos.w * userYOffsetRatio
  const anchorX = smoothedPos.x
  const anchorY = smoothedPos.y - yOffset

  // ─── Draw Temples (Arms) with Perspective ───
  const pAnat1 = {
    x: (flipX ? (1 - landmarks[127].x) : landmarks[127].x) * w,
    y: landmarks[127].y * h
  }
  const pAnat2 = {
    x: (flipX ? (1 - landmarks[389].x) : landmarks[389].x) * w,
    y: landmarks[389].y * h
  }

  const pScreenL = pAnat1.x < pAnat2.x ? pAnat1 : pAnat2
  const pScreenR = pAnat1.x < pAnat2.x ? pAnat2 : pAnat1

  const drawTemple = (startX, startY, endX, endY, isVisible) => {
    if (!isVisible) return;
    ctx.save()
    const grad = ctx.createLinearGradient(startX, startY, endX, endY)
    grad.addColorStop(0, 'rgba(25, 25, 25, 1)')
    grad.addColorStop(0.8, 'rgba(25, 25, 25, 0.4)')
    grad.addColorStop(1, 'rgba(25, 25, 25, 0)')
    ctx.beginPath()
    ctx.strokeStyle = grad
    ctx.lineWidth = smoothedPos.w * 0.035
    ctx.lineCap = 'round'
    ctx.shadowBlur = 6
    ctx.shadowColor = 'rgba(0,0,0,0.5)'
    ctx.moveTo(startX, startY)
    ctx.lineTo(endX, endY)
    ctx.stroke()
    ctx.restore()
  }

  // Calculate frame edges with extra margin for temples
  const templeSpread = 0.95 // adjustment factor
  const halfW = (smoothedPos.w / 2) * Math.cos(smoothedPos.yaw) * templeSpread
  const cosR = Math.cos(smoothedPos.roll)
  const sinR = Math.sin(smoothedPos.roll)

  const fLx = anchorX - halfW * cosR
  const fLy = anchorY - halfW * sinR
  const fRx = anchorX + halfW * cosR
  const fRy = anchorY + halfW * sinR

  // Visibility logic based on yaw (rotation)
  // yaw > 0 means turning right (in mirrored view, left temple becomes visible)
  // We use a small threshold to avoid flickering
  const showLeftTemple = (smoothedPos.yaw > -0.1)
  const showRightTemple = (smoothedPos.yaw < 0.1)

  drawTemple(fLx, fLy, pScreenL.x, pScreenL.y, showLeftTemple)
  drawTemple(fRx, fRy, pScreenR.x, pScreenR.y, showRightTemple)

  // ─── Draw Main Frame ───
  ctx.translate(anchorX, anchorY)
  
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
  
  // Face Shape detection using Nose Units (U)
  const getP = (idx) => ({
    x: (flipX ? (1 - landmarks[idx].x) : landmarks[idx].x) * w,
    y: landmarks[idx].y * h
  })

  const p8 = getP(8)
  const p2 = getP(2)
  const p10 = getP(10)
  const p152 = getP(152)
  const p234 = getP(234)
  const p454 = getP(454)
  const p132 = getP(132)
  const p361 = getP(361)

  // Step 1: Calculate raw U
  const rawU = getPointDist(p8, p2)
  
  if (uBuffer.length >= MAX_U_BUFFER) uBuffer.shift()
  uBuffer.push(rawU)
  
  // Filtered U using median
  const U = getMedian(uBuffer)

  if (U > 0) {
    // Step 2: Normalization
    const heightUnits = getPointDist(p10, p152) / U
    const widthUnits = getPointDist(p234, p454) / U
    const jawUnits = getPointDist(p132, p361) / U
    
    // Bezier Offset
    const bezierOffsetPx = pointToLineDist(p132, p234, p152)
    const bezierOffset = bezierOffsetPx / U

    // Jaw Angle
    const angleL = getAngle(p132, p234, p152)
    const angleR = getAngle(p361, p454, p152)
    const jawAngle = (angleL + angleR) / 2

    // Step 3: Classification Logic
    if (currentAppMode === 'calibration') {
       calStatus.style.color = 'var(--accent)';
       calStatus.textContent = `Live: Angle ${jawAngle.toFixed(0)}° | H/W ${(heightUnits/widthUnits).toFixed(2)}`;
       recommendationCard.hidden = true;
       return;
    }

    recommendationCard.hidden = false;
    
    // Store for calibration record (even in stylist mode)
    currentMetrics = {
      angle: jawAngle,
      h: heightUnits,
      j: jawUnits,
      w: widthUnits
    };

    // Step 4: Classification Logic (Scoring System)
    const ratioHW = heightUnits / widthUnits;
    const diffWJ = widthUnits - jawUnits;
    
    const scores = {
      Oval: 0,
      Rounded: 0,
      Angular: 0,
      Elongated: 0
    };

    // --- Feature 1: Height/Width Ratio ---
    if (ratioHW > 1.26) scores.Elongated += 4;
    else if (ratioHW > 1.16 && ratioHW <= 1.26) scores.Oval += 2;
    else scores.Rounded += 2;

    // --- Feature 2: Jaw Angle ---
    if (jawAngle < 137) scores.Angular += 4;
    else if (jawAngle >= 137 && jawAngle < 142) {
      scores.Angular += 1;
      scores.Rounded += 2;
    }
    else scores.Oval += 3;

    // --- Feature 3: Width-Jaw Delta ---
    if (diffWJ > 0.14) scores.Rounded += 4;
    else if (diffWJ < 0.07) scores.Angular += 4;
    else {
      scores.Oval += 2;
      scores.Elongated += 1;
    }

    // --- Feature 4: Absolute Width ---
    if (widthUnits > 2.65) scores.Rounded += 2;
    if (widthUnits < 2.35) scores.Elongated += 2;

    // Determine the winner
    let bestShape = Object.keys(scores).reduce((a, b) => scores[a] > scores[b] ? a : b);
    
    // Tie-breaker or subtle bias
    if (scores[bestShape] < 3) bestShape = 'Oval'; 

    // Add to buffer for stabilization
    if (faceMetricsBuffer.length >= MAX_METRICS_BUFFER) faceMetricsBuffer.shift();
    faceMetricsBuffer.push(bestShape);

    const counts = faceMetricsBuffer.reduce((acc, shape) => { acc[shape] = (acc[shape] || 0) + 1; return acc; }, {});
    currentShapeKey = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);

    let category, advice, recommendedModels = [];

    if (currentShapeKey === 'Elongated') {
      category = 'Elongated (Подовжене)';
      advice = 'Обличчя витягнуте: обирайте великі оправи, щоб візуально вкоротити обличчя.';
      recommendedModels = ['Aviator', 'Oversized', 'Wayfarer'];
    } else if (currentShapeKey === 'Angular') {
      category = 'Angular (Квадратне/Гостре)';
      advice = 'Виражені кути: пом\'якшуйте їх за допомогою круглих або овальних оправ.';
      recommendedModels = ['Round', 'Oval', 'Panto'];
    } else if (currentShapeKey === 'Rounded') {
      category = 'Rounded (Кругле)';
      advice = 'Плавні лінії: додайте характеру за допомогою прямокутних оправ.';
      recommendedModels = ['Square', 'Rectangular', 'Cat-eye'];
    } else {
      category = 'Oval (Овальне)';
      advice = 'Ідеальний баланс: вам підійде майже будь-яка форма!';
      recommendedModels = ['Aviator', 'Wayfarer', 'Cat-eye', 'Round'];
    }

    if (category !== currentCategoryStr) {
      currentCategoryStr = category;
      faceShapeCategory.textContent = 'Analyzing...';
      recBody.hidden = true;
      if (shapeDetectTimeout) clearTimeout(shapeDetectTimeout);
      shapeDetectTimeout = setTimeout(() => {
        faceShapeCategory.textContent = category;
        faceShapeAdvice.textContent = advice;
        faceShapeModels.textContent = recommendedModels.join(', ');
        recBody.hidden = false;
        recommendationCard.hidden = false;
      }, 1500);
    }
  }



  recommendationCard.hidden = false
  recommendationCard.style.boxShadow = '0 0 0 2px var(--success), 0 14px 30px rgba(125, 227, 161, 0.15)'
}
