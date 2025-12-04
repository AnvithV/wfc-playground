
const fs = require('fs');
const path = require('path');
const { Mulberry32 } = require('./lib/random');
const { WaveState } = require('./lib/wave-state');
const { Heuristic, createNodePicker, forEachNeighbor } = require('./lib/heuristics');
const { loadTiledDefinition } = require('./lib/tiled-loader');
const { renderModelToPng } = require('./lib/renderers');
const { PatternStrategy, selectPattern } = require('./lib/pattern-selector');
const { createNoiseBiasAdjuster } = require('./lib/noise-bias');
const { createContextualAdjuster } = require('./lib/contextual-weights');
const { CoherenceTracker, createCoherenceAdjuster } = require('./lib/coherence');

class Model {
  constructor(width, height, n, periodic, heuristic = Heuristic.ENTROPY) {
    this.MX = width;
    this.MY = height;
    this.N = n;
    this.periodic = periodic;
    this.heuristic = heuristic;
    this.initialized = false;
    this.ground = false;
    this.cellCount = width * height;
    this.state = null;
    this.stepRecorder = null;
    this.stepRecorderLimit = Infinity;
    this.recordedSteps = 0;
    this.distributionAdjusters = [];
    this.coherenceTracker = null;
    this.patternUsage = null;
    this.patternStrategy = PatternStrategy.WEIGHTED;
  }

  init() {
    if (!this.state) {
      this.state = new WaveState(
        this.MX,
        this.MY,
        this.T,
        this.weights,
        this.propagator,
      );
    }
    this.state.reset();
    this.initialized = true;
    if (!this.patternUsage || this.patternUsage.length !== this.T) {
      this.patternUsage = new Uint32Array(this.T);
    }
  }

  clear() {
    if (!this.initialized) {
      throw new Error('Model not initialized');
    }
    this.state.reset();
    if (this.coherenceTracker && typeof this.coherenceTracker.reset === 'function') {
      this.coherenceTracker.reset();
    }
    if (this.patternUsage) {
      this.patternUsage.fill(0);
    }
  }

  addDistributionAdjuster(adjuster) {
    if (typeof adjuster === 'function') {
      this.distributionAdjusters.push(adjuster);
    }
  }

  setCoherenceTracker(tracker) {
    this.coherenceTracker = tracker;
  }

  getDistributionForCell(cellIndex) {
    let distribution = this.state.sampleDistribution(cellIndex);
    if (this.distributionAdjusters.length === 0) {
      return distribution;
    }
    for (const adjuster of this.distributionAdjusters) {
      if (!adjuster) continue;
      distribution = adjuster(cellIndex, distribution) || distribution;
    }
    return distribution;
  }

  setStepRecorder(recorder, limit = Infinity) {
    this.stepRecorder = typeof recorder === 'function' ? recorder : null;
    this.stepRecorderLimit =
      Number.isFinite(limit) && limit > 0 ? limit : Infinity;
  }

  run(seed = Date.now(), limit = -1) {
    if (!this.initialized) {
      this.init();
    }
    this.clear();

    const rng = new Mulberry32(seed);
    const pickNode = createNodePicker(this);
    const maxSteps = limit < 0 ? Number.MAX_SAFE_INTEGER : limit;
    this.recordedSteps = 0;

    const recordState = () => {
      if (!this.stepRecorder) return;
      if (this.recordedSteps >= this.stepRecorderLimit) return;
      this.stepRecorder(this, this.recordedSteps);
      this.recordedSteps += 1;
    };

    recordState();

    for (let steps = 0; steps < maxSteps; steps++) {
      const node = pickNode(rng);
      if (node === -1) {
        this.commitObserved();
        recordState();
        return true;
      }

      this.observe(node, rng);
      if (!this.propagate()) {
        recordState();
        return false;
      }
      recordState();
    }

    this.commitObserved();
    recordState();
    return true;
  }

  commitObserved() {
    const { wave, observed } = this.state;
    for (let i = 0; i < wave.length; i++) {
      const w = wave[i];
      let chosen = -1;
      for (let t = 0; t < this.T; t++) {
        if (w[t]) {
          chosen = t;
          break;
        }
      }
      observed[i] = chosen;
    }
  }

  observe(node, rng) {
    const distribution = this.getDistributionForCell(node);
    const strategy = this.patternStrategy || PatternStrategy.WEIGHTED;
    const choice = selectPattern(
      strategy,
      distribution,
      rng,
      this.patternUsage,
      this.state.wave[node],
    );
    if (choice === -1) {
      throw new Error('Failed to sample from distribution (all weights are zero).');
    }

    const row = this.state.wave[node];
    for (let t = 0; t < this.T; t++) {
      if (row[t] !== (t === choice)) {
        this.state.ban(node, t);
      }
    }
    this.state.observed[node] = choice;
    if (this.patternUsage) {
      this.patternUsage[choice] += 1;
    }
    if (this.coherenceTracker && typeof this.coherenceTracker.register === 'function') {
      this.coherenceTracker.register(choice);
    }
  }

