import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calculateModalScale } from '../src/core/modalResponsive';


describe('Modal Responsive Scaling Tests', () => {
  // Happy-path tests
  it('happy path: standard desktop (1920x1080) retains full 1.0 scale', () => {
    const scale = calculateModalScale(1920, 1080);
    assert.strictEqual(scale, 1.0);
  });

  it('happy path: short landscape viewport (896x303) scales down to fit viewport height cleanly', () => {
    const scale = calculateModalScale(896, 303);
    // 303 * 0.88 / 370 = ~0.72
    assert.ok(scale < 0.75, `Expected scale < 0.75, got ${scale}`);
    assert.ok(scale >= 0.70, `Expected scale >= 0.70, got ${scale}`);
    const scaledHeight = 370 * scale;
    assert.ok(scaledHeight < 303, `Scaled height (${scaledHeight}) must fit inside 303px`);
  });

  it('happy path: narrow mobile portrait (320x568) scales down to fit viewport width cleanly', () => {
    const scale = calculateModalScale(320, 568);
    // 320 * 0.92 / 340 = ~0.865
    assert.ok(scale < 0.90, `Expected scale < 0.90, got ${scale}`);
    assert.ok(scale >= 0.85, `Expected scale >= 0.85, got ${scale}`);
    const scaledWidth = 340 * scale;
    assert.ok(scaledWidth < 320, `Scaled width (${scaledWidth}) must fit inside 320px`);
  });

  // Failure-path / edge-case tests
  it('failure path: handles non-positive or corrupted dimensions gracefully', () => {
    assert.strictEqual(calculateModalScale(0, 0), 1.0);
    assert.strictEqual(calculateModalScale(-100, 300), 1.0);
  });

  it('failure path: clamps to minimum threshold on ultra-tiny screens so modal remains readable', () => {
    const scale = calculateModalScale(100, 100);
    assert.strictEqual(scale, 0.42);
  });
});
