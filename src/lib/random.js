class Mulberry32 {
  constructor(seed = Date.now()) {
    this.state = seed >>> 0;
  }

  next() {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

function weightedPick(weights, rng, scratch = null) {
  const buffer = scratch ?? weights;
  let total = 0;
  for (let i = 0; i < weights.length; i++) {
    const value = weights[i];
    buffer[i] = value > 0 ? value : 0;
    total += buffer[i];
  }

  if (total <= 0) {
    return -1;
  }

  let threshold = rng.next() * total;
  for (let i = 0; i < buffer.length; i++) {
    threshold -= buffer[i];
    if (threshold <= 0) {
      return i;
    }
  }

  return buffer.length - 1;
}

module.exports = {
  Mulberry32,
  weightedPick,
};

