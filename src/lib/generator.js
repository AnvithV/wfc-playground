const path = require('path');
const { SimpleTiledModel } = require('../simpleTiledWfc');
const { PatternStrategy } = require('./pattern-selector');
const { Heuristic } = require('./heuristics');

function createGenerator(config) {
  const {
    width,
    height,
    xmlPath,
    tilesPath,
    limit = -1,
    restarts = 120,
    frameLimit = width * height + 20,
  } = config;

  if (!width || !height) {
    throw new Error('Generator requires width and height');
  }

  const resolvedXml = xmlPath
    ? xmlPath
    : path.join(process.cwd(), 'connects.xml');
  const resolvedTiles = tilesPath
    ? tilesPath
    : path.join(process.cwd(), 'tileset');

  return {
    generate(seed, modes = defaultModes()) {
      return generateImage({
        seed,
        width,
        height,
        limit,
        restarts,
        frameLimit,
        xmlPath: resolvedXml,
        tilesPath: resolvedTiles,
        modes,
      });
    },
  };
}

function generateImage({
  seed,
  width,
  height,
  limit,
  restarts,
  frameLimit,
  xmlPath,
  tilesPath,
  modes,
}) {
  let lastError = null;
  const maxAttempts = Math.max(restarts, 1);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const runSeed =
      attempt === 0 ? seed : Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    try {
      const model = new SimpleTiledModel({
        xmlPath,
        tilesDirectory: tilesPath,
        width,
        height,
        periodic: false,
        heuristic: modes.locator,
        locationHeuristic: modes.locator,
        contextSensitive: modes.context,
        coherenceBoost: modes.coherence,
        noiseBias: modes.noise,
        noiseOptions: { seed: runSeed },
        patternStrategy: modes.pattern,
        contextOptions: modes.contextOptions,
        coherenceOptions: modes.coherenceOptions,
      });

      const frameCollector = [];
      if (frameLimit > 0) {
        model.setStepRecorder((instance) => {
          try {
            frameCollector.push(serializeFrame(instance));
          } catch (err) {
            console.warn('[WFC] Failed to record frame:', err);
          }
        }, frameLimit);
      }

      const success = model.run(runSeed, limit);
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
          finalSeed: runSeed,
          frames: frameCollector,
          modes,
        };
      }
      lastError = new Error(
        `Unresolved collapse after ${attempt + 1} attempt(s) (seed ${runSeed})`,
      );
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

function defaultModes() {
  return {
    context: true,
    coherence: true,
    noise: false,
    pattern: PatternStrategy.WEIGHTED,
    locator: Heuristic.ENTROPY,
    contextOptions: {},
    coherenceOptions: {},
  };
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

module.exports = {
  createGenerator,
  parseModeOptions,
  defaultModes,
};


