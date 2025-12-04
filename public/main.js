const ModeDefaults = Object.freeze({
  context: true,
  noise: false,
  coherence: true,
  pattern: 'weighted',
  locator: 'entropy',
});

const ui = {
  image: document.getElementById('frameImage'),
  overlay: document.getElementById('viewportOverlay'),
  status: document.getElementById('statStatus'),
  seed: document.getElementById('statSeed'),
  attempts: document.getElementById('statAttempts'),
  grid: document.getElementById('statGrid'),
  seedInput: document.getElementById('seedInput'),
  seedRandom: document.getElementById('seedRandom'),
  regen: document.getElementById('regenBtn'),
  play: document.getElementById('playBtn'),
  save: document.getElementById('saveBtn'),
  slider: document.getElementById('frameSlider'),
  frameLabel: document.getElementById('frameLabel'),
  constraintCanvas: document.getElementById('constraintCanvas'),
  modeBar: document.getElementById('modeBar'),
};

const state = {
  frames: [],
  constraintFrames: [],
  index: 0,
  playing: false,
  timer: null,
  loading: false,
  controller: null,
  lastSeed: null,
  gridWidth: 0,
  gridHeight: 0,
  modes: { ...ModeDefaults },
};

const constraintCtx = ui.constraintCanvas.getContext('2d');

function normalizeSeed(raw) {
  if (!raw) return null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    return Math.floor(numeric);
  }
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function setStatus(text) {
  ui.status.textContent = text;
}

function stopPlayback() {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  state.playing = false;
  ui.play.textContent = 'Play';
}

function startPlayback() {
  if (state.frames.length <= 1) return;
  stopPlayback();
  state.playing = true;
  ui.play.textContent = 'Pause';
  state.timer = setInterval(() => {
    const next = (state.index + 1) % state.frames.length;
    renderFrame(next);
  }, 220);
}

function togglePlayback() {
  if (ui.play.disabled) return;
  state.playing ? stopPlayback() : startPlayback();
}

function renderFrame(position) {
  if (!state.frames.length) {
    ui.image.src = '';
    ui.frameLabel.textContent = '0 / 0';
    ui.slider.value = '0';
    ui.save.disabled = true;
    clearConstraintOverlay();
    return;
  }
  const next = Math.min(Math.max(position, 0), state.frames.length - 1);
  state.index = next;
  ui.image.src = state.frames[next];
  ui.frameLabel.textContent = `${next + 1} / ${state.frames.length}`;
  ui.slider.value = String(next);
  ui.save.disabled = false;
  renderConstraintOverlay(next);
}

function applyFrames(framePayload = [], fallbackImage) {
  const normalized = normalizeFrames(framePayload, fallbackImage);
  state.frames = normalized.map((frame) => frame.image);
  state.constraintFrames = normalized.map((frame) =>
    decodeConstraint(frame.constraint),
  );
  const max = Math.max(state.frames.length - 1, 0);
  ui.slider.max = String(max);
  ui.slider.disabled = state.frames.length <= 1 || state.loading;
  ui.play.disabled = state.frames.length <= 1 || state.loading;
  stopPlayback();
  renderFrame(max);
}

function setMeta(payload = {}) {
  ui.seed.textContent = payload.seed ?? '—';
  ui.attempts.textContent =
    payload.attempts != null ? String(payload.attempts) : '0';
  if (payload.width && payload.height) {
    ui.grid.textContent = `${payload.width} × ${payload.height}`;
    state.gridWidth = payload.width;
    state.gridHeight = payload.height;
  } else {
    ui.grid.textContent = '—';
  }
  if (payload.modes) {
    state.modes = { ...state.modes, ...payload.modes };
    updateModeBadges();
  }
  state.lastSeed = payload.seed ?? null;
}

function setLoading(flag) {
  state.loading = flag;
  ui.overlay.classList.toggle('visible', flag);
  ui.regen.disabled = flag;
  ui.seedInput.disabled = flag;
  ui.seedRandom.disabled = flag;
  ui.slider.disabled = flag || state.frames.length <= 1;
  ui.play.disabled = flag || state.frames.length <= 1;
  if (flag) stopPlayback();
}

