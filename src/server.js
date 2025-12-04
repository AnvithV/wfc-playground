const path = require('path');
const express = require('express');
const { SimpleTiledModel } = require('./simpleTiledWfc');
const { PatternStrategy } = require('./lib/pattern-selector');
const { Heuristic } = require('./lib/heuristics');

const ROOT = path.resolve(__dirname, '..');
const XML_PATH = path.join(ROOT, 'connects.xml');
const TILES_PATH = path.join(ROOT, 'tileset');

const WIDTH = parseInt(process.env.WFC_WIDTH || '24', 10);
const HEIGHT = parseInt(process.env.WFC_HEIGHT || '24', 10);
const LIMIT = parseInt(process.env.WFC_LIMIT || '-1', 10);
const RESTARTS = parseInt(process.env.WFC_RESTARTS || '120', 10);
const PORT = parseInt(process.env.PORT || '3000', 10);
const DEFAULT_FRAME_LIMIT = WIDTH * HEIGHT + 20;
const FRAME_LIMIT = parseInt(
  process.env.WFC_FRAME_LIMIT || `${DEFAULT_FRAME_LIMIT}`,
  10,
);

const app = express();

app.use(express.static(path.join(ROOT, 'public')));

app.get('/api/generate', async (req, res) => {
  const seedParam = parseInt(req.query.seed, 10);
  const seed = Number.isFinite(seedParam) ? seedParam : Date.now();
  const modeOptions = parseModeOptions(req.query);

  try {
    const { buffer, attempts, finalSeed, frames, modes } = generateImage(
      seed,
      modeOptions,
    );
    const base64 = buffer.toString('base64');
    res.set('Cache-Control', 'no-store');
    res.json({
      image: `data:image/png;base64,${base64}`,
      frames:
        frames && frames.length > 0
          ? frames
          : [{ image: `data:image/png;base64,${base64}`, constraint: null }],
      seed: finalSeed,
      attempts,
      width: WIDTH,
      height: HEIGHT,
      modes,
    });
  } catch (err) {
    console.error('[WFC] Generation failed:', err);
    res.status(500).json({ error: 'Generation failed, please try again.' });
  }
});

app.listen(PORT, () => {
  console.log(`WFC server listening on http://localhost:${PORT}`);
  console.log('Press R in the browser UI or click "Regenerate" to refresh the layout.');
});

function generateImage(initialSeed, modes) {
  let lastError = null;
  const maxAttempts = Math.max(RESTARTS, 1);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const seed =
      attempt === 0
        ? initialSeed
        : Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    try {
      const model = new SimpleTiledModel({
        xmlPath: XML_PATH,
        tilesDirectory: TILES_PATH,
        width: WIDTH,
        height: HEIGHT,
        periodic: false,
        heuristic: modes.locator,
        locationHeuristic: modes.locator,
        contextSensitive: modes.context,
        coherenceBoost: modes.coherence,
        noiseBias: modes.noise,
        noiseOptions: { seed },
        patternStrategy: modes.pattern,
        contextOptions: modes.contextOptions,
        coherenceOptions: modes.coherenceOptions,
      });

      const frameCollector = [];
      if (FRAME_LIMIT > 0) {
        model.setStepRecorder((instance) => {
          try {
            frameCollector.push(serializeFrame(instance));
          } catch (frameErr) {
            console.warn('[WFC] Failed to record frame:', frameErr);
          }
        }, FRAME_LIMIT);
      }

      const success = model.run(seed, LIMIT);
      if (success && isFullyObserved(model.state)) {
        const buffer = model.renderPngBuffer();
        const finalFrame = {
          image: `data:image/png;base64,${buffer.toString('base64')}`,
          constraint: encodeConstraint(model.state, model.T),
        };
        const lastFrame = frameCollector[frameCollector.length - 1];
        if (
          !lastFrame ||
          !lastFrame.image ||
          lastFrame.image !== finalFrame.image
        ) {
          frameCollector.push(finalFrame);
        }
        return {
          buffer,
          attempts: attempt + 1,
          finalSeed: seed,
          frames: frameCollector,
          modes,
        };
      }
      lastError = new Error(`Unresolved collapse after ${attempt + 1} attempt(s) (seed ${seed})`);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('Unable to collapse wave with the configured tileset.');
}

function isFullyObserved(state) {
  if (!state || !state.observed) {
    return false;
  }
  const { observed } = state;
  for (let i = 0; i < observed.length; i++) {
    if (observed[i] < 0) {
      return false;
    }
  }
  return true;
}

function serializeFrame(model) {
  const buffer = model.renderPngBuffer();
  return {
    image: `data:image/png;base64,${buffer.toString('base64')}`,
    constraint: encodeConstraint(model.state, model.T),
  };
}

function encodeConstraint(state, tileCount) {
  if (!state || !state.sumsOfOnes) {
    return null;
  }
  const counts = state.sumsOfOnes;
  const max = Math.max(tileCount - 1, 1);
  const buf = Buffer.alloc(counts.length);
  for (let i = 0; i < counts.length; i++) {
    const remaining = counts[i];
    const normalized =
      remaining <= 1 ? 0 : Math.min(1, (remaining - 1) / max);
    buf[i] = Math.round(normalized * 255);
  }
  return buf.toString('base64');
}

function parseModeOptions(query = {}) {
  const context = parseBoolean(query.context, true);
  const coherence = parseBoolean(query.coherence, true);
  const noise = parseBoolean(query.noise, false);
  const pattern = parsePatternStrategy(query.pattern);
  const locator = parseLocator(query.locator);
  return {
    context,
    coherence,
    noise,
    pattern,
    locator,
    contextOptions: {},
    coherenceOptions: {},
  };
}

function parseBoolean(value, defaultValue) {
  if (value === undefined) return defaultValue;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function parsePatternStrategy(value) {
  if (!value) return PatternStrategy.WEIGHTED;
  const normalized = String(value).toLowerCase();
  if (normalized === PatternStrategy.LEAST_USED) {
    return PatternStrategy.LEAST_USED;
  }
  return PatternStrategy.WEIGHTED;
}

function parseLocator(value) {
  if (!value) {
    return Heuristic.ENTROPY;
  }
  const normalized = String(value).toLowerCase();
  if (Object.values(Heuristic).includes(normalized)) {
    return normalized;
  }
  return Heuristic.ENTROPY;
}

