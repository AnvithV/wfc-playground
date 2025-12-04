const { OPPOSITE } = require('./directions');

class WaveState {
  constructor(width, height, tileCount, weights, propagator) {
    this.width = width;
    this.height = height;
    this.tileCount = tileCount;
    this.weights = weights;
    this.propagator = propagator;

    this.totalCells = width * height;
    this.wave = Array.from({ length: this.totalCells }, () =>
      Array(tileCount).fill(true),
    );
    this.compatible = Array.from({ length: this.totalCells }, () =>
      Array.from({ length: tileCount }, () => new Int16Array(4)),
    );
    this.stack = [];
    this.observed = new Int32Array(this.totalCells).fill(-1);
    this.distribution = new Float64Array(tileCount);
    this.sumsOfOnes = new Uint16Array(this.totalCells);
    this.sumsOfWeights = new Float64Array(this.totalCells);
    this.sumsOfWeightLogWeights = new Float64Array(this.totalCells);
    this.entropies = new Float64Array(this.totalCells);

    this.weightLogWeights = weights.map((weight) =>
      weight > 0 ? weight * Math.log(weight) : 0,
    );
    this.sumOfWeights = weights.reduce((acc, weight) => acc + weight, 0);
    this.sumOfWeightLogWeights = this.weightLogWeights.reduce(
      (acc, weight) => acc + weight,
      0,
    );
    this.startingEntropy =
      this.sumOfWeights === 0
        ? 0
        : Math.log(this.sumOfWeights) -
          this.sumOfWeightLogWeights / this.sumOfWeights;

    this.observedSoFar = 0;
  }

  reset() {
    for (let i = 0; i < this.totalCells; i++) {
      const w = this.wave[i];
      w.fill(true);

      const compat = this.compatible[i];
      for (let t = 0; t < this.tileCount; t++) {
        const comp = compat[t];
        for (let d = 0; d < 4; d++) {
          comp[d] = this.propagator[OPPOSITE[d]][t].length;
        }
      }

      this.sumsOfOnes[i] = this.tileCount;
      this.sumsOfWeights[i] = this.sumOfWeights;
      this.sumsOfWeightLogWeights[i] = this.sumOfWeightLogWeights;
      this.entropies[i] = this.startingEntropy;
      this.observed[i] = -1;
    }
    this.observedSoFar = 0;
    this.stack.length = 0;
  }

  sampleDistribution(cellIndex) {
    const row = this.wave[cellIndex];
    for (let t = 0; t < this.tileCount; t++) {
      this.distribution[t] = row[t] ? this.weights[t] : 0;
    }
    return this.distribution;
  }

  pushToStack(index, tile) {
    this.stack.push({ index, tile });
  }

  popFromStack() {
    return this.stack.pop();
  }

  hasPending() {
    return this.stack.length > 0;
  }

  ban(index, tile) {
    if (!this.wave[index][tile]) {
      return false;
    }

    this.wave[index][tile] = false;
    const comp = this.compatible[index][tile];
    for (let d = 0; d < 4; d++) {
      comp[d] = 0;
    }

    this.pushToStack(index, tile);

    this.sumsOfOnes[index] -= 1;
    const weight = this.weights[tile];
    this.sumsOfWeights[index] -= weight;
    this.sumsOfWeightLogWeights[index] -= this.weightLogWeights[tile];
    const sum = this.sumsOfWeights[index];

    this.entropies[index] =
      sum > 0 ? Math.log(sum) - this.sumsOfWeightLogWeights[index] / sum : 0;

    return this.sumsOfOnes[index] === 0;
  }
}

module.exports = {
  WaveState,
};