async function regenerate(seedOverride) {
  const normalized =
    seedOverride != null ? seedOverride : normalizeSeed(ui.seedInput.value.trim());
  if (state.controller) {
    state.controller.abort();
  }
  const controller = new AbortController();
  state.controller = controller;
  setLoading(true);
  setStatus('Generating…');
  ui.save.disabled = true;

  try {
    const query = buildQueryString(normalized);
    const response = await fetch(`/api/generate${query}`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    const payload = await response.json();
    applyFrames(payload.frames, payload.image);
    setMeta(payload);
    setStatus(
      `Done in ${payload.attempts} attempt${payload.attempts === 1 ? '' : 's'}.`,
    );
  } catch (err) {
    if (err.name === 'AbortError') {
      return;
    }
    console.error(err);
    state.frames = [];
    renderFrame(0);
    setMeta();
    setStatus('Generation failed. Try again.');
  } finally {
    if (state.controller === controller) {
      state.controller = null;
    }
    setLoading(false);
  }
}

function onSliderChange(event) {
  if (!state.frames.length) return;
  stopPlayback();
  const value = Number(event.target.value);
  if (Number.isFinite(value)) {
    renderFrame(value);
  }
}

function randomizeSeed() {
  const random = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
  ui.seedInput.value = random;
  ui.seedInput.focus();
  ui.seedInput.select();
}

function downloadImage() {
  if (!state.frames.length) return;
  const url = state.frames[state.frames.length - 1];
  const anchor = document.createElement('a');
  anchor.href = url;
  const suffix = state.lastSeed != null ? `-${state.lastSeed}` : '';
  anchor.download = `wfc${suffix}.png`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function stepFrame(delta) {
  if (!state.frames.length) return;
  stopPlayback();
  renderFrame(state.index + delta);
}

function handleKeydown(event) {
  const el = document.activeElement;
  const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
  const key = event.key.toLowerCase();
  if ((key === 'r') && !typing) {
    event.preventDefault();
    regenerate();
    return;
  }
  if (key === ' ' && !typing) {
    event.preventDefault();
    togglePlayback();
    return;
  }
  if (!typing && handleModeKey(key)) {
    event.preventDefault();
    return;
  }
  if (key === 'arrowleft' && !typing) {
    event.preventDefault();
    stepFrame(-1);
  }
  if (key === 'arrowright' && !typing) {
    event.preventDefault();
    stepFrame(1);
  }
}

function handleModeKey(key) {
  switch (key) {
    case 'c':
      toggleMode('context');
      return true;
    case 'n':
      toggleMode('noise');
      return true;
    case 'p':
      toggleMode('pattern');
      return true;
    case 'l':
      toggleMode('locator');
      return true;
    default:
      return false;
  }
}

function toggleMode(mode) {
  switch (mode) {
    case 'context':
      state.modes.context = !state.modes.context;
      break;
    case 'noise':
      state.modes.noise = !state.modes.noise;
      break;
    case 'pattern':
      state.modes.pattern =
        state.modes.pattern === 'weighted' ? 'least-used' : 'weighted';
      break;
    case 'locator':
      state.modes.locator =
        state.modes.locator === 'entropy' ? 'spiral' : 'entropy';
      break;
    default:
      return;
  }
  setStatus(`Mode updated: ${mode}`);
  updateModeBadges();
  regenerate(state.lastSeed ?? undefined);
}

function updateModeBadges() {
  if (!ui.modeBar) return;
  const contextChip = ui.modeBar.querySelector('[data-mode="context"]');
  const noiseChip = ui.modeBar.querySelector('[data-mode="noise"]');
  const patternChip = ui.modeBar.querySelector('[data-mode="pattern"]');
  const locatorChip = ui.modeBar.querySelector('[data-mode="locator"]');
  if (contextChip) {
    contextChip.textContent = `Context (C): ${state.modes.context ? 'on' : 'off'}`;
  }
  if (noiseChip) {
    noiseChip.textContent = `Noise (N): ${state.modes.noise ? 'on' : 'off'}`;
  }
  if (patternChip) {
    patternChip.textContent = `Pattern (P): ${
      state.modes.pattern === 'weighted' ? 'weighted' : 'least-used'
    }`;
  }
  if (locatorChip) {
    locatorChip.textContent = `Locator (L): ${state.modes.locator}`;
  }
}

function buildQueryString(seed) {
  const params = new URLSearchParams();
  if (seed != null) {
    params.set('seed', seed);
  }
  params.set('context', state.modes.context ? '1' : '0');
  params.set('coherence', state.modes.coherence ? '1' : '0');
  params.set('noise', state.modes.noise ? '1' : '0');
  params.set('pattern', state.modes.pattern);
  params.set('locator', state.modes.locator);
  return `?${params.toString()}`;
}

function normalizeFrames(rawFrames, fallbackImage) {
  if (!Array.isArray(rawFrames) || rawFrames.length === 0) {
    return fallbackImage ? [{ image: fallbackImage, constraint: null }] : [];
  }
  return rawFrames.map((frame) => {
    if (typeof frame === 'string') {
      return { image: frame, constraint: null };
    }
    return {
      image: frame.image || fallbackImage || '',
      constraint: frame.constraint || null,
    };
  });
}

function decodeConstraint(encoded) {
  if (!encoded) return null;
  const binary = atob(encoded);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    arr[i] = binary.charCodeAt(i);
  }
  return arr;
}

function renderConstraintOverlay(index) {
  const data = state.constraintFrames[index];
  if (!data || !state.gridWidth || !state.gridHeight) {
    clearConstraintOverlay();
    return;
  }
  if (
    ui.constraintCanvas.width !== state.gridWidth ||
    ui.constraintCanvas.height !== state.gridHeight
  ) {
    ui.constraintCanvas.width = state.gridWidth;
    ui.constraintCanvas.height = state.gridHeight;
  }
  const imageData = constraintCtx.createImageData(
    state.gridWidth,
    state.gridHeight,
  );
  for (let i = 0; i < data.length; i++) {
    const value = data[i];
    const offset = i * 4;
    if (value === 0) {
      imageData.data[offset + 3] = 0;
      continue;
    }
    const alpha = value / 255;
    imageData.data[offset + 0] = 255;
    imageData.data[offset + 1] = Math.max(0, 180 - Math.round(alpha * 120));
    imageData.data[offset + 2] = 64;
    imageData.data[offset + 3] = Math.round(alpha * 180);
  }
  constraintCtx.putImageData(imageData, 0, 0);
}

function clearConstraintOverlay() {
  constraintCtx.clearRect(0, 0, ui.constraintCanvas.width, ui.constraintCanvas.height);
}

ui.slider.addEventListener('input', onSliderChange);
ui.slider.addEventListener('change', onSliderChange);
ui.play.addEventListener('click', togglePlayback);
ui.regen.addEventListener('click', () => regenerate());
ui.seedRandom.addEventListener('click', randomizeSeed);
ui.save.addEventListener('click', downloadImage);
document.addEventListener('keydown', handleKeydown);

window.addEventListener('load', () => {
  updateModeBadges();
  regenerate();
});

