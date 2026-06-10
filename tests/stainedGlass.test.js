import { describe, expect, it } from 'vitest';
import { luminance, quantizeChannel, renderStainedGlass } from '../src/stainedGlass.js';

describe('quantizeChannel', () => {
  it('snaps values to discrete levels', () => {
    expect(quantizeChannel(0, 4)).toBe(0);
    expect(quantizeChannel(255, 4)).toBe(255);
    expect(quantizeChannel(100, 8)).toBeGreaterThanOrEqual(0);
    expect(quantizeChannel(100, 8)).toBeLessThanOrEqual(255);
  });
});

describe('luminance', () => {
  it('returns a weighted brightness value', () => {
    expect(luminance(255, 255, 255)).toBeCloseTo(255);
    expect(luminance(0, 0, 0)).toBe(0);
  });
});

describe('renderStainedGlass', () => {
  function createContexts(width, height) {
    const sourceCanvas = document.createElement('canvas');
    const outputCanvas = document.createElement('canvas');
    sourceCanvas.width = width;
    sourceCanvas.height = height;
    outputCanvas.width = width;
    outputCanvas.height = height;

    const sourceCtx = sourceCanvas.getContext('2d');
    const outputCtx = outputCanvas.getContext('2d');

    return { sourceCtx, outputCtx };
  }

  function averageColumnLuminance(outputCtx, x, height, band = 3) {
    const pixels = outputCtx.getImageData(x, 0, band, height).data;
    let total = 0;
    let count = 0;

    for (let i = 0; i < pixels.length; i += 4) {
      total += luminance(pixels[i], pixels[i + 1], pixels[i + 2]);
      count += 1;
    }

    return total / count;
  }

  it('produces opaque output pixels', () => {
    const width = 36;
    const height = 36;
    const { sourceCtx, outputCtx } = createContexts(width, height);

    sourceCtx.fillStyle = '#ff6600';
    sourceCtx.fillRect(0, 0, width, height);
    sourceCtx.fillStyle = '#0044ff';
    sourceCtx.fillRect(width / 2, 0, width / 2, height);

    renderStainedGlass(sourceCtx, outputCtx, width, height, {
      cellSize: 12,
      colorLevels: 6,
      leadStrength: 0.8,
    });

    const pixels = outputCtx.getImageData(0, 0, width, height).data;
    expect(pixels[3]).toBe(255);
    expect(pixels[width * 4 + 3]).toBe(255);
  });

  it('adds glass-like tonal variation inside panes', () => {
    const width = 48;
    const height = 48;
    const { sourceCtx, outputCtx } = createContexts(width, height);

    sourceCtx.fillStyle = '#dd6600';
    sourceCtx.fillRect(0, 0, width, height);

    renderStainedGlass(sourceCtx, outputCtx, width, height, {
      cellSize: 16,
      colorLevels: 8,
      leadStrength: 0.8,
    });

    const pixels = outputCtx.getImageData(8, 8, 16, 16).data;
    const colors = new Set();

    for (let i = 0; i < pixels.length; i += 4) {
      colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
    }

    expect(colors.size).toBeGreaterThan(8);
  });

  it('avoids full-height square grid seams', () => {
    const width = 64;
    const height = 64;
    const { sourceCtx, outputCtx } = createContexts(width, height);

    sourceCtx.fillStyle = '#dd6600';
    sourceCtx.fillRect(0, 0, width, height);

    renderStainedGlass(sourceCtx, outputCtx, width, height, {
      cellSize: 16,
      colorLevels: 8,
      leadStrength: 0.8,
    });

    const pixels = outputCtx.getImageData(16, 0, 1, height).data;
    let darkPixels = 0;

    for (let i = 0; i < pixels.length; i += 4) {
      if (luminance(pixels[i], pixels[i + 1], pixels[i + 2]) < 80) {
        darkPixels += 1;
      }
    }

    expect(darkPixels).toBeLessThan(height * 0.9);
  });

  it('places stronger lead where the source has stark color differences', () => {
    const width = 80;
    const height = 40;
    const highContrast = createContexts(width, height);
    const lowContrast = createContexts(width, height);
    const options = {
      detail: 0.85,
      colorLevels: 12,
      leadStrength: 0.9,
    };

    highContrast.sourceCtx.fillStyle = '#f2a000';
    highContrast.sourceCtx.fillRect(0, 0, width / 2, height);
    highContrast.sourceCtx.fillStyle = '#1038d8';
    highContrast.sourceCtx.fillRect(width / 2, 0, width / 2, height);

    lowContrast.sourceCtx.fillStyle = '#d88a22';
    lowContrast.sourceCtx.fillRect(0, 0, width / 2, height);
    lowContrast.sourceCtx.fillStyle = '#d89428';
    lowContrast.sourceCtx.fillRect(width / 2, 0, width / 2, height);

    renderStainedGlass(highContrast.sourceCtx, highContrast.outputCtx, width, height, options);
    renderStainedGlass(lowContrast.sourceCtx, lowContrast.outputCtx, width, height, options);

    expect(averageColumnLuminance(highContrast.outputCtx, width / 2 - 1, height)).toBeLessThan(
      averageColumnLuminance(lowContrast.outputCtx, width / 2 - 1, height) - 25,
    );
  });

  it('uses detail to reveal moderate source transitions', () => {
    const width = 80;
    const height = 40;
    const highDetail = createContexts(width, height);
    const lowDetail = createContexts(width, height);

    [highDetail.sourceCtx, lowDetail.sourceCtx].forEach((ctx) => {
      ctx.fillStyle = '#8a5420';
      ctx.fillRect(0, 0, width / 2, height);
      ctx.fillStyle = '#cf9142';
      ctx.fillRect(width / 2, 0, width / 2, height);
    });

    renderStainedGlass(highDetail.sourceCtx, highDetail.outputCtx, width, height, {
      detail: 1,
      colorLevels: 12,
      leadStrength: 0.9,
    });
    renderStainedGlass(lowDetail.sourceCtx, lowDetail.outputCtx, width, height, {
      detail: 0,
      colorLevels: 12,
      leadStrength: 0.9,
    });

    expect(averageColumnLuminance(highDetail.outputCtx, width / 2 - 1, height)).toBeLessThan(
      averageColumnLuminance(lowDetail.outputCtx, width / 2 - 1, height) - 10,
    );
  });
});
