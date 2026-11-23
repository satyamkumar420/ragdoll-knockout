import {
  type Scene,
  type TransformNode,
  type AbstractMesh,
} from '@babylonjs/core';
import type { RagdollController } from './ragdoll';
import type { PugController } from './pug';
import { obstacleManager } from './core/obstacleManager';
import {
  isLandingPlatform,
  type SupportSurfaceInfo,
  getSupportSurfaceInfo,
  getSupportSurfaceHeight,
} from './surfaceDetection';

export {
  isLandingPlatform,
  type SupportSurfaceInfo,
  getSupportSurfaceInfo,
  getSupportSurfaceHeight,
};

// Shortest angular difference between two angles in radians
export function getShortestAngleDiff(current: number, target: number): number {
  let diff = (target - current) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

const IGNORE_RAY_PREFIXES = [
  'muzzleflash', 'bullet', 'realbullet', 'hit', 'spark',
  'smoke', 'groundphysicsbox', 'fixedcamera', 'light'
];

/**
 * Checks if a mesh qualifies as a solid obstacle for weapon collisions.
 */
export function isObstacleMesh(
  mesh: AbstractMesh,
  weaponRoot?: TransformNode,
  weaponMesh?: AbstractMesh
): boolean {
  if (!mesh || !mesh.isEnabled() || !mesh.isVisible) return false;
  if (mesh.metadata?.noCollision === true || mesh.metadata?.isObstacle === false) return false;
  if (mesh.metadata?.isObstacle === true) return true;

  if (weaponMesh && (mesh === weaponMesh || mesh.isDescendantOf(weaponMesh))) return false;
  if (weaponRoot && mesh.isDescendantOf(weaponRoot)) return false;

  const name = mesh.name.toLowerCase();
  if (IGNORE_RAY_PREFIXES.some((p) => name.startsWith(p))) return false;
  if (name.includes('ground') || name.includes('floor') || name.includes('sky') || name.includes('lawn')) return false;
  if (name.includes('mannequin') || name.includes('char_') || name.includes('pug') || name.includes('target')) return false;
  if (name.includes('eyeball') || name.includes('pupil') || name.includes('pistol') || name.includes('gun')) return false;

  if (mesh.checkCollisions || (mesh as any).physicsAggregate || mesh.physicsBody) {
    return true;
  }

  return typeof mesh.getTotalVertices === 'function' && mesh.getTotalVertices() > 0;
}


/**
 * Resolves horizontal collision between weapon and an obstacle mesh.
 * When weapon is on top of or above an obstacle, horizontal pushing is bypassed
 * so vertical surface physics can handle contact, sliding, and falling realistically!
 */
export function resolveMeshCollision(
  mesh: AbstractMesh,
  nx: number,
  posY: number,
  nz: number,
  vx: number,
  vz: number,
  supportY?: number
): { nx: number; nz: number; vx: number; vz: number } {
  const bInfo = mesh.getBoundingInfo?.();
  if (!bInfo) return { nx, nz, vx, vz };

  const { minimumWorld: min, maximumWorld: max } = bInfo.boundingBox;
  const gunRadius = 0.22; // Physical radius of handgun

  const isWall =
    mesh.metadata?.isWall === true ||
    mesh.name.toLowerCase().includes('wall') ||
    mesh.name.toLowerCase().includes('building');

  // Enforce boundary containment for room walls (data-driven for any room layout)
  if (isWall) {
    const wallMargin = 0.85; // Full physical radius of gun model (barrel to rear/grip)
    const inY = posY < max.y + 0.25 && posY > min.y - 0.25;
    const overlapsZ = min.z <= 0.8 && max.z >= -0.8;
    if (overlapsZ && inY) {
      const stopLeft = min.x - wallMargin;
      const stopRight = max.x + wallMargin;
      const wallCenterX = (min.x + max.x) / 2;

      const prevX = nx - vx * 0.07;

      // 1. Entity approaching or touching the left face
      if (nx <= min.x) {
        // High-speed tunneling check: entity tunneled completely through from the far right face
        if (vx < 0 && prevX >= max.x) {
          return { nx: stopRight, nz, vx: Math.max(1.0, Math.abs(vx) * 0.50), vz };
        }
        if (nx > stopLeft) {
          nx = stopLeft;
          if (vx > 0) {
            vx = -Math.max(1.0, Math.abs(vx) * 0.50);
          }
        }
        return { nx, nz, vx, vz };
      }
      // 2. Entity approaching or touching the right face
      else if (nx >= max.x) {
        // High-speed tunneling check: entity tunneled completely through from the far left face
        if (vx > 0 && prevX <= min.x) {
          return { nx: stopLeft, nz, vx: -Math.max(1.0, Math.abs(vx) * 0.50), vz };
        }
        if (nx < stopRight) {
          nx = stopRight;
          if (vx < 0) {
            vx = Math.max(1.0, Math.abs(vx) * 0.50);
          }
        }
        return { nx, nz, vx, vz };
      }
      // 3. Entity inside the physical wall volume (penetration from high speed)
      else {
        if (vx > 0) {
          return { nx: stopLeft, nz, vx: -Math.max(1.0, Math.abs(vx) * 0.50), vz };
        } else if (vx < 0) {
          return { nx: stopRight, nz, vx: Math.max(1.0, Math.abs(vx) * 0.50), vz };
        } else {
          const stop = nx < wallCenterX ? stopLeft : stopRight;
          return { nx: stop, nz, vx: 0, vz };
        }
      }
    }
    if (min.z > 1.5 && inY && nz >= min.z - wallMargin) {
      return { nx, nz: min.z - wallMargin, vx, vz: -Math.max(1.0, Math.abs(vz) * 0.50) };
    }
  }

  // Broadphase AABB rejection
  if (
    nx < min.x - (gunRadius + 0.5) || nx > max.x + (gunRadius + 0.5) ||
    nz < min.z - 1.0 || nz > max.z + 1.0
  ) {
    return { nx, nz, vx, vz };
  }

  // TOP SURFACE CHECK:
  // If weapon is on top of or above obstacle, bypass horizontal collision
  if (posY >= max.y - 0.06 || (supportY !== undefined && Math.abs(supportY - max.y) < 0.08 && posY >= supportY - 0.06)) {
    return { nx, nz, vx, vz };
  }

  // 2D XY plane resolution (for hitting obstacle sides / vertical faces)
  if (Math.abs(nz) < 0.05) {
    const overlapsZ = min.z <= 0.8 && max.z >= -0.8;
    if (
      posY < max.y - 0.06 &&
      posY > min.y - 0.25 &&
      nx >= min.x - gunRadius &&
      nx <= max.x + gunRadius &&
      overlapsZ
    ) {
      const obstacleCenterX = (min.x + max.x) / 2;
      if (nx <= obstacleCenterX) {
        const stopX = min.x - gunRadius;
        const resVx = vx > 0 ? -vx * 0.45 : vx;
        return { nx: Math.min(nx, stopX), nz: 0, vx: Math.abs(resVx) < 0.12 ? 0 : resVx, vz: 0 };
      } else {
        const stopX = max.x + gunRadius;
        const resVx = vx < 0 ? -vx * 0.45 : vx;
        return { nx: Math.max(nx, stopX), nz: 0, vx: Math.abs(resVx) < 0.12 ? 0 : resVx, vz: 0 };
      }
    }
    return { nx, nz: 0, vx, vz: 0 };
  }

  // 3D collision fallback
  if (mesh.metadata?.colliderShape === 'cylinder' || mesh.metadata?.colliderShape === 'sphere') {
    const radius = (mesh.metadata?.radius ?? (max.x - min.x) / 2) + gunRadius;
    const centerX = (min.x + max.x) / 2;
    const centerZ = (min.z + max.z) / 2;
    const dx = nx - centerX;
    const dz = nz - centerZ;
    const dist = Math.hypot(dx, dz);
    if (posY < max.y - 0.06 && posY > min.y - 0.25 && dist < radius) {
      const dirX = (dx || 0.1) / (dist || 0.1);
      const dirZ = (dz || 0.1) / (dist || 0.1);
      const dot = vx * dirX + vz * dirZ;
      return {
        nx: centerX + dirX * radius,
        nz: centerZ + dirZ * radius,
        vx: dot < 0 ? vx - 1.4 * dot * dirX : vx + dirX * 0.3,
        vz: dot < 0 ? vz - 1.4 * dot * dirZ : vz + dirZ * 0.3,
      };
    }
  } else if (
    posY < max.y - 0.06 && posY > min.y - 0.25 &&
    nx >= min.x - gunRadius && nx <= max.x + gunRadius &&
    nz >= min.z - gunRadius && nz <= max.z + gunRadius
  ) {
    const dMinX = Math.abs(nx - (min.x - gunRadius));
    const dMaxX = Math.abs(max.x + gunRadius - nx);
    const dMinZ = Math.abs(nz - (min.z - gunRadius));
    const dMaxZ = Math.abs(max.z + gunRadius - nz);
    const minDist = Math.min(dMinX, dMaxX, dMinZ, dMaxZ);
    if (minDist === dMinX || (vx > 0 && minDist === dMaxX)) {
      return { nx: min.x - gunRadius, nz, vx: Math.abs(vx) < 0.12 ? 0 : -vx * 0.45, vz };
    }
    if (minDist === dMaxX || (vx < 0 && minDist === dMinX)) {
      return { nx: max.x + gunRadius, nz, vx: Math.abs(vx) < 0.12 ? 0 : -vx * 0.45, vz };
    }
    if (minDist === dMinZ) {
      return { nx, nz: min.z - gunRadius, vx, vz: vz > 0 ? -vz * 0.4 : vz };
    }
    return { nx, nz: max.z + gunRadius, vx, vz: vz < 0 ? -vz * 0.4 : vz };
  }
  return { nx, nz, vx, vz };
}

/**
 * Resolves 2D/3D collisions with all obstacles: characters, pugs, and scene props.
 */
export function resolveObstacleCollisions(
  posX: number,
  posY: number,
  posZ: number,
  velX: number,
  velZ: number,
  scene: Scene,
  characters?: RagdollController[],
  pugs?: PugController[],
  weaponRoot?: TransformNode,
  weaponMesh?: AbstractMesh,
  supportY?: number
): { posX: number; posZ: number; velX: number; velZ: number } {
  let nx = posX;
  let nz = posZ;
  let vx = velX;
  let vz = velZ;

  // 1. Garden fence background clamp
  if (nz > 3.42 && posY < 1.1) {
    nz = 3.42;
    if (vz > 0) vz = -Math.abs(vz) * 0.5;
  }

  // 2. Characters / Ragdolls
  if (characters) {
    for (const ctrl of characters) {
      if (ctrl.isDefeated) {
        // Full head-to-toe bounding span for defeated ragdoll lying on the ground
        const rootPos = ctrl.character.rootNode.position;
        const headNode = ctrl.character.headNode;
        const headPos = headNode ? headNode.getAbsolutePosition() : null;

        let rMinX: number;
        let rMaxX: number;
        let rMaxY: number;

        if (headPos && !isNaN(headPos.x) && Math.abs(headPos.x - rootPos.x) < 3.0) {
          rMinX = Math.min(rootPos.x, headPos.x) - 0.40;
          rMaxX = Math.max(rootPos.x, headPos.x) + 0.40;
          rMaxY = Math.max(rootPos.y, headPos.y) + 0.45;
        } else {
          rMinX = rootPos.x - 1.15;
          rMaxX = rootPos.x + 1.15;
          rMaxY = rootPos.y + 0.55;
        }

        const gunRadius = 0.22;
        // If weapon is above the defeated ragdoll, bypass horizontal ejection
        if (posY >= rMaxY - 0.06) {
          continue;
        }

        if (
          posY < rMaxY &&
          posY > rootPos.y - 0.25 &&
          nx >= rMinX - gunRadius &&
          nx <= rMaxX + gunRadius
        ) {
          const dLeft = Math.abs(nx - (rMinX - gunRadius));
          const dRight = Math.abs((rMaxX + gunRadius) - nx);

          if (dLeft < dRight) {
            nx = rMinX - gunRadius;
            vx = vx > 0 ? -vx * 0.35 : vx;
          } else {
            nx = rMaxX + gunRadius;
            vx = vx < 0 ? -vx * 0.35 : vx;
          }
          if (Math.abs(vx) < 0.12) vx = 0;
        }
      } else {
        const charMesh = ctrl.character.mainMesh || ctrl.character.rootNode;
        if (!charMesh) continue;
        const cPos = charMesh.getAbsolutePosition();
        const dx = nx - cPos.x;
        const radius = 0.45;
        const heightCheck = posY >= cPos.y - 0.2 && posY <= cPos.y + 2.1;
        if (Math.abs(posZ) < 0.05) {
          if (heightCheck && Math.abs(dx) < radius) {
            const dirX = dx >= 0 ? 1 : -1;
            nx = cPos.x + dirX * radius;
            vx = vx * dirX < 0 ? -vx * 0.4 : dirX * 0.4;
          }
        } else {
          const dz = nz - cPos.z;
          const dist = Math.hypot(dx, dz);
          if (heightCheck && dist < radius) {
            const dirX = (dx || 0.1) / (dist || 0.1);
            const dirZ = (dz || 0.1) / (dist || 0.1);
            nx = cPos.x + dirX * radius;
            nz = cPos.z + dirZ * radius;
            const dot = vx * dirX + vz * dirZ;
            vx = dot < 0 ? vx - 1.4 * dot * dirX : vx + dirX * 0.35;
            vz = dot < 0 ? vz - 1.4 * dot * dirZ : vz + dirZ * 0.35;
          }
        }
      }
    }
  }

  // 3. Pug companion
  if (pugs) {
    for (const pug of pugs) {
      const pPos = pug.rootNode.position;
      const dx = nx - pPos.x;
      const dz = nz - pPos.z;
      const radius = 0.85;

      if (Math.abs(posZ) < 0.05) {
        if (posY < pPos.y + 0.85 && Math.abs(dx) < radius) {
          const dirX = dx >= 0 ? 1 : -1;
          nx = pPos.x + dirX * radius;
          vx = vx * dirX < 0 ? -vx * 0.4 : dirX * 0.4;
        }
      } else {
        const dist = Math.hypot(dx, dz);
        if (posY < pPos.y + 0.85 && dist < radius) {
          const dirX = (dx || 0.1) / (dist || 0.1);
          const dirZ = (dz || 0.1) / (dist || 0.1);
          nx = pPos.x + dirX * radius;
          nz = pPos.z + dirZ * radius;
          const dot = vx * dirX + vz * dirZ;
          vx = dot < 0 ? vx - 1.4 * dot * dirX : vx + dirX * 0.35;
          vz = dot < 0 ? vz - 1.4 * dot * dirZ : vz + dirZ * 0.35;
        }
      }
    }
  }

  // 4. Props & Obstacles from ObstacleManager (unified composite bounds)
  const allManaged = obstacleManager.getAllObstacles();
  const gunRadius = 0.22;
  const processedObsIds = new Set<string>();

  for (const obs of allManaged) {
    if (obs.isDestroyed) continue;
    processedObsIds.add(obs.id);

    const b = obstacleManager.getObstacleBounds(obs);
    // Ignore props outside gameplay Z corridor
    if (b.min.z > 0.8 || b.max.z < -0.8) continue;

    const isWall =
      obs.mesh?.metadata?.isWall === true ||
      obs.name.toLowerCase().includes('wall') ||
      obs.name.toLowerCase().includes('building');

    if (isWall) {
      const wallMargin = 0.85;
      const inY = posY < b.max.y + 0.25 && posY > b.min.y - 0.25;

      if (inY) {
        const stopLeft = b.min.x - wallMargin;
        const stopRight = b.max.x + wallMargin;
        const wallCenterX = (b.min.x + b.max.x) / 2;

        const prevX = nx - vx * 0.07;

        if (nx <= b.min.x) {
          if (vx < 0 && prevX >= b.max.x) {
            nx = stopRight;
            vx = Math.abs(vx) * 0.45;
          } else if (nx > stopLeft) {
            nx = stopLeft;
            if (vx > 0) {
              vx = -vx * 0.45;
            }
          }
          if (Math.abs(vx) < 0.12) vx = 0;
        } else if (nx >= b.max.x) {
          if (vx > 0 && prevX <= b.min.x) {
            nx = stopLeft;
            vx = -Math.abs(vx) * 0.45;
          } else if (nx < stopRight) {
            nx = stopRight;
            if (vx < 0) {
              vx = -vx * 0.45;
            }
          }
          if (Math.abs(vx) < 0.12) vx = 0;
        } else {
          // Inside wall volume
          if (vx > 0) {
            nx = stopLeft;
            vx = -vx * 0.45;
          } else if (vx < 0) {
            nx = stopRight;
            vx = -vx * 0.45;
          } else {
            nx = nx < wallCenterX ? stopLeft : stopRight;
            vx = 0;
          }
          if (Math.abs(vx) < 0.12) vx = 0;
        }
      }
      continue;
    }

    // TOP SURFACE CHECK:
    // If weapon is on top of or above this obstacle, bypass horizontal side deflection completely
    if (posY >= b.max.y - 0.06 || (supportY !== undefined && Math.abs(supportY - b.max.y) < 0.08 && posY >= supportY - 0.06)) {
      continue;
    }

    // Solid collision with unified obstacle bounds (vertical faces only)
    if (
      posY < b.max.y - 0.06 &&
      posY > b.min.y - 0.25 &&
      nx >= b.min.x - gunRadius &&
      nx <= b.max.x + gunRadius
    ) {
      const obstacleCenterX = (b.min.x + b.max.x) / 2;
      if (nx <= obstacleCenterX) {
        nx = Math.min(nx, b.min.x - gunRadius);
        if (vx > 0) {
          vx = -vx * 0.45;
          if (Math.abs(vx) < 0.12) vx = 0;
        }
      } else {
        nx = Math.max(nx, b.max.x + gunRadius);
        if (vx < 0) {
          vx = -vx * 0.45;
          if (Math.abs(vx) < 0.12) vx = 0;
        }
      }
    }
  }

  // 5. Fallback for unmanaged scene meshes
  const sceneMeshes = scene?.meshes || [];
  for (let i = 0; i < sceneMeshes.length; i++) {
    const m = sceneMeshes[i];
    if (!m || !m.isEnabled() || !m.isVisible) continue;
    if (m.metadata?.isObstacle !== true && !m.checkCollisions) continue;
    if (!isObstacleMesh(m, weaponRoot, weaponMesh)) continue;
    const mObs = obstacleManager.getObstacleByMesh(m);
    if (mObs && processedObsIds.has(mObs.id)) continue;
    const res = resolveMeshCollision(m, nx, posY, nz, vx, vz, supportY);
    nx = res.nx;
    nz = res.nz;
    vx = res.vx;
    vz = res.vz;
  }

  if (Math.abs(posZ) < 0.05) {
    return { posX: nx, posZ: 0, velX: vx, velZ: 0 };
  }
  return { posX: nx, posZ: nz, velX: vx, velZ: vz };
}

/**
 * Computes strict playable horizontal boundaries [minX, maxX] by constraining
 * camera viewport bounds against any solid room boundary walls present in the scene.
 */
export function getPlayableXBounds(
  _scene: Scene,
  spawnX: number,
  fallbackBounds: { minX: number; maxX: number },
  wallMargin = 0.85
): { minX: number; maxX: number } {
  let minX = fallbackBounds.minX;
  let maxX = fallbackBounds.maxX;

  const allManaged = obstacleManager.getAllObstacles();
  for (const obs of allManaged) {
    if (obs.isDestroyed) continue;
    const isWall =
      obs.mesh?.metadata?.isWall === true ||
      obs.name.toLowerCase().includes('wall') ||
      obs.name.toLowerCase().includes('building');
    if (!isWall) continue;

    const b = obstacleManager.getObstacleBounds(obs);
    // Ignore walls outside the gameplay Z corridor
    if (b.min.z > 0.8 || b.max.z < -0.8) continue;

    const wallCenterX = (b.min.x + b.max.x) / 2;
    if (wallCenterX < spawnX) {
      // Wall to the left of room interior: interior face is at b.max.x
      minX = Math.max(minX, b.max.x + wallMargin);
    } else if (wallCenterX > spawnX) {
      // Wall to the right of room interior: interior face is at b.min.x
      maxX = Math.min(maxX, b.min.x - wallMargin);
    }
  }

  return { minX, maxX };
}

export { getCameraViewportBounds, type ViewportBounds } from './cameraBounds';
