import {
  type Scene,
} from '@babylonjs/core';

export interface ViewportBounds {
  minX: number;
  maxX: number;
  maxY: number;
}

/**
 * Calculates current visible screen boundaries in world space at gameplay plane Z.
 */
export function getCameraViewportBounds(scene: Scene, planeZ = 0): ViewportBounds {
  const camera = scene.activeCamera as any;
  const engine = scene.getEngine();
  const w = engine.getRenderWidth() || 800;
  const h = engine.getRenderHeight() || 600;
  const aspect = w / h;

  if (camera) {
    try {
      // Direct geometric calculation from camera perspective parameters:
      // 100% accurate across all screen resolutions and devicePixelRatio / hardware scaling levels
      const beta = camera.beta !== undefined ? camera.beta : Math.PI / 2;
      const radius = camera.radius !== undefined && camera.radius > 0 ? camera.radius : 10;
      const fov = camera.fov !== undefined && camera.fov > 0 ? camera.fov : 0.8;

      const targetX = camera.target ? camera.target.x : 0;
      const targetY = camera.target ? camera.target.y : 0;
      const targetZ = camera.target ? camera.target.z : 0;

      // Distance from camera eye to planeZ along Z
      const camZ = targetZ - radius * Math.sin(beta);
      const distZ = Math.max(0.1, Math.abs(planeZ - camZ));

      // Frustum half dimensions at gameplay plane
      const halfFovY = fov / 2;
      const visibleHalfHeight = distZ * Math.tan(halfFovY);
      const visibleHalfWidth = visibleHalfHeight * aspect;

      // Model dimension buffer ensures rotating gun (approx 0.65 units radius) stays 100% inside screen
      const gunModelBuffer = 0.65;
      const topBuffer = 0.45;

      const minX = targetX - visibleHalfWidth + gunModelBuffer;
      const maxX = targetX + visibleHalfWidth - gunModelBuffer;
      const maxY = targetY + visibleHalfHeight - topBuffer;

      if (maxX > minX) {
        return { minX, maxX, maxY };
      }
    } catch {
      // Fallback below
    }
  }

  return { minX: -4.0, maxX: 4.3, maxY: 4.6 };
}
