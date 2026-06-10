/**
 * Quantize a channel value into discrete levels.
 */
export function quantizeChannel(value, levels) {
  const step = 255 / (levels - 1);
  return Math.round(Math.round(value / step) * step);
}

/**
 * Convert RGB to a single luminance value.
 */
export function luminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function randomUnit(col, row, salt) {
  const value = Math.sin(col * 127.1 + row * 311.7 + salt * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

function createSeeds(cols, rows, cellSize, width, height) {
  const count = cols * rows;
  const xs = new Float32Array(count);
  const ys = new Float32Array(count);
  const variants = new Float32Array(count);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col;
      const jitterX = (randomUnit(col, row, 1) - 0.5) * cellSize * 0.7;
      const jitterY = (randomUnit(col, row, 2) - 0.5) * cellSize * 0.7;

      xs[index] = clamp((col + 0.5) * cellSize + jitterX, 0, width - 1);
      ys[index] = clamp((row + 0.5) * cellSize + jitterY, 0, height - 1);
      variants[index] = randomUnit(col, row, 3);
    }
  }

  return { xs, ys, variants };
}

function writeNearestSeeds(x, y, seeds, cols, rows, cellSize, result) {
  const startCol = Math.max(Math.floor(x / cellSize) - 2, 0);
  const endCol = Math.min(Math.floor(x / cellSize) + 2, cols - 1);
  const startRow = Math.max(Math.floor(y / cellSize) - 2, 0);
  const endRow = Math.min(Math.floor(y / cellSize) + 2, rows - 1);

  let bestIndex = 0;
  let bestDistance = Infinity;
  let secondDistance = Infinity;

  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      const index = row * cols + col;
      const dx = x - seeds.xs[index];
      const dy = y - seeds.ys[index];
      const distance = dx * dx + dy * dy;

      if (distance < bestDistance) {
        secondDistance = bestDistance;
        bestDistance = distance;
        bestIndex = index;
      } else if (distance < secondDistance) {
        secondDistance = distance;
      }
    }
  }

  result.bestIndex = bestIndex;
  result.bestDistance = bestDistance;
  result.secondDistance = secondDistance;
}

function shapeGlassColor(r, g, b) {
  const brightness = luminance(r, g, b);
  return [
    clamp(Math.round((brightness + (r - brightness) * 1.22 - 128) * 1.08 + 136), 0, 255),
    clamp(Math.round((brightness + (g - brightness) * 1.22 - 128) * 1.08 + 136), 0, 255),
    clamp(Math.round((brightness + (b - brightness) * 1.22 - 128) * 1.08 + 136), 0, 255),
  ];
}

/**
 * Apply a stained-glass effect: organic pane tessellation plus dark lead seams.
 */
export function renderStainedGlass(sourceCtx, outputCtx, width, height, options = {}) {
  const cellSize = options.cellSize ?? 24;
  const colorLevels = options.colorLevels ?? 12;
  const leadStrength = options.leadStrength ?? 0.82;

  const source = sourceCtx.getImageData(0, 0, width, height);
  const output = outputCtx.createImageData(width, height);

  const cols = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);
  const seeds = createSeeds(cols, rows, cellSize, width, height);
  const seedCount = cols * rows;
  const sumR = new Float64Array(seedCount);
  const sumG = new Float64Array(seedCount);
  const sumB = new Float64Array(seedCount);
  const counts = new Uint32Array(seedCount);
  const cellColors = new Uint8ClampedArray(cols * rows * 3);
  const nearest = {
    bestIndex: 0,
    bestDistance: 0,
    secondDistance: Infinity,
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      writeNearestSeeds(x, y, seeds, cols, rows, cellSize, nearest);

      const sourceIndex = (y * width + x) * 4;
      const seedIndex = nearest.bestIndex;
      sumR[seedIndex] += source.data[sourceIndex];
      sumG[seedIndex] += source.data[sourceIndex + 1];
      sumB[seedIndex] += source.data[sourceIndex + 2];
      counts[seedIndex] += 1;
    }
  }

  for (let index = 0; index < seedCount; index += 1) {
    const sourceX = Math.round(seeds.xs[index]);
    const sourceY = Math.round(seeds.ys[index]);
    const fallbackIndex = (sourceY * width + sourceX) * 4;
    const count = counts[index] || 1;
    const shaped = shapeGlassColor(
      quantizeChannel(counts[index] ? sumR[index] / count : source.data[fallbackIndex], colorLevels),
      quantizeChannel(counts[index] ? sumG[index] / count : source.data[fallbackIndex + 1], colorLevels),
      quantizeChannel(counts[index] ? sumB[index] / count : source.data[fallbackIndex + 2], colorLevels),
    );

    const base = index * 3;
    cellColors[base] = shaped[0];
    cellColors[base + 1] = shaped[1];
    cellColors[base + 2] = shaped[2];
  }

  const leadWidth = 1.4 + leadStrength * 3.4;
  const leadFeather = 1.1 + leadStrength * 1.4;
  const detailBlend = 0.12 + (1 - leadStrength) * 0.08;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      writeNearestSeeds(x, y, seeds, cols, rows, cellSize, nearest);

      const seedIndex = nearest.bestIndex;
      const base = seedIndex * 3;
      const sourceIndex = (y * width + x) * 4;
      const dx = (x - seeds.xs[seedIndex]) / cellSize;
      const dy = (y - seeds.ys[seedIndex]) / cellSize;
      const centerGlow = 1 - clamp(Math.sqrt(nearest.bestDistance) / (cellSize * 0.85), 0, 1);
      const ripple = Math.sin(x * 0.075 + y * 0.11 + seeds.variants[seedIndex] * Math.PI * 2) * 0.025;
      const facet = 1 + centerGlow * 0.16 - dx * 0.08 + dy * 0.06 + ripple;

      let r = (cellColors[base] * (1 - detailBlend) + source.data[sourceIndex] * detailBlend) * facet;
      let g = (cellColors[base + 1] * (1 - detailBlend) + source.data[sourceIndex + 1] * detailBlend) * facet;
      let b = (cellColors[base + 2] * (1 - detailBlend) + source.data[sourceIndex + 2] * detailBlend) * facet;

      const boundaryDistance = Number.isFinite(nearest.secondDistance)
        ? Math.sqrt(nearest.secondDistance) - Math.sqrt(nearest.bestDistance)
        : Infinity;
      const edgeDistance = Math.min(x, y, width - 1 - x, height - 1 - y);
      const seamAlpha = 1 - clamp((boundaryDistance - leadWidth) / leadFeather, 0, 1);
      const frameAlpha = 1 - clamp((edgeDistance - leadWidth) / leadFeather, 0, 1);
      const leadAlpha = Math.max(seamAlpha, frameAlpha);

      if (leadAlpha > 0) {
        const leadR = 10 + r * 0.05;
        const leadG = 12 + g * 0.05;
        const leadB = 17 + b * 0.06;

        r = r * (1 - leadAlpha) + leadR * leadAlpha;
        g = g * (1 - leadAlpha) + leadG * leadAlpha;
        b = b * (1 - leadAlpha) + leadB * leadAlpha;
      }

      const outIdx = (y * width + x) * 4;
      output.data[outIdx] = clamp(Math.round(r), 0, 255);
      output.data[outIdx + 1] = clamp(Math.round(g), 0, 255);
      output.data[outIdx + 2] = clamp(Math.round(b), 0, 255);
      output.data[outIdx + 3] = 255;
    }
  }

  outputCtx.putImageData(output, 0, 0);
}