  coordFromIndex(index) {
    return {
      x: index % this.MX,
      y: Math.floor(index / this.MX),
    };
  }

  propagate() {
    const state = this.state;
    while (state.hasPending()) {
      const { index: sourceIndex, tile } = state.popFromStack();
      const aborted = forEachNeighbor(this, sourceIndex, (direction, neighbor) => {
        const allowed = this.propagator[direction][tile];
        const compat = state.compatible[neighbor];

        for (let l = 0; l < allowed.length; l++) {
          const targetTile = allowed[l];
          const comp = compat[targetTile];
          comp[direction] -= 1;
          if (comp[direction] === 0) {
            const exhausted = state.ban(neighbor, targetTile);
            if (exhausted) {
              return true;
            }
          }
        }

        return false;
      });

      if (aborted) {
        return false;
      }
    }

    return true;
  }
}

class SimpleTiledModel extends Model {
  constructor(options) {
    const {
      xmlPath,
      tilesDirectory,
      width,
      height,
      periodic = false,
      heuristic = Heuristic.ENTROPY,
      ground = false,
      blackBackground = false,
      locationHeuristic,
      contextSensitive = true,
      noiseBias = false,
      patternStrategy = PatternStrategy.WEIGHTED,
      coherenceBoost = true,
    } = options;

    super(width, height, 1, periodic, locationHeuristic || heuristic);
    this.blackBackground = blackBackground;
    this.xmlPath = xmlPath;
    this.tilesDirectory = tilesDirectory;
    this.ground = ground;

    const definition = loadTiledDefinition(xmlPath, tilesDirectory);
    this.weights = definition.weights;
    this.tiles = definition.tiles;
    this.tilenames = definition.tilenames;
    this.tilesize = definition.tilesize;
    this.propagator = definition.propagator;
    this.T = this.weights.length;
    this.patternStrategy = patternStrategy;

    if (contextSensitive) {
      const contextualAdjuster = createContextualAdjuster(this, options.contextOptions);
      if (contextualAdjuster) {
        this.addDistributionAdjuster(contextualAdjuster);
      }
    }

    if (noiseBias) {
      const noiseAdjuster = createNoiseBiasAdjuster(this, options.noiseOptions);
      if (noiseAdjuster) {
        this.addDistributionAdjuster(noiseAdjuster);
      }
    }

    if (coherenceBoost) {
      const tracker = new CoherenceTracker(this.weights, this.cellCount, options.coherenceOptions);
      this.setCoherenceTracker(tracker);
      const coherenceAdjuster = createCoherenceAdjuster(tracker, options.coherenceOptions);
      if (coherenceAdjuster) {
        this.addDistributionAdjuster(coherenceAdjuster);
      }
    }
  }

  renderPngBuffer() {
    if (this.state.observed[0] < 0 && this.blackBackground) {
      throw new Error('Cannot render unresolved wave with the black background option.');
    }
    return renderModelToPng(this);
  }

  save(outputPath) {
    const buffer = this.renderPngBuffer();
    fs.writeFileSync(outputPath, buffer);
  }
}

function parseArgs(argv) {
  const result = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      switch (key) {
        case 'xml':
        case 'tiles':
        case 'output':
        case 'heuristic':
          result[key] = value;
          i++;
          break;
        case 'width':
        case 'height':
        case 'seed':
        case 'limit':
        case 'restarts':
          result[key] = parseInt(value, 10);
          i++;
          break;
        case 'periodic':
        case 'blackBackground':
          result[key] = true;
          break;
        default:
          break;
      }
    }
  }

  return result;
}

function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const width = args.width || 24;
  const height = args.height || 24;
  const xmlPath = path.resolve(args.xml || 'connects.xml');
  const tilesPath = path.resolve(args.tiles || 'tileset');
  const seed = args.seed || Date.now();
  const limit = typeof args.limit === 'number' ? args.limit : -1;
  const restarts =
    Number.isFinite(args.restarts) && args.restarts > 0 ? args.restarts : 200;
  const outputPath = path.resolve(args.output || 'output.png');

  const model = new SimpleTiledModel({
    xmlPath,
    tilesDirectory: tilesPath,
    width,
    height,
    periodic: !!args.periodic,
    heuristic: args.heuristic || Heuristic.ENTROPY,
    blackBackground: !!args.blackBackground,
  });

  let success = false;
  let attempt = 0;
  while (!success && attempt < restarts) {
    const currentSeed = seed + attempt;
    success = model.run(currentSeed, limit);
    attempt++;
  }

  if (!success) {
    console.error(
      `Failed to generate a valid output after ${restarts} attempt(s). ` +
        'Try increasing --restarts or reducing the grid size.',
    );
    process.exit(1);
  }

  model.save(outputPath);
  console.log(`Generated output saved to ${outputPath}`);
}

if (require.main === module) {
  runCli();
}

module.exports = {
  Model,
  SimpleTiledModel,
  Heuristic,
};

