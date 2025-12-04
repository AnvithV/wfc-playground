const { travel } = require('./directions');

function buildNormalizedFrequencies(propagator) {
  const directions = propagator.length;
  const T = propagator[0]?.length || 0;
  return Array.from({ length: directions }, () =>
    Array.from({ length: T }, () => new Float64Array(T)),
  ).map((directionBuckets, direction) =>
    directionBuckets.map((row, tile) => {
      const allowed = propagator[direction][tile];
      if (!allowed || allowed.length === 0) {
        return row;
      }
      const weight = 1 / allowed.length;
      for (let i = 0; i < allowed.length; i++) {
        row[allowed[i]] += weight;
      }
      return row;
    }),
  );
}

function gatherNeighborContexts(model, cellIndex) {
  const contexts = [];
  const x = cellIndex % model.MX;
  const y = Math.floor(cellIndex / model.MX);
  const bounds = { width: model.MX, height: model.MY };
  const state = model.state;
  for (let direction = 0; direction < 4; direction++) {
    const coords = travel(x, y, direction, bounds, model.periodic, model.N);
    if (!coords) continue;
    const neighborIndex = coords.x + coords.y * model.MX;
    const wave = state.wave[neighborIndex];
    if (!wave) continue;
    const entries = [];
    let weightSum = 0;
    for (let t = 0; t < model.T; t++) {
      if (wave[t]) {
        const weight = model.weights[t];
        entries.push({ tile: t, weight });
        weightSum += weight;
      }
    }
    if (entries.length === 0 || entries.length === model.T) {
      continue;
    }
    contexts.push({
      direction,
      entries,
      weightSum: weightSum > 0 ? weightSum : entries.length,
    });
  }
  return contexts;
}

function createContextualAdjuster(model, options = {}) {
  if (!model || !model.propagator) {
    return null;
  }
  const bias = Number.isFinite(options.bias) ? options.bias : 1;
  const penalty = Number.isFinite(options.penalty) ? options.penalty : 0.2;
  const normalized = buildNormalizedFrequencies(model.propagator);
  const scratch = new Float64Array(model.T);

  return function contextAdjuster(cellIndex, distribution) {
    const contexts = gatherNeighborContexts(model, cellIndex);
    if (contexts.length === 0) {
      return distribution;
    }
    for (let t = 0; t < model.T; t++) {
      const base = distribution[t];
      if (base <= 0) {
        scratch[t] = 0;
        continue;
      }
      let modifier = 1;
      for (let i = 0; i < contexts.length; i++) {
        const ctx = contexts[i];
        const freqRow = normalized[ctx.direction][t];
        let matchScore = 0;
        for (let j = 0; j < ctx.entries.length; j++) {
          const entry = ctx.entries[j];
          matchScore += freqRow[entry.tile] * entry.weight;
        }
        const ratio =
          matchScore > 0 && ctx.weightSum > 0 ? matchScore / ctx.weightSum : 0;
        if (ratio > 0) {
          modifier *= 1 + bias * ratio;
        } else {
          modifier *= penalty;
        }
      }
      scratch[t] = base * modifier;
    }
    return scratch;
  };
}

module.exports = {
  createContextualAdjuster,
};


