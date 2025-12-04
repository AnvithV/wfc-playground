const fs = require('fs');
const path = require('path');
const { DOMParser } = require('@xmldom/xmldom');

function loadTiledDefinition(xmlPath, tilesDirectory) {
  const xmlContent = fs.readFileSync(xmlPath, 'utf8');
  const doc = new DOMParser().parseFromString(xmlContent, 'text/xml');

  const tilesRoot = expectNode(doc.getElementsByTagName('tiles')[0], 'tiles');
  const neighborRoot = expectNode(
    doc.getElementsByTagName('neighbors')[0],
    'neighbors',
  );

  const action = [];
  const weightList = [];
  const tiles = [];
  const tilenames = [];
  const firstOccurrence = new Map();
  let tilesize = 0;

  for (const tileNode of asArray(tilesRoot.getElementsByTagName('tile'))) {
    const name = expectAttr(tileNode, 'name');
    const sym = (tileNode.getAttribute('symmetry') || 'X').trim();
    const weight = parseFloat(tileNode.getAttribute('weight') || '1');

    const { cardinality, rotate, reflect } = buildSymmetry(sym);
    const baseIndex = action.length;
    firstOccurrence.set(name, baseIndex);

    for (let t = 0; t < cardinality; t++) {
      const transformation = new Array(8);
      transformation[0] = t;
      transformation[1] = rotate(t);
      transformation[2] = rotate(transformation[1]);
      transformation[3] = rotate(transformation[2]);
      transformation[4] = reflect(t);
      transformation[5] = reflect(transformation[1]);
      transformation[6] = reflect(transformation[2]);
      transformation[7] = reflect(transformation[3]);
      for (let i = 0; i < transformation.length; i++) {
        transformation[i] += baseIndex;
      }
      action.push(transformation);
    }

    const bitmap = loadBitmap(path.join(tilesDirectory, `${name}.png`));
    if (!tilesize) {
      tilesize = bitmap.size;
    } else if (tilesize !== bitmap.size) {
      throw new Error('All tiles must share the same dimensions.');
    }

    if (bitmap.width !== bitmap.height) {
      throw new Error(`Tile ${name} must be square.`);
    }

    tiles.push(bitmap.data);
    tilenames.push(`${name} 0`);

    for (let t = 1; t < cardinality; t++) {
      const derived =
        t <= 3
          ? rotateBitmap(tiles[baseIndex + t - 1], tilesize)
          : reflectBitmap(tiles[baseIndex + t - 4], tilesize);
      tiles.push(derived);
      tilenames.push(`${name} ${t}`);
    }

    for (let t = 0; t < cardinality; t++) {
      weightList.push(weight);
    }
  }

  const propagator = buildPropagator(
    action,
    firstOccurrence,
    neighborRoot,
    tilenames,
  );

  return {
    weights: weightList,
    tiles,
    tilenames,
    tilesize,
    propagator,
  };
}

function buildPropagator(action, firstOccurrence, neighborRoot, tilenames) {
  const T = action.length;
  const dense = Array.from({ length: 4 }, () =>
    Array.from({ length: T }, () => Array(T).fill(false)),
  );

  for (const neighbor of asArray(neighborRoot.getElementsByTagName('neighbor'))) {
    const left = expectAttr(neighbor, 'left');
    const right = expectAttr(neighbor, 'right');

    const L = tileFromSpec(left, action, firstOccurrence);
    const R = tileFromSpec(right, action, firstOccurrence);
    const D = action[L][1];
    const U = action[R][1];

    dense[0][R][L] = true;
    dense[0][action[R][6]][action[L][6]] = true;
    dense[0][action[L][4]][action[R][4]] = true;
    dense[0][action[L][2]][action[R][2]] = true;

    dense[1][U][D] = true;
    dense[1][action[D][6]][action[U][6]] = true;
    dense[1][action[U][4]][action[D][4]] = true;
    dense[1][action[D][2]][action[U][2]] = true;
  }

  for (let t2 = 0; t2 < T; t2++) {
    for (let t1 = 0; t1 < T; t1++) {
      dense[2][t2][t1] = dense[0][t1][t2];
      dense[3][t2][t1] = dense[1][t1][t2];
    }
  }

  const sparse = Array.from({ length: 4 }, () =>
    Array.from({ length: T }, () => []),
  );

  for (let d = 0; d < 4; d++) {
    for (let t1 = 0; t1 < T; t1++) {
      const allowed = [];
      for (let t2 = 0; t2 < T; t2++) {
        if (dense[d][t1][t2]) {
          allowed.push(t2);
        }
      }
      if (allowed.length === 0) {
        throw new Error(`Tile ${tilenames[t1]} has no neighbors in direction ${d}`);
      }
      sparse[d][t1] = allowed;
    }
  }

  return sparse;
}

