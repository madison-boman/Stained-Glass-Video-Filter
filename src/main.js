import { renderStainedGlass } from './stainedGlass.js';

const video = document.getElementById('camera');
const demoCanvas = document.getElementById('demo-source');
const output = document.getElementById('output');
const startBtn = document.getElementById('start-btn');
const snapshotBtn = document.getElementById('snapshot-btn');
const statusEl = document.getElementById('status');
const detailInput = document.getElementById('detail-level');
const colorLevelsInput = document.getElementById('color-levels');
const leadStrengthInput = document.getElementById('lead-strength');
const cameraFacingInput = document.getElementById('camera-facing');

const outputCtx = output.getContext('2d', { willReadFrequently: true });
const sourceCanvas = document.createElement('canvas');
const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });

let animationId = null;
let usingDemo = false;
let demoPhase = 0;
let activeStream = null;

function getOptions() {
  return {
    detail: Number(detailInput.value) / 100,
    colorLevels: Number(colorLevelsInput.value),
    leadStrength: Number(leadStrengthInput.value) / 100,
  };
}

function setStatus(message) {
  statusEl.textContent = message;
}

function resizeCanvases(width, height) {
  output.width = width;
  output.height = height;
  sourceCanvas.width = width;
  sourceCanvas.height = height;
}

function drawDemoFrame() {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  demoPhase += 0.02;

  const gradient = sourceCtx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, `hsl(${(demoPhase * 40) % 360}, 80%, 55%)`);
  gradient.addColorStop(0.5, `hsl(${(demoPhase * 40 + 120) % 360}, 75%, 50%)`);
  gradient.addColorStop(1, `hsl(${(demoPhase * 40 + 240) % 360}, 85%, 60%)`);

  sourceCtx.fillStyle = gradient;
  sourceCtx.fillRect(0, 0, width, height);

  sourceCtx.fillStyle = `hsl(${(demoPhase * 60 + 30) % 360}, 70%, 45%)`;
  sourceCtx.beginPath();
  sourceCtx.arc(
    width * 0.5 + Math.sin(demoPhase) * width * 0.15,
    height * 0.5 + Math.cos(demoPhase * 1.3) * height * 0.1,
    Math.min(width, height) * 0.18,
    0,
    Math.PI * 2,
  );
  sourceCtx.fill();
}

function renderFrame() {
  if (usingDemo) {
    drawDemoFrame();
  } else if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    sourceCtx.drawImage(video, 0, 0, sourceCanvas.width, sourceCanvas.height);
  }

  renderStainedGlass(sourceCtx, outputCtx, sourceCanvas.width, sourceCanvas.height, getOptions());
  animationId = requestAnimationFrame(renderFrame);
}

function stopRendering() {
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
}

function stopActiveStream() {
  if (activeStream === null) {
    return;
  }

  activeStream.getTracks().forEach((track) => track.stop());
  activeStream = null;
  video.srcObject = null;
}

async function startCamera() {
  stopRendering();
  stopActiveStream();
  usingDemo = false;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: cameraFacingInput.value } },
      audio: false,
    });
    activeStream = stream;
    video.srcObject = stream;
    video.hidden = false;
    demoCanvas.hidden = true;
    await video.play();

    resizeCanvases(video.videoWidth || 640, video.videoHeight || 480);
    snapshotBtn.disabled = false;
    setStatus('Live camera active. Adjust sliders to change the stained glass look.');
    renderFrame();
  } catch {
    startDemo();
  }
}

function startDemo() {
  stopRendering();
  stopActiveStream();
  usingDemo = true;
  video.hidden = true;
  demoCanvas.hidden = true;

  resizeCanvases(640, 480);
  snapshotBtn.disabled = false;
  setStatus('Demo mode: animated scene (no camera available).');
  renderFrame();
}

snapshotBtn.addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = `stained-glass-${Date.now()}.png`;
  link.href = output.toDataURL('image/png');
  link.click();
});

startBtn.addEventListener('click', startCamera);
cameraFacingInput.addEventListener('change', () => {
  if (!usingDemo && activeStream !== null) {
    startCamera();
  }
});

[startBtn, snapshotBtn, cameraFacingInput].forEach((el) => {
  el.addEventListener('click', () => el.blur());
});

window.addEventListener('resize', () => {
  if (!animationId) {
    return;
  }
  const width = usingDemo ? 640 : video.videoWidth || 640;
  const height = usingDemo ? 480 : video.videoHeight || 480;
  resizeCanvases(width, height);
});

startDemo();
