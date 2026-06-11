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

  function countDarkInteriorPixels(outputCtx, width, height, threshold = 70) {
    const pixels = outputCtx.getImageData(0, 0, width, height).data;
    let darkPixels = 0;

    for (let y = 4; y < height - 4; y += 1) {
      for (let x = 4; x < width - 4; x += 1) {
        const index = (y * width + x) * 4;

        if (luminance(pixels[index], pixels[index + 1], pixels[index + 2]) < threshold) {
          darkPixels += 1;
        }
      }
    }

    return darkPixels;
  }

  function countShadowInteriorPixels(outputCtx, width, height) {
    const pixels = outputCtx.getImageData(0, 0, width, height).data;
    let shadowPixels = 0;

    for (let y = 4; y < height - 4; y += 1) {
      for (let x = 4; x < width - 4; x += 1) {
        const index = (y * width + x) * 4;
        const brightness = luminance(pixels[index], pixels[index + 1], pixels[index + 2]);

        if (brightness >= 70 && brightness < 115) {
          shadowPixels += 1;
        }
      }
    }

    return shadowPixels;
  }

  function averageInteriorLuminance(outputCtx, width, height) {
    const pixels = outputCtx.getImageData(0, 0, width, height).data;
    let total = 0;
    let count = 0;

    for (let y = 4; y < height - 4; y += 1) {
      for (let x = 4; x < width - 4; x += 1) {
        const index = (y * width + x) * 4;
        total += luminance(pixels[index], pixels[index + 1], pixels[index + 2]);
        count += 1;
      }
    }

    return total / count;
  }

  function countDarkMaskDifferences(firstCtx, secondCtx, width, height, threshold = 70) {
    const first = firstCtx.getImageData(0, 0, width, height).data;
    const second = secondCtx.getImageData(0, 0, width, height).data;
    let differences = 0;

    for (let y = 4; y < height - 4; y += 1) {
      for (let x = 4; x < width - 4; x += 1) {
        const index = (y * width + x) * 4;
        const firstIsLead = luminance(first[index], first[index + 1], first[index + 2]) < threshold;
        const secondIsLead = luminance(second[index], second[index + 1], second[index + 2]) < threshold;

        if (firstIsLead !== secondIsLead) {
          differences += 1;
        }
      }
    }

    return differences;
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

  it('draws crisp lead between shards even when source colors are similar', () => {
    const width = 80;
    const height = 80;
    const { sourceCtx, outputCtx } = createContexts(width, height);

    sourceCtx.fillStyle = '#d88a22';
    sourceCtx.fillRect(0, 0, width, height);

    renderStainedGlass(sourceCtx, outputCtx, width, height, {
      detail: 0.8,
      colorLevels: 12,
      leadStrength: 0.9,
    });

    expect(countDarkInteriorPixels(outputCtx, width, height)).toBeGreaterThan(300);
  });

  it('keeps lead lines from blacking out glass panes', () => {
    const width = 80;
    const height = 80;
    const { sourceCtx, outputCtx } = createContexts(width, height);

    sourceCtx.fillStyle = '#d88a22';
    sourceCtx.fillRect(0, 0, width, height);

    renderStainedGlass(sourceCtx, outputCtx, width, height, {
      detail: 0.9,
      colorLevels: 12,
      leadStrength: 0.9,
    });

    expect(countDarkInteriorPixels(outputCtx, width, height)).toBeLessThan(1400);
  });

  it('renders lead as solid lines instead of gray shadows', () => {
    const width = 80;
    const height = 80;
    const { sourceCtx, outputCtx } = createContexts(width, height);

    sourceCtx.fillStyle = '#d88a22';
    sourceCtx.fillRect(0, 0, width, height);

    renderStainedGlass(sourceCtx, outputCtx, width, height, {
      detail: 0.9,
      colorLevels: 12,
      leadStrength: 0.9,
    });

    expect(countShadowInteriorPixels(outputCtx, width, height)).toBeLessThan(200);
  });

  it('renders dark source areas as glass instead of black blobs', () => {
    const width = 80;
    const height = 80;
    const { sourceCtx, outputCtx } = createContexts(width, height);

    sourceCtx.fillStyle = '#121212';
    sourceCtx.fillRect(0, 0, width, height);

    renderStainedGlass(sourceCtx, outputCtx, width, height, {
      detail: 0.8,
      colorLevels: 12,
      leadStrength: 0.9,
    });

    expect(averageInteriorLuminance(outputCtx, width, height)).toBeGreaterThan(38);
  });

  it('smooths isolated source noise instead of rendering it as grain', () => {
    const width = 80;
    const height = 80;
    const clean = createContexts(width, height);
    const noisy = createContexts(width, height);
    const options = {
      detail: 0.9,
      colorLevels: 12,
      leadStrength: 0.9,
    };

    [clean.sourceCtx, noisy.sourceCtx].forEach((ctx) => {
      ctx.fillStyle = '#d88a22';
      ctx.fillRect(0, 0, width, height);
    });

    for (let y = 6; y < height - 6; y += 7) {
      for (let x = 6; x < width - 6; x += 7) {
        noisy.sourceCtx.fillStyle = (x + y) % 2 === 0 ? '#111111' : '#f6f2de';
        noisy.sourceCtx.fillRect(x, y, 1, 1);
      }
    }

    renderStainedGlass(clean.sourceCtx, clean.outputCtx, width, height, options);
    renderStainedGlass(noisy.sourceCtx, noisy.outputCtx, width, height, options);

    expect(countDarkInteriorPixels(noisy.outputCtx, width, height)).toBeLessThan(
      countDarkInteriorPixels(clean.outputCtx, width, height) + 500,
    );
  });

  it('regenerates shard geometry when the frame colors change', () => {
    const width = 80;
    const height = 80;
    const firstFrame = createContexts(width, height);
    const secondFrame = createContexts(width, height);
    const options = {
      detail: 0.85,
      colorLevels: 12,
      leadStrength: 0.9,
    };

    firstFrame.sourceCtx.fillStyle = '#d86e16';
    firstFrame.sourceCtx.fillRect(0, 0, width, height);
    secondFrame.sourceCtx.fillStyle = '#165ed8';
    secondFrame.sourceCtx.fillRect(0, 0, width, height);

    renderStainedGlass(firstFrame.sourceCtx, firstFrame.outputCtx, width, height, options);
    renderStainedGlass(secondFrame.sourceCtx, secondFrame.outputCtx, width, height, options);

    expect(countDarkMaskDifferences(firstFrame.outputCtx, secondFrame.outputCtx, width, height)).toBeGreaterThan(250);
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

  it('uses detail to change moderate-transition shard patterns', () => {
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

    expect(countDarkMaskDifferences(highDetail.outputCtx, lowDetail.outputCtx, width, height)).toBeGreaterThan(300);
  });
});
