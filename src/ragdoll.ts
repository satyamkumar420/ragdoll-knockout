import { Scene, Vector3 } from '@babylonjs/core';
import type { CharacterInstance } from './character';
import { playHitSound, playBoingSound, playRagdollDeathSound } from './audio';
import { obstacleManager } from './core/obstacleManager';
import { resolveBodyVsAABB } from './core/collisionSystem';
import { spawnComicHitEffect } from './core/vfx';
export { spawnComicHitEffect } from './core/vfx';

export interface RagdollController {
  character: CharacterInstance;
  isRagdoll: boolean;
  isDefeated: boolean;
  triggerHit: (hitPoint: Vector3, shootDirection: Vector3, force?: number) => void;
  getPosition?: () => Vector3;
  dispose?: () => void;
}

interface InternalRagdoll {
  id: string;
  rootMesh: { position: Vector3; rotation: Vector3 };
  isDefeated: () => boolean;
  getRadius: () => number;
  nudgePosition: (dx: number, dz: number) => void;
}

const activeRagdolls = new Set<InternalRagdoll>();

export function clearActiveRagdolls(): void {
  activeRagdolls.clear();
}

/**
 * Computes highest supporting surface underneath a point (X, Y, Z).
 */
export function getSupportingSurfaceY(x: number, y: number, z: number): number {
  let highestSupport = 0;
  const obstacles = obstacleManager.getAllObstacles();
  for (const obs of obstacles) {
    if (obs.isDestroyed) continue;
    const bounds = obstacleManager.getObstacleBounds(obs);
    const min = bounds.min;
    const max = bounds.max;

    if (
      x >= min.x &&
      x <= max.x &&
      z >= min.z &&
      z <= max.z
    ) {
      if (y >= max.y - 0.15) {
        if (max.y > highestSupport) {
          highestSupport = max.y;
        }
      }
    }
  }
  return highestSupport;
}

