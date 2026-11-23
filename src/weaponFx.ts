import {
  Scene,
  Vector3,
  TransformNode,
  StandardMaterial,
  Color3,
  MeshBuilder,
} from '@babylonjs/core';

/**
 * Clean, punchy gunshot muzzle flash burst.
 * Fast, crisp, zero screen-blinking, and highlights the gun barrel mouth.
 */
export function spawnMuzzleFlash(scene: Scene, pos: Vector3, dir: Vector3): void {
  const flashRoot = new TransformNode(`muzzleFlashRoot_${Date.now()}`, scene);
  flashRoot.position.copyFrom(pos);
  if (dir.lengthSquared() > 0.001) {
    flashRoot.lookAt(pos.add(dir));
  }

  // 1. Incandescent white-yellow core sphere
  const coreMat = new StandardMaterial(`flashCoreMat_${Date.now()}`, scene);
  coreMat.diffuseColor = new Color3(1.0, 0.98, 0.7);
  coreMat.emissiveColor = new Color3(1.0, 0.95, 0.5);
  coreMat.specularColor = new Color3(0, 0, 0);

  const core = MeshBuilder.CreateSphere('flashCore', { diameter: 0.16, segments: 8 }, scene);
  core.parent = flashRoot;
  core.position.set(0, 0, 0.05);
  core.material = coreMat;

  // 2. Rounded teardrop outer flame
  const flameMat = new StandardMaterial(`flashFlameMat_${Date.now()}`, scene);
  flameMat.diffuseColor = new Color3(1.0, 0.45, 0.05);
  flameMat.emissiveColor = new Color3(0.95, 0.35, 0.02);
  flameMat.specularColor = new Color3(0, 0, 0);

  const mainFlame = MeshBuilder.CreateSphere('flashFlame', { diameter: 0.22, segments: 8 }, scene);
  mainFlame.parent = flashRoot;
  mainFlame.position.set(0, 0, 0.12);
  mainFlame.scaling.set(0.85, 0.85, 1.4);
  mainFlame.material = flameMat;

  // 3. Forward shooting fiery sparks
  const sparks: { mesh: TransformNode; vel: Vector3 }[] = [];
  const sparkMat = new StandardMaterial(`flashSparkMat_${Date.now()}`, scene);
  sparkMat.diffuseColor = new Color3(1.0, 0.85, 0.15);
  sparkMat.emissiveColor = new Color3(1.0, 0.70, 0.05);
  sparkMat.specularColor = new Color3(0, 0, 0);

  for (let i = 0; i < 4; i++) {
    const s = MeshBuilder.CreateSphere(`flashSpark_${i}`, { diameter: 0.035, segments: 6 }, scene);
    s.material = sparkMat;
    s.position.copyFrom(pos);
    const speed = 4.0 + Math.random() * 2.5;
    const spread = new Vector3(
      (Math.random() - 0.5) * 0.7,
      (Math.random() - 0.5) * 0.7,
      (Math.random() - 0.5) * 0.4
    );
    sparks.push({ mesh: s, vel: dir.scale(speed).add(spread) });
  }

  let progress = 0;
  const observer = scene.onBeforeRenderObservable.add(() => {
    progress += 0.16;
    const delta = scene.getEngine().getDeltaTime() / 1000;

    flashRoot.scaling.setAll(1.0 + Math.sin(Math.min(1.0, progress) * Math.PI) * 0.3);
    const alpha = Math.max(0, 1.0 - progress * 1.2);
    coreMat.alpha = alpha;
    flameMat.alpha = alpha;
    sparkMat.alpha = alpha;

    sparks.forEach((s) => {
      s.mesh.position.addInPlace(s.vel.scale(delta));
      s.vel.y -= 6.0 * delta;
      s.mesh.scaling.scaleInPlace(0.92);
    });

    if (progress >= 1.0) {
      scene.onBeforeRenderObservable.remove(observer);
      flashRoot.dispose(false, true);
      coreMat.dispose();
      flameMat.dispose();
      sparkMat.dispose();
      sparks.forEach((s) => s.mesh.dispose());
    }
  });
}

