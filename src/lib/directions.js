const CARDINALS = Object.freeze([
  { dx: -1, dy: 0, opposite: 2 },
  { dx: 0, dy: 1, opposite: 3 },
  { dx: 1, dy: 0, opposite: 0 },
  { dx: 0, dy: -1, opposite: 1 },
]);

const OPPOSITE = CARDINALS.map((dir) => dir.opposite);

function wrapCoord(value, size) {
  if (size === 0) return 0;
  let result = value % size;
  if (result < 0) result += size;
  return result;
}

function travel(x, y, directionIndex, bounds, periodic, n) {
  const direction = CARDINALS[directionIndex];
  let nx = x + direction.dx;
  let ny = y + direction.dy;

  if (!periodic) {
    if (nx < 0 || ny < 0 || nx + n > bounds.width || ny + n > bounds.height) {
      return null;
    }
  }

  nx = wrapCoord(nx, bounds.width);
  ny = wrapCoord(ny, bounds.height);
  return { x: nx, y: ny };
}

module.exports = {
  CARDINALS,
  OPPOSITE,
  travel,
  wrapCoord,
};

