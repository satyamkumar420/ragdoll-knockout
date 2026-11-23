import {
  Scene,
  SceneLoader,
  Vector3,
  Color3,
  StandardMaterial,
  MeshBuilder,
  TransformNode,
  AbstractMesh,
  AnimationGroup,
  Skeleton,
  PBRMaterial,
  AssetContainer,
  type ShadowGenerator,
} from '@babylonjs/core';
import {
  createCharacterMagicFx,
  type MagicController,
  type MagicFxConfig,
} from './core/magicFx';

export interface AttachedSwordInstance {
  root: TransformNode;
  baseScale: number;
  dispose: () => void;
}

export interface CharacterInstance {
  rootNode: TransformNode;
  mainMesh: AbstractMesh;
  skeleton: Skeleton | null;
  animationGroups: AnimationGroup[];
  playAnimation: (animName: string, loop?: boolean, speed?: number) => void;
  playAnimationSequence: (animNames: string[], speed?: number) => void;
  stopAllAnimations: () => void;
  headNode: TransformNode | null;
  attachedSword?: AttachedSwordInstance | null;
  attachedWeapon?: AttachedSwordInstance | null;
  magicController?: MagicController | null;
  currentWeaponPath?: string;
  setWeapon?: (modelPath?: string, options?: { scale?: number; rotation?: Vector3; position?: Vector3 }) => Promise<void>;
  updateWeaponTransform?: (pos?: Vector3, rot?: Vector3, scale?: number) => void;
  setMagicFx?: (fx?: boolean | 'arcane' | 'fire' | 'none' | MagicFxConfig) => void;
  dispose: () => void;
}

export interface CharacterOptions {
  position?: Vector3;
  rotationY?: number;
  scale?: number;
  animationName?: string;
  animationNames?: string[];
  animationSpeed?: number;
  namePrefix?: string;
  shadowGen?: ShadowGenerator;
  swordModelPath?: string;
  weaponModelPath?: string;
  swordScale?: number;
  swordRotation?: Vector3;
  swordPosition?: Vector3;
  magicFx?: boolean | 'arcane' | 'fire' | 'none' | MagicFxConfig;
}

// Stylized Yellow Cartoon Material (matches reference screenshots)
export function createCartoonYellowMaterial(scene: Scene, name = 'cartoonYellowMat'): StandardMaterial {
  const mat = new StandardMaterial(name, scene);
  mat.diffuseColor = new Color3(0.97, 0.77, 0.24); // Vibrant cartoon yellow
  mat.specularColor = new Color3(0.12, 0.12, 0.12); // Soft matte/toon specular
  mat.emissiveColor = new Color3(0.08, 0.06, 0.02); // Subtle warm fill
  return mat;
}

// Googly Eyes (cute, properly proportioned cartoon eyes)
export function attachGooglyEyes(headNode: TransformNode, scene: Scene): { root: TransformNode; dispose: () => void } {
  const eyesRoot = new TransformNode('googlyEyesRoot', scene);
  eyesRoot.parent = headNode;
  // Positioned slightly higher and recessed deeper inward into the head surface
  eyesRoot.position = new Vector3(0, 0.072, 0.084);

  const whiteMat = new StandardMaterial('eyeWhiteMat', scene);
  whiteMat.diffuseColor = new Color3(0.98, 0.98, 0.98);
  whiteMat.specularColor = new Color3(0.3, 0.3, 0.3);

  const pupilMat = new StandardMaterial('pupilBlackMat', scene);
  pupilMat.diffuseColor = new Color3(0.04, 0.04, 0.04);
  pupilMat.specularColor = new Color3(0.9, 0.9, 0.9);
  pupilMat.specularPower = 32;

  // Larger cartoon button googly eyes set deeper into the face
  const eyeMeshes: AbstractMesh[] = [];
  const eyeOffsets = [-0.036, 0.036];
  eyeOffsets.forEach((offsetX, i) => {
    // Eyeball: increased diameter from 0.050 to 0.068, slightly flattened depth
    const eyeball = MeshBuilder.CreateSphere(`eyeball_${i}`, { diameter: 0.068, segments: 16 }, scene);
    eyeball.position = new Vector3(offsetX, 0, 0);
    eyeball.scaling.set(1.0, 1.0, 0.78);
    eyeball.material = whiteMat;
    eyeball.parent = eyesRoot;
    eyeMeshes.push(eyeball);

    // Pupil: increased diameter from 0.024 to 0.033
    const pupil = MeshBuilder.CreateSphere(`pupil_${i}`, { diameter: 0.033, segments: 12 }, scene);
    pupil.position = new Vector3(offsetX, 0, 0.023);
    pupil.scaling.set(1.0, 1.0, 0.78);
    pupil.material = pupilMat;
    pupil.parent = eyesRoot;
    eyeMeshes.push(pupil);
  });

  const dispose = () => {
    eyeMeshes.forEach((m) => m.dispose(false, true));
    whiteMat.dispose();
    pupilMat.dispose();
    eyesRoot.dispose(false, true);
  };

  return { root: eyesRoot, dispose };
}

