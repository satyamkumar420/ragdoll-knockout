import {
  type Scene,
  Vector3,
  Ray,
  type AbstractMesh,
} from '@babylonjs/core';
import type { RagdollController } from '../ragdoll';
import type { PugController } from '../pug';
import { obstacleManager } from './obstacleManager.ts';
import {
  type ObstacleState,
  type ObstacleImpactResult,
  type WeaponBallistics,
  DEFAULT_WEAPON_BALLISTICS,
} from './obstacleTypes.ts';
import { intersectRayAABB, overlapsGameplayPlaneZ } from './collisionSystem.ts';

export interface HitDetectionResult {
  hitPoint: Vector3;
  hitTarget: RagdollController | null;
  hitPug: PugController | null;
  hitObstacle: ObstacleState | null;
  penetratedObstacles: ObstacleImpactResult[];
  effectiveDamage: number;
  isDirect: boolean;
  stoppedByObstacle: boolean;
}

interface CandidateHit {
  type: 'obstacle' | 'character' | 'pug' | 'ground';
  distance: number;
  hitPoint: Vector3;
  obstacle?: ObstacleState;
  character?: RagdollController;
  pug?: PugController;
}

/**
 * Determines whether an obstacle should use swept AABB ray testing.
 * Complex 3D models (cars, vehicles, furniture, streetlamps, trees, etc.) have non-box
 * silhouettes with large open spaces (e.g. above car hoods, under chassis, between chair legs).
 * They must strictly rely on Section 1's triangle-level mesh picking (multiPickWithRay)
 * rather than coarse AABB sweep to prevent phantom hits in thin air.
 */
function isBoxOrWallObstacle(obs: ObstacleState): boolean {
  if (obs.mesh?.metadata?.isBox === true) return true;
  if (obs.mesh?.metadata?.isWall === true) return true;

  const model = (obs.modelPath || '').toLowerCase();
  if (model) {
    // Only primitive box/crate/wall assets have matching rectangular AABBs
    return (
      model.includes('box') ||
      model.includes('crate') ||
      model.includes('wall') ||
      model.includes('brick') ||
      model.includes('barrel') ||
      model.includes('chest')
    );
  }

  const name = (obs.name || '').toLowerCase();
  return name.includes('box') || name.includes('crate') || name.includes('wall') || name.includes('platform');
}

export const BULLET_HIT_RADIUS = 0.08; // 8cm projectile clearance radius for tight, accurate hit registration

const SEAT_KEYWORDS = ['chair', 'stool', 'armchair', 'seat', 'bench', 'sofa', 'couch', 'throne', 'cushion'];

function isSeatObstacle(obs: ObstacleState): boolean {
  const model = (obs.modelPath || '').toLowerCase();
  const name = (obs.name || '').toLowerCase();
  return SEAT_KEYWORDS.some((kw) => model.includes(kw) || name.includes(kw));
}

/**
 * Unified, distance-sorted continuous collision solver for projectile ballistics.
 * Detects all obstacles, ragdolls, and pugs along the trajectory without skipping
 * thin colliders or missing close-range impacts.
 */
