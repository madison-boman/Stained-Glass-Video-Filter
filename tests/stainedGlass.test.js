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
  it('produces opaque output pixels', () => {
    const width = 36;
    const height = 36;
    const sourceCanvas = document.createElement('canvas');
    const outputCanvas = document.createElement('canvas');
    sourceCanvas.width = width;
    sourceCanvas.height = height;
    outputCanvas.width = width;
    outputCanvas.height = height;

    const sourceCtx = sourceCanvas.getContext('2d');
    const outputCtx = outputCanvas.getContext('2d');

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
});