/**
 * Calculates default calibrated weapon position offset based on weapon type and animation.
 * Accurately aligns pistols for Pistol_Aim_Down (Level 18 left), Pistol_Aim_Up (Level 18 right),
 * and Pistol_Aim_Neutral (Level 17 / standard aim).
 */
export function getDefaultWeaponPosition(modelPath?: string, animNames?: string[]): Vector3 {
  const isPistol = (modelPath?.toLowerCase().includes('pistol') || modelPath?.toLowerCase().includes('gun')) ||
    (animNames?.some((a) => a.toLowerCase().includes('pistol') || a.toLowerCase().includes('gun')));

  if (isPistol) {
    const animStr = animNames ? animNames.join(' ').toLowerCase() : '';
    if (animStr.includes('aim_down')) {
      // Level 18 Left Target (High Sniper) calibrated position
      return new Vector3(-0.06, 0.03, -0.045);
    }
    if (animStr.includes('aim_up')) {
      // Level 18 Right Target (Ground Gunner) calibrated position
      return new Vector3(-0.04, 0.1, -0.085);
    }
    // Level 17 (Convoy Sniper) / standard neutral pistol grip
    return new Vector3(0.005, 0.05, -0.075);
  }

  // Swords, axes, and other hand attachments
  return new Vector3(0.015, 0.02, 0.02);
}