function buildSymmetry(sym) {
  switch (sym) {
    case 'L':
      return {
        cardinality: 4,
        rotate: (i) => (i + 1) % 4,
        reflect: (i) => (i % 2 === 0 ? i + 1 : i - 1),
      };
    case 'T':
      return {
        cardinality: 4,
        rotate: (i) => (i + 1) % 4,
        reflect: (i) => (i % 2 === 0 ? i : 4 - i),
      };
    case 'I':
      return {
        cardinality: 2,
        rotate: (i) => 1 - i,
        reflect: (i) => i,
      };
    case '\\':
      return {
        cardinality: 2,
        rotate: (i) => 1 - i,
        reflect: (i) => 1 - i,
      };
    case 'F':
      return {
        cardinality: 8,
        rotate: (i) => (i < 4 ? (i + 1) % 4 : 4 + ((i - 1) % 4)),
        reflect: (i) => (i < 4 ? i + 4 : i - 4),
      };
    case 'X':
    default:
      return {
        cardinality: 1,
        rotate: (i) => i,
        reflect: (i) => i,
      };
  }
}

function expectNode(node, tag) {
  if (!node) {
    throw new Error(`No <${tag}> element found in XML.`);
  }
  return node;
}

function expectAttr(node, attr) {
  const value = node.getAttribute(attr);
  if (!value) {
    throw new Error(`Missing required attribute "${attr}".`);
  }
  return value;
}

function asArray(nodeList) {
  return Array.from({ length: nodeList.length }, (_, i) => nodeList.item(i));
}

function tileFromSpec(spec, action, firstOccurrence) {
  const parts = spec.trim().split(/\s+/);
  const name = parts[0];
  const transformRaw = parts.length > 1 ? parseInt(parts[1], 10) : 0;
  const transform = Number.isFinite(transformRaw) ? transformRaw : 0;

  if (!firstOccurrence.has(name)) {
    throw new Error(`Unknown tile referenced: ${name}`);
  }
  const index = firstOccurrence.get(name);
  const variants = action[index];
  if (transform < 0 || transform >= variants.length) {
    throw new Error(`Invalid transform ${transform} for tile ${name}`);
  }
  return variants[transform];
}

function loadBitmap(filepath) {
  const { PNG } = require('pngjs');
  if (!fs.existsSync(filepath)) {
    throw new Error(`Tile bitmap missing at ${filepath}`);
  }
  const png = PNG.sync.read(fs.readFileSync(filepath));
  if (png.width !== png.height) {
    throw new Error(`Tile bitmap ${filepath} must be square.`);
  }
  const size = png.width;
  const result = new Uint32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) << 2;
      const r = png.data[idx];
      const g = png.data[idx + 1];
      const b = png.data[idx + 2];
      const a = png.data[idx + 3];
      result[x + y * size] = (a << 24) | (r << 16) | (g << 8) | b;
    }
  }

  return { data: result, size, width: size, height: size };
}

function rotateBitmap(tile, size) {
  const result = new Uint32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      result[x + y * size] = tile[size - 1 - y + x * size];
    }
  }
  return result;
}

function reflectBitmap(tile, size) {
  const result = new Uint32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      result[x + y * size] = tile[size - 1 - x + y * size];
    }
  }
  return result;
}

module.exports = {
  loadTiledDefinition,
  rotateBitmap,
  reflectBitmap,
};

