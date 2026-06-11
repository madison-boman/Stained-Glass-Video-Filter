import { renderStainedGlass } from './stainedGlass.js';

const video = document.getElementById('camera');
const demoCanvas = document.getElementById('demo-source');
const output = document.getElementById('output');
const startBtn = document.getElementById('start-btn');
const snapshotBtn = document.getElementById('snapshot-btn');
const statusEl = document.getElementById('status');
const mediaUploadInput = document.getElementById('media-upload');
const detailInput = document.getElementById('detail-level');
const colorLevelsInput = document.getElementById('color-levels');
const mergeThresholdInput = document.getElementById('merge-threshold');
const leadStrengthInput = document.getElementById('lead-strength');
const cameraFacingBtns = Array.from(document.querySelectorAll('.camera-facing'));

const outputCtx = output.getContext('2d', { willReadFrequently: true });
const sourceCanvas = document.createElement('canvas');
const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });

let animationId = null;
let usingDemo = false;
let demoPhase = 0;
let activeStream = null;
let cameraFacing = 'user';
let sourceMode = 'demo';
let uploadedImage = null;
let uploadedVideoUrl = null;

function getOptions() {
  return {
    detail: Number(detailInput.value) / 100,
    colorLevels: Number(colorLevelsInput.value),
    mergeThreshold: Number(mergeThresholdInput.value),
    leadStrength: Number(leadStrengthInput.value) / 100,
  };
}

function setStatus(message) {
  statusEl.textContent = message;
}

function setCameraFacing(facing) {
  cameraFacing = facing;

  cameraFacingBtns.forEach((button) => {
    const isActive = button.dataset.facing === facing;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
}

function resizeCanvases(width, height) {
  output.width = width;
  output.height = height;
  sourceCanvas.width = width;
  sourceCanvas.height = height;
}

function resizeToMedia(width, height) {
  const maxSide = 1920;
  const scale = Math.min(1, maxSide / Math.max(width, height));

  resizeCanvases(Math.round(width * scale), Math.round(height * scale));
}

function clearUploadedVideoUrl() {
  if (uploadedVideoUrl === null) {
    return;
  }

  URL.revokeObjectURL(uploadedVideoUrl);
  uploadedVideoUrl = null;
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
  if (sourceMode === 'demo') {
    drawDemoFrame();
  } else if ((sourceMode === 'camera' || sourceMode === 'video') && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    sourceCtx.drawImage(video, 0, 0, sourceCanvas.width, sourceCanvas.height);
  } else if (sourceMode === 'image' && uploadedImage !== null) {
    sourceCtx.drawImage(uploadedImage, 0, 0, sourceCanvas.width, sourceCanvas.height);
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

function resetVideoElement() {
  video.pause();
  video.removeAttribute('src');
  video.load();
}

function waitForVideoMetadata() {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    video.addEventListener('loadedmetadata', resolve, { once: true });
    video.addEventListener('error', reject, { once: true });
  });
}

async function startCamera() {
  stopRendering();
  stopActiveStream();
  clearUploadedVideoUrl();
  resetVideoElement();
  uploadedImage = null;
  usingDemo = false;
  sourceMode = 'camera';

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: cameraFacing },
        width: { ideal: 1080 },
        height: { ideal: 1920 },
      },
      audio: false,
    });
    activeStream = stream;
    video.srcObject = stream;
    video.hidden = true;
    demoCanvas.hidden = true;
    await video.play();

    resizeToMedia(video.videoWidth || 1080, video.videoHeight || 1920);
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
  clearUploadedVideoUrl();
  uploadedImage = null;
  resetVideoElement();
  usingDemo = true;
  sourceMode = 'demo';
  video.hidden = true;
  demoCanvas.hidden = true;

  resizeCanvases(640, 480);
  snapshotBtn.disabled = false;
  setStatus('Demo mode: animated scene (no camera available).');
  renderFrame();
}

function startImageUpload(file) {
  stopRendering();
  stopActiveStream();
  clearUploadedVideoUrl();
  resetVideoElement();
  usingDemo = false;
  sourceMode = 'image';

  const image = new Image();
  const url = URL.createObjectURL(file);

  image.addEventListener('load', () => {
    URL.revokeObjectURL(url);
    uploadedImage = image;
    resizeToMedia(image.naturalWidth || 640, image.naturalHeight || 480);
    snapshotBtn.disabled = false;
    setStatus('Photo loaded. Rendering stained glass output only.');
    renderFrame();
  }, { once: true });

  image.addEventListener('error', () => {
    URL.revokeObjectURL(url);
    startDemo();
    setStatus('Could not load that photo. Demo mode restored.');
  }, { once: true });

  image.src = url;
}

async function startVideoUpload(file) {
  stopRendering();
  stopActiveStream();
  clearUploadedVideoUrl();
  uploadedImage = null;
  usingDemo = false;
  sourceMode = 'video';

  uploadedVideoUrl = URL.createObjectURL(file);
  video.hidden = true;
  video.srcObject = null;
  video.src = uploadedVideoUrl;
  video.loop = true;
  video.muted = true;
  video.playsInline = true;

  try {
    await waitForVideoMetadata();
    await video.play();
    resizeToMedia(video.videoWidth || 640, video.videoHeight || 480);
    snapshotBtn.disabled = false;
    setStatus('Video loaded. Rendering stained glass output only.');
    renderFrame();
  } catch {
    clearUploadedVideoUrl();
    startDemo();
    setStatus('Could not play that video. Demo mode restored.');
  }
}

function startUpload(file) {
  if (file.type.startsWith('image/')) {
    startImageUpload(file);
    return;
  }

  if (file.type.startsWith('video/')) {
    startVideoUpload(file);
    return;
  }

  setStatus('Please choose an image or video file.');
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/png');
  });
}

function downloadSnapshot(blob, filename) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.download = filename;
  link.href = url;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

snapshotBtn.addEventListener('click', async () => {
  const filename = `stained-glass-${Date.now()}.png`;
  const blob = await canvasToBlob(output);

  if (blob === null) {
    setStatus('Snapshot failed. Please try again.');
    return;
  }

  const file = new File([blob], filename, { type: 'image/png' });

  try {
    if (navigator.canShare?.({ files: [file] }) && navigator.share) {
      await navigator.share({
        files: [file],
        title: 'Digital Stained Glass',
        text: 'Save or share your stained glass snapshot.',
      });
      setStatus('Snapshot shared. Choose Save Image in the share sheet to add it to Photos.');
      return;
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      setStatus('Snapshot share cancelled.');
      return;
    }
  }

  downloadSnapshot(blob, filename);
  setStatus('Snapshot saved as a download. On mobile, tap Share, then Save Image to Photos.');
});

startBtn.addEventListener('click', startCamera);
mediaUploadInput.addEventListener('change', () => {
  const [file] = mediaUploadInput.files;

  if (file) {
    startUpload(file);
  }
});
cameraFacingBtns.forEach((button) => {
  button.addEventListener('click', () => {
    setCameraFacing(button.dataset.facing);

    if (!usingDemo && activeStream !== null) {
      startCamera();
    }
  });
});

[startBtn, snapshotBtn, ...cameraFacingBtns].forEach((el) => {
  el.addEventListener('click', () => el.blur());
});

window.addEventListener('resize', () => {
  if (!animationId) {
    return;
  }
  if (sourceMode === 'demo') {
    resizeCanvases(640, 480);
  }
});

startDemo();