export async function attachSwordModel(
  handNode: TransformNode,
  swordModelPath: string,
  scene: Scene,
  options: {
    scale?: number;
    rotation?: Vector3;
    position?: Vector3;
    shadowGen?: ShadowGenerator;
    animationName?: string;
    animationNames?: string[];
  } = {}
): Promise<AttachedSwordInstance> {
  let rootDir = './assets/models/';
  let modelFile = swordModelPath.replace(/^\.?\/?assets\/(models\/)?/, '').replace(/^\.?\/?/, '');
  if (modelFile.toLowerCase().includes('pistol')) {
    rootDir = './assets/';
    modelFile = 'Pistol.glb';
  }

  const result = await SceneLoader.ImportMeshAsync('', rootDir, modelFile, scene);
  const swordContainer = new TransformNode(`swordContainer_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`, scene);
  swordContainer.parent = handNode;

  const rootMesh = result.meshes[0];
  rootMesh.parent = swordContainer;
  rootMesh.rotationQuaternion = null;

  const isPistol = modelFile.toLowerCase().includes('pistol') || modelFile.toLowerCase().includes('gun');
  const isSword2 = modelFile.toLowerCase().includes('sword_2');
  const isAxe = modelFile.toLowerCase().includes('axe');

  let baseScale = 0.85;
  if (isPistol) {
    // Pistol.glb: native scale ~0.286m along Z (barrel), grip extends down -Y, slide up +Y.
    baseScale = 1.05;
    // In DEF-hand.R bone space:
    // +Y is along forearm pointing forward towards target (aim vector).
    // +Z is top of fist (thumb/index), -Z is bottom of fist (pinky).
    // Euler (PI/2, 0, 0) with rootMesh.rotationQuaternion = null maps:
    //   Pistol Barrel (+Z) -> forward along aim vector
    //   Pistol Slide (+Y)  -> top of hand
    //   Pistol Grip (-Y)   -> seated securely inside palm
    rootMesh.rotation.set(Math.PI / 2, 0, 0);
    rootMesh.position.set(0, 0, 0);

    // Apply sleek tactical gunmetal PBR finish matching weapon.ts
    result.meshes.forEach((mesh) => {
      const mat = mesh.material as PBRMaterial;
      if (mat && mat.getClassName?.() === 'PBRMaterial') {
        mat.albedoColor = new Color3(0.12, 0.13, 0.15);
        mat.metallic = 0.82;
        mat.roughness = 0.38;
      }
    });
  } else if (isAxe) {
    // axe.glb native scale is ~1.71m (handle Y: -0.32 to +0.54, head Y: +0.54 to +1.40).
    // Native origin (Y=0) is near bottom tip. Setting rootMesh Y offset to -0.20 centers the grip in fist.
    baseScale = 0.38;
    rootMesh.position.set(0, -0.20, 0);
    rootMesh.rotation.set(Math.PI / 2, 0, 0);
  } else if (isSword2) {
    // sword_2.glb: native scale ~3.8m, blade extends along -Z, handle center ~ -0.85m
    baseScale = 0.22;
    rootMesh.position.set(0, 0, 0);
    rootMesh.rotation.set(0, Math.PI, 0);
  } else {
    // sword.glb: native scale ~1.0m, blade extends along +Y, handle center ~ 0.0m
    baseScale = 0.85;
    rootMesh.position.set(0, 0, 0);
    rootMesh.rotation.set(Math.PI / 2, 0, 0);
  }

  const userScale = options.scale ?? 1.0;
  swordContainer.scaling.setAll(baseScale * userScale);

  // swordContainer position and rotation in DEF-hand.R coordinate space
  const animList = options.animationNames || (options.animationName ? [options.animationName] : []);
  const defPosition = getDefaultWeaponPosition(modelFile, animList);
  swordContainer.position.copyFrom(options.position ?? defPosition);
  swordContainer.rotation.copyFrom(options.rotation ?? new Vector3(0, 0, 0));

  result.meshes.forEach((m) => {
    if (options.shadowGen && m.getTotalVertices() > 0) {
      options.shadowGen.addShadowCaster(m);
    }
  });

  const dispose = () => {
    try {
      if (options.shadowGen) {
        result.meshes.forEach((m) => options.shadowGen?.removeShadowCaster(m));
      }
      swordContainer.dispose(false, true);
      result.animationGroups?.forEach((ag) => ag.dispose());
      result.meshes.forEach((m) => {
        m.material?.dispose(true, true);
        m.geometry?.dispose();
        m.dispose(false, true);
      });
      result.transformNodes?.forEach((t) => t.dispose());
    } catch (err) {
      console.warn('Error disposing sword model', err);
    }
  };

  return { root: swordContainer, baseScale, dispose };
}

let characterAssetContainer: AssetContainer | null = null;
let characterContainerLoadingPromise: Promise<AssetContainer> | null = null;

export async function getCharacterAssetContainer(scene: Scene): Promise<AssetContainer> {
  if (characterAssetContainer && characterAssetContainer.scene === scene) {
    return characterAssetContainer;
  }
  if (!characterContainerLoadingPromise || (characterAssetContainer && characterAssetContainer.scene !== scene)) {
    characterContainerLoadingPromise = SceneLoader.LoadAssetContainerAsync(
      './assets/',
      'AnimationLibrary_Godot_Standard.glb',
      scene
    ).then((container) => {
      characterAssetContainer = container;
      return container;
    });
  }
  return characterContainerLoadingPromise;
}

