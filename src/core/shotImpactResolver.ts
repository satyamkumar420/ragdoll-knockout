import { Vector3, type Scene } from '@babylonjs/core';
import { spawnComicHitEffect, type RagdollController } from '../ragdoll.ts';
import { obstacleManager } from './obstacleManager.ts';
import type { HitDetectionResult } from './hitDetection.ts';

export function resolveShotImpact(
  scene: Scene,
  hitResult: HitDetectionResult,
  barrelDir: Vector3,
  onTargetHit?: (target: RagdollController) => void
): void {
  // 1. Resolve obstacles penetrated along trajectory
  if (hitResult.penetratedObstacles.length > 0) {
    hitResult.penetratedObstacles.forEach((p) => {
      const obsZ = p.obstacle.mesh?.position?.z ?? 0;
      const obsImpact = new Vector3(p.hitPoint.x, p.hitPoint.y, obsZ);
      obstacleManager.applyImpact(p.obstacle, obsImpact, barrelDir, p.damageApplied, 20);
      spawnComicHitEffect(scene, obsImpact);
    });
  }

  // 2. Resolve terminal impact
  if (hitResult.hitObstacle) {
    const obsZ = hitResult.hitObstacle.mesh?.position?.z ?? 0;
    const obsImpact = new Vector3(hitResult.hitPoint.x, hitResult.hitPoint.y, obsZ);
    obstacleManager.applyImpact(hitResult.hitObstacle, obsImpact, barrelDir, 50, 24);
    spawnComicHitEffect(scene, obsImpact);
  } else if (hitResult.hitPug) {
    const pugZ = hitResult.hitPug.rootNode?.position?.z ?? 0;
    const pugImpact = new Vector3(hitResult.hitPoint.x, hitResult.hitPoint.y, pugZ);
    spawnComicHitEffect(scene, pugImpact);
    hitResult.hitPug.triggerHit(pugImpact, barrelDir);
  } else if (hitResult.hitTarget && !hitResult.hitTarget.isDefeated) {
    const charPos = hitResult.hitTarget.getPosition
      ? hitResult.hitTarget.getPosition()
      : ((hitResult.hitTarget.character.rootNode as any)?.position || hitResult.hitTarget.character.mainMesh?.getAbsolutePosition?.());
    const charZ = charPos?.z ?? 0;
    // Land impact effect precisely at bullet impact X to match the straight projectile flight
    const charImpact = new Vector3(hitResult.hitPoint.x, hitResult.hitPoint.y, charZ);
    spawnComicHitEffect(scene, charImpact);
    hitResult.hitTarget.triggerHit(charImpact, barrelDir, hitResult.effectiveDamage * 0.64);
    onTargetHit?.(hitResult.hitTarget);
  } else {
    spawnComicHitEffect(scene, hitResult.hitPoint);
  }
}
