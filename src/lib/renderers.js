const { PNG } = require('pngjs');

function renderModelToPng(model) {
  const width = model.MX * model.tilesize;
  const height = model.MY * model.tilesize;
  const png = new PNG({ width, height });
  const { wave, observed } = model.state;
  const tiles = model.tiles;

  for (let y = 0; y < model.MY; y++) {
    for (let x = 0; x < model.MX; x++) {
      const index = x + y * model.MX;
      const tileIndex = observed[index];
      const tileData =
        tileIndex >= 0 ? tiles[tileIndex] : averageColors(wave[index], tiles);

      for (let dy = 0; dy < model.tilesize; dy++) {
        for (let dx = 0; dx < model.tilesize; dx++) {
          const destX = x * model.tilesize + dx;
          const destY = y * model.tilesize + dy;
          const destIndex = (destY * width + destX) << 2;
          const color = tileData[dx + dy * model.tilesize];

          png.data[destIndex] = (color >> 16) & 0xff;
          png.data[destIndex + 1] = (color >> 8) & 0xff;
          png.data[destIndex + 2] = color & 0xff;
          png.data[destIndex + 3] = (color >> 24) & 0xff;
        }
      }
    }
  }

  return PNG.sync.write(png);
}

function averageColors(stateRow, tiles) {
  const totalPixels = tiles[0].length;
  const averages = new Uint32Array(totalPixels);

  for (let idx = 0; idx < totalPixels; idx++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    let contributors = 0;
    for (let t = 0; t < tiles.length; t++) {
      if (!stateRow[t]) continue;
      const color = tiles[t][idx];
      r += (color >> 16) & 0xff;
      g += (color >> 8) & 0xff;
      b += color & 0xff;
      a += (color >> 24) & 0xff;
      contributors++;
    }
    if (contributors === 0) {
      averages[idx] = 0xff000000;
    } else {
      averages[idx] =
        ((a / contributors) << 24) |
        ((r / contributors) << 16) |
        ((g / contributors) << 8) |
        (b / contributors);
    }
  }

  return averages;
}

module.exports = {
  renderModelToPng,
  averageColors,
};

