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
});
