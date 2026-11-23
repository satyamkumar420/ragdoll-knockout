import {
  Scene,
  SceneLoader,
  Vector3,
  TransformNode,
  type AbstractMesh,
  type ShadowGenerator,
  type PBRMaterial,
  type AnimationGroup,
} from '@babylonjs/core';
import type { RagdollController } from './ragdoll';
import type { PugController } from './pug';
import { spawnMuzzleFlash } from './weaponFx';
import {
  playSlidePull,
  playSlideRelease,
  playMagIn,
  playMagOut,
} from './audio';
import {
  getSupportSurfaceInfo,
  getSupportSurfaceHeight,
  resolveObstacleCollisions,
  getCameraViewportBounds,
  getPlayableXBounds,
  getShortestAngleDiff,
} from './weaponPhysics';

export interface WeaponShootResult {
  muzzlePos: Vector3;
  barrelDir: Vector3;
  didShoot?: boolean;
}

export interface PlayerWeapon {
  root: TransformNode;
  gunMesh: AbstractMesh;
  getMuzzlePosition: () => Vector3;
  getMuzzleForwardVector: () => Vector3;
  triggerFlipAndShoot: () => WeaponShootResult;
  updatePhysics: (delta: number, characters?: RagdollController[], pugs?: PugController[]) => void;
  isGrounded: () => boolean;
  isReloading: () => boolean;
  isSpawnDropping?: () => boolean;
  resetToGround: (customPos?: Vector3, customRot?: Vector3, customScale?: number) => void;
  spawnDropFromAir: (customPos?: Vector3, customRot?: Vector3, customScale?: number) => void;
  setScale: (scale: number) => void;
  playAnimation: (animName: string, loop?: boolean, speedRatio?: number) => boolean;
  stopAnimation: (animName?: string) => void;
  playReloadSequence: (speedMultiplier?: number) => void;
  playCockSequence: () => void;
  getAvailableAnimations: () => string[];
  resetShotCount: () => void;
  getShotCount: () => number;
}

