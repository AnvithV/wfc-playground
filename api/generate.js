const path = require('path');
const { createGenerator, parseModeOptions } = require('../src/lib/generator');

const WIDTH = parseInt(process.env.WFC_WIDTH || '24', 10);
const HEIGHT = parseInt(process.env.WFC_HEIGHT || '24', 10);
const LIMIT = parseInt(process.env.WFC_LIMIT || '-1', 10);
const RESTARTS = parseInt(process.env.WFC_RESTARTS || '120', 10);
const DEFAULT_FRAME_LIMIT = WIDTH * HEIGHT + 20;
const FRAME_LIMIT = parseInt(
  process.env.WFC_FRAME_LIMIT || `${DEFAULT_FRAME_LIMIT}`,
  10,
);

const generator = createGenerator({
  width: WIDTH,
  height: HEIGHT,
  xmlPath: path.join(process.cwd(), 'connects.xml'),
  tilesPath: path.join(process.cwd(), 'tileset'),
  limit: LIMIT,
  restarts: RESTARTS,
  frameLimit: FRAME_LIMIT,
});

module.exports = async function handler(req, res) {
  const seedParam = parseInt(req.query.seed, 10);
  const seed = Number.isFinite(seedParam) ? seedParam : Date.now();
  const modes = parseModeOptions(req.query);

  try {
    const { buffer, attempts, finalSeed, frames } = generator.generate(
      seed,
      modes,
    );
    const base64 = buffer.toString('base64');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
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
    console.error('[WFC] API generation failed:', err);
    res.status(500).json({ error: 'Generation failed, please try again.' });
  }
};


