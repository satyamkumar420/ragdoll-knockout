import {
  Scene,
  SceneLoader,
  TransformNode,
  PhysicsAggregate,
  PhysicsShapeType,
  AnimationGroup,
  PBRMaterial,
  Color3,
  type AbstractMesh,
  type ShadowGenerator,
  type ISceneLoaderAsyncResult,
} from '@babylonjs/core';
import type { PropItemConfig } from '../config/levelTypes';
import { obstacleManager } from './obstacleManager';
import { ASSET_CATALOG } from '../editor/assetCatalog';

export interface LoadedPropInstance {
  rootNode: TransformNode;
  animationGroups?: AnimationGroup[];
  playAnimation?: (name: string, loop?: boolean, speed?: number) => void;
  stopAllAnimations?: () => void;
  dispose: () => void;
}

/**
 * Applies authentic stylized PBR material finishes to props:
 * - Warm chestnut wood matching reference image for tables, chairs, cabinets
 * - Terracotta pot & lush realistic waxy green leaves for potted plants (gamla)
 * - Cohesive warm materials for dining room furniture
 */
function applyPropMaterialEnhancements(
  modelPath: string,
  meshes: AbstractMesh[],
  scene: Scene,
  propName?: string
): PBRMaterial[] {
  const customMats: PBRMaterial[] = [];
  const pLower = modelPath.toLowerCase();
  const nameLower = (propName || '').toLowerCase();

  // 6. Industrial Workshop / Garage Walls: clean bright modern speed-shop panels
  if (pLower.includes('wall') && (nameLower.includes('garage') || nameLower.includes('workshop'))) {
    meshes.forEach((m) => {
      const wallMat = new PBRMaterial(`garageWallMat_${m.name}_${Date.now()}`, scene);
      wallMat.albedoColor = new Color3(0.84, 0.85, 0.88); // Clean bright modern speed-shop pearl wall
      wallMat.roughness = 0.40;
      wallMat.metallic = 0.05;
      m.material = wallMat;
      customMats.push(wallMat);
    });
    return customMats;
  }

  // 1. Potted Plant (Gamla): Terracotta/wood pot + lush waxy green leaves
  if (pLower.includes('plant')) {
    meshes.forEach((m) => {
      if (m.name.includes('primitive0')) {
        // Cylindrical Pot (Gamla)
        const potMat = new PBRMaterial(`potMat_${m.name}_${Date.now()}`, scene);
        potMat.albedoColor = new Color3(0.58, 0.34, 0.24); // Warm chestnut wood / terracotta from image
        potMat.roughness = 0.50;
        potMat.metallic = 0.0;
        m.material = potMat;
        customMats.push(potMat);
      } else if (m.name.includes('primitive1')) {
        // Leaves and stems (Patte)
        const leafMat = new PBRMaterial(`leafMat_${m.name}_${Date.now()}`, scene);
        leafMat.albedoColor = new Color3(0.12, 0.65, 0.18); // Lush, vibrant realistic green
        leafMat.roughness = 0.28; // Natural waxy leaf shine
        leafMat.metallic = 0.02;
        leafMat.emissiveColor = new Color3(0.03, 0.15, 0.04); // Subsurface organic translucency
        m.material = leafMat;
        customMats.push(leafMat);
      }
    });
    return customMats;
  }

  // 2. Dining Table: Warm chestnut wood matching reference image
  if (pLower.includes('table')) {
    meshes.forEach((m) => {
      const isTop = m.name.includes('primitive1');
      const tableMat = new PBRMaterial(`tableMat_${m.name}_${Date.now()}`, scene);
      tableMat.albedoColor = isTop
        ? new Color3(0.58, 0.34, 0.24) // Tabletop: polished warm chestnut wood
        : new Color3(0.52, 0.30, 0.21); // Legs & apron
      tableMat.roughness = isTop ? 0.38 : 0.48;
      tableMat.metallic = 0.0;
      m.material = tableMat;
      customMats.push(tableMat);
    });
    return customMats;
  }

  // 3. Dining Chairs: Warm chestnut wood matching reference image
  if (pLower.includes('chair') && !pLower.includes('armchair')) {
    meshes.forEach((m) => {
      const isSeat = m.name.includes('primitive1');
      const chairMat = new PBRMaterial(`chairMat_${m.name}_${Date.now()}`, scene);
      chairMat.albedoColor = isSeat
        ? new Color3(0.58, 0.34, 0.24)
        : new Color3(0.52, 0.30, 0.21);
      chairMat.roughness = isSeat ? 0.40 : 0.48;
      chairMat.metallic = 0.0;
      m.material = chairMat;
      customMats.push(chairMat);
    });
    return customMats;
  }

  // 4. Cabinet / Bookshelf / Wooden Storage
  if (pLower.includes('cabinet') || pLower.includes('bookshelf')) {
    meshes.forEach((m) => {
      if (m.material && m.material.getClassName?.() === 'PBRMaterial') {
        const mat = m.material as PBRMaterial;
        mat.albedoColor = new Color3(0.56, 0.32, 0.23); // Matching wooden body
        mat.roughness = 0.45;
        mat.metallic = 0.0;
      }
    });
    return customMats;
  }

  // 5. Floor Lamp: warm wood base and warm glowing shade
  if (pLower.includes('lamp')) {
    meshes.forEach((m) => {
      const isShade = m.name.includes('primitive1');
      const lampMat = new PBRMaterial(`lampMat_${m.name}_${Date.now()}`, scene);
      if (isShade) {
        lampMat.albedoColor = new Color3(0.96, 0.92, 0.84); // Warm cream fabric shade
        lampMat.emissiveColor = new Color3(0.35, 0.28, 0.18); // Soft warm lamp glow
        lampMat.roughness = 0.65;
      } else {
        lampMat.albedoColor = new Color3(0.54, 0.30, 0.21); // Warm wooden base
        lampMat.roughness = 0.45;
      }
      lampMat.metallic = 0.0;
      m.material = lampMat;
      customMats.push(lampMat);
    });
    return customMats;
  }

  return customMats;
}