// Attach physics ragdoll controller to character
export function createCharacterRagdollController(
  character: CharacterInstance,
  scene: Scene
): RagdollController {
  let isRagdoll = false;
  let isDefeated = false;
  const deathSoundVariant = Math.floor(Math.random() * 8) + 1;

  let velX = 0;
  let velY = 0;
  let velZ = 0;
  let rotVelY = 0;
  let fallVelY = 0;

  const rootMesh = character.rootNode as unknown as {
    position: Vector3;
    rotation: Vector3;
  };

  // Keywords representing seats or resting props (bench, chair, sofa, etc.)
  const SEAT_KEYWORDS = ['chair', 'stool', 'armchair', 'seat', 'bench', 'sofa', 'couch', 'throne', 'cushion'];

  // Search for chair, bench, or supporting obstacle near character
  const findNearbyChair = () => {
    const obstacles = obstacleManager.getAllObstacles();
    for (const obs of obstacles) {
      if (obs.isDestroyed) continue;
      const name = (obs.name || '').toLowerCase();
      const isSeatProp = SEAT_KEYWORDS.some((kw) => name.includes(kw));
      if (isSeatProp) {
        const bounds = obstacleManager.getObstacleBounds(obs);
        // Generous horizontal bounding check to support wide benches and multi-seat props
        const isHorizontallyClose =
          rootMesh.position.x >= bounds.min.x - 0.75 &&
          rootMesh.position.x <= bounds.max.x + 0.75 &&
          rootMesh.position.z >= bounds.min.z - 0.75 &&
          rootMesh.position.z <= bounds.max.z + 0.75;
        const isVerticallyClose = Math.abs(rootMesh.position.y - bounds.min.y) < 2.5;
        if (isHorizontallyClose && isVerticallyClose) {
          return obs;
        }
      }
    }
    return null;
  };

  let associatedChair: any = findNearbyChair();
  const hadInitialChair = associatedChair !== null;

  const initialSpawnY = rootMesh.position.y;
  let initialSupportingObs: any = associatedChair;
  if (!initialSupportingObs) {
    const obstacles = obstacleManager.getAllObstacles();
    for (const obs of obstacles) {
      if (obs.isDestroyed) continue;
      const bounds = obstacleManager.getObstacleBounds(obs);
      if (
        rootMesh.position.x >= bounds.min.x - 0.55 &&
        rootMesh.position.x <= bounds.max.x + 0.55 &&
        rootMesh.position.z >= bounds.min.z - 0.55 &&
        rootMesh.position.z <= bounds.max.z + 0.55
      ) {
        initialSupportingObs = obs;
        break;
      }
    }
  }

  const internalId = `ragdoll_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const internalRef: InternalRagdoll = {
    id: internalId,
    rootMesh,
    isDefeated: () => isDefeated,
    getRadius: () => (isDefeated ? 0.55 : 0.42),
    nudgePosition: (dx: number, dz: number) => {
      rootMesh.position.x += dx;
      rootMesh.position.z += dz;
    },
  };
  activeRagdolls.add(internalRef);

  const floorObserver = scene.onBeforeRenderObservable.add(() => {
    const totalDelta = Math.min(scene.getEngine().getDeltaTime() / 1000, 0.033);
    const substeps = 2;
    const delta = totalDelta / substeps;

    for (let step = 0; step < substeps; step++) {
      let supportY = 0;
      if (!isDefeated) {
        if (initialSupportingObs) {
          if (!initialSupportingObs.isDestroyed) {
            const bounds = obstacleManager.getObstacleBounds(initialSupportingObs);
            const isBeneath =
              rootMesh.position.x >= bounds.min.x - 0.75 &&
              rootMesh.position.x <= bounds.max.x + 0.75 &&
              rootMesh.position.z >= bounds.min.z - 0.75 &&
              rootMesh.position.z <= bounds.max.z + 0.75;
            if (isBeneath) {
              supportY = initialSpawnY;
            } else {
              initialSupportingObs = null;
            }
          } else {
            initialSupportingObs = null;
          }
        }

        if (!initialSupportingObs) {
          supportY = getSupportingSurfaceY(rootMesh.position.x, rootMesh.position.y, rootMesh.position.z);
          // If no supporting obstacle is resolved under an alive stationary character, fall back to initialSpawnY
          // so characters placed on props or custom platforms in the editor never sink through the floor
          if (supportY === 0 && initialSpawnY > 0.05 && !hadInitialChair) {
            supportY = initialSpawnY;
          }
        }
      } else {
        supportY = getSupportingSurfaceY(rootMesh.position.x, rootMesh.position.y, rootMesh.position.z);
      }

      // 1. Ragdoll-to-Ragdoll Collision Check
      const myRadius = internalRef.getRadius();
      activeRagdolls.forEach((other) => {
        if (other.id === internalId) return;
        const oPos = other.rootMesh.position;
        const dx = oPos.x - rootMesh.position.x;
        const dz = oPos.z - rootMesh.position.z;
        const distSq = dx * dx + dz * dz;
        const minDist = myRadius + other.getRadius();

        if (distSq < minDist * minDist && Math.abs(oPos.y - rootMesh.position.y) < 1.7) {
          const dist = Math.sqrt(distSq) || 0.001;
          const overlap = minDist - dist;
          const nx = dx / dist;
          const nz = dz / dist;

          const ratio = isDefeated ? 0.6 : 0.5;
          rootMesh.position.x -= nx * overlap * (1 - ratio);
          rootMesh.position.z -= nz * overlap * (1 - ratio);
          other.nudgePosition(nx * overlap * ratio, nz * overlap * ratio);

          if (isDefeated) {
            velX -= nx * Math.abs(velX) * 0.25;
            velZ -= nz * Math.abs(velZ) * 0.25;
          }
        }
      });

      if (!isDefeated) {
        // Chair destruction check: If character was initially seated on a chair/bench and it breaks, stand up & talk
        if (hadInitialChair && associatedChair) {
          if (associatedChair.isDestroyed) {
            character.playAnimation('Idle_Talking_Loop', true);
            associatedChair = null;
            initialSupportingObs = null;
          }
        }

        // Alive character gravity
        if (rootMesh.position.y > supportY + 0.005) {
          fallVelY -= 14.0 * delta;
          rootMesh.position.y += fallVelY * delta;

          if (rootMesh.position.y <= supportY) {
            rootMesh.position.y = supportY;
            fallVelY = 0;
          }
        } else {
          rootMesh.position.y = supportY;
          fallVelY = 0;
        }
        continue;
      }

      // Defeated ragdoll knockback physics
      velY -= 13.0 * delta;
      rootMesh.position.x += velX * delta;
      rootMesh.position.y += velY * delta;
      rootMesh.position.z += velZ * delta;
      rootMesh.rotation.y += rotVelY * delta;

      // Realistic air damping (prevents excessive sliding across the room)
      velX *= 0.94;
      velZ *= 0.94;

      // Obstacle & Wall collisions via 3D MTV penetration resolution (never penetrates into obstacles)
      const obstacles = obstacleManager.getAllObstacles();
      const ragdollRadius = 0.44;
      for (const obs of obstacles) {
        if (obs.isDestroyed) continue;
        const bounds = obstacleManager.getObstacleBounds(obs);

        const res = resolveBodyVsAABB(
          rootMesh.position.x,
          rootMesh.position.y,
          rootMesh.position.z,
          velX,
          velY,
          velZ,
          ragdollRadius,
          0.38,
          ragdollRadius,
          bounds,
          0.7,
          0.2,
          true
        );
        if (res.collided) {
          rootMesh.position.x = res.x;
          rootMesh.position.y = res.y;
          rootMesh.position.z = res.z;
          velX = res.vx;
          velY = res.vy;
          velZ = res.vz;
        }

        // Additional head/torso containment: if headNode enters solid obstacle, push root back
        if (character.headNode) {
          const headPos = character.headNode.getAbsolutePosition();
          const headRes = resolveBodyVsAABB(
            headPos.x,
            headPos.y,
            headPos.z,
            0,
            0,
            0,
            0.28,
            0.28,
            0.28,
            bounds,
            0.8,
            0.1,
            false
          );
          if (headRes.collided && !headRes.isOnTop) {
            rootMesh.position.x += (headRes.x - headPos.x);
            rootMesh.position.z += (headRes.z - headPos.z);
          }
        }
      }
      // Room boundary containment
      if (rootMesh.position.z > 2.3) {
        rootMesh.position.z = 2.3;
        velZ = Math.min(0, velZ);
      }
      if (rootMesh.position.z < -1.5) {
        rootMesh.position.z = -1.5;
        velZ = Math.max(0, velZ);
      }
      if (rootMesh.position.x < -5.5) {
        rootMesh.position.x = -5.5;
        velX = Math.max(0, velX);
      }
      if (rootMesh.position.x > 7.4) {
        rootMesh.position.x = 7.4;
        velX = Math.min(0, velX);
      }
      // Support surface clamp & friction
      if (rootMesh.position.y <= supportY) {
        rootMesh.position.y = supportY;
        velY = 0;
        velX *= 0.72;
        velZ *= 0.72;
        rotVelY *= 0.72;
      }
    }
  });

  const dispose = (): void => {
    activeRagdolls.delete(internalRef);
    scene.onBeforeRenderObservable.remove(floorObserver);
  };
  character.mainMesh.onDisposeObservable.add(dispose);

  const triggerHit = (hitPoint: Vector3, shootDirection: Vector3, force = 22): void => {
    if (isDefeated) {
      velY = 1.0;
      velX += shootDirection.x * 0.7;
      velZ += shootDirection.z * 0.7;
      rotVelY += (Math.random() - 0.5) * 1.5;
      playBoingSound();
      spawnComicHitEffect(scene, hitPoint);
      return;
    }

    const activeAnims = character.animationGroups.filter((ag) => ag.isPlaying).map((ag) => ag.name);
    const wasSitting = activeAnims.some((n) => n.toLowerCase().includes('sit'));

    isRagdoll = true;
    isDefeated = true;
    associatedChair = null;
    initialSupportingObs = null;

    if (character.magicController) {
      character.magicController.dissipate();
    }

    character.playAnimation('Death01', false, 1.35);
    playHitSound();
    playRagdollDeathSound(deathSoundVariant);
    spawnComicHitEffect(scene, hitPoint);

    // Physically-driven knockback: transfers bullet momentum along shot trajectory
    const knockbackSpeed = Math.min(force * 0.065, 1.6);
    const dirX = shootDirection.x !== 0 ? shootDirection.x : -0.5;
    const dirZ = shootDirection.z !== 0 ? shootDirection.z : 0.5;
    velX = dirX * knockbackSpeed;
    velZ = dirZ * knockbackSpeed;
    velY = Math.max(0.65, Math.abs(shootDirection.y) * knockbackSpeed + 0.45);
    rotVelY = (dirX > 0 ? 1 : -1) * 1.2;

    if (wasSitting) {
      // Natural tumble forward off seat away from the backrest onto open floor
      const facingAngle = rootMesh.rotation.y || 0;
      const forwardX = Math.sin(facingAngle);
      const forwardZ = Math.cos(facingAngle);
      velX += forwardX * 1.1;
      velZ += forwardZ * 1.1;
      velY = Math.max(velY, 0.75);
    }
  };
  return {
    character,
    get isRagdoll() {
      return isRagdoll;
    },
    get isDefeated() {
      return isDefeated;
    },
    triggerHit,
    getPosition: () => rootMesh.position,
    dispose,
  };
}
