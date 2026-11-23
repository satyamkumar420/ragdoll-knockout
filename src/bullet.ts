import {
  Vector3,
  MeshBuilder,
  StandardMaterial,
  Color3,
  TransformNode,
  type Scene,
  type Engine,
} from '@babylonjs/core';
import type { RagdollController } from './ragdoll';

/**
 * Spawns the authentic metallic copper FMJ ogive bullet projectile
 * that flies strictly straight in the 2D plane (Z = 0) along the gun's barrel direction
 * with axial rifling twist and supersonic tracer sparks.
 * Eliminates all homing, curving, and 3D Z-plane skewing.
 */
export function spawnEnhancedBullet(
  scene: Scene,
  engine: Engine,
  start: Vector3,
  end: Vector3,
  direction: Vector3,
  onImpact: () => void,
  _isEntityHit = false,
  _targetController?: RagdollController | null
): void {
  // In 2D gameplay, the bullet trajectory and projectile mesh are strictly locked to the 2D plane (Z = 0)
  const startX = start.x;
  const startY = start.y;
  const endX = end.x;
  const endY = end.y;

  const bulletRoot = new TransformNode(`realBulletRoot_${Date.now()}`, scene);
  bulletRoot.position.set(startX, startY, 0);

  // Responsive bullet scaling: sleek, calibrated size on large screens / desktop, chunky on mobile portrait
  const w = engine?.getRenderWidth ? engine.getRenderWidth() : 800;
  const h = engine?.getRenderHeight ? engine.getRenderHeight() : 600;
  const aspect = w / (h || 1);
  const isLargeScreen = aspect >= 1.05 || w >= 1024;
  const bulletScale = isLargeScreen ? 0.92 : 1.35;
  bulletRoot.scaling.setAll(bulletScale);

  // Compute exact normalized 2D flight direction strictly from the gun barrel vector
  let flightDirX = direction.x;
  let flightDirY = direction.y;
  const dirLen = Math.hypot(flightDirX, flightDirY);
  if (dirLen > 0.001) {
    flightDirX /= dirLen;
    flightDirY /= dirLen;
  } else {
    const dx = endX - startX;
    const dy = endY - startY;
    const dLen = Math.hypot(dx, dy) || 1.0;
    flightDirX = dx / dLen;
    flightDirY = dy / dLen;
  }

  // Exact 2D trajectory angle: bullet nose faces forward along straight trajectory (strictly 0 pitch/yaw into 3D)
  const flightAngle = Math.atan2(flightDirY, flightDirX);
  bulletRoot.rotation.set(0, 0, flightAngle);

  // Mesh sub-root for axial rifling twist around longitudinal axis (local X)
  const bulletMesh = new TransformNode(`bulletMesh_${Date.now()}`, scene);
  bulletMesh.parent = bulletRoot;

  const fmjMat = new StandardMaterial(`bulletFmjMat_${Date.now()}`, scene);
  fmjMat.diffuseColor = new Color3(0.92, 0.55, 0.28);
  fmjMat.specularColor = new Color3(1.0, 0.95, 0.85);
  fmjMat.specularPower = 96;
  fmjMat.emissiveColor = new Color3(0.22, 0.12, 0.04);

  // 1. Aerodynamic Ogive Nose (aligned along local +X)
  const bulletNose = MeshBuilder.CreateCylinder(
    'bulletNose',
    { diameterTop: 0.03, diameterBottom: 0.11, height: 0.12, tessellation: 18 },
    scene
  );
  bulletNose.parent = bulletMesh;
  bulletNose.position.set(0.06, 0, 0);
  bulletNose.rotation.z = -Math.PI / 2;
  bulletNose.material = fmjMat;

  // 2. Rounded Tip (Meplat)
  const bulletTip = MeshBuilder.CreateSphere(
    'bulletTip',
    { diameter: 0.035, segments: 10 },
    scene
  );
  bulletTip.parent = bulletMesh;
  bulletTip.position.set(0.12, 0, 0);
  bulletTip.material = fmjMat;

  // 3. Cylindrical Shank
  const bulletShank = MeshBuilder.CreateCylinder(
    'bulletShank',
    { diameter: 0.11, height: 0.14, tessellation: 18 },
    scene
  );
  bulletShank.parent = bulletMesh;
  bulletShank.position.set(-0.07, 0, 0);
  bulletShank.rotation.z = -Math.PI / 2;
  bulletShank.material = fmjMat;

  // 4. Boat-tail Base
  const bulletBase = MeshBuilder.CreateCylinder(
    'bulletBase',
    { diameterTop: 0.11, diameterBottom: 0.09, height: 0.03, tessellation: 18 },
    scene
  );
  bulletBase.parent = bulletMesh;
  bulletBase.position.set(-0.155, 0, 0);
  bulletBase.rotation.z = -Math.PI / 2;
  bulletBase.material = fmjMat;

  // 5. Supersonic Tracer slipstream
  const tracerMat = new StandardMaterial(`tracerMat_${Date.now()}`, scene);
  tracerMat.diffuseColor = new Color3(1.0, 0.82, 0.35);
  tracerMat.emissiveColor = new Color3(1.0, 0.70, 0.15);
  tracerMat.alpha = 0.45;

  const tracer = MeshBuilder.CreateCylinder(
    'bulletTracer',
    { diameterTop: 0.08, diameterBottom: 0.01, height: 0.55, tessellation: 8 },
    scene
  );
  tracer.parent = bulletMesh;
  tracer.position.set(-0.42, 0, 0);
  tracer.rotation.z = -Math.PI / 2;
  tracer.material = tracerMat;

  let traveled = 0;
  // Cinematic, slow-motion bullet flight speed for dramatic readability: 4.5 m/s
  const flightSpeed = 4.5;
  const totalFlightDistance = Math.max(0.05, Math.hypot(endX - startX, endY - startY));

  // Active sparks pool managed within the single flightObserver
  const activeSparks: { mesh: ReturnType<typeof MeshBuilder.CreateSphere>; life: number }[] = [];
  let sparkCooldown = 0;

  const flightObserver = scene.onBeforeRenderObservable.add(() => {
    const delta = Math.min(engine.getDeltaTime() / 1000, 0.05);
    traveled += flightSpeed * delta;

    const currentDist = Math.min(traveled, totalFlightDistance);
    const progress = currentDist / totalFlightDistance;

    // Laser-straight 2D flight along flightDir on the Z = 0 gameplay plane
    bulletRoot.position.set(
      startX + flightDirX * currentDist,
      startY + flightDirY * currentDist,
      0
    );

    // Pure axial rifling twist around forward flight axis (local X)
    bulletMesh.rotation.x += (22.0 + flightSpeed * 0.6) * delta;

    // Lightweight slipstream tracer sparks strictly on Z = 0 behind the projectile
    sparkCooldown += delta;
    if (sparkCooldown >= 0.04 && activeSparks.length < 12) {
      sparkCooldown = 0;
      const sparkRadius = isLargeScreen ? 0.032 : 0.045;
      const spark = MeshBuilder.CreateSphere('bulletSpark', { diameter: sparkRadius, segments: 6 }, scene);
      const sparkTrailOffset = 0.20 * (bulletScale / 0.92);
      spark.position.set(
        bulletRoot.position.x - flightDirX * sparkTrailOffset,
        bulletRoot.position.y - flightDirY * sparkTrailOffset,
        0
      );
      spark.material = tracerMat;
      activeSparks.push({ mesh: spark, life: 0 });
    }

    // Update active sparks
    for (let i = activeSparks.length - 1; i >= 0; i--) {
      const s = activeSparks[i];
      s.life += delta * 3.2;
      s.mesh.scaling.scaleInPlace(0.94);
      if (s.life >= 1.0) {
        s.mesh.geometry?.dispose();
        s.mesh.dispose(false, true);
        activeSparks.splice(i, 1);
      }
    }

    if (progress >= 1.0) {
      scene.onBeforeRenderObservable.remove(flightObserver);
      for (const s of activeSparks) {
        s.mesh.geometry?.dispose();
        s.mesh.dispose(false, true);
      }
      activeSparks.length = 0;
      bulletNose.geometry?.dispose();
      bulletTip.geometry?.dispose();
      bulletShank.geometry?.dispose();
      bulletBase.geometry?.dispose();
      tracer.geometry?.dispose();
      bulletNose.dispose(false, true);
      bulletTip.dispose(false, true);
      bulletShank.dispose(false, true);
      bulletBase.dispose(false, true);
      tracer.dispose(false, true);
      bulletMesh.dispose(false, true);
      bulletRoot.dispose(false, true);
      fmjMat.dispose();
      tracerMat.dispose();
      onImpact();
    }
  });
}