export function detectHitEntity(
  scene: Scene,
  muzzlePos: Vector3,
  barrelDir: Vector3,
  ignoreMesh: AbstractMesh,
  controllers: RagdollController[],
  pugs: PugController[],
  ballistics: WeaponBallistics = DEFAULT_WEAPON_BALLISTICS
): HitDetectionResult {
  const dirLen = Math.hypot(barrelDir.x, barrelDir.y) || 1.0;
  const dir2DX = barrelDir.x / dirLen;
  const dir2DY = barrelDir.y / dirLen;

  const maxRayDist = 35.0;
  const candidates: CandidateHit[] = [];
  const obstacleHitMap = new Map<string, CandidateHit>();

  // 1. Precise 3D Mesh Picking via Babylon Ray (strictly from muzzle forward)
  const bulletRay = new Ray(
    new Vector3(muzzlePos.x, muzzlePos.y, 0),
    new Vector3(dir2DX, dir2DY, 0),
    maxRayDist
  );

  const pickResults = scene.multiPickWithRay(bulletRay, (mesh) => {
    if (!mesh.isEnabled() || !mesh.isVisible) return false;
    if (mesh === ignoreMesh || mesh.isDescendantOf(ignoreMesh)) return false;

    const mName = mesh.name.toLowerCase();
    if (
      mName.startsWith('muzzleflash') ||
      mName.startsWith('bullet') ||
      mName.startsWith('realbullet') ||
      mName.startsWith('spark') ||
      mName.startsWith('hit') ||
      mName.startsWith('smoke')
    ) {
      return false;
    }
    if (mName.includes('ground') || mName.includes('lawn') || mName.includes('floor')) return false;

    // In 2D gameplay, ignore any mesh that is not on the 2D gameplay plane (Z = 0)
    const bInfo = mesh.getBoundingInfo?.();
    if (bInfo) {
      const { minimumWorld: min, maximumWorld: max } = bInfo.boundingBox;
      if (!overlapsGameplayPlaneZ(min.z, max.z, 0.45)) return false;
    }

    // Ignore background decorative walls sitting behind or in front of gameplay plane
    if (mesh.metadata?.isWall === true && (mesh.position.z > 0.6 || mesh.position.z < -0.6)) return false;

    if (mesh.metadata?.isObstacle === false || mesh.metadata?.noCollision === true) return false;
    if (mesh.metadata?.isObstacle === true || mesh.checkCollisions) return true;

    const obs = obstacleManager.getObstacleByMesh(mesh);
    return !!obs && !obs.isDestroyed;
  });

  if (pickResults && pickResults.length > 0) {
    for (const pick of pickResults) {
      if (!pick.hit || !pick.pickedMesh || !pick.pickedPoint) continue;
      const obs = obstacleManager.getObstacleByMesh(pick.pickedMesh);
      if (!obs || obs.isDestroyed) continue;

      const dist = Math.hypot(pick.pickedPoint.x - muzzlePos.x, pick.pickedPoint.y - muzzlePos.y);
      const existing = obstacleHitMap.get(obs.id);
      if (!existing || dist < existing.distance) {
        const hitCandidate: CandidateHit = {
          type: 'obstacle',
          distance: dist,
          hitPoint: dist === 0
            ? new Vector3(muzzlePos.x + dir2DX * 0.02, muzzlePos.y + dir2DY * 0.02, 0)
            : new Vector3(pick.pickedPoint.x, pick.pickedPoint.y, 0),
          obstacle: obs,
        };
        obstacleHitMap.set(obs.id, hitCandidate);
      }
    }
  }

  // =========================================================================
  // 2. Continuous Swept Ray Against All Registered Obstacles (No Tunneling)
  // =========================================================================
  const allObstacles = obstacleManager.getAllObstacles();
  for (const obs of allObstacles) {
    if (obs.isDestroyed) continue;
    // Skip coarse AABB sweep for complex models (e.g. cars, vehicles, props) - Section 1 handles them via exact mesh triangles
    if (!isBoxOrWallObstacle(obs)) continue;

    const bounds = obstacleManager.getObstacleBounds(obs);
    const { min, max } = bounds;

    // Verify obstacle strictly overlaps the 2D gameplay action plane depth (Z = 0)
    if (obs.mesh?.metadata?.isWall === true && (obs.mesh.position.z > 0.6 || obs.mesh.position.z < -0.6)) continue;
    if (!overlapsGameplayPlaneZ(min.z, max.z, 0.45)) continue;

    const margin = 0.05;
    const sweep = intersectRayAABB(
      muzzlePos.x,
      muzzlePos.y,
      dir2DX,
      dir2DY,
      min.x - margin,
      max.x + margin,
      min.y - margin,
      max.y + margin
    );

    if (sweep.hit && sweep.tMin < maxRayDist) {
      const dist = sweep.tMin;
      const existing = obstacleHitMap.get(obs.id);
      if (!existing || dist < existing.distance) {
        const hitPoint = dist === 0
          ? new Vector3(muzzlePos.x + dir2DX * 0.02, muzzlePos.y + dir2DY * 0.02, 0)
          : new Vector3(
              muzzlePos.x + dir2DX * sweep.tMin,
              muzzlePos.y + dir2DY * sweep.tMin,
              0
            );
        obstacleHitMap.set(obs.id, {
          type: 'obstacle',
          distance: dist,
          hitPoint,
          obstacle: obs,
        });
      }
    }
  }

  // Add all resolved obstacle impacts
  obstacleHitMap.forEach((hit) => candidates.push(hit));

  // =========================================================================
  // 3. Gather Character Ragdoll Intersections (Tight Anatomical Hitboxes & Clean Ray Intersection)
  // =========================================================================
  for (const ctrl of controllers) {
    if (ctrl.isDefeated) continue;
    const charPos = ctrl.getPosition
      ? ctrl.getPosition()
      : ((ctrl.character.rootNode as any)?.position || ctrl.character.mainMesh.getAbsolutePosition());
    const cx = charPos.x;
    const cy = charPos.y;
    const cz = charPos.z ?? 0;

    const scale = (ctrl.character.rootNode as any)?.scaling?.x || 1.0;

    // 3a. 2D Screen-Planar Projection for 3D Target Placement:
    // Characters retain exact 3D editor coordinates. Hit detection projects their visible
    // 2D bounds onto the gameplay plane (Z = 0) matching player screen perception.
    let effX = cx;
    let effY = cy;
    let effScale = scale;

    const cam = scene?.activeCamera as any;
    if (cam) {
      const camPos = cam.globalPosition || cam.position;
      if (camPos && Math.abs(camPos.z) > 0.5 && Math.abs(cz - camPos.z) > 0.1) {
        const t = -camPos.z / (cz - camPos.z);
        effX = camPos.x + t * (cx - camPos.x);
        effY = camPos.y + t * (cy - camPos.y);
        effScale = scale * t;
      }
    }

    // 3b. Anatomically Accurate Posture-Aware Hitbox (Head, Torso, Legs) with Swept Bullet Radius
    // Check if character is actively moving / walking / running to widen leg stride hitbox
    const isMoving = ctrl.character?.animationGroups?.some(
      (ag) => ag.isPlaying && (
        ag.name.toLowerCase().includes('walk') ||
        ag.name.toLowerCase().includes('run') ||
        ag.name.toLowerCase().includes('jog') ||
        ag.name.toLowerCase().includes('sprint')
      )
    ) ?? false;

    // Check if character is in sitting posture (armchair, couch, bench, floor)
    const isSitting = (ctrl.character?.animationGroups || []).some(
      (ag) => (ag.isPlaying || ctrl.character?.animationGroups?.length === 1) && ag.name.toLowerCase().includes('sit')
    );

    const legHalfWidth = (isMoving ? 0.28 : 0.20) * effScale;
    const torsoHalfWidth = (isSitting ? 0.35 : 0.26) * effScale;
    const headHalfWidth = 0.18 * effScale;

    const headNode = ctrl.character?.headNode;
    const headPos = headNode?.getAbsolutePosition?.();

    let segments: { minX: number; maxX: number; minY: number; maxY: number }[];

    if (isSitting) {
      // Sitting posture: head drops lower, torso is compact, knees/legs extend forward horizontally
      segments = [
        // Head
        {
          minX: effX - headHalfWidth - BULLET_HIT_RADIUS,
          maxX: effX + headHalfWidth + BULLET_HIT_RADIUS,
          minY: effY + 0.75 * effScale - BULLET_HIT_RADIUS,
          maxY: effY + 1.35 * effScale + BULLET_HIT_RADIUS,
        },
        // Torso & Shoulders
        {
          minX: effX - torsoHalfWidth - BULLET_HIT_RADIUS,
          maxX: effX + torsoHalfWidth + BULLET_HIT_RADIUS,
          minY: effY + 0.25 * effScale - BULLET_HIT_RADIUS,
          maxY: effY + 0.90 * effScale + BULLET_HIT_RADIUS,
        },
        // Lap & Lower Legs / Forward Knees
        {
          minX: effX - (0.38 * effScale + BULLET_HIT_RADIUS),
          maxX: effX + (0.38 * effScale + BULLET_HIT_RADIUS),
          minY: effY - 0.05,
          maxY: effY + 0.55 * effScale + BULLET_HIT_RADIUS,
        },
      ];
    } else {
      // Standing / Dancing / Walking posture
      let headMinX = effX - headHalfWidth;
      let headMaxX = effX + headHalfWidth;
      let headMinY = effY + 1.35 * effScale;
      let headMaxY = effY + 1.88 * effScale;

      if (headPos) {
        let hx = headPos.x;
        let hy = headPos.y;
        if (cam) {
          const camPos = cam.globalPosition || cam.position;
          const hz = headPos.z ?? cz;
          if (camPos && Math.abs(camPos.z) > 0.5 && Math.abs(hz - camPos.z) > 0.1) {
            const t = -camPos.z / (hz - camPos.z);
            hx = camPos.x + t * (headPos.x - camPos.x);
            hy = camPos.y + t * (headPos.y - camPos.y);
          }
        }
        headMinX = hx - headHalfWidth;
        headMaxX = hx + headHalfWidth;
        headMinY = hy - 0.20 * effScale;
        headMaxY = hy + 0.20 * effScale;
      }

      segments = [
        // Head
        {
          minX: headMinX - BULLET_HIT_RADIUS,
          maxX: headMaxX + BULLET_HIT_RADIUS,
          minY: headMinY - BULLET_HIT_RADIUS,
          maxY: headMaxY + BULLET_HIT_RADIUS,
        },
        // Torso & Shoulders
        {
          minX: effX - torsoHalfWidth - BULLET_HIT_RADIUS,
          maxX: effX + torsoHalfWidth + BULLET_HIT_RADIUS,
          minY: effY + 0.60 * effScale - BULLET_HIT_RADIUS,
          maxY: effY + 1.45 * effScale + BULLET_HIT_RADIUS,
        },
        // Hips & Legs
        {
          minX: effX - legHalfWidth - BULLET_HIT_RADIUS,
          maxX: effX + legHalfWidth + BULLET_HIT_RADIUS,
          minY: effY - 0.05,
          maxY: effY + 0.75 * effScale + BULLET_HIT_RADIUS,
        },
      ];
    }

    let earliestHitDist = Infinity;

    for (const seg of segments) {
      const hit = intersectRayAABB(
        muzzlePos.x,
        muzzlePos.y,
        dir2DX,
        dir2DY,
        seg.minX,
        seg.maxX,
        seg.minY,
        seg.maxY
      );

      if (hit.hit && hit.tMin < earliestHitDist && hit.tMin < maxRayDist) {
        earliestHitDist = hit.tMin;
      }
    }

    if (earliestHitDist < maxRayDist) {
      const dist = earliestHitDist;
      // Calculate distance along ray to character's vertical center line
      const toCharX = effX - muzzlePos.x;
      const toCharY = (effY + 1.0 * effScale) - muzzlePos.y;
      const tToCenter = toCharX * dir2DX + toCharY * dir2DY;

      // Anatomical body surface is inset from the expanded swept AABB towards the character's center
      const tBodySurface = Math.max(0.06, tToCenter - 0.12 * effScale);

      // Hit point reaches into the character's physical body:
      let hitDistance: number;
      if (dist === 0) {
        // Muzzle is already within the bounding box (point blank / close contact):
        // Fly forward into the body mesh rather than stopping at 2cm!
        hitDistance = Math.max(0.06, Math.min(tToCenter, tBodySurface));
      } else {
        // Normal shot: fly all the way from AABB entry to the character's physical body
        hitDistance = Math.max(dist + 0.05, Math.min(tToCenter, Math.max(dist, tBodySurface)));
      }

      const hitPoint = new Vector3(
        muzzlePos.x + dir2DX * hitDistance,
        muzzlePos.y + dir2DY * hitDistance,
        0
      );

      candidates.push({
        type: 'character',
        distance: dist,
        hitPoint,
        character: ctrl,
      });
    }
  }

  // =========================================================================
  // 4. Gather Pug / Chicken Companion Intersections (Ignore defeated/roasted meat)
  // =========================================================================
  for (const pug of pugs) {
    if (pug.isDefeated) continue;

    const pPos = pug.rootNode.position;
    const px = pPos.x;
    const py = pPos.y;
    const pz = pPos.z ?? 0;
    const pugScale = (pug.rootNode as any)?.scaling?.x || 1.0;

    let effPx = px;
    let effPy = py;
    let effPugScale = pugScale;

    const cam = scene?.activeCamera as any;
    if (cam) {
      const camPos = cam.globalPosition || cam.position;
      if (camPos && Math.abs(camPos.z) > 0.5 && Math.abs(pz - camPos.z) > 0.1) {
        const t = -camPos.z / (pz - camPos.z);
        effPx = camPos.x + t * (px - camPos.x);
        effPy = camPos.y + t * (py - camPos.y);
        effPugScale = pugScale * t;
      }
    }

    const chickenHalfWidth = 0.32 * effPugScale + BULLET_HIT_RADIUS;
    const pugMinY = effPy - 0.05;
    const pugMaxY = effPy + 0.85 * effPugScale + BULLET_HIT_RADIUS;

    const hit = intersectRayAABB(
      muzzlePos.x,
      muzzlePos.y,
      dir2DX,
      dir2DY,
      effPx - chickenHalfWidth,
      effPx + chickenHalfWidth,
      pugMinY,
      pugMaxY
    );

    if (hit.hit && hit.tMin < maxRayDist) {
      const dist = hit.tMin;
      const toPugX = effPx - muzzlePos.x;
      const toPugY = (effPy + 0.35 * effPugScale) - muzzlePos.y;
      const tToPugCenter = toPugX * dir2DX + toPugY * dir2DY;
      const tPugSurface = Math.max(0.05, tToPugCenter - 0.10 * effPugScale);

      let hitDistance: number;
      if (dist === 0) {
        hitDistance = Math.max(0.05, Math.min(tToPugCenter, tPugSurface));
      } else {
        hitDistance = Math.max(dist + 0.04, Math.min(tToPugCenter, Math.max(dist, tPugSurface)));
      }

      const hitPoint = new Vector3(
        muzzlePos.x + dir2DX * hitDistance,
        muzzlePos.y + dir2DY * hitDistance,
        0
      );

      candidates.push({
        type: 'pug',
        distance: dist,
        hitPoint,
        pug,
      });
    }
  }

  // =========================================================================
  // 5. Ground Plane Collision (Downward shots hit ground at true intersection)
  // =========================================================================
  if (dir2DY < -0.0001) {
    const tGround = (0.02 - muzzlePos.y) / dir2DY;
    if (tGround >= 0 && tGround < maxRayDist) {
      candidates.push({
        type: 'ground',
        distance: tGround,
        hitPoint: new Vector3(
          muzzlePos.x + dir2DX * tGround,
          0.02,
          0
        ),
      });
    }
  }

  // =========================================================================
  // 6. Strict Ascending Distance Sorting
  // =========================================================================
  candidates.sort((a, b) => a.distance - b.distance);

  // =========================================================================
  // 7. Sequential Impact & Penetration Resolution
  // =========================================================================
  let remainingPenetration = ballistics.penetrationPower;
  let currentDamage = ballistics.damage;
  const penetratedObstacles: ObstacleImpactResult[] = [];

  let hitTarget: RagdollController | null = null;
  let hitPug: PugController | null = null;
  let hitObstacle: ObstacleState | null = null;
  let stoppedByObstacle = false;
  let finalHitPoint = new Vector3(
    muzzlePos.x + dir2DX * maxRayDist,
    muzzlePos.y + dir2DY * maxRayDist,
    0
  );

  for (const c of candidates) {
    if (c.type === 'ground') {
      finalHitPoint = c.hitPoint;
      stoppedByObstacle = true;
      break;
    } else if (c.type === 'obstacle' && c.obstacle) {
      const obs = c.obstacle;
      const isSeat = isSeatObstacle(obs);
      // If obstacle is a chair/couch and there's a character target sitting on or near it along the line of fire,
      // allow the bullet to pierce the seat rather than absorbing the shot and shielding the enemy
      const isSittingTargetAhead = isSeat && candidates.some(
        (other) => other.type === 'character' && other.distance > c.distance &&
        Math.hypot((other.character?.getPosition?.()?.x ?? 0) - c.hitPoint.x, (other.character?.getPosition?.()?.y ?? 0) - c.hitPoint.y) < 1.6
      );

      const canPenetrate =
        (obs.isPenetrable || isSittingTargetAhead) &&
        remainingPenetration >= obs.penetrationResistance &&
        penetratedObstacles.length < ballistics.maxPenetrations;

      if (canPenetrate || isSittingTargetAhead) {
        penetratedObstacles.push({
          obstacle: obs,
          hitPoint: c.hitPoint,
          damageApplied: currentDamage,
          destroyed: false,
          penetrated: true,
        });
        if (!isSittingTargetAhead) {
          remainingPenetration -= obs.penetrationResistance;
          currentDamage *= 0.65;
        }
      } else {
        hitObstacle = obs;
        stoppedByObstacle = true;
        finalHitPoint = c.hitPoint;
        break;
      }
    } else if (c.type === 'character' && c.character) {
      hitTarget = c.character;
      finalHitPoint = c.hitPoint;
      break;
    } else if (c.type === 'pug' && c.pug) {
      hitPug = c.pug;
      finalHitPoint = c.hitPoint;
      break;
    }
  }

  const isDirect = penetratedObstacles.length === 0 && !stoppedByObstacle;

  return {
    hitPoint: finalHitPoint,
    hitTarget,
    hitPug,
    hitObstacle,
    penetratedObstacles,
    effectiveDamage: currentDamage,
    isDirect,
    stoppedByObstacle,
  };
}
