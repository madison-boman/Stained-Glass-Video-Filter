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

function colorDifference(r1, g1, b1, r2, g2, b2) {
  return (Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2)) / 3;
}

function sourceEdgeContrast(data, width, height, x, y) {
  const left = (y * width + Math.max(x - 1, 0)) * 4;
  const right = (y * width + Math.min(x + 1, width - 1)) * 4;
  const top = (Math.max(y - 1, 0) * width + x) * 4;
  const bottom = (Math.min(y + 1, height - 1) * width + x) * 4;

  return Math.max(
    colorDifference(data[left], data[left + 1], data[left + 2], data[right], data[right + 1], data[right + 2]),
    colorDifference(data[top], data[top + 1], data[top + 2], data[bottom], data[bottom + 1], data[bottom + 2]),
  );
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
    const rowDrift = (randomUnit(0, row, 4) - 0.5) * cellSize * 0.55;

    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col;
      const jitterX = (randomUnit(col, row, 1) - 0.5) * cellSize * 0.95;
      const jitterY = (randomUnit(col, row, 2) - 0.5) * cellSize * 0.95;

      xs[index] = clamp((col + 0.5) * cellSize + rowDrift + jitterX, 0, width - 1);
      ys[index] = clamp((row + 0.5) * cellSize + jitterY, 0, height - 1);
      variants[index] = randomUnit(col, row, 3);
    }
  }

  return { xs, ys, variants };
}

function writeNearestSeeds(x, y, seeds, cols, rows, cellSize, result) {
  const warpedX =
    x +
    Math.sin(y * 0.055) * cellSize * 0.42 +
    Math.sin(y * 0.021 + 1.7) * cellSize * 0.28;
  const warpedY = y + Math.sin(x * 0.049 + 0.8) * cellSize * 0.34;
  const gridCol = clamp(Math.floor(warpedX / cellSize), 0, cols - 1);
  const gridRow = clamp(Math.floor(warpedY / cellSize), 0, rows - 1);
  const startCol = Math.max(gridCol - 3, 0);
  const endCol = Math.min(gridCol + 3, cols - 1);
  const startRow = Math.max(gridRow - 3, 0);
  const endRow = Math.min(gridRow + 3, rows - 1);

  let bestIndex = 0;
  let secondIndex = 0;
  let bestDistance = Infinity;
  let secondDistance = Infinity;

  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      const index = row * cols + col;
      const dx = warpedX - seeds.xs[index];
      const dy = warpedY - seeds.ys[index];
      const distance = dx * dx + dy * dy;

      if (distance < bestDistance) {
        secondIndex = bestIndex;
        secondDistance = bestDistance;
        bestDistance = distance;
        bestIndex = index;
      } else if (distance < secondDistance) {
        secondDistance = distance;
        secondIndex = index;
      }
    }
  }

  result.bestIndex = bestIndex;
  result.secondIndex = secondIndex;
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
  const detail = clamp(options.detail ?? 0.65, 0, 1);
  const cellSize = options.cellSize ?? Math.round(52 - detail * 38);
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
    secondIndex: 0,
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

  const leadWidth = 0.9 + leadStrength * 2.45;
  const leadFeather = 0.9 + leadStrength * 0.9;
  const detailBlend = 0.08 + detail * 0.18;
  const seamThreshold = 18 + (1 - detail) * 72;
  const edgeThreshold = 22 + (1 - detail) * 82;

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
      const secondBase = nearest.secondIndex * 3;
      const seamContrast = colorDifference(
        cellColors[base],
        cellColors[base + 1],
        cellColors[base + 2],
        cellColors[secondBase],
        cellColors[secondBase + 1],
        cellColors[secondBase + 2],
      );
      const seamDetail = clamp((seamContrast - seamThreshold) / (160 - seamThreshold), 0, 1);
      const edgeDetail = clamp((sourceEdgeContrast(source.data, width, height, x, y) - edgeThreshold) / (180 - edgeThreshold), 0, 1);
      const leadAlpha = Math.max(seamAlpha * seamDetail, frameAlpha, edgeDetail * leadStrength);

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