export async function loadPlayerWeapon(
  scene: Scene,
  spawnPos = new Vector3(-1.75, 0.075, 0),
  shadowGen?: ShadowGenerator,
  modelAssetUrl?: string
): Promise<PlayerWeapon> {
  const root = new TransformNode('weaponRoot', scene);
  root.position.copyFrom(spawnPos);

  const result = modelAssetUrl
    ? await SceneLoader.ImportMeshAsync('', '', modelAssetUrl, scene)
    : await SceneLoader.ImportMeshAsync('', './assets/', 'Pistol.glb', scene);
  const gltfRoot = result.meshes[0];
  gltfRoot.parent = root;
  gltfRoot.rotationQuaternion = null;
  // Rotate gltfRoot Y = +90 degrees so local +Z barrel points forward along +X in gameplay plane
  gltfRoot.rotation.set(0, Math.PI / 2, 0);

  const BASE_MODEL_SCALE = 7.5;
  let userScale: number | null = null;

  // Responsive dynamic scaling: scales up on mobile portrait so the pistol is prominent & juicy
  const getResponsiveScale = (): number => {
    const w = scene.getEngine().getRenderWidth() || 800;
    const h = scene.getEngine().getRenderHeight() || 600;
    const aspect = w / h;
    const base = userScale !== null && userScale > 0 ? userScale : 0.52;
    // On mobile portrait, boost gun size by 1.35x so it's chunky, arcade-like and prominent
    const mobileBoost = aspect < 1.0 ? 1.35 : 1.0;
    return base * mobileBoost;
  };

  let currentScale = getResponsiveScale();
  gltfRoot.scaling.setAll(BASE_MODEL_SCALE * currentScale);

  // Muzzle tip and slide rear markers in gltfRoot local coordinates:
  // With gltfRoot rotated Y = +PI/2: local +Z is forward (+X in world), local +Y is up (+Y in world)
  // Perfectly calibrated barrel bore center: local Y = 0.095, local Z = 0.182 (aligned with lower barrel bore)
  const muzzleMarker = new TransformNode('muzzleMarker', scene);
  muzzleMarker.parent = gltfRoot;
  muzzleMarker.position.set(0, 0.095, 0.182);

  const rearMarker = new TransformNode('rearMarker', scene);
  rearMarker.parent = gltfRoot;
  rearMarker.position.set(0, 0.095, -0.045);

  const gunMeshes = result.meshes.filter((m) => m !== gltfRoot);

  // Setup animations from GLB AnimationGroups
  const animGroups = new Map<string, AnimationGroup>();
  for (const ag of result.animationGroups || []) {
    animGroups.set(ag.name, ag);
    ag.stop();
  }

  const playAnimation = (name: string, loop = false, speedRatio = 1.0): boolean => {
    const ag = animGroups.get(name);
    if (!ag) return false;
    ag.stop();
    ag.speedRatio = speedRatio;
    ag.play(loop);
    return true;
  };

  const stopAnimation = (name?: string): void => {
    if (name) {
      animGroups.get(name)?.stop();
    } else {
      animGroups.forEach((ag) => ag.stop());
    }
  };

  const getAvailableAnimations = (): string[] => {
    return Array.from(animGroups.keys());
  };

  let shotCount = 0;
  let isReloadingState = false;
  let lastReloadBounceTime = 0;
  let reloadTimeoutA: ReturnType<typeof setTimeout> | null = null;
  let reloadTimeoutB: ReturnType<typeof setTimeout> | null = null;
  let reloadTimeoutC: ReturnType<typeof setTimeout> | null = null;

  const cancelPendingReload = () => {
    if (reloadTimeoutA !== null) {
      clearTimeout(reloadTimeoutA);
      reloadTimeoutA = null;
    }
    if (reloadTimeoutB !== null) {
      clearTimeout(reloadTimeoutB);
      reloadTimeoutB = null;
    }
    if (reloadTimeoutC !== null) {
      clearTimeout(reloadTimeoutC);
      reloadTimeoutC = null;
    }
    isReloadingState = false;
  };

  const playReloadSequence = (speedMultiplier = 1.0): void => {
    cancelPendingReload();
    isReloadingState = true;

    playAnimation('Mag Out', false, speedMultiplier);
    playMagOut();

    const magInDelay = Math.round(300 / speedMultiplier);
    reloadTimeoutA = setTimeout(() => {
      playAnimation('Mag In', false, speedMultiplier);
      playMagIn();
      reloadTimeoutA = null;
    }, magInDelay);

    const slideReleaseDelay = Math.round(650 / speedMultiplier);
    reloadTimeoutB = setTimeout(() => {
      playAnimation('Slide Release', false, speedMultiplier);
      playSlideRelease();
      reloadTimeoutB = null;
    }, slideReleaseDelay);

    const reloadCompleteDelay = Math.round(780 / speedMultiplier);
    reloadTimeoutC = setTimeout(() => {
      isReloadingState = false;
      reloadTimeoutC = null;
    }, reloadCompleteDelay);
  };

  const playCockSequence = (): void => {
    cancelPendingReload();
    playAnimation('Slide Pull', false, 1.0);
    playSlidePull();
    setTimeout(() => {
      playAnimation('Slide Release', false, 1.0);
      playSlideRelease();
    }, 200);
  };

  // Stylized PBR Material enhancement: metallic sheen with embedded purple & wooden grip palette atlas
  gunMeshes.forEach((mesh) => {
    if (shadowGen) shadowGen.addShadowCaster(mesh);

    const mat = mesh.material as PBRMaterial;
    if (mat && mat.getClassName?.() === 'PBRMaterial') {
      mat.metallic = 0.70;
      mat.roughness = 0.30;
      mat.directIntensity = 1.30;
      mat.environmentIntensity = 1.20;
    }
  });

  const nominalFlatGroundY = 0.085;
  const baseRotZ = 0; // Normal horizontal forward-pointing orientation
  const UPRIGHT_ROT_X = 0; // Upright in 2D gameplay plane
  const GRAVITY = -9.8;

  let currentSpawnX = spawnPos.x;
  let posX = spawnPos.x;
  let posY = spawnPos.y || nominalFlatGroundY;

  let velX = 0;
  let velY = 0;

  let isGroundedState = true;

  // In 2D gameplay, rotX and rotY are strictly 0 at all times!
  let rotX = 0;
  let rotY = 0;
  let rotZ = baseRotZ;
  let targetFlatRotX = 0;
  let targetRestRotZ = baseRotZ;
  let isSleeping = false;
  let isSpawnDropping = false;

  let angVelZ = 0;

  root.position.set(posX, posY, 0);
  root.rotation.set(rotX, rotY, rotZ);
  root.computeWorldMatrix(true);
  gltfRoot.computeWorldMatrix(true);

  const getMuzzlePosition = (): Vector3 => {
    muzzleMarker.computeWorldMatrix(true);
    const p = muzzleMarker.getAbsolutePosition();
    return new Vector3(p.x, p.y, 0); // Strictly locked to 2D gameplay action plane (Z = 0)
  };

  const getMuzzleForwardVector = (): Vector3 => {
    muzzleMarker.computeWorldMatrix(true);
    rearMarker.computeWorldMatrix(true);
    const pMuzzle = muzzleMarker.getAbsolutePosition();
    const pRear = rearMarker.getAbsolutePosition();
    const dx = pMuzzle.x - pRear.x;
    const dy = pMuzzle.y - pRear.y;
    const len = Math.hypot(dx, dy) || 1.0;
    return new Vector3(dx / len, dy / len, 0);
  };

  const getGunMinimumWorldY = (): number => {
    let minY = Infinity;
    for (let i = 0; i < gunMeshes.length; i++) {
      const m = gunMeshes[i];
      m.computeWorldMatrix(false);
      const b = m.getBoundingInfo().boundingBox;
      if (b.minimumWorld.y < minY) minY = b.minimumWorld.y;
    }
    return minY;
  };

  // Check initial ground height to avoid starting below grass
  const initialSupportY = getSupportSurfaceHeight(scene, posX, posY, 0, gltfRoot, root);
  const initialMinY = getGunMinimumWorldY();
  if (initialSupportY - initialMinY > 0) {
    posY += (initialSupportY - initialMinY);
    root.position.y = posY;
    root.computeWorldMatrix(true);
  }

  const triggerFlipAndShoot = (): WeaponShootResult => {
    // Immediately ensure weapon is strictly upright in the 2D gameplay plane (rotX = 0, rotY = 0, Z = 0)
    // BEFORE computing muzzle position and barrel direction vectors so no 3D tilt contaminates trajectory
    rotX = UPRIGHT_ROT_X;
    rotY = 0;
    root.position.set(posX, posY, 0);
    root.rotation.set(rotX, rotY, rotZ);
    root.computeWorldMatrix(true);
    gltfRoot.computeWorldMatrix(true);
    muzzleMarker.computeWorldMatrix(true);
    rearMarker.computeWorldMatrix(true);

    const barrelDir = getMuzzleForwardVector();
    const muzzlePos = getMuzzlePosition();

    // If reloading: do NOT interrupt reload or fire bullets.
    // Instead provide a balanced, smooth bounce so the reload animation can be appreciated
    if (isReloadingState) {
      const now = Date.now();
      if (now - lastReloadBounceTime > 160) {
        lastReloadBounceTime = now;
        isGroundedState = false;
        isSleeping = false;
        // Balanced upward float bounce
        velY = Math.min(3.2, Math.max(velY + 1.5, 2.5));
        // Smooth rotation
        angVelZ = -2.0;
      }
      return { muzzlePos, barrelDir, didShoot: false };
    }

    if (isSpawnDropping) {
      isSpawnDropping = false;
    }

    const wasGrounded = isGroundedState;
    isGroundedState = false;
    isSleeping = false;

    // Ground flip launch: When resting on the ground, tapping flips the gun up into the air without firing a bullet
    if (wasGrounded) {
      playSlidePull();
      // Well-balanced upward hop
      velY = 4.2;
      velX = barrelDir.x >= 0 ? 0.30 : -0.30;
      // Controlled, responsive clockwise flip spin
      angVelZ = -3.7;

      cancelPendingReload();
      stopAnimation('Mag Out');
      stopAnimation('Mag In');
      playAnimation('RESET', false, 1.0);

      return { muzzlePos, barrelDir, didShoot: false };
    }

    // --- AIRBORNE SHOOT LOGIC ---
    // Smooth, responsive recoil kickback opposite to barrel direction
    const kickStrength = 3.1;
    velX -= barrelDir.x * kickStrength;
    velX = Math.max(-3.1, Math.min(3.1, velX));

    // Balanced upward recoil propulsion
    const recoilY = -barrelDir.y * kickStrength;
    const isLowAltitude = posY < 0.6;
    const baseHop = isLowAltitude ? 3.5 : 2.5;
    velY = Math.max(velY * 0.23 + baseHop, recoilY + 2.4);
    velY = Math.min(5.2, velY);

    // Responsive, natural clockwise spin (~4.0 rad/s)
    angVelZ = -4.0;

    // Cancel any active mid-reload and ensure weapon is instantly ready to fire
    cancelPendingReload();
    stopAnimation('Mag Out');
    stopAnimation('Mag In');
    playAnimation('RESET', false, 1.0);

    // Trigger pistol mechanical slide & hammer recoil animation
    playAnimation('Fire', false, 1.0);

    shotCount++;
    // Every 3 shots, trigger an automatic stylish magazine reload during the airborne spin!
    if (shotCount % 3 === 0) {
      setTimeout(() => {
        playReloadSequence(1.0);
      }, 70);
    }

    spawnMuzzleFlash(scene, muzzlePos, barrelDir);

    return { muzzlePos, barrelDir, didShoot: true };
  };

  const updatePhysics = (delta: number, characters?: RagdollController[], pugs?: PugController[]) => {
    const clampedDelta = Math.min(delta, 0.05);
    // Smooth cinematic slow-motion during reload or initial level spawn drop
    const timeScale = isReloadingState ? 0.55 : (isSpawnDropping ? 0.38 : 1.0);
    const simDelta = clampedDelta * timeScale;

    // Dynamic viewport boundaries constrained by camera and solid room walls
    const vpBounds = getCameraViewportBounds(scene, 0);
    const bounds = getPlayableXBounds(scene, currentSpawnX, vpBounds);
    const maxY = vpBounds.maxY;

    // Responsive scale check
    currentScale = getResponsiveScale();
    const targetScale = BASE_MODEL_SCALE * currentScale;
    if (Math.abs(gltfRoot.scaling.x - targetScale) > 0.01) {
      gltfRoot.scaling.setAll(targetScale);
    }

    // Supporting surface underneath the gun
    const surfInfo = getSupportSurfaceInfo(scene, posX, posY, 0, gltfRoot, root, characters, pugs);
    const supportY = surfInfo.surfaceY;

    if (!isGroundedState) {
      // Downward gravity & air friction for smooth 2D movement
      velY += GRAVITY * (isReloadingState || isSpawnDropping ? 0.75 : 1.0) * simDelta;
      velX *= (isReloadingState || isSpawnDropping ? 0.992 : 0.986);
      velY = Math.max(-6.8, velY); // Terminal velocity cap to avoid unnatural hyper-speed falls
      posX += velX * simDelta;
      posY += velY * simDelta;

      // Horizontal obstacle collisions in 2D (walls, trees, fences, props, characters, pugs)
      const obst = resolveObstacleCollisions(posX, posY, 0, velX, 0, scene, characters, pugs, root, gltfRoot, supportY);
      posX = obst.posX;
      velX = obst.velX;

      // Controlled screen and room boundary deflection without penetrating walls
      if (posX <= bounds.minX) {
        posX = bounds.minX;
        velX = Math.abs(velX) * 0.20;
        angVelZ *= 0.50;
        if (Math.abs(velX) < 0.12) velX = 0;
      }
      if (posX >= bounds.maxX) {
        posX = bounds.maxX;
        velX = -Math.abs(velX) * 0.20;
        angVelZ *= 0.50;
        if (Math.abs(velX) < 0.12) velX = 0;
      }
      if (posY >= maxY) {
        posY = maxY;
        // Soft ceiling absorption: arrests upward force smoothly instead of catapulting gun downwards
        velY = -Math.min(0.18, Math.abs(velY) * 0.05);
        angVelZ *= 0.60;
      }

      // In air: stays upright in 2D action plane and flips smoothly around Z
      rotX = UPRIGHT_ROT_X;
      rotY = 0;
      rotZ += angVelZ * simDelta;
      rotZ = (rotZ % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      angVelZ *= (isReloadingState ? 0.994 : 0.992); // Gentle angular damping

      // Update matrices before checking ground contact
      root.position.set(posX, posY, 0);
      root.rotation.set(rotX, rotY, rotZ);
      root.computeWorldMatrix(true);
      gltfRoot.computeWorldMatrix(true);

      // Check ground contact using actual lowest point of gun mesh ONLY when falling downwards
      if (velY <= 0) {
        const currentMinY = getGunMinimumWorldY();
        if (currentMinY <= supportY) {
          // Push gun pivot up so lowest vertex sits exactly on support surface
          const penetration = supportY - currentMinY;
          posY += penetration;
          root.position.y = posY;

          if (isSpawnDropping) {
            // Elegant, clean touchdown at the end of spawn drop
            isSpawnDropping = false;
            isGroundedState = true;
            isSleeping = true;
            velY = 0;
            velX = 0;
            angVelZ = 0;
            rotZ = targetRestRotZ;
            root.rotation.set(0, 0, rotZ);
            root.computeWorldMatrix(true);
            gltfRoot.computeWorldMatrix(true);
            playSlideRelease();
            return;
          }

          // Weapon lands on support surface (ground, table, car, crate, chair, etc.)
          if (velY < -1.5) {
            // Soft metallic clatter bounce with rapid decay (no rubber ball springiness)
            const bounceRestitution = isReloadingState ? 0.08 : 0.12;
            velY = -velY * bounceRestitution;
            velX *= 0.50;
            angVelZ *= 0.45;
            posY += 0.01; // Small clearance to start clean low hop
            isGroundedState = false;
          } else if (!surfInfo.isStable && supportY > 0.15) {
            // Narrow/unstable prop (chair, barrel, car): slide off dynamically to ground
            const centerX = (surfInfo.minX + surfInfo.maxX) / 2;
            const slideDir = posX >= centerX ? 1 : -1;
            velX = slideDir * 0.9;
            velY = 0.35;
            angVelZ = slideDir * -1.6;
            isGroundedState = false;
          } else {
            // Low downward momentum: settle flush onto the obstacle/ground surface and STAY resting on it!
            isGroundedState = true;
            velY = 0;
            velX *= 0.5;
            angVelZ *= 0.5;
            targetFlatRotX = 0;
            // Latch resting direction once on touchdown
            targetRestRotZ = Math.cos(rotZ) >= 0 ? 0 : Math.PI;
          }
        }
      }

      root.position.set(posX, posY, 0);
      root.rotation.set(rotX, rotY, rotZ);
      root.computeWorldMatrix(true);
      gltfRoot.computeWorldMatrix(true);
    } else {
      // Grounded state
      if (isSleeping) {
        // Check if supporting surface underneath has moved or was broken by gunfire
        const currentMinY = getGunMinimumWorldY();
        if (currentMinY > supportY + 0.30 || currentMinY < supportY - 0.25) {
          isSleeping = false;
          isGroundedState = false;
        }

        // Even when resting, verify dynamic entities (ragdolls, moving props) have not encroached
        const obst = resolveObstacleCollisions(posX, posY, 0, 0, 0, scene, characters, pugs, root, gltfRoot, supportY);
        if (Math.abs(obst.posX - posX) > 0.005) {
          posX = Math.max(bounds.minX, Math.min(bounds.maxX, obst.posX));
          velX = obst.velX;
          isSleeping = false;
          root.position.set(posX, posY, 0);
          root.computeWorldMatrix(true);
          gltfRoot.computeWorldMatrix(true);
        }
        return;
      }

      const currentMinY = getGunMinimumWorldY();
      if (currentMinY > supportY + 0.30) {
        isGroundedState = false;
        isSleeping = false;
      } else {
        velY = 0;
      }

      velX *= 0.80;
      if (Math.abs(velX) < 0.02) velX = 0;
      posX += velX * clampedDelta;

      // Friction quickly dampens any residual spin
      angVelZ *= 0.75;
      if (Math.abs(angVelZ) < 0.05) angVelZ = 0;

      // Strictly maintain 2D planar alignment (rotX = 0, rotY = 0)
      rotX = 0;
      rotY = 0;

      // Smoothly align rest orientation with latched direction
      const alignFactor = Math.min(1.0, clampedDelta * 12);
      const diffZ = getShortestAngleDiff(rotZ, targetRestRotZ);
      rotZ += diffZ * alignFactor;
      if (Math.abs(diffZ) < 0.02) rotZ = targetRestRotZ;

      // Always resolve collisions with obstacles, ragdolls, and pugs
      const obst = resolveObstacleCollisions(posX, posY, 0, velX, 0, scene, characters, pugs, root, gltfRoot, supportY);
      posX = obst.posX;
      velX = obst.velX;

      // Stay within screen viewport bounds
      if (posX <= bounds.minX) { posX = bounds.minX; velX = 0; }
      if (posX >= bounds.maxX) { posX = bounds.maxX; velX = 0; }

      root.position.set(posX, posY, 0);
      root.rotation.set(rotX, rotY, rotZ);
      root.computeWorldMatrix(true);
      gltfRoot.computeWorldMatrix(true);

      // PERFECT GROUND CONTACT: Settle flush on support surface with small deadband to prevent micro-jitter
      const groundedMinY = getGunMinimumWorldY();
      const penetration = supportY - groundedMinY;
      if (Math.abs(penetration) > 0.005) {
        posY += penetration;
        root.position.y = posY;
        root.computeWorldMatrix(true);
        gltfRoot.computeWorldMatrix(true);
      }

      // Enter resting sleep state once velocity and rotation have settled
      if (
        Math.abs(velX) < 0.03 &&
        Math.abs(velY) < 0.03 &&
        Math.abs(angVelZ) < 0.05 &&
        Math.abs(rotX - targetFlatRotX) < 0.03 &&
        Math.abs(diffZ) < 0.03
      ) {
        isSleeping = true;
        velX = 0;
        velY = 0;
        angVelZ = 0;
        rotX = targetFlatRotX;
        rotY = 0;
        rotZ = targetRestRotZ;
        root.rotation.set(rotX, rotY, rotZ);
        root.computeWorldMatrix(true);
        gltfRoot.computeWorldMatrix(true);
      }
    }

    root.position.set(posX, posY, 0);
    root.rotation.set(rotX, rotY, rotZ);
    root.computeWorldMatrix(true);
  };

  /**
   * Spawns gun high above in the air at the configured X coordinate and drops
   * down smoothly in cinematic slow-motion onto the ground/platform.
   */
  const spawnDropFromAir = (customPos?: Vector3, customRot?: Vector3, customScale?: number) => {
    cancelPendingReload();
    if (customScale !== undefined && customScale > 0) {
      userScale = customScale;
    }
    const targetX = customPos ? customPos.x : -2.2;
    currentSpawnX = targetX;
    const vpBounds = getCameraViewportBounds(scene, 0);
    const bounds = getPlayableXBounds(scene, targetX, vpBounds);
    currentScale = getResponsiveScale();
    gltfRoot.scaling.setAll(BASE_MODEL_SCALE * currentScale);
    gltfRoot.position.set(0, 0, 0);

    posX = Math.max(bounds.minX, Math.min(bounds.maxX, targetX));
    const targetGroundY = customPos ? customPos.y : nominalFlatGroundY;

    // In 2D gameplay, rotX and rotY are strictly 0 at all times
    rotX = 0;
    rotY = 0;
    rotZ = customRot ? customRot.z : 0;

    targetFlatRotX = 0;
    targetRestRotZ = rotZ;

    // Support surface check to determine exact landing floor height
    const surfInfo = getSupportSurfaceInfo(scene, posX, targetGroundY, 0, gltfRoot, root);
    const supportY = surfInfo.surfaceY;

    // Spawn high above in the air near the top of the viewport for slow-motion entrance drop
    const dropHeight = Math.min(vpBounds.maxY - 0.35, supportY + 3.6);
    posY = Math.max(supportY + 2.2, dropHeight);

    velX = 0;
    velY = -0.4; // Gentle downward drift to begin slow-motion descent
    angVelZ = 0;

    isSpawnDropping = true;
    isGroundedState = false;
    isSleeping = false;

    root.position.set(posX, posY, 0);
    root.rotation.set(rotX, rotY, rotZ);
    root.computeWorldMatrix(true);
    gltfRoot.computeWorldMatrix(true);
  };

  /**
   * Resets gun cleanly and stably onto the ground/supporting surface at the configured
   * spawn position without awkward aerial drops or teleport flickering.
   */
  const resetToGround = (customPos?: Vector3, customRot?: Vector3, customScale?: number) => {
    cancelPendingReload();
    if (customScale !== undefined && customScale > 0) {
      userScale = customScale;
    }
    const targetX = customPos ? customPos.x : -2.2;
    currentSpawnX = targetX;
    const vpBounds = getCameraViewportBounds(scene, 0);
    const bounds = getPlayableXBounds(scene, targetX, vpBounds);
    currentScale = getResponsiveScale();
    gltfRoot.scaling.setAll(BASE_MODEL_SCALE * currentScale);
    gltfRoot.position.set(0, 0, 0);

    posX = Math.max(bounds.minX, Math.min(bounds.maxX, targetX));
    const targetGroundY = customPos ? customPos.y : nominalFlatGroundY;

    // In 2D gameplay, rotX and rotY are strictly 0 at all times
    rotX = 0;
    rotY = 0;
    rotZ = customRot ? customRot.z : 0;

    targetFlatRotX = 0;
    targetRestRotZ = rotZ;

    velX = 0;
    velY = 0;
    angVelZ = 0;

    isSpawnDropping = false;
    isGroundedState = true;
    isSleeping = true;

    // Support surface check to determine exact landing floor height
    const surfInfo = getSupportSurfaceInfo(scene, posX, targetGroundY, 0, gltfRoot, root);
    const supportY = surfInfo.surfaceY;
    posY = supportY;

    root.position.set(posX, posY, 0);
    root.rotation.set(rotX, rotY, rotZ);
    root.computeWorldMatrix(true);
    gltfRoot.computeWorldMatrix(true);

    // Adjust position so lowest vertex rests exactly on support surface
    const currentMinY = getGunMinimumWorldY();
    if (currentMinY < supportY) {
      posY += (supportY - currentMinY);
      root.position.y = posY;
      root.computeWorldMatrix(true);
      gltfRoot.computeWorldMatrix(true);
    }
  };

  const setScale = (scale: number) => {
    if (scale > 0) {
      userScale = scale;
      currentScale = scale;
      gltfRoot.scaling.setAll(BASE_MODEL_SCALE * scale);
    }
  };

  return {
    root,
    gunMesh: gltfRoot,
    getMuzzlePosition,
    getMuzzleForwardVector,
    triggerFlipAndShoot,
    updatePhysics,
    isGrounded: () => isGroundedState,
    isReloading: () => isReloadingState,
    isSpawnDropping: () => isSpawnDropping,
    resetToGround,
    spawnDropFromAir,
    setScale,
    playAnimation,
    stopAnimation,
    playReloadSequence,
    playCockSequence,
    getAvailableAnimations,
    resetShotCount: () => {
      shotCount = 0;
    },
    getShotCount: () => shotCount,
  };
}
