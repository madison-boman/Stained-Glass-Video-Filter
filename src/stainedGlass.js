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

/**
 * Apply a stained-glass effect: block quantization plus dark lead lines on edges.
 */
export function renderStainedGlass(sourceCtx, outputCtx, width, height, options = {}) {
  const cellSize = options.cellSize ?? 18;
  const colorLevels = options.colorLevels ?? 8;
  const leadStrength = options.leadStrength ?? 0.7;

  const source = sourceCtx.getImageData(0, 0, width, height);
  const output = outputCtx.createImageData(width, height);

  const cols = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);
  const cellColors = new Uint8ClampedArray(cols * rows * 3);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x0 = col * cellSize;
      const y0 = row * cellSize;
      const x1 = Math.min(x0 + cellSize, width);
      const y1 = Math.min(y0 + cellSize, height);

      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let count = 0;

      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const idx = (y * width + x) * 4;
          sumR += source.data[idx];
          sumG += source.data[idx + 1];
          sumB += source.data[idx + 2];
          count += 1;
        }
      }

      const base = (row * cols + col) * 3;
      cellColors[base] = quantizeChannel(sumR / count, colorLevels);
      cellColors[base + 1] = quantizeChannel(sumG / count, colorLevels);
      cellColors[base + 2] = quantizeChannel(sumB / count, colorLevels);
    }
  }

  const leadThreshold = 28 + (1 - leadStrength) * 40;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const col = Math.min(Math.floor(x / cellSize), cols - 1);
      const row = Math.min(Math.floor(y / cellSize), rows - 1);
      const base = (row * cols + col) * 3;

      let r = cellColors[base];
      let g = cellColors[base + 1];
      let b = cellColors[base + 2];

      const onVerticalLead = x % cellSize === 0 || x === width - 1;
      const onHorizontalLead = y % cellSize === 0 || y === height - 1;

      if (onVerticalLead || onHorizontalLead) {
        const leftCol = Math.max(col - 1, 0);
        const rightCol = Math.min(col + 1, cols - 1);
        const topRow = Math.max(row - 1, 0);
        const bottomRow = Math.min(row + 1, rows - 1);

        const left = cellColors[(row * cols + leftCol) * 3];
        const right = cellColors[(row * cols + rightCol) * 3];
        const top = cellColors[(topRow * cols + col) * 3];
        const bottom = cellColors[(bottomRow * cols + col) * 3];

        const edge =
          Math.abs(left - right) +
          Math.abs(top - bottom) +
          Math.abs(luminance(r, g, b) - luminance(left, cellColors[(row * cols + leftCol) * 3 + 1], cellColors[(row * cols + leftCol) * 3 + 2]));

        if (edge > leadThreshold || onVerticalLead || onHorizontalLead) {
          const darken = 0.12 + leadStrength * 0.55;
          r = Math.round(r * darken);
          g = Math.round(g * darken);
          b = Math.round(b * darken);
        }
      }

      const outIdx = (y * width + x) * 4;
      output.data[outIdx] = r;
      output.data[outIdx + 1] = g;
      output.data[outIdx + 2] = b;
      output.data[outIdx + 3] = 255;
    }
  }

  outputCtx.putImageData(output, 0, 0);
}