export async function loadCharacter(scene: Scene, options: CharacterOptions = {}): Promise<CharacterInstance> {
  const prefix = options.namePrefix || `char_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const spawnPos = options.position || new Vector3(0, 0, 0);
  const rotY = options.rotationY ?? 0;
  const userScale = options.scale ?? 1.0;

  // On mobile portrait, boost character scale by 1.22x so ragdolls and animations are big & readable
  const isMobilePortrait = (scene.getEngine().getRenderWidth() / (scene.getEngine().getRenderHeight() || 1)) < 1.0;
  const scale = userScale * (isMobilePortrait ? 1.22 : 1.0);

  const container = await getCharacterAssetContainer(scene);
  const instantiated = container.instantiateModelsToScene(
    (name) => `${prefix}_${name}`,
    false,
    { doNotInstantiate: true }
  );

  const rootMesh = (instantiated.rootNodes[0] || instantiated.rootNodes.find((r) => r.name.includes('root'))) as AbstractMesh;
  rootMesh.name = `${prefix}_root`;
  rootMesh.position.copyFrom(spawnPos);
  rootMesh.rotationQuaternion = null;
  rootMesh.rotation.y = rotY;
  rootMesh.scaling.setAll(scale);

  const childMeshes = (rootMesh.getChildMeshes ? rootMesh.getChildMeshes(false) : []) as AbstractMesh[];
  const allMeshes = [rootMesh, ...childMeshes];
  const childTransformNodes = (rootMesh.getChildTransformNodes ? rootMesh.getChildTransformNodes(false) : []) as TransformNode[];

  // Apply cartoon yellow material to Mannequin mesh
  const yellowMat = createCartoonYellowMaterial(scene, `${prefix}_yellowMat`);
  const mannequinMesh = allMeshes.find((m) => m.name.toLowerCase().includes('mannequin')) || childMeshes[0] || rootMesh;
  if (mannequinMesh) {
    mannequinMesh.material = yellowMat;
    if (options.shadowGen) {
      options.shadowGen.addShadowCaster(mannequinMesh);
    }
  }

  // Find head bone / transform node
  let headNode = childTransformNodes.find((t) => t.name.includes('DEF-head') || t.name.includes('head')) || null;
  if (!headNode && instantiated.skeletons.length > 0) {
    const headBone = instantiated.skeletons[0].bones.find((b) => b.name === 'DEF-head' || b.name.includes('head'));
    if (headBone) {
      headNode = headBone.getTransformNode() as TransformNode;
    }
  }

  let googlyEyes: { root: TransformNode; dispose: () => void } | null = null;
  if (headNode) {
    googlyEyes = attachGooglyEyes(headNode, scene);
  }

  // Find hand bone / transform node for weapon attachment
  let handNode = childTransformNodes.find((t) => t.name.includes('DEF-hand.R') || t.name.includes('hand.R') || t.name.includes('hand_r')) || null;
  if (!handNode && instantiated.skeletons.length > 0) {
    const handBone = instantiated.skeletons[0].bones.find((b) => b.name === 'DEF-hand.R' || b.name.includes('hand.R') || b.name.includes('hand_r'));
    if (handBone) {
      handNode = handBone.getTransformNode() as TransformNode;
    }
  }

  let attachedSword: AttachedSwordInstance | null = null;
  let currentWeaponPath: string | undefined = undefined;

  let currentAnimNames: string[] = options.animationNames && options.animationNames.length > 0
    ? [...options.animationNames]
    : (options.animationName ? [options.animationName] : []);

  const isPistolAnim = currentAnimNames.some(
    (a) => a.toLowerCase().includes('pistol') || a.toLowerCase().includes('gun')
  );
  const isSwordAnim = currentAnimNames.some(
    (a) => a.toLowerCase().includes('sword')
  );

  const rawModelChoice = options.weaponModelPath || options.swordModelPath;
  const initialWeaponPath = (rawModelChoice && rawModelChoice !== 'auto')
    ? (rawModelChoice === 'none' ? undefined : rawModelChoice)
    : (isPistolAnim ? 'Pistol.glb' : (isSwordAnim ? 'swords/sword.glb' : undefined));

  const attachWeaponInternal = async (
    modelPath: string,
    wOptions?: { scale?: number; rotation?: Vector3; position?: Vector3 }
  ): Promise<AttachedSwordInstance | null> => {
    if (!handNode || !modelPath || modelPath === 'none') return null;
    return await attachSwordModel(handNode, modelPath, scene, {
      scale: wOptions?.scale ?? options.swordScale,
      rotation: wOptions?.rotation ?? options.swordRotation,
      position: wOptions?.position ?? options.swordPosition,
      shadowGen: options.shadowGen,
      animationName: options.animationName,
      animationNames: currentAnimNames,
    });
  };

  if (handNode && initialWeaponPath && initialWeaponPath !== 'none') {
    try {
      attachedSword = await attachWeaponInternal(initialWeaponPath);
      currentWeaponPath = initialWeaponPath;
    } catch (err) {
      console.warn('Failed to attach weapon to character hand:', err);
    }
  }

  let sequenceTimeout: number | null = null;
  let sequenceIndex = 0;
  let activeSequence: string[] = [];

  const findAnimGroup = (animName: string): AnimationGroup | undefined => {
    const cleanQuery = animName.toLowerCase();
    return instantiated.animationGroups.find((ag) => {
      const cleanAg = ag.name.toLowerCase();
      return (
        cleanAg === cleanQuery ||
        cleanAg.endsWith(`_${cleanQuery}`) ||
        cleanAg.replace(/^[a-z0-9_-]+_/, '') === cleanQuery
      );
    });
  };

  const clearSequenceTimers = (): void => {
    if (sequenceTimeout !== null) {
      window.clearTimeout(sequenceTimeout);
      sequenceTimeout = null;
    }
    instantiated.animationGroups.forEach((ag) => {
      ag.onAnimationGroupEndObservable.clear();
    });
  };

  const stopSequence = (): void => {
    activeSequence = [];
    clearSequenceTimers();
  };

  const playAnimation = (animName: string, loop = true, speed = 1.0): void => {
    currentAnimNames = [animName];
    stopSequence();
    instantiated.animationGroups.forEach((ag) => ag.stop());
    const targetGroup = findAnimGroup(animName);
    if (targetGroup) {
      targetGroup.speedRatio = speed;
      targetGroup.start(loop, speed, targetGroup.from, targetGroup.to);
    }
  };

  const playAnimationSequence = (animNames: string[], speed = 1.0): void => {
    currentAnimNames = [...animNames];
    stopSequence();
    const validNames = animNames.filter((n) => findAnimGroup(n) !== undefined);
    if (validNames.length === 0) return;
    if (validNames.length === 1) {
      playAnimation(validNames[0], true, speed);
      return;
    }

    activeSequence = [...validNames];
    sequenceIndex = 0;

    const playNext = () => {
      clearSequenceTimers();
      if (activeSequence.length === 0) return;
      const nextName = activeSequence[sequenceIndex % activeSequence.length];
      sequenceIndex++;

      instantiated.animationGroups.forEach((ag) => ag.stop());
      const ag = findAnimGroup(nextName);
      if (!ag) {
        sequenceTimeout = window.setTimeout(playNext, 500);
        return;
      }

      ag.speedRatio = speed;
      const isLoop = nextName.toLowerCase().includes('loop') || nextName.toLowerCase().includes('idle');
      if (isLoop) {
        ag.start(true, speed, ag.from, ag.to);
        sequenceTimeout = window.setTimeout(playNext, 3800);
      } else {
        ag.start(false, speed, ag.from, ag.to);
        const obs = ag.onAnimationGroupEndObservable.addOnce(() => {
          ag.onAnimationGroupEndObservable.remove(obs);
          if (activeSequence.length > 0) {
            playNext();
          }
        });
      }
    };

    playNext();
  };

  const stopAllAnimations = (): void => {
    stopSequence();
    instantiated.animationGroups.forEach((ag) => ag.stop());
  };

  // Start initial animation(s) if specified
  if (options.animationNames && options.animationNames.length > 1) {
    playAnimationSequence(options.animationNames, options.animationSpeed ?? 1.0);
  } else if (options.animationNames && options.animationNames.length === 1) {
    playAnimation(options.animationNames[0], true, options.animationSpeed ?? 1.0);
  } else if (options.animationName) {
    playAnimation(options.animationName, true, options.animationSpeed ?? 1.0);
  }

  let magicController: MagicController | null = null;
  const isSpellAnim = (options.animationNames || [options.animationName || '']).some(
    (a) => a.toLowerCase().includes('spell') || a.toLowerCase().includes('magic')
  );

  const dispose = (): void => {
    stopAllAnimations();
    if (googlyEyes) {
      googlyEyes.dispose();
      googlyEyes = null;
    }
    if (magicController) {
      magicController.dispose();
      magicController = null;
    }
    if (attachedSword) {
      attachedSword.dispose();
      attachedSword = null;
    }
    if (options.shadowGen && mannequinMesh) {
      options.shadowGen.removeShadowCaster(mannequinMesh);
    }
    yellowMat.dispose(true, true);
    instantiated.animationGroups.forEach((ag) => ag.dispose());
    allMeshes.forEach((m) => {
      m.material?.dispose(true, true);
      m.dispose(false, true);
    });
    instantiated.skeletons.forEach((s) => s.dispose());
    childTransformNodes.forEach((t) => t.dispose());
    instantiated.rootNodes.forEach((r) => r.dispose(false, true));
  };

  const updateWeaponTransform = (pos?: Vector3, rot?: Vector3, scale?: number): void => {
    const w = instance.attachedSword || instance.attachedWeapon;
    if (!w?.root) return;
    if (pos) w.root.position.copyFrom(pos);
    if (rot) w.root.rotation.copyFrom(rot);
    if (scale !== undefined && scale > 0) {
      w.root.scaling.setAll((w.baseScale ?? 1.0) * scale);
    }
  };

  const setWeapon = async (
    modelPath?: string,
    wOptions?: { scale?: number; rotation?: Vector3; position?: Vector3 }
  ): Promise<void> => {
    const isPistol = currentAnimNames.some(
      (a) => a.toLowerCase().includes('pistol') || a.toLowerCase().includes('gun')
    );
    const isSword = currentAnimNames.some(
      (a) => a.toLowerCase().includes('sword')
    );
    const targetPath = (!modelPath || modelPath === 'auto')
      ? (isPistol ? 'Pistol.glb' : (isSword ? 'swords/sword.glb' : undefined))
      : (modelPath === 'none' ? undefined : modelPath);

    if (currentWeaponPath === targetPath && (instance.attachedSword || instance.attachedWeapon)) {
      updateWeaponTransform(wOptions?.position, wOptions?.rotation, wOptions?.scale);
      return;
    }

    if (instance.attachedSword) {
      instance.attachedSword.dispose();
      instance.attachedSword = null;
      instance.attachedWeapon = null;
    }
    currentWeaponPath = targetPath;
    instance.currentWeaponPath = targetPath;

    if (!handNode || !targetPath) {
      return;
    }

    try {
      const newAttached = await attachWeaponInternal(targetPath, wOptions);
      instance.attachedSword = newAttached;
      instance.attachedWeapon = newAttached;
    } catch (err) {
      console.warn('Failed to update character weapon:', err);
    }
  };

  let currentMagicFxSetting: unknown = options.magicFx;

  const setMagicFx = (fx?: boolean | 'arcane' | 'fire' | 'none' | MagicFxConfig): void => {
    const currentSerialized = JSON.stringify(currentMagicFxSetting ?? 'none');
    const newSerialized = JSON.stringify(fx ?? 'none');
    if (currentSerialized === newSerialized) return;

    if (magicController) {
      magicController.dispose();
      magicController = null;
      instance.magicController = null;
    }
    currentMagicFxSetting = fx;
    if (!fx || fx === 'none') return;
    const magicCfg: MagicFxConfig = typeof fx === 'object'
      ? fx
      : (fx === 'fire'
          ? { color: [1.0, 0.45, 0.08] }
          : (fx === 'arcane' ? { color: [0.18, 0.85, 1.0] } : {}));
    magicController = createCharacterMagicFx(instance, scene, magicCfg);
    instance.magicController = magicController;
  };

  const instance: CharacterInstance = {
    rootNode: rootMesh as unknown as TransformNode,
    mainMesh: mannequinMesh || rootMesh,
    skeleton: instantiated.skeletons[0] || null,
    animationGroups: instantiated.animationGroups,
    playAnimation,
    playAnimationSequence,
    stopAllAnimations,
    headNode,
    attachedSword,
    attachedWeapon: attachedSword,
    magicController: null,
    currentWeaponPath,
    setWeapon,
    updateWeaponTransform,
    setMagicFx,
    dispose,
  };

  if (options.magicFx || isSpellAnim) {
    const magicCfg: MagicFxConfig = typeof options.magicFx === 'object'
      ? options.magicFx
      : (options.magicFx === 'fire'
          ? { color: [1.0, 0.45, 0.08] }
          : (options.magicFx === 'arcane' ? { color: [0.18, 0.85, 1.0] } : {}));
    magicController = createCharacterMagicFx(instance, scene, magicCfg);
    instance.magicController = magicController;
  }

  return instance;
}
