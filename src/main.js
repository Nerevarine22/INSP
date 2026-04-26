import './style.css'

const app = document.querySelector('#app')

app.innerHTML = `
  <main class="mobile-shell">
    <section class="hero-panel">
      <p class="eyebrow">SpecSight AR</p>
      <h1>Mobile face tracking prototype</h1>
      <p class="intro">
        Minimal Jeeliz demo adapted for mobile: opens the camera, detects one face,
        and draws a live guide over it.
      </p>
    </section>

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
          <div class="metric-card">
            <span class="metric-label">Tracking</span>
            <strong id="trackingValue">Waiting</strong>
          </div>
          <div class="metric-card">
            <span class="metric-label">Rotation</span>
            <strong id="rotationValue">0 deg, 0 deg, 0 deg</strong>
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
    // Skip if already in DOM
    if (document.querySelector(`script[src="${src}"]`)) {
      return resolve()
    }
    const el = document.createElement('script')
    el.src = src
    el.onload  = () => resolve()
    el.onerror = () => reject(new Error(`Failed to load script: ${src}`))
    document.head.appendChild(el)
  })
}

async function loadJeelizScripts() {
  for (const step of JEELIZ_SCRIPTS) {
    showLoading(step.label, step.progress)
    await injectScript(step.src)      // reliable onload / onerror
  }
  scriptsLoaded = true
}

// ─── Background preload (starts right after page render) ──────────────────

function preloadScriptsSilently() {
  if (preloadPromise) return preloadPromise
  preloadPromise = loadJeelizScripts().catch(() => {
    // silent — will retry properly on button click
    preloadPromise = null
  })
  return preloadPromise
}

// ─── Tracking drawing ───────────────────────────────────────────────────────

function drawTrackingFrame(detectState) {
  if (!jeelizCanvasHelper) return
  const { ctx, canvas: helperCanvas } = jeelizCanvasHelper
  const face   = jeelizCanvasHelper.getCoordinates(detectState)
  const radius = Math.max(18, face.w * 0.12)

  ctx.clearRect(0, 0, helperCanvas.width, helperCanvas.height)
  ctx.strokeStyle = 'rgba(245, 211, 104, 0.95)'
  ctx.lineWidth   = Math.max(2, face.w * 0.015)
  ctx.fillStyle   = 'rgba(245, 211, 104, 0.08)'

  ctx.beginPath()
  ctx.moveTo(face.x + radius, face.y)
  ctx.lineTo(face.x + face.w - radius, face.y)
  ctx.quadraticCurveTo(face.x + face.w, face.y, face.x + face.w, face.y + radius)
  ctx.lineTo(face.x + face.w, face.y + face.h - radius)
  ctx.quadraticCurveTo(face.x + face.w, face.y + face.h, face.x + face.w - radius, face.y + face.h)
  ctx.lineTo(face.x + radius, face.y + face.h)
  ctx.quadraticCurveTo(face.x, face.y + face.h, face.x, face.y + face.h - radius)
  ctx.lineTo(face.x, face.y + radius)
  ctx.quadraticCurveTo(face.x, face.y, face.x + radius, face.y)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(face.x + face.w * 0.5, face.y + face.h * 0.42, Math.max(6, face.w * 0.03), 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.fill()

  jeelizCanvasHelper.update_canvasTexture()
}

function clearTrackingFrame() {
  if (!jeelizCanvasHelper) return
  jeelizCanvasHelper.ctx.clearRect(0, 0, jeelizCanvasHelper.canvas.width, jeelizCanvasHelper.canvas.height)
  jeelizCanvasHelper.update_canvasTexture()
}

function handleDetectionState(detectState) {
  if (isDetected && detectState.detected < SETTINGS.detectionThreshold - SETTINGS.detectionHysteresis) {
    isDetected = false
    setStatus('Face lost, align your face inside the frame', 'warning')
    setTrackingState('Searching')
    clearTrackingFrame()
    setRotation()
    return
  }
  if (!isDetected && detectState.detected > SETTINGS.detectionThreshold + SETTINGS.detectionHysteresis) {
    isDetected = true
    setStatus('Face detected', 'success')
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

  window.JeelizResizer.size_canvas({
    canvas,
    CSSFlipX: true,
    isApplyCSS: true,
    overSamplingFactor: 1,
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
}

startButton.addEventListener('click', startExperience)

// ─── Background preload (starts right after UI render) ─────────────────────
// 1. Jeeliz JS scripts
setTimeout(preloadScriptsSilently, 100)
// 2. Neural network JSON — prefetch into browser cache so fetch() is instant
setTimeout(() => {
  fetch('/jeeliz/neuralNets/NN_VERYLIGHT_1.json').catch(() => {})
}, 200)
