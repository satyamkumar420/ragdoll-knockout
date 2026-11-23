import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  calculateResponsiveCameraRadius,
  calculateDynamicGameplayRadius,
  computeLevelGameplayBounds,
} from '../src/core/cameraResponsive.ts';

describe('Camera Responsive Scaling Tests', () => {
  const baseRadius = 10.45; // Level 1 standard reference radius

  // Happy-path tests
  it('happy path: standard desktop widescreen (1920x1080, aspect 1.77) retains base radius', () => {
    const radius = calculateResponsiveCameraRadius(baseRadius, 1920, 1080);
    assert.strictEqual(radius, baseRadius);
  });

  it('happy path: short mobile landscape (896x300, aspect 2.98) retains base radius without zoom skew', () => {
    const radius = calculateResponsiveCameraRadius(baseRadius, 896, 300);
    assert.strictEqual(radius, baseRadius);
  });

  it('happy path: user mobile portrait (416x863, aspect 0.482) dynamically scales radius ~3.07x so gun & targets fit', () => {
    const radius = calculateResponsiveCameraRadius(baseRadius, 416, 863);
    const expected = baseRadius * (1.48 / (416 / 863));
    assert.ok(Math.abs(radius - expected) < 0.01, `Expected ${expected}, got ${radius}`);
    assert.ok(radius >= 32.0, 'Radius must expand beyond 32.0m to fit all horizontal targets');
  });

  it('happy path: modern mobile portrait (390x844, aspect 0.462) scales radius ~3.2x', () => {
    const radius = calculateResponsiveCameraRadius(baseRadius, 390, 844);
    assert.ok(radius > baseRadius * 3.1);
  });

  it('happy path: square/foldable screen (1000x1000, aspect 1.0) scales radius by exactly refAspect (1.48x)', () => {
    const radius = calculateResponsiveCameraRadius(baseRadius, 1000, 1000);
    assert.ok(Math.abs(radius - (baseRadius * 1.48)) < 0.001);
  });

  // Dynamic Gameplay Framing Tests
  it('happy path: dynamic framing tightens Level 99 from 70m to ~38m on mobile for big characters', () => {
    const level99Bounds = { minX: -5.5, maxX: 6.8 };
    const radius = calculateDynamicGameplayRadius(level99Bounds, 390, 844, 21.38);
    // Ideal is ~38.65, comfortably between 36 and 42 (much bigger characters than 70m!)
    assert.ok(radius < 45.0, `Expected tightened radius < 45, got ${radius}`);
    assert.ok(radius > 35.0, `Expected radius > 35 to fit gun and targets, got ${radius}`);
  });

  it('happy path: computeLevelGameplayBounds correctly finds bounds from gun and targets', () => {
    const mockLevel = {
      gunSpawnPos: { x: 6.8, y: 0.05, z: -0.1 },
      targets: [
        { position: { x: -5.5, y: 0, z: 3.2 } },
        { position: { x: 1.0, y: 0, z: 1.2 } },
        { position: { x: 5.18, y: 0, z: 1.37 } },
      ],
    };
    const bounds = computeLevelGameplayBounds(mockLevel);
    assert.deepStrictEqual(bounds, { minX: -5.5, maxX: 6.8 });
  });

  // Failure-path / edge-case tests
  it('failure path: non-positive or corrupted dimensions return base radius safely without throwing', () => {
    assert.strictEqual(calculateResponsiveCameraRadius(baseRadius, 0, 800), baseRadius);
    assert.strictEqual(calculateResponsiveCameraRadius(baseRadius, 800, 0), baseRadius);
    assert.strictEqual(calculateResponsiveCameraRadius(baseRadius, -500, 800), baseRadius);
    assert.strictEqual(calculateResponsiveCameraRadius(0, 400, 800), 0);
  });

  it('failure path: computeLevelGameplayBounds returns undefined when no gun or targets exist', () => {
    assert.strictEqual(computeLevelGameplayBounds({}), undefined);
    assert.strictEqual(computeLevelGameplayBounds({ targets: [] }), undefined);
  });
});
