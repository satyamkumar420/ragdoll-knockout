import {
  type Scene,
  Vector3,
  type TransformNode,
  type AbstractMesh,
  Ray,
} from '@babylonjs/core';
import type { RagdollController } from './ragdoll';
import type { PugController } from './pug';
import { obstacleManager } from './core/obstacleManager';

/**
 * Determines whether an obstacle is a wide, flat stable landing platform (e.g. dining table, large crate)
 * or a narrow/slanted prop (e.g. chair, stool, bench, car, ragdoll) from which the gun must slide off to ground.
 */
export function isLandingPlatform(name: string, minX: number, maxX: number, maxY: number): boolean {
  if (maxY > 0.95) return false;
  const n = (name || '').toLowerCase();
  const excluded = [
    'wall', 'lamp', 'plant', 'tree', 'rock', 'foliage', 'picket', 'rail',
    'chair', 'stool', 'seat', 'armchair', 'bench', 'car', 'taxi', 'cruiser',
    'vehicle', 'pug', 'mannequin', 'char_', 'sofa', 'couch'
  ];
  if (excluded.some((k) => n.includes(k))) return false;
  return (maxX - minX) >= 0.70;
}

export interface SupportSurfaceInfo {
  surfaceY: number;
  isStable: boolean;
  minX: number;
  maxX: number;
  name: string;
}

/**
 * Calculates highest supporting surface underneath the gun.
 * Dynamically resolves 3D props overlapping the gameplay corridor (Z in [-0.45, 0.45])
 * without relying on brittle name strings or hardcoded Z=0 raycasts.
 */
export function getSupportSurfaceInfo(
  scene: Scene,
  posX: number,
  posY: number,
  _posZ: number,
  gltfRoot: AbstractMesh,
  root: TransformNode,
  _characters?: RagdollController[],
  _pugs?: PugController[]
): SupportSurfaceInfo {
  let highest: SupportSurfaceInfo = {
    surfaceY: 0,
    isStable: true,
    minX: -Infinity,
    maxX: Infinity,
    name: 'ground',
  };

  const obstacles = obstacleManager.getAllObstacles();

  for (const obs of obstacles) {
    if (obs.isDestroyed || obs.mesh?.metadata?.isWall === true) continue;

    const b = obstacleManager.getObstacleBounds(obs);
    const width = b.max.x - b.min.x;
    const depth = b.max.z - b.min.z;

    // 1. Dynamic Size Filter: Only solid physical structures can support the gun
    if (width < 0.38 || depth < 0.32 || b.max.y < 0.05) continue;

    // 2. Dynamic Corridor Check: Must overlap gameplay action depth [-0.45, 0.45]
    if (b.min.z > 0.45 || b.max.z < -0.45) continue;

    // 3. Horizontal Footprint Check: Gun X must be within obstacle bounds (with slight margin)
    if (posX < b.min.x - 0.15 || posX > b.max.x + 0.15) continue;

    // 4. Determine surface height: obstacle top bounds provides exact millimeter surface height
    let foundSurfaceY = b.max.y;
    const targetZ = Math.max(-0.35, Math.min(0.35, (b.min.z + b.max.z) / 2));

    // Optional raycast refinement only if gun is close to the surface and mesh needs fine contours
    if (posY < b.max.y + 0.4 && posY > b.max.y - 0.3 && scene.pickWithRay) {
      const downRay = new Ray(
        new Vector3(posX, b.max.y + 0.25, targetZ),
        new Vector3(0, -1, 0),
        0.55
      );
      const hit = scene.pickWithRay(downRay, (mesh) => {
        if (!mesh || !mesh.isPickable || !mesh.isEnabled() || !mesh.isVisible) return false;
        if (mesh === gltfRoot || mesh.isDescendantOf(root)) return false;
        return obs.allMeshes ? obs.allMeshes.includes(mesh) : mesh === obs.mesh;
      });
      if (hit?.hit && hit.pickedPoint) {
        foundSurfaceY = hit.pickedPoint.y;
      }
    }

    if (foundSurfaceY > highest.surfaceY) {
      const isUnstable =
        (b.max.x - b.min.x) < 0.6 ||
        /chair|car|police|taxi|sedan|suv|delivery|cone|barrel/i.test(obs.name);
      highest = {
        surfaceY: foundSurfaceY,
        isStable: !isUnstable,
        minX: b.min.x,
        maxX: b.max.x,
        name: obs.name,
      };
    }
  }

  return highest;
}

export function getSupportSurfaceHeight(
  scene: Scene,
  posX: number,
  posY: number,
  posZ: number,
  gltfRoot: AbstractMesh,
  root: TransformNode,
  characters?: RagdollController[],
  pugs?: PugController[]
): number {
  return getSupportSurfaceInfo(scene, posX, posY, posZ, gltfRoot, root, characters, pugs).surfaceY;
}