export async function loadProp(
  scene: Scene,
  config: PropItemConfig,
  shadowGen?: ShadowGenerator
): Promise<LoadedPropInstance> {
  // Pistol.glb is in ./assets/, while all modular props and environment models reside in ./assets/models/
  let modelFile = config.modelPath.replace(/^\.?\/?assets\/(models\/)?/, '').replace(/^models\//, '');
  const isDirectAsset = modelFile === 'Pistol.glb' || modelFile.endsWith('/Pistol.glb');
  const rootDir = isDirectAsset ? './assets/' : './assets/models/';

  let result: ISceneLoaderAsyncResult | null = null;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      result = await SceneLoader.ImportMeshAsync(
        '',
        rootDir,
        modelFile,
        scene
      );
      break;
    } catch (err) {
      lastError = err;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 150));
      }
    }
  }

  if (!result) {
    throw lastError || new Error(`Unable to load model: ${rootDir}${modelFile}`);
  }

  const rootMesh = result.meshes[0];
  rootMesh.name = config.name;
  rootMesh.position.copyFrom(config.position);
  rootMesh.rotationQuaternion = null;
  rootMesh.rotation.set(
    config.rotationX ?? 0,
    config.rotationY ?? 0,
    config.rotationZ ?? 0
  );
  if (config.scale !== undefined) rootMesh.scaling.setAll(config.scale);

  // Compute world matrices immediately so obstacle bounding boxes are accurate before first frame
  rootMesh.computeWorldMatrix(true);
  result.meshes.forEach((m) => m.computeWorldMatrix(true));

  // Apply stylized realistic PBR finishes to wooden furniture & plants
  const customMaterials = applyPropMaterialEnhancements(config.modelPath, result.meshes, scene, config.name);

  // If static gun prop, apply titanium/gunmetal tactical finishes matching weapon.ts
  if (config.modelPath.toLowerCase().includes('pistol')) {
    result.meshes.forEach((mesh) => {
      const mat = mesh.material as PBRMaterial;
      if (mat && mat.getClassName?.() === 'PBRMaterial') {
        mat.transparencyMode = 0; // PBRMATERIAL_OPAQUE to eliminate sorting flicker
        if (mat.name === 'LightMetal') {
          mat.albedoColor = new Color3(0.85, 0.88, 0.92);
          mat.metallic = 0.9;
          mat.roughness = 0.22;
        } else if (mat.name === 'Metal') {
          mat.albedoColor = new Color3(0.32, 0.35, 0.40);
          mat.metallic = 0.72;
          mat.roughness = 0.32;
        } else if (mat.name === 'Black') {
          mat.albedoColor = new Color3(0.12, 0.13, 0.15);
          mat.metallic = 0.15;
          mat.roughness = 0.65;
        }
      }
    });
  }

  // Tag obstacle metadata and collision flags for dynamic physics detection
  const isWall =
    config.modelPath.toLowerCase().includes('wall') ||
    (config.name ? config.name.toLowerCase().includes('wall') : false);
  const catalogEntry = ASSET_CATALOG.find(
    (a) => a.modelPath === config.modelPath || a.id === config.name
  );
  const defaultCollidable = catalogEntry ? catalogEntry.hasCollision !== false : true;
  const isCollidable = isWall || (config.hasCollision !== undefined ? config.hasCollision : defaultCollidable);
  rootMesh.metadata = { ...(rootMesh.metadata || {}), isObstacle: isCollidable, isWall };
  for (const mesh of result.meshes) {
    mesh.metadata = { ...(mesh.metadata || {}), isObstacle: isCollidable, isWall };
    if (isCollidable) {
      mesh.checkCollisions = true;
      mesh.isPickable = true;
    }
  }

  // Register in obstacleManager with data-driven physical properties
  let obstacleState: any = null;
  if (isCollidable) {
    const mainMesh = result.meshes.find((m) => m.getTotalVertices() > 0) || rootMesh;
    obstacleState = obstacleManager.registerObstacle(
      rootMesh,
      mainMesh,
      result.meshes,
      {
        name: config.name || config.modelPath,
        modelPath: config.modelPath,
        material: config.material,
        durability: config.durability,
        isDestructible: config.isDestructible,
        isMovable: config.isMovable,
        mass: config.mass,
        isPenetrable: config.isPenetrable,
        penetrationResistance: config.penetrationResistance,
      }
    );
  }

  // Cast shadows on all meshes
  if (shadowGen && config.castShadow !== false) {
    for (const mesh of result.meshes) {
      if (mesh.getTotalVertices() > 0) {
        shadowGen.addShadowCaster(mesh);
      }
    }
  }

  // Animation support for animated GLB props
  const playAnimation = (name: string, loop = true, speed = 1.0) => {
    result.animationGroups.forEach((ag) => ag.stop());
    const ag = result.animationGroups.find((g) => g.name === name);
    if (ag) {
      ag.speedRatio = speed;
      ag.start(loop, speed, ag.from, ag.to);
    }
  };

  const stopAllAnimations = () => {
    result.animationGroups.forEach((ag) => ag.stop());
  };

  // Stop all default auto-started GLB animation groups so static props never jitter/flicker
  stopAllAnimations();

  if (config.animationName) {
    playAnimation(config.animationName, true, config.animationSpeed ?? 1.0);
  }

  // Physics aggregate for bullet and gun collision bounce
  let physicsAgg: PhysicsAggregate | null = null;
  if (isCollidable) {
    physicsAgg = new PhysicsAggregate(
      rootMesh,
      PhysicsShapeType.BOX,
      { mass: 0, restitution: 0.35, friction: 0.5 },
      scene
    );
  }

  const dispose = () => {
    stopAllAnimations();
    if (shadowGen) {
      result.meshes.forEach((m) => shadowGen.removeShadowCaster(m));
    }
    if (obstacleState) {
      obstacleManager.unregisterObstacle(obstacleState.id);
      obstacleState = null;
    }
    if (physicsAgg) {
      physicsAgg.dispose();
      physicsAgg = null;
    }
    customMaterials.forEach((mat) => mat.dispose(true, true));
    result.animationGroups.forEach((ag) => ag.dispose());
    result.meshes.forEach((m) => {
      m.material?.dispose(true, true);
      m.geometry?.dispose();
      m.dispose(false, true);
    });
    result.transformNodes?.forEach((t) => t.dispose());
  };

  return {
    rootNode: rootMesh,
    animationGroups: result.animationGroups,
    playAnimation,
    stopAllAnimations,
    dispose,
  };
}

export async function loadAllProps(
  scene: Scene,
  propsConfig: PropItemConfig[],
  shadowGen?: ShadowGenerator
): Promise<{ disposables: { dispose: () => void }[] }> {
  const disposables: { dispose: () => void }[] = [];

  for (const p of propsConfig) {
    try {
      const propInst = await loadProp(scene, p, shadowGen);
      disposables.push(propInst);
    } catch (err) {
      console.error(`Failed to load prop: ${p.name} (${p.modelPath})`, err);
    }
  }

  return { disposables };
}
