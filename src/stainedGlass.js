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

function sourceIndexAt(width, height, x, y) {
  const sampleX = clamp(Math.round(x), 0, width - 1);
  const sampleY = clamp(Math.round(y), 0, height - 1);

  return (sampleY * width + sampleX) * 4;
}

function createSmoothedSourceData(data, width, height) {
  const smoothed = new Uint8ClampedArray(data.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let count = 0;

      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        const sampleY = clamp(y + offsetY, 0, height - 1);

        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const sampleX = clamp(x + offsetX, 0, width - 1);
          const index = (sampleY * width + sampleX) * 4;

          sumR += data[index];
          sumG += data[index + 1];
          sumB += data[index + 2];
          count += 1;
        }
      }

      const outIndex = (y * width + x) * 4;
      smoothed[outIndex] = Math.round(sumR / count);
      smoothed[outIndex + 1] = Math.round(sumG / count);
      smoothed[outIndex + 2] = Math.round(sumB / count);
      smoothed[outIndex + 3] = 255;
    }
  }

  return smoothed;
}

function randomUnit(col, row, salt) {
  const value = Math.sin(col * 127.1 + row * 311.7 + salt * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

function createSeeds(cols, rows, cellSize, width, height, sourceData, detail) {
  const count = cols * rows;
  const xs = new Float32Array(count);
  const ys = new Float32Array(count);
  const rs = new Uint8ClampedArray(count);
  const gs = new Uint8ClampedArray(count);
  const bs = new Uint8ClampedArray(count);
  const variants = new Float32Array(count);
  const colorDrift = cellSize * (0.5 + detail * 0.72);

  for (let row = 0; row < rows; row += 1) {
    const rowDrift = (randomUnit(0, row, 4) - 0.5) * cellSize * 0.55;

    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col;
      const jitterX = (randomUnit(col, row, 1) - 0.5) * cellSize * 0.95;
      const jitterY = (randomUnit(col, row, 2) - 0.5) * cellSize * 0.95;
      const variant = randomUnit(col, row, 3);
      const baseX = (col + 0.5) * cellSize + rowDrift + jitterX;
      const baseY = (row + 0.5) * cellSize + jitterY;
      const sampleIndex = sourceIndexAt(width, height, baseX, baseY);
      const r = sourceData[sampleIndex];
      const g = sourceData[sampleIndex + 1];
      const b = sourceData[sampleIndex + 2];
      const brightness = luminance(r, g, b);
      const colorPhase =
        (r * 0.019 + g * 0.031 + b * 0.043 + brightness * 0.017) * (0.55 + variant * 0.7) +
        variant * Math.PI * 2;
      const chromaPhase = (r - b) * 0.037 + (g - brightness) * 0.029 + variant * Math.PI * 4;
      const left = sourceIndexAt(width, height, baseX - cellSize * 0.45, baseY);
      const right = sourceIndexAt(width, height, baseX + cellSize * 0.45, baseY);
      const top = sourceIndexAt(width, height, baseX, baseY - cellSize * 0.45);
      const bottom = sourceIndexAt(width, height, baseX, baseY + cellSize * 0.45);
      const gradientX =
        luminance(sourceData[right], sourceData[right + 1], sourceData[right + 2]) -
        luminance(sourceData[left], sourceData[left + 1], sourceData[left + 2]);
      const gradientY =
        luminance(sourceData[bottom], sourceData[bottom + 1], sourceData[bottom + 2]) -
        luminance(sourceData[top], sourceData[top + 1], sourceData[top + 2]);

      xs[index] = clamp(
        baseX +
          Math.sin(colorPhase) * colorDrift +
          Math.sin(chromaPhase) * cellSize * detail * 0.28 +
          gradientX * detail * 0.09,
        0,
        width - 1,
      );
      ys[index] = clamp(
        baseY +
          Math.cos(colorPhase) * colorDrift +
          Math.cos(chromaPhase) * cellSize * detail * 0.28 +
          gradientY * detail * 0.09,
        0,
        height - 1,
      );
      rs[index] = r;
      gs[index] = g;
      bs[index] = b;
      variants[index] = variant;
    }
  }

  return { xs, ys, rs, gs, bs, variants };
}

function writeNearestSeeds(
  x,
  y,
  seeds,
  cols,
  rows,
  cellSize,
  sourceData,
  width,
  height,
  colorWeight,
  warpStrength,
  result,
) {
  const sourceIndex = (y * width + x) * 4;
  const r = sourceData[sourceIndex];
  const g = sourceData[sourceIndex + 1];
  const b = sourceData[sourceIndex + 2];
  const brightness = luminance(r, g, b);
  const sourcePhase = r * 0.035 + g * 0.057 + b * 0.071 + brightness * 0.023;
  const warpedX =
    x +
    Math.sin(y * 0.055) * cellSize * 0.42 +
    Math.sin(y * 0.021 + 1.7) * cellSize * 0.28 +
    Math.sin(sourcePhase) * warpStrength +
    Math.sin((r - g) * 0.05 + y * 0.018) * warpStrength * 0.45;
  const warpedY =
    y +
    Math.sin(x * 0.049 + 0.8) * cellSize * 0.34 +
    Math.cos(sourcePhase) * warpStrength +
    Math.cos((b - g) * 0.05 + x * 0.018) * warpStrength * 0.45;
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
      const spatialDistance = dx * dx + dy * dy;
      const colorCost = colorDifference(r, g, b, seeds.rs[index], seeds.gs[index], seeds.bs[index]);
      const distance = spatialDistance + colorCost * cellSize * colorWeight;

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
  const smoothedSource = createSmoothedSourceData(source.data, width, height);
  const output = outputCtx.createImageData(width, height);

  const cols = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);
  const seeds = createSeeds(cols, rows, cellSize, width, height, smoothedSource, detail);
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
  const colorWeight = 0.9 + detail * 2.15;
  const warpStrength = cellSize * (0.45 + detail * 1.05);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      writeNearestSeeds(
        x,
        y,
        seeds,
        cols,
        rows,
        cellSize,
        smoothedSource,
        width,
        height,
        colorWeight,
        warpStrength,
        nearest,
      );

      const sourceIndex = (y * width + x) * 4;
      const seedIndex = nearest.bestIndex;
      sumR[seedIndex] += smoothedSource[sourceIndex];
      sumG[seedIndex] += smoothedSource[sourceIndex + 1];
      sumB[seedIndex] += smoothedSource[sourceIndex + 2];
      counts[seedIndex] += 1;
    }
  }

  for (let index = 0; index < seedCount; index += 1) {
    const sourceX = Math.round(seeds.xs[index]);
    const sourceY = Math.round(seeds.ys[index]);
    const fallbackIndex = (sourceY * width + sourceX) * 4;
    const count = counts[index] || 1;
    const shaped = shapeGlassColor(
      quantizeChannel(counts[index] ? sumR[index] / count : smoothedSource[fallbackIndex], colorLevels),
      quantizeChannel(counts[index] ? sumG[index] / count : smoothedSource[fallbackIndex + 1], colorLevels),
      quantizeChannel(counts[index] ? sumB[index] / count : smoothedSource[fallbackIndex + 2], colorLevels),
    );

    const base = index * 3;
    cellColors[base] = shaped[0];
    cellColors[base + 1] = shaped[1];
    cellColors[base + 2] = shaped[2];
  }

  const leadWidth = 1.15 + leadStrength * 2.8;
  const leadFeather = 0.65 + leadStrength * 0.65;
  const detailBlend = 0.02 + detail * 0.04;
  const seamThreshold = 18 + (1 - detail) * 72;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      writeNearestSeeds(
        x,
        y,
        seeds,
        cols,
        rows,
        cellSize,
        smoothedSource,
        width,
        height,
        colorWeight,
        warpStrength,
        nearest,
      );

      const seedIndex = nearest.bestIndex;
      const base = seedIndex * 3;
      const sourceIndex = (y * width + x) * 4;
      const dx = (x - seeds.xs[seedIndex]) / cellSize;
      const dy = (y - seeds.ys[seedIndex]) / cellSize;
      const centerGlow = 1 - clamp(Math.sqrt(nearest.bestDistance) / (cellSize * 0.85), 0, 1);
      const ripple = Math.sin(x * 0.075 + y * 0.11 + seeds.variants[seedIndex] * Math.PI * 2) * 0.025;
      const facet = 1 + centerGlow * 0.16 - dx * 0.08 + dy * 0.06 + ripple;

      let r = (cellColors[base] * (1 - detailBlend) + smoothedSource[sourceIndex] * detailBlend) * facet;
      let g = (cellColors[base + 1] * (1 - detailBlend) + smoothedSource[sourceIndex + 1] * detailBlend) * facet;
      let b = (cellColors[base + 2] * (1 - detailBlend) + smoothedSource[sourceIndex + 2] * detailBlend) * facet;

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
      const leadBaseline = 0.74 + leadStrength * 0.2;
      const leadAlpha = Math.max(
        clamp(seamAlpha * (leadBaseline + seamDetail * 0.18), 0, 1),
        frameAlpha,
      );

      if (leadAlpha > 0) {
        const leadR = 4 + r * 0.025;
        const leadG = 5 + g * 0.025;
        const leadB = 7 + b * 0.03;

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
