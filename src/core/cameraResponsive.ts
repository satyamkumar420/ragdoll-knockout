export interface GameplayBounds {
  minX: number;
  maxX: number;
  minY?: number;
  maxY?: number;
}

/**
 * Calculates responsive camera radius to guarantee all level targets, obstacles,
 * and the player weapon remain fully inside visible screen bounds across any aspect ratio.
 */
export function calculateResponsiveCameraRadius(
  baseRadius: number,
  width: number,
  height: number,
  refAspect = 1.48
): number {
  if (width <= 0 || height <= 0 || baseRadius <= 0) return baseRadius;
  const aspect = width / height;

  if (aspect < refAspect) {
    // Scale proportionally but limit zoom-out so content stays large on mobile
    const scaleFactor = refAspect / aspect;
    // Apply a dampened scale: sqrt blending prevents over-zoom on tall portrait screens
    const dampened = 1 + (scaleFactor - 1) * 0.65;
    return baseRadius * dampened;
  }
  return baseRadius;
}

/**
 * Computes horizontal and vertical gameplay bounds from gun spawn position,
 * character targets, and animal companions (chickens/pugs).
 * NOTE: Background scenery props (distant lamps, trees, houses) are strictly
 * excluded so the camera doesn't zoom out excessively into the sky.
 */
export function computeLevelGameplayBounds(level: {
  gunSpawnPos?: { x: number; y: number; z: number } | [number, number, number];
  targets?: { position: { x: number; y: number; z: number } | [number, number, number] }[];
  pugs?: { position: { x: number; y: number; z: number } | [number, number, number] }[];
}): GameplayBounds | undefined {
  const getX = (pos: any): number | undefined => {
    if (!pos) return undefined;
    if (typeof pos.x === 'number') return pos.x;
    if (Array.isArray(pos) && typeof pos[0] === 'number') return pos[0];
    return undefined;
  };
  const getY = (pos: any): number | undefined => {
    if (!pos) return undefined;
    if (typeof pos.y === 'number') return pos.y;
    if (Array.isArray(pos) && typeof pos[1] === 'number') return pos[1];
    return undefined;
  };

  const gunX = getX(level.gunSpawnPos);
  const gunY = getY(level.gunSpawnPos);
  if (gunX === undefined && (!level.targets || level.targets.length === 0)) {
    return undefined;
  }
  let minX = gunX !== undefined ? gunX : 0;
  let maxX = gunX !== undefined ? gunX : 0;
  let minY = gunY !== undefined ? gunY : 0;
  let maxY = gunY !== undefined ? gunY : 0;

  // Include enemy character targets
  if (level.targets && level.targets.length > 0) {
    for (const t of level.targets) {
      const tx = getX(t.position);
      const ty = getY(t.position);
      if (tx !== undefined) {
        minX = Math.min(minX, tx);
        maxX = Math.max(maxX, tx);
      }
      if (ty !== undefined) {
        minY = Math.min(minY, ty);
        maxY = Math.max(maxY, ty + 2.0);
      }
    }
  }

  // Include animal companions (chicken/pug)
  if (level.pugs && level.pugs.length > 0) {
    for (const p of level.pugs) {
      const px = getX(p.position);
      const py = getY(p.position);
      if (px !== undefined) {
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
      }
      if (py !== undefined) {
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py + 1.2);
      }
    }
  }

  return { minX, maxX, minY, maxY };
}

/**
 * Calculates optimal camera radius based on actual gameplay bounds (gun + targets),
 * keeping characters large, crisp and readable on mobile with a comfortable margin.
 */
export function calculateDynamicGameplayRadius(
  bounds: GameplayBounds,
  width: number,
  height: number,
  baseRadius?: number,
  fov = 0.8,
  targetX = 0,
  targetY = 1.15
): number {
  if (width <= 0 || height <= 0) return baseRadius || 12;
  const aspect = width / height;
  const halfFov = fov / 2;

  // --- Horizontal constraint ---
  const maxReachX = Math.max(
    Math.abs(bounds.minX - targetX),
    Math.abs(bounds.maxX - targetX),
    (bounds.maxX - bounds.minX) / 2
  );
  // Gentle breathing room (+1.35 units padding) so characters and nearby props
  // have comfortable space without pushing the camera far away
  const requiredHalfWidth = maxReachX + 1.35;
  const visibleHalfWidthPerUnit = Math.tan(halfFov) * aspect;
  const radiusFromWidth = requiredHalfWidth / Math.max(0.05, visibleHalfWidthPerUnit);

  // --- Vertical constraint ---
  const boundsMinY = bounds.minY ?? 0;
  const boundsMaxY = bounds.maxY ?? (targetY + 2.0);
  const maxReachY = Math.max(
    Math.abs(boundsMaxY - targetY),
    Math.abs(targetY - boundsMinY)
  );
  const requiredHalfHeight = maxReachY + 0.8;
  const visibleHalfHeightPerUnit = Math.tan(halfFov);
  const radiusFromHeight = requiredHalfHeight / Math.max(0.05, visibleHalfHeightPerUnit);

  const optimalRadius = Math.max(radiusFromWidth, radiusFromHeight);

  // On widescreen (desktop/landscape), use baseRadius if defined and larger
  if (aspect >= 1.2 && baseRadius && baseRadius > 0) {
    return Math.max(baseRadius, optimalRadius);
  }

  // On portrait / mobile: clamp tightly between 9 and 26 to guarantee characters stay close and large!
  const clampedRadius = Math.max(9, Math.min(optimalRadius, 26));

  if (baseRadius && baseRadius > 0 && baseRadius >= clampedRadius && aspect >= 0.9) {
    return baseRadius;
  }

  return clampedRadius;
}
