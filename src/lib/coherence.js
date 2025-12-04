class CoherenceTracker {
  constructor(weights, totalCells, options = {}) {
    this.totalCells = totalCells;
    this.counts = new Uint32Array(weights.length);
    this.decisions = 0;
    const sum = weights.reduce((acc, weight) => acc + weight, 0) || 1;
    this.targetShares = weights.map((weight) => weight / sum);
    this.tolerance =
      Number.isFinite(options.tolerance) && options.tolerance >= 0
        ? options.tolerance
        : 0.12;
  }

  reset() {
    this.counts.fill(0);
    this.decisions = 0;
  }

  register(tile) {
    if (tile < 0 || tile >= this.counts.length) {
      return;
    }
    this.counts[tile] += 1;
    this.decisions += 1;
  }
}

function createCoherenceAdjuster(tracker, options = {}) {
  if (!tracker) {
    return null;
  }
  const strength =
    Number.isFinite(options.strength) && options.strength > 0
      ? options.strength
      : 0.6;
  const penaltyFloor =
    Number.isFinite(options.penaltyFloor) && options.penaltyFloor > 0
      ? options.penaltyFloor
      : 0.25;
  const boostCap =
    Number.isFinite(options.boostCap) && options.boostCap > 0
      ? options.boostCap
      : 2;
  const scratch = new Float64Array(tracker.counts.length);

  return function coherenceAdjuster(cellIndex, distribution) {
    if (tracker.decisions === 0) {
      return distribution;
    }
    let mutated = false;
    for (let t = 0; t < distribution.length; t++) {
      const base = distribution[t];
      if (base <= 0) {
        scratch[t] = 0;
        continue;
      }
      const currentShare = tracker.counts[t] / tracker.decisions;
      const targetShare = tracker.targetShares[t];
      const delta = currentShare - targetShare;
      let modifier = 1;
      if (Math.abs(delta) > tracker.tolerance) {
        if (delta > 0) {
          const excess = delta - tracker.tolerance;
          modifier = Math.max(penaltyFloor, 1 - excess * strength);
        } else {
          const deficit = -delta - tracker.tolerance;
          modifier = Math.min(boostCap, 1 + deficit * strength);
        }
        mutated = true;
      }
      scratch[t] = base * modifier;
    }
    return mutated ? scratch : distribution;
  };
}

module.exports = {
  CoherenceTracker,
  createCoherenceAdjuster,
};


