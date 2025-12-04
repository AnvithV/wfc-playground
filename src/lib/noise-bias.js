function createNoiseBiasAdjuster(model, options = {}) {
  if (!model || !model.tilenames) {
    return null;
  }

  const boost = Number.isFinite(options.boost) ? options.boost : 1.4;
  const bleed = Number.isFinite(options.bleed) ? options.bleed : 0.85;
  const seed = Number.isFinite(options.seed) ? options.seed : 0;

  const tileGroups = model.tilenames.map((tilename) => tilename.split(' ')[0]);
  const uniqueGroups = Array.from(new Set(tileGroups));
  if (uniqueGroups.length <= 1) {
    return null;
  }
  const groupIndex = tileGroups.map((group) => uniqueGroups.indexOf(group));
  const noiseField = buildNoiseField(model.MX, model.MY, uniqueGroups.length, seed);
  const scratch = new Float64Array(model.T);

  return function noiseAdjuster(cellIndex, distribution) {
    const preferredGroup = noiseField[cellIndex];
    let mutated = false;
    for (let t = 0; t < distribution.length; t++) {
      const base = distribution[t];
      if (base <= 0) {
        scratch[t] = 0;
        continue;
      }
      const group = groupIndex[t];
      const multiplier = group === preferredGroup ? boost : bleed;
      scratch[t] = base * multiplier;
      if (group !== preferredGroup) {
        mutated = true;
      }
    }
    return mutated ? scratch : distribution;
  };
}

function buildNoiseField(width, height, groupCount, seed) {
  const field = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const h = hash2d(x, y, seed);
      const group = Math.floor(h * groupCount) % groupCount;
      field[x + y * width] = group;
    }
  }
  return field;
}

function hash2d(x, y, seed) {
  let h = x * 374761393 + y * 668265263 + seed * 1597334677;
  h = (h ^ (h >> 13)) * 1274126177;
  h = (h ^ (h >> 16)) >>> 0;
  return h / 4294967295;
}

module.exports = {
  createNoiseBiasAdjuster,
};


