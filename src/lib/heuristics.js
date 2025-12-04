const { travel } = require('./directions');

const Heuristic = Object.freeze({
  ENTROPY: 'entropy',
  MRV: 'mrv',
  SCANLINE: 'scanline',
  SPIRAL: 'spiral',
});

function createNodePicker(model) {
  if (model.heuristic === Heuristic.SCANLINE) {
    return scanlinePicker(model);
  }
  if (model.heuristic === Heuristic.MRV) {
    return mrvPicker(model);
  }
  if (model.heuristic === Heuristic.SPIRAL) {
    return spiralPicker(model);
  }
  return entropyPicker(model);
}

function scanlinePicker(model) {
  return () => {
    const state = model.state;
    for (let i = state.observedSoFar; i < model.cellCount; i++) {
      if (
        !model.periodic &&
        ((i % model.MX) + model.N > model.MX ||
          Math.floor(i / model.MX) + model.N > model.MY)
      ) {
        continue;
      }
      if (state.sumsOfOnes[i] > 1) {
        state.observedSoFar = i + 1;
        return i;
      }
    }
    return -1;
  };
}

function mrvPicker(model) {
  return (rng) => {
    const state = model.state;
    let min = Infinity;
    let argmin = -1;

    for (let i = 0; i < model.cellCount; i++) {
      const { x, y } = model.coordFromIndex(i);
      if (!model.periodic && (x + model.N > model.MX || y + model.N > model.MY)) {
        continue;
      }
      const remainingValues = state.sumsOfOnes[i];
      if (remainingValues <= 1) {
        continue;
      }
      const candidateScore = remainingValues + 1e-6 * rng.next();
      if (candidateScore < min) {
        min = candidateScore;
        argmin = i;
      }
    }
    return argmin;
  };
}

function entropyPicker(model) {
  return (rng) => {
    const state = model.state;
    let min = Infinity;
    let argmin = -1;

    for (let i = 0; i < model.cellCount; i++) {
      const { x, y } = model.coordFromIndex(i);
      if (!model.periodic && (x + model.N > model.MX || y + model.N > model.MY)) {
        continue;
      }

      if (state.sumsOfOnes[i] <= 1) {
        continue;
      }

      const candidateScore = state.entropies[i] + 1e-6 * rng.next();
      if (candidateScore < min) {
        min = candidateScore;
        argmin = i;
      }
    }

    return argmin;
  };
}

function spiralPicker(model) {
  const order = buildSpiralOrder(model.MX, model.MY);
  let cursor = 0;
  const total = order.length;
  return () => {
    for (let offset = 0; offset < total; offset++) {
      const index = order[(cursor + offset) % total];
      const { x, y } = model.coordFromIndex(index);
      if (!model.periodic && (x + model.N > model.MX || y + model.N > model.MY)) {
        continue;
      }
      if (model.state.sumsOfOnes[index] > 1) {
        cursor = (index + 1) % total;
        return index;
      }
    }
    return -1;
  };
}

function buildSpiralOrder(width, height) {
  const result = [];
  let left = 0;
  let right = width - 1;
  let top = 0;
  let bottom = height - 1;
  while (left <= right && top <= bottom) {
    for (let x = left; x <= right; x++) {
      result.push(x + top * width);
    }
    for (let y = top + 1; y <= bottom; y++) {
      result.push(right + y * width);
    }
    if (top !== bottom) {
      for (let x = right - 1; x >= left; x--) {
        result.push(x + bottom * width);
      }
    }
    if (left !== right) {
      for (let y = bottom - 1; y > top; y--) {
        result.push(left + y * width);
      }
    }
    left++;
    right--;
    top++;
    bottom--;
  }
  return result;
}

function forEachNeighbor(model, index, visitor) {
  const x = index % model.MX;
  const y = Math.floor(index / model.MX);
  for (let direction = 0; direction < 4; direction++) {
    const coords = travel(
      x,
      y,
      direction,
      { width: model.MX, height: model.MY },
      model.periodic,
      model.N,
    );
    if (!coords) {
      continue;
    }
    const shouldAbort = visitor(direction, coords.x + coords.y * model.MX);
    if (shouldAbort) {
      return true;
    }
  }
  return false;
}

module.exports = {
  Heuristic,
  createNodePicker,
  forEachNeighbor,
  buildSpiralOrder,
};

