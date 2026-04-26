import './style.css'

const app = document.querySelector('#app')

app.innerHTML = `
  <main class="mobile-shell">
    <section class="viewer-panel">
      <div class="camera-stage">
        <canvas id="jeeFaceFilterCanvas" aria-label="Camera preview"></canvas>

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
            <p id="recommendationText" class="recommendation-desc">Please look straight at the camera to determine your face shape.</p>
          </div>
          <!-- Debug metrics hidden for clean UI -->
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
const canvas          = document.querySelector('#jeeFaceFilterCanvas')
const loadingOverlay  = document.querySelector('#loadingOverlay')
const loadingBar      = document.querySelector('#loadingBar')
const loadingLabel    = document.querySelector('#loadingLabel')

const recommendationCard = document.querySelector('#recommendationCard')
const faceShapeValue     = document.querySelector('#faceShapeValue')
const recommendationText = document.querySelector('#recommendationText')

const SETTINGS = {
  detectionThreshold: 0.82,
  detectionHysteresis: 0.04,
}

const JEELIZ_SCRIPTS = [
  { src: '/jeeliz/dist/jeelizFaceFilter.js',      label: 'Loading face engine…',  progress: 33 },
  { src: '/jeeliz/helpers/JeelizResizer.js',       label: 'Loading canvas helper…', progress: 66 },
  { src: '/jeeliz/helpers/JeelizCanvas2DHelper.js',label: 'Ready…',                progress: 100 },
]

let isInitializing    = false
let isDetected        = false
let jeelizCanvasHelper = null
let scriptsLoaded     = false
let preloadPromise    = null  // resolves when scripts are ready

// Face Analytics State
let faceRatioSamples  = []
let analysisComplete  = false

// Tracking Smoothing (LERP) State
let smoothedFace      = null
let smoothedRot       = null
const LERP_FACTOR     = 0.35 // 35% new position, 65% old position for smooth tracking

// ─── Assets ─────────────────────────────────────────────────────────────────

const glassesImg = new Image()
glassesImg.src = '/glasses.svg'

// ─── UI helpers ────────────────────────────────────────────────────────────

function setStatus(message, tone = 'idle') {
  statusText.textContent = message
  document.documentElement.dataset.status = tone
  statusDot.dataset.status = tone
}

function setTrackingState(label) {
  trackingValue.textContent = label
}

function setRotation(rx = 0, ry = 0, rz = 0) {
  const toDegrees = (v) => `${Math.round((v * 180) / Math.PI)} deg`
  rotationValue.textContent = `${toDegrees(rx)}, ${toDegrees(ry)}, ${toDegrees(rz)}`
}

function showLoading(label, pct) {
  loadingOverlay.hidden = false
  loadingLabel.textContent = label
  loadingBar.style.width = `${pct}%`
}

function hideLoading() {
  loadingOverlay.hidden = true
  loadingBar.style.width = '0%'
}

// ─── Dynamic script loader ──────────────────────────────────────────────────

function injectScript(src) {
  return new Promise((resolve, reject) => {
    // Skip if already in DOM and actually loaded
    if (document.querySelector(`script[src="${src}"][data-loaded="true"]`)) {
      return resolve()
    }
    const el = document.createElement('script')
    el.src = src
    el.onload  = () => {
      el.dataset.loaded = 'true'
      resolve()
    }
    el.onerror = () => {
      el.remove() // remove so we can retry later
      reject(new Error(`Failed to load script: ${src}`))
    }
    document.head.appendChild(el)
  })
}

async function loadJeelizScripts(silent = false) {
  for (const step of JEELIZ_SCRIPTS) {
    if (!silent) showLoading(step.label, step.progress)
    await injectScript(step.src)      // reliable onload / onerror
  }
  scriptsLoaded = true
}

// ─── Background preload (starts right after page render) ──────────────────

function preloadScriptsSilently() {
  if (preloadPromise) return preloadPromise
  preloadPromise = loadJeelizScripts(true).catch(() => {
    // silent — will retry properly on button click
    preloadPromise = null
  })
  return preloadPromise
}

// ─── Tracking drawing ───────────────────────────────────────────────────────

function drawTrackingFrame(detectState) {
  if (!jeelizCanvasHelper || !glassesImg.complete) return
  const { ctx, canvas: helperCanvas } = jeelizCanvasHelper
  const rawFace = jeelizCanvasHelper.getCoordinates(detectState)

  // Initialize smoothing if it's the first frame
  if (!smoothedFace) {
    smoothedFace = { ...rawFace }
    smoothedRot  = { rx: detectState.rx, ry: detectState.ry, rz: detectState.rz }
  } else {
    // Apply Linear Interpolation (LERP) to reduce jitter
    smoothedFace.x += (rawFace.x - smoothedFace.x) * LERP_FACTOR
    smoothedFace.y += (rawFace.y - smoothedFace.y) * LERP_FACTOR
    smoothedFace.w += (rawFace.w - smoothedFace.w) * LERP_FACTOR
    smoothedFace.h += (rawFace.h - smoothedFace.h) * LERP_FACTOR

    smoothedRot.rx += (detectState.rx - smoothedRot.rx) * LERP_FACTOR
    smoothedRot.ry += (detectState.ry - smoothedRot.ry) * LERP_FACTOR
    smoothedRot.rz += (detectState.rz - smoothedRot.rz) * LERP_FACTOR
  }

  const face = smoothedFace

  ctx.clearRect(0, 0, helperCanvas.width, helperCanvas.height)
  ctx.save()

  // 1. Move canvas origin to the center of the detected face box
  ctx.translate(face.x + face.w / 2, face.y + face.h / 2)

  // JeelizCanvas2DHelper flips the canvas vertically (scaleY = -1) by default.
  // We MUST un-flip it so our image draws right-side up.
  ctx.scale(1, -1)

  // 2. Apply Rotations (faking 3D with 2D Canvas)
  // rz is the roll (tilt left/right). Negate it to fix inverted tilt!
  ctx.rotate(-smoothedRot.rz)

  // rx is pitch (looking up/down). ry is yaw (looking left/right).
  // Dampen the angles so the glasses don't distort wildly when tilting the camera.
  const pitch = smoothedRot.rx * 0.5
  const yaw   = smoothedRot.ry * 0.5
  const scaleX = Math.max(0.5, Math.cos(yaw))
  const scaleY = Math.max(0.5, Math.cos(pitch))
  ctx.scale(scaleX, scaleY)

  // 3. Draw the glasses image centered
  const glassesWidth = face.w * 1.15 // Slightly scaled down for better fit
  const glassesHeight = glassesWidth * (glassesImg.height / glassesImg.width)
  
  // Offset to rest on the nose bridge.
  // The lightweight neural net anchors detectState.y near the bottom lip/chin.
  // -0.55 was on the nose, -0.85 was on the eyebrows. -0.70 places it exactly on the eyes.
  const noseOffsetY = face.w * -0.70

  const drawX = -glassesWidth / 2
  const drawY = -glassesHeight / 2 + noseOffsetY

  ctx.drawImage(
    glassesImg,
    drawX,
    drawY,
    glassesWidth,
    glassesHeight
  )

  ctx.restore()
  jeelizCanvasHelper.update_canvasTexture()
}

// Handle device orientation changes
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    // If the orientation changes drastically, the most robust way to reset WebAR 
    // camera streams and neural net aspect ratios is to reload the instance.
    if (Math.abs(window.orientation) === 90 || window.innerWidth > window.innerHeight !== (document.body.clientWidth > document.body.clientHeight)) {
       window.location.reload();
    }
  }, 500);
});

function clearTrackingFrame() {
  if (!jeelizCanvasHelper) return
  const { ctx, canvas: helperCanvas } = jeelizCanvasHelper
  ctx.clearRect(0, 0, helperCanvas.width, helperCanvas.height)
  jeelizCanvasHelper.update_canvasTexture()
  smoothedFace = null
  smoothedRot  = null
}

function handleDetectionState(detectState) {
  if (isDetected && detectState.detected < SETTINGS.detectionThreshold - SETTINGS.detectionHysteresis) {
    isDetected = false
    setStatus('Face lost, align your face inside the frame', 'warning')
    setTrackingState('Searching')
    clearTrackingFrame()
    setRotation()
    recommendationCard.hidden = true
    return
  }
  if (!isDetected && detectState.detected > SETTINGS.detectionThreshold + SETTINGS.detectionHysteresis) {
    isDetected = true
    setStatus('Face detected', 'success')
    recommendationCard.hidden = false
  }
  if (!isDetected) {
    setTrackingState('Searching')
    clearTrackingFrame()
    setRotation()
    return
  }
  setTrackingState(`${Math.round(detectState.detected * 100)}%`)
  setRotation(detectState.rx, detectState.ry, detectState.rz)
  drawTrackingFrame(detectState)
  
  if (!analysisComplete) {
    analyzeFaceShape(detectState)
  }
}

function analyzeFaceShape(detectState) {
  // Only sample if the user is looking relatively straight (rx and ry close to 0)
  const isLookingStraight = Math.abs(detectState.rx) < 0.15 && Math.abs(detectState.ry) < 0.15
  
  if (!isLookingStraight) {
    return // skip frame
  }

  const face = jeelizCanvasHelper.getCoordinates(detectState)
  const ratio = face.w / face.h
  faceRatioSamples.push(ratio)

  if (faceRatioSamples.length >= 30) {
    analysisComplete = true
    const avgRatio = faceRatioSamples.reduce((a, b) => a + b, 0) / faceRatioSamples.length
    
    // Ratios are typically between 0.7 and 1.0 depending on the model output and face shape.
    // Taller/narrower ratio indicates an Oval/Long face, wider ratio indicates Round/Square.
    if (avgRatio > 0.82) {
      faceShapeValue.textContent = 'Round / Square'
      recommendationText.textContent = 'Angular frames like rectangles or wayfarers will add great contrast to your face.'
    } else {
      faceShapeValue.textContent = 'Oval / Long'
      recommendationText.textContent = 'Most frames suit you! Try oversized or round frames to complement your proportions.'
    }
    
    // Celebrate with UI update
    recommendationCard.style.boxShadow = '0 0 0 2px var(--success), 0 14px 30px rgba(125, 227, 161, 0.15)'
  } else {
    faceShapeValue.textContent = `Analyzing... ${Math.round((faceRatioSamples.length / 30) * 100)}%`
  }
}

// ─── Jeeliz init ────────────────────────────────────────────────────────────

async function initJeeliz(bestVideoSettings) {
  // Merge the best settings from JeelizResizer with our max-resolution cap
  const videoSettings = Object.assign({
    idealWidth: 640,
    idealHeight: 480,
    maxWidth: 1280,
    maxHeight: 720,
  }, bestVideoSettings)

  // Fetch the lightweight model (~250KB vs 3.7MB default)
  // Jeeliz accepts a pre-fetched NNC object directly
  const nnUrl = '/jeeliz/neuralNets/NN_VERYLIGHT_1.json'
  let nnData
  try {
    const res = await fetch(nnUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    nnData = await res.json()
  } catch (e) {
    isInitializing = false
    hideLoading()
    setStatus(`Failed to load neural net: ${e.message}`, 'error')
    setTrackingState('Error')
    startButton.disabled = false
    startButton.textContent = 'Try again'
    return
  }

  window.JEELIZFACEFILTER.init({
    canvasId: 'jeeFaceFilterCanvas',
    NNC: nnData,          // pre-fetched lightweight model
    maxFacesDetected: 1,
    videoSettings,
    callbackReady: (errCode, spec) => {
      isInitializing = false
      hideLoading()

      if (errCode) {
        setStatus(`Camera start failed: ${errCode}`, 'error')
        setTrackingState('Error')
        startButton.disabled = false
        startButton.textContent = 'Try again'
        return
      }

      jeelizCanvasHelper = window.JeelizCanvas2DHelper(spec)
      setStatus('Camera live, looking for a face', 'warning')
      setTrackingState('Searching')
      startButton.textContent = 'Camera active'
      startButton.disabled = true
    },
    callbackTrack: (detectState) => {
      handleDetectionState(detectState)
      if (jeelizCanvasHelper) jeelizCanvasHelper.draw()
    },
  })
}

// ─── Main entry ─────────────────────────────────────────────────────────────

async function startExperience() {
  if (isInitializing) return
  isInitializing = true
  startButton.disabled = true
  setStatus('Loading tracking engine…', 'warning')
  setTrackingState('Loading')

  try {
    if (!scriptsLoaded) {
      await loadJeelizScripts()
    }
  } catch (err) {
    isInitializing = false
    hideLoading()
    setStatus(`Failed to load engine: ${err.message}`, 'error')
    setTrackingState('Error')
    startButton.disabled = false
    startButton.textContent = 'Try again'
    return
  }

  showLoading('Starting camera…', 100)
  setStatus('Requesting camera access…', 'warning')

  try {
    if (!window.JeelizResizer || !window.JEELIZFACEFILTER) {
      throw new Error('Engine objects are missing. Script loading might have failed.')
    }

    JeelizResizer.size_canvas({
      canvasId: 'jeeFaceFilterCanvas',
      isFullScreen: true, // Let Jeeliz handle basic resizing
      overSamplingFactor: Math.min(window.devicePixelRatio || 1, 2), // Retina support (capped at 2x to prevent thermal throttling)
      callback: async (isError, bestVideoSettings) => {
        if (isError) {
          isInitializing = false
          hideLoading()
          setStatus('Canvas setup failed', 'error')
          setTrackingState('Error')
          startButton.disabled = false
          startButton.textContent = 'Try again'
          return
        }
        await initJeeliz(bestVideoSettings)
      },
    })
  } catch (err) {
    isInitializing = false
    hideLoading()
    setStatus(`Setup error: ${err.message}`, 'error')
    setTrackingState('Error')
    startButton.disabled = false
    startButton.textContent = 'Try again'
  }
}

startButton.addEventListener('click', startExperience)

// ─── Background preload (starts right after UI render) ─────────────────────
// 1. Jeeliz JS scripts
setTimeout(preloadScriptsSilently, 100)
// 2. Neural network JSON — prefetch into browser cache so fetch() is instant
setTimeout(() => {
  fetch('/jeeliz/neuralNets/NN_VERYLIGHT_1.json').catch(() => {})
}, 200)
