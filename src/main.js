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
            <strong id="rotationValue">0°, 0°, 0°</strong>
          </div>
        </div>
      </div>
    </section>
  </main>
`

const startButton = document.querySelector('#startButton')
const statusText = document.querySelector('#statusText')
const trackingValue = document.querySelector('#trackingValue')
const rotationValue = document.querySelector('#rotationValue')
const statusDot = document.querySelector('#statusDot')
const canvas = document.querySelector('#jeeFaceFilterCanvas')

const SETTINGS = {
  detectionThreshold: 0.82,
  detectionHysteresis: 0.04,
}

let isScriptsLoaded = false
let isInitializing = false
let isDetected = false
let jeelizCanvasHelper = null

function setStatus(message, tone = 'idle') {
  statusText.textContent = message
  document.documentElement.dataset.status = tone
  statusDot.dataset.status = tone
}

function setTrackingState(label) {
  trackingValue.textContent = label
}

function setRotation(rx = 0, ry = 0, rz = 0) {
  const toDegrees = (value) => `${Math.round((value * 180) / Math.PI)}°`
  rotationValue.textContent = `${toDegrees(rx)}, ${toDegrees(ry)}, ${toDegrees(rz)}`
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`)
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve()
      } else {
        existing.addEventListener('load', resolve, { once: true })
        existing.addEventListener('error', reject, { once: true })
      }
      return
    }

    const script = document.createElement('script')
    script.src = src
    script.async = false
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true'
      resolve()
    }, { once: true })
    script.addEventListener('error', () => {
      reject(new Error(`Failed to load script: ${src}`))
    }, { once: true })
    document.head.append(script)
  })
}

async function ensureJeelizScripts() {
  if (isScriptsLoaded) return

  await loadScript('/jeeliz/dist/jeelizFaceFilter.js')
  await loadScript('/jeeliz/helpers/JeelizResizer.js')
  await loadScript('/jeeliz/helpers/JeelizCanvas2DHelper.js')
  isScriptsLoaded = true
}

function drawTrackingFrame(detectState) {
  if (!jeelizCanvasHelper) return

  const { ctx, canvas: helperCanvas } = jeelizCanvasHelper
  const face = jeelizCanvasHelper.getCoordinates(detectState)
  const radius = Math.max(18, face.w * 0.12)

  ctx.clearRect(0, 0, helperCanvas.width, helperCanvas.height)
  ctx.strokeStyle = 'rgba(245, 211, 104, 0.95)'
  ctx.lineWidth = Math.max(2, face.w * 0.015)
  ctx.fillStyle = 'rgba(245, 211, 104, 0.08)'

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
  jeelizCanvasHelper.ctx.clearRect(
    0,
    0,
    jeelizCanvasHelper.canvas.width,
    jeelizCanvasHelper.canvas.height
  )
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

function initJeeliz(bestVideoSettings) {
  window.JEELIZFACEFILTER.init({
    canvasId: 'jeeFaceFilterCanvas',
    NNCPath: '/jeeliz/neuralNets/',
    maxFacesDetected: 1,
    videoSettings: bestVideoSettings,
    callbackReady: (errCode, spec) => {
      isInitializing = false

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
      if (jeelizCanvasHelper) {
        jeelizCanvasHelper.draw()
      }
    },
  })
}

async function startExperience() {
  if (isInitializing) return

  isInitializing = true
  startButton.disabled = true
  startButton.textContent = 'Starting...'
  setStatus('Loading tracking engine...', 'warning')
  setTrackingState('Loading')

  try {
    await ensureJeelizScripts()

    window.JeelizResizer.size_canvas({
      canvas,
      CSSFlipX: true,
      isApplyCSS: true,
      overSamplingFactor: 1,
      callback: (isError, bestVideoSettings) => {
        if (isError) {
          isInitializing = false
          setStatus('Canvas setup failed', 'error')
          setTrackingState('Error')
          startButton.disabled = false
          startButton.textContent = 'Try again'
          return
        }

        setStatus('Requesting camera access...', 'warning')
        initJeeliz(bestVideoSettings)
      },
    })
  } catch (error) {
    isInitializing = false
    setStatus('Failed to load Jeeliz assets', 'error')
    setTrackingState('Error')
    startButton.disabled = false
    startButton.textContent = 'Try again'
    console.error(error)
  }
}

startButton.addEventListener('click', startExperience)
