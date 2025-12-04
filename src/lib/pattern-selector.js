const { weightedPick } = require('./random');

const PatternStrategy = Object.freeze({
  WEIGHTED: 'weighted',
  LEAST_USED: 'least-used',
});

function selectPattern(strategy, distribution, rng, usage, availability) {
  switch (strategy) {
    case PatternStrategy.LEAST_USED:
      return pickLeastUsed(distribution, usage, availability, rng);
    case PatternStrategy.WEIGHTED:
    default:
      return weightedPick(distribution, rng, distribution);
  }
}

function pickLeastUsed(distribution, usage, availability, rng) {
  let minUsage = Infinity;
  const candidates = [];
  for (let t = 0; t < distribution.length; t++) {
    if (!availability[t] || distribution[t] <= 0) {
      continue;
    }
    const count = usage[t] || 0;
    if (count < minUsage) {
      minUsage = count;
      candidates.length = 0;
      candidates.push(t);
    } else if (count === minUsage) {
      candidates.push(t);
    }
  }
  if (candidates.length === 0) {
    return -1;
  }
  const pickIndex = Math.floor(rng.next() * candidates.length);
  return candidates[pickIndex];
}

module.exports = {
  PatternStrategy,
  selectPattern,
};


