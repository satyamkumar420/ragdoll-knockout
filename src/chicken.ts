import {
  Scene,
  Vector3,
  TransformNode,
  Color3,
  MeshBuilder,
  StandardMaterial,
  type AbstractMesh,
  type ShadowGenerator,
} from '@babylonjs/core';
import { playChickenSquawk, playChickenCluck } from './audio';
import { spawnComicHitEffect } from './ragdoll';
import { obstacleManager } from './core/obstacleManager';

export type ChickenVariant = 'white' | 'yellow' | 'green';

export interface ChickenVariantPalette {
  name: string;
  body: Color3;
  comb: Color3;
  beakFeet: Color3;
  eyes: Color3;
  previewHex: {
    body: string;
    comb: string;
    beakFeet: string;
  };
}

export const CHICKEN_VARIANTS: Record<ChickenVariant, ChickenVariantPalette> = {
  white: {
    name: 'Snow White Rooster',
    body: new Color3(0.98, 0.99, 1.0),      // Pure silky white feathers
    comb: new Color3(0.92, 0.11, 0.14),     // Vibrant scarlet red comb & wattles
    beakFeet: new Color3(1.0, 0.65, 0.12), // Rich warm golden-orange beak & legs
    eyes: new Color3(0.06, 0.06, 0.06),    // Glossy deep-black eyes
    previewHex: {
      body: '#f9faff',
      comb: '#eb1c24',
      beakFeet: '#ffa61f',
    },
  },
  yellow: {
    name: 'Classic Yellow',
    body: new Color3(1.0, 0.84, 0.30),     // Cheerful chick yellow
    comb: new Color3(1.0, 0.30, 0.32),     // Coral red comb
    beakFeet: new Color3(1.0, 0.55, 0.20), // Warm orange beak & feet
    eyes: new Color3(0.06, 0.06, 0.06),
    previewHex: {
      body: '#ffd64d',
      comb: '#ff4d52',
      beakFeet: '#ff8c33',
    },
  },
  green: {
    name: 'Forest Green',
    body: new Color3(0.38, 0.82, 0.26),    // Vibrant meadow green
    comb: new Color3(0.58, 0.34, 0.22),    // Earth brown comb
    beakFeet: new Color3(0.95, 0.90, 0.78),
    eyes: new Color3(0.06, 0.06, 0.06),
    previewHex: {
      body: '#61d142',
      comb: '#945738',
      beakFeet: '#f2e6c7',
    },
  },
};

export type ChickenAnimationName =
  | 'idle'
  | 'walk'
  | 'run'
  | 'jump'
  | 'fall'
  | 'beak_speak'
  | 'blink'
  | 'butt_slide'
  | 'butt_slide_lean.L'
  | 'butt_slide_lean.R'
  | 'walk_lean.L'
  | 'walk_lean.R'
  | 'walk_strafe.L'
  | 'walk_strafe.R';

export type ChickenBehaviorMode = 'sit' | 'roam' | 'run';

export interface ChickenController {
  rootNode: TransformNode;
  mainMesh: AbstractMesh;
  allMeshes: AbstractMesh[];
  isDefeated: boolean;
  behaviorMode: ChickenBehaviorMode;
  variant: ChickenVariant;
  setVariant: (variant: ChickenVariant) => void;
  playAnimation: (name: ChickenAnimationName | string, loop?: boolean, onEnd?: () => void) => void;
  playAnimationSequence?: (names: (ChickenAnimationName | string)[]) => void;
  setFloorY?: (y: number) => void;
  triggerHit: (hitPoint: Vector3, shootDirection: Vector3) => void;
  triggerNearShot: () => void;
  dispose: () => void;
}

export interface ChickenOptions {
  position?: Vector3 | [number, number, number];
  rotationY?: number;
  scale?: number;
  shadowGen?: ShadowGenerator;
  initialAnimation?: ChickenAnimationName | string;
  initialAnimations?: (ChickenAnimationName | string)[];
  behaviorMode?: ChickenBehaviorMode;
  variant?: ChickenVariant;
  roamRange?: { minX: number; maxX: number };
  isEditor?: boolean;
}

// Backward-compatibility aliases
export type PugAnimationName = ChickenAnimationName | string;
export type PugBehaviorMode = ChickenBehaviorMode;
export type PugController = ChickenController;
export type PugOptions = ChickenOptions;

const LEGACY_ANIM_MAP: Record<string, ChickenAnimationName> = {
  Idle: 'idle',
  Idle_2: 'idle',
  Idle_2_HeadLow: 'idle',
  Eating: 'idle',
  Walk: 'walk',
  Run: 'run',
  Run_Jump: 'jump',
  Attack: 'idle',
  HitReact_Left: 'walk_lean.L',
  HitReact_Right: 'walk_lean.R',
  Death: 'fall',
};

export function normalizeChickenAnimName(name: string): ChickenAnimationName {
  if (LEGACY_ANIM_MAP[name]) return LEGACY_ANIM_MAP[name];
  return (name || 'idle') as ChickenAnimationName;
}

function getShortestAngleDiff(current: number, target: number): number {
  let diff = (target - current) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

export function applyChickenVariant(_mesh: AbstractMesh, _variant: ChickenVariant = 'white'): void {
  // Managed via procedural materials
}

interface ActiveFeather {
  mesh: AbstractMesh;
  mat: StandardMaterial;
  pos: Vector3;
  velY: number;
  wobblePhase: number;
  wobbleSpeed: number;
  rotSpeed: number;
  floorY: number;
  life: number;
  isGrounded: boolean;
  fadeLife: number;
}

/**
 * Loads a procedural 3D cartoon chicken that turns into a delicious Cooked Roast Chicken
 * upon being shot, scattering feathers everywhere just like in comic games!
 */
export async function loadChicken(scene: Scene, options: ChickenOptions = {}): Promise<ChickenController> {
  const spawnPos = options.position
    ? (options.position instanceof Vector3
        ? options.position
        : Array.isArray(options.position)
          ? new Vector3(options.position[0], options.position[1], options.position[2])
          : new Vector3(
              (options.position as { x: number; y: number; z: number }).x,
              (options.position as { x: number; y: number; z: number }).y,
              (options.position as { x: number; y: number; z: number }).z
            ))
    : new Vector3(-1.3, 0, 0.4);

  const isMobile = (scene.getEngine().getRenderWidth() / (scene.getEngine().getRenderHeight() || 1)) < 1.0;
  const baseScale = (options.scale ?? 0.50) * (isMobile ? 1.25 : 1.0);
  const behaviorMode: ChickenBehaviorMode = options.behaviorMode ?? 'sit';
  let currentVariant: ChickenVariant = (!options.variant || options.variant === 'yellow') ? 'white' : options.variant;

  const root = new TransformNode(`chickenRoot_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`, scene);
  root.position.copyFrom(spawnPos);

  const rawRotY = options.rotationY ?? (behaviorMode === 'sit' ? -Math.PI * 0.25 : Math.PI);
  root.rotation.y = rawRotY;

  const scaleNode = new TransformNode('chickenScaleNode', scene);
  scaleNode.parent = root;
  scaleNode.scaling.setAll(baseScale * 1.55);

  const allMeshes: AbstractMesh[] = [];
  const allMaterials: StandardMaterial[] = [];

  const createMaterial = (name: string, color: Color3, specular = 0.2, specPower = 32): StandardMaterial => {
    const mat = new StandardMaterial(`${name}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`, scene);
    mat.diffuseColor = color.clone();
    mat.specularColor = new Color3(specular, specular, specular);
    mat.specularPower = specPower;
    mat.ambientColor = new Color3(0.32, 0.32, 0.32);
    allMaterials.push(mat);
    return mat;
  };

  const palette = CHICKEN_VARIANTS[currentVariant] || CHICKEN_VARIANTS.white;
  const bodyMat = createMaterial('chicken_bodyMat', palette.body, 0.20, 32);
  const combMat = createMaterial('chicken_combMat', palette.comb, 0.35, 48);
  const beakFeetMat = createMaterial('chicken_beakFeetMat', palette.beakFeet, 0.35, 48);
  const eyePupilMat = createMaterial('chicken_eyePupilMat', palette.eyes, 0.9, 128);
  const eyeRingMat = createMaterial('chicken_eyeRingMat', new Color3(0.92, 0.36, 0.14), 0.3, 32);
  const eyeHighlightMat = createMaterial('chicken_eyeSpecMat', new Color3(1, 1, 1), 1.0, 128);

  // --- 1. LIVE CHICKEN GROUP ---
  const liveGroup = new TransformNode('chicken_liveGroup', scene);
  liveGroup.parent = scaleNode;

  const bodyPivot = new TransformNode('chicken_bodyPivot', scene);
  bodyPivot.parent = liveGroup;
  const baseBodyY = 0.36;
  bodyPivot.position.set(0, baseBodyY, 0);

  // Body & Chest
  const bodyMesh = MeshBuilder.CreateSphere('chicken_mainBody', {
    diameterX: 0.54,
    diameterY: 0.58,
    diameterZ: 0.66,
    segments: 18,
  }, scene);
  bodyMesh.position.set(0, 0, 0.02);
  bodyMesh.parent = bodyPivot;
  bodyMesh.material = bodyMat;
  allMeshes.push(bodyMesh);

  const chestMesh = MeshBuilder.CreateSphere('chicken_chest', {
    diameterX: 0.46,
    diameterY: 0.50,
    diameterZ: 0.46,
    segments: 18,
  }, scene);
  chestMesh.position.set(0, 0.07, -0.14);
  chestMesh.parent = bodyPivot;
  chestMesh.material = bodyMat;
  allMeshes.push(chestMesh);

  // Neck & Head (Slender, Proud & Lengthened)
  const neckPivot = new TransformNode('chicken_neckPivot', scene);
  neckPivot.parent = bodyPivot;
  neckPivot.position.set(0, 0.20, -0.12);
  neckPivot.rotation.x = 0.12;

  const neckMesh = MeshBuilder.CreateCylinder('chicken_neck', {
    diameterTop: 0.17,
    diameterBottom: 0.27,
    height: 0.33,
    tessellation: 24,
  }, scene);
  neckMesh.position.set(0, 0.14, -0.015);
  neckMesh.parent = neckPivot;
  neckMesh.material = bodyMat;
  allMeshes.push(neckMesh);

  const headNode = new TransformNode('chicken_headNode', scene);
  headNode.parent = neckPivot;
  const baseHeadY = 0.32;
  const baseHeadZ = -0.025;
  headNode.position.set(0, baseHeadY, baseHeadZ);

  const headMesh = MeshBuilder.CreateSphere('chicken_head', {
    diameterX: 0.26,
    diameterY: 0.30,
    diameterZ: 0.31,
    segments: 18,
  }, scene);
  headMesh.parent = headNode;
  headMesh.material = bodyMat;
  allMeshes.push(headMesh);

  // Crown Comb (Embedded in skull)
  const combNode = new TransformNode('chicken_combNode', scene);
  combNode.parent = headNode;
  combNode.position.set(0, 0.08, 0.01);

  const combBaseMesh = MeshBuilder.CreateBox('chicken_combBase', {
    width: 0.048,
    height: 0.12,
    depth: 0.28,
  }, scene);
  combBaseMesh.position.set(0, 0.04, 0);
  combBaseMesh.parent = combNode;
  combBaseMesh.material = combMat;
  allMeshes.push(combBaseMesh);

  const combPeaks = [
    { z: -0.13, y: 0.03, sx: 0.05, sy: 0.12, sz: 0.08 },
    { z: -0.07, y: 0.07, sx: 0.055, sy: 0.18, sz: 0.11 },
    { z: 0.00, y: 0.10, sx: 0.06, sy: 0.22, sz: 0.13 },
    { z: 0.07, y: 0.08, sx: 0.055, sy: 0.18, sz: 0.11 },
    { z: 0.13, y: 0.04, sx: 0.05, sy: 0.12, sz: 0.08 },
  ];
  combPeaks.forEach((p, idx) => {
    const peak = MeshBuilder.CreateSphere(`chicken_combPeak_${idx}`, {
      diameterX: p.sx,
      diameterY: p.sy,
      diameterZ: p.sz,
      segments: 12,
    }, scene);
    peak.position.set(0, p.y, p.z);
    peak.parent = combNode;
    peak.material = combMat;
    allMeshes.push(peak);
  });

  // Beak & Wattles
  const beakMesh = MeshBuilder.CreateCylinder('chicken_beak', {
    diameterTop: 0,
    diameterBottom: 0.13,
    height: 0.20,
    tessellation: 12,
  }, scene);
  beakMesh.rotation.x = -Math.PI * 0.54;
  beakMesh.position.set(0, -0.02, -0.22);
  beakMesh.parent = headNode;
  beakMesh.material = beakFeetMat;
  allMeshes.push(beakMesh);

  [-0.04, 0.04].forEach((xSide, idx) => {
    const wattle = MeshBuilder.CreateSphere(`chicken_wattle_${idx}`, {
      diameterX: 0.055,
      diameterY: 0.17,
      diameterZ: 0.10,
      segments: 12,
    }, scene);
    wattle.position.set(xSide, -0.13, -0.11);
    wattle.parent = headNode;
    wattle.material = combMat;
    allMeshes.push(wattle);
  });

  // Eyes
  [-0.12, 0.12].forEach((xSide, idx) => {
    const eyeRing = MeshBuilder.CreateSphere(`chicken_eyeRing_${idx}`, {
      diameterX: 0.02,
      diameterY: 0.08,
      diameterZ: 0.08,
      segments: 12,
    }, scene);
    eyeRing.position.set(xSide * 1.05, 0.04, -0.07);
    eyeRing.parent = headNode;
    eyeRing.material = eyeRingMat;
    allMeshes.push(eyeRing);

    const eye = MeshBuilder.CreateSphere(`chicken_eye_${idx}`, {
      diameterX: 0.022,
      diameterY: 0.065,
      diameterZ: 0.065,
      segments: 12,
    }, scene);
    eye.position.set(xSide * 1.08, 0.04, -0.07);
    eye.parent = headNode;
    eye.material = eyePupilMat;
    allMeshes.push(eye);

    const highlight = MeshBuilder.CreateSphere(`chicken_eyeSpec_${idx}`, {
      diameterX: 0.014,
      diameterY: 0.022,
      diameterZ: 0.022,
      segments: 8,
    }, scene);
    highlight.position.set(xSide * 1.09, 0.055, -0.085);
    highlight.parent = headNode;
    highlight.material = eyeHighlightMat;
    allMeshes.push(highlight);
  });

  // Layered Wings
  const buildLayeredWing = (isLeft: boolean) => {
    const xMult = isLeft ? 1 : -1;
    const namePrefix = isLeft ? 'L' : 'R';

    const wingPivot = new TransformNode(`chicken_wingPivot_${namePrefix}`, scene);
    wingPivot.parent = bodyPivot;
    wingPivot.position.set(xMult * 0.24, 0.08, -0.04);

    const covert = MeshBuilder.CreateSphere(`chicken_wingCovert_${namePrefix}`, {
      diameterX: 0.065,
      diameterY: 0.32,
      diameterZ: 0.46,
      segments: 14,
    }, scene);
    covert.position.set(xMult * 0.02, -0.04, 0.05);
    covert.rotation.x = 0.22;
    covert.rotation.y = xMult * -0.16;
    covert.parent = wingPivot;
    covert.material = bodyMat;
    allMeshes.push(covert);

    const featherLayers = [
      { y: 0.02, z: 0.16, len: 0.32, w: 0.075, rotX: 0.38, rotZ: xMult * 0.08 },
      { y: -0.06, z: 0.18, len: 0.36, w: 0.070, rotX: 0.44, rotZ: xMult * 0.04 },
      { y: -0.12, z: 0.14, len: 0.30, w: 0.065, rotX: 0.50, rotZ: 0 },
    ];

    featherLayers.forEach((fl, idx) => {
      const fMesh = MeshBuilder.CreateSphere(`chicken_wingFeather_${namePrefix}_${idx}`, {
        diameterX: 0.035,
        diameterY: fl.w,
        diameterZ: fl.len,
        segments: 10,
      }, scene);
      fMesh.rotation.x = fl.rotX;
      fMesh.rotation.z = fl.rotZ;
      fMesh.position.set(xMult * 0.03, fl.y, fl.z);
      fMesh.parent = wingPivot;
      fMesh.material = bodyMat;
      allMeshes.push(fMesh);
    });

    return wingPivot;
  };

  const leftWingPivot = buildLayeredWing(true);
  const rightWingPivot = buildLayeredWing(false);

  // Tail
  const tailPivot = new TransformNode('chicken_tailPivot', scene);
  tailPivot.parent = bodyPivot;
  tailPivot.position.set(0, 0.16, 0.28);
  tailPivot.rotation.x = 0.75;

  const tailFanFeathers = [
    { rotZ: -0.22, length: 0.44, width: 0.14, y: 0.18, z: 0.04 },
    { rotZ: -0.10, length: 0.54, width: 0.16, y: 0.24, z: 0.00 },
    { rotZ: 0.00, length: 0.58, width: 0.17, y: 0.26, z: -0.02 },
    { rotZ: 0.10, length: 0.54, width: 0.16, y: 0.24, z: 0.00 },
    { rotZ: 0.22, length: 0.44, width: 0.14, y: 0.18, z: 0.04 },
  ];
  tailFanFeathers.forEach((f, idx) => {
    const feather = MeshBuilder.CreateSphere(`chicken_tailFeather_${idx}`, {
      diameterX: 0.04,
      diameterY: f.length,
      diameterZ: f.width,
      segments: 12,
    }, scene);
    feather.rotation.z = f.rotZ;
    feather.position.set(f.rotZ * 0.15, f.y, f.z);
    feather.parent = tailPivot;
    feather.material = bodyMat;
    allMeshes.push(feather);
  });

  // Legs & Claws
  const buildLeg = (xOffset: number, name: string) => {
    const hip = new TransformNode(`chicken_hip_${name}`, scene);
    hip.parent = liveGroup;
    hip.position.set(xOffset, 0.28, -0.02);

    const thigh = MeshBuilder.CreateSphere(`chicken_thigh_${name}`, {
      diameterX: 0.13,
      diameterY: 0.16,
      diameterZ: 0.14,
      segments: 10,
    }, scene);
    thigh.position.set(0, -0.04, 0);
    thigh.parent = hip;
    thigh.material = bodyMat;
    allMeshes.push(thigh);

    const shank = MeshBuilder.CreateCylinder(`chicken_shank_${name}`, {
      diameter: 0.042,
      height: 0.24,
      tessellation: 10,
    }, scene);
    shank.position.set(0, -0.18, 0);
    shank.parent = hip;
    shank.material = beakFeetMat;
    allMeshes.push(shank);

    const footBase = new TransformNode(`chicken_foot_${name}`, scene);
    footBase.parent = hip;
    footBase.position.set(0, -0.28, 0);

    const clawAngles = [-0.35, 0, 0.35];
    clawAngles.forEach((angle, cIdx) => {
      const claw = MeshBuilder.CreateBox(`chicken_claw_${name}_${cIdx}`, {
        width: 0.03,
        height: 0.025,
        depth: 0.14,
      }, scene);
      claw.rotation.y = angle;
      claw.position.set(Math.sin(angle) * 0.06, 0.01, -Math.cos(angle) * 0.06);
      claw.parent = footBase;
      claw.material = beakFeetMat;
      allMeshes.push(claw);
    });

    const backClaw = MeshBuilder.CreateBox(`chicken_backClaw_${name}`, {
      width: 0.028,
      height: 0.022,
      depth: 0.08,
    }, scene);
    backClaw.position.set(0, 0.01, 0.04);
    backClaw.parent = footBase;
    backClaw.material = beakFeetMat;
    allMeshes.push(backClaw);

    return hip;
  };

  const leftLegPivot = buildLeg(0.14, 'L');
  const rightLegPivot = buildLeg(-0.14, 'R');

  // --- 2. ROASTED COOKED CHICKEN GROUP (Tandoori Roast Chicken) ---
  const roastGroup = new TransformNode('chicken_roastGroup', scene);
  roastGroup.parent = scaleNode;
  roastGroup.setEnabled(false); // Hidden until shot!

  // Golden crispy succulent roasted skin material
  const roastMat = createMaterial('chicken_roastMat', new Color3(0.92, 0.52, 0.16), 0.40, 48);
  const boneMat = createMaterial('chicken_boneMat', new Color3(0.96, 0.96, 0.92), 0.15, 32);

  // Plump roasted chicken main meat body
  const roastBody = MeshBuilder.CreateSphere('chicken_roastBody', {
    diameterX: 0.52,
    diameterY: 0.38,
    diameterZ: 0.62,
    segments: 16,
  }, scene);
  roastBody.position.set(0, 0.19, 0);
  roastBody.parent = roastGroup;
  roastBody.material = roastMat;
  allMeshes.push(roastBody);

  // Two plump roasted breasts on top
  [-0.10, 0.10].forEach((xSide, idx) => {
    const roastBreast = MeshBuilder.CreateSphere(`chicken_roastBreast_${idx}`, {
      diameterX: 0.24,
      diameterY: 0.22,
      diameterZ: 0.34,
      segments: 14,
    }, scene);
    roastBreast.position.set(xSide, 0.26, -0.06);
    roastBreast.parent = roastGroup;
    roastBreast.material = roastMat;
    allMeshes.push(roastBreast);
  });

  // Two juicy roast drumsticks with white bone tips sticking out (as in photo)
  [-0.20, 0.20].forEach((xSide, idx) => {
    const drumMeat = MeshBuilder.CreateSphere(`chicken_drumMeat_${idx}`, {
      diameterX: 0.17,
      diameterY: 0.18,
      diameterZ: 0.28,
      segments: 14,
    }, scene);
    drumMeat.position.set(xSide, 0.16, 0.08);
    drumMeat.rotation.x = -0.22;
    drumMeat.parent = roastGroup;
    drumMeat.material = roastMat;
    allMeshes.push(drumMeat);

    // Bone shaft sticking out forward
    const bone = MeshBuilder.CreateCylinder(`chicken_boneShaft_${idx}`, {
      diameter: 0.036,
      height: 0.16,
      tessellation: 12,
    }, scene);
    bone.rotation.x = Math.PI * 0.45;
    bone.position.set(xSide * 1.05, 0.18, 0.26);
    bone.parent = roastGroup;
    bone.material = boneMat;
    allMeshes.push(bone);

    // Double bone knuckle balls at the tip
    [-0.018, 0.018].forEach((kSide, kIdx) => {
      const knuckle = MeshBuilder.CreateSphere(`chicken_knuckle_${idx}_${kIdx}`, {
        diameter: 0.042,
        segments: 8,
      }, scene);
      knuckle.position.set(xSide * 1.05 + kSide, 0.19, 0.33);
      knuckle.parent = roastGroup;
      knuckle.material = boneMat;
      allMeshes.push(knuckle);
    });
  });

  // Two folded roasted winglets tucked at front-sides
  [-0.22, 0.22].forEach((xSide, idx) => {
    const roastWing = MeshBuilder.CreateSphere(`chicken_roastWing_${idx}`, {
      diameterX: 0.08,
      diameterY: 0.18,
      diameterZ: 0.26,
      segments: 10,
    }, scene);
    roastWing.position.set(xSide, 0.15, -0.10);
    roastWing.rotation.x = 0.35;
    roastWing.parent = roastGroup;
    roastWing.material = roastMat;
    allMeshes.push(roastWing);
  });

  // Shadows
  allMeshes.forEach((mesh) => {
    mesh.receiveShadows = false;
    mesh.isPickable = true;
    if (options.shadowGen) {
      options.shadowGen.addShadowCaster(mesh);
    }
  });

  const mainMesh = bodyMesh;

  const setVariant = (variant: ChickenVariant): void => {
    currentVariant = variant;
    const pal = CHICKEN_VARIANTS[variant] || CHICKEN_VARIANTS.white;
    bodyMat.diffuseColor.copyFrom(pal.body);
    combMat.diffuseColor.copyFrom(pal.comb);
    beakFeetMat.diffuseColor.copyFrom(pal.beakFeet);
    eyePupilMat.diffuseColor.copyFrom(pal.eyes);
  };

  // --- Falling Feathers Particle System ---
  const activeFeathers: ActiveFeather[] = [];

  const spawnFeather = (origin: Vector3, upwardVelocity = false) => {
    const fMat = new StandardMaterial(`featherMat_${Date.now()}_${Math.random()}`, scene);
    fMat.diffuseColor = bodyMat.diffuseColor.clone();
    fMat.specularColor = new Color3(0, 0, 0);
    fMat.backFaceCulling = false;

    const fMesh = MeshBuilder.CreatePlane('chicken_fallingFeather', {
      width: 0.06 + Math.random() * 0.04,
      height: 0.14 + Math.random() * 0.05,
    }, scene);
    fMesh.material = fMat;
    fMesh.position.copyFrom(origin);
    fMesh.position.x += (Math.random() - 0.5) * 0.35;
    fMesh.position.y += (Math.random() - 0.5) * 0.15 + (upwardVelocity ? 0.3 : 0);
    fMesh.position.z += (Math.random() - 0.5) * 0.35;
    fMesh.rotation.x = Math.random() * Math.PI;
    fMesh.rotation.y = Math.random() * Math.PI;

    activeFeathers.push({
      mesh: fMesh,
      mat: fMat,
      pos: fMesh.position,
      velY: upwardVelocity ? (0.6 + Math.random() * 0.5) : -(0.35 + Math.random() * 0.25),
      wobblePhase: Math.random() * Math.PI * 2,
      wobbleSpeed: 4.0 + Math.random() * 3.0,
      rotSpeed: (Math.random() - 0.5) * 5.0,
      floorY: baseFloorY + 0.02,
      life: 0,
      isGrounded: false,
      fadeLife: 0,
    });
  };

  const triggerFeatherBurst = (count = 14) => {
    const centerPos = root.position.clone();
    centerPos.y += 0.45;
    for (let i = 0; i < count; i++) {
      window.setTimeout(() => {
        if (!root || root.isDisposed()) return;
        spawnFeather(centerPos, true);
      }, i * 40);
    }
  };

  let isFlappingWings = false;
  let wingFlapTimer = 0;
  let nextPeriodicFlapTime = 6.0 + Math.random() * 3.0;

  const triggerWingFlapBurst = () => {
    if (isDefeated) return;
    isFlappingWings = true;
    wingFlapTimer = 0;

    for (let i = 0; i < 6; i++) {
      window.setTimeout(() => {
        if (!root || root.isDisposed()) return;
        const fromLeft = Math.random() > 0.5;
        const wingPos = fromLeft
          ? leftWingPivot.getAbsolutePosition()
          : rightWingPivot.getAbsolutePosition();
        spawnFeather(wingPos, false);
      }, i * 140);
    }
  };

  // --- Procedural Animation Engine ---
  let activeAnim: ChickenAnimationName = 'idle';
  let animTime = 0;
  let isLoopingAnim = true;
  let animOnEndCallback: (() => void) | null = null;
  let animDuration = 0;
  let animElapsed = 0;

  const playAnimation = (name: ChickenAnimationName | string, loop = true, onEnd?: () => void): void => {
    const resolved = normalizeChickenAnimName(name);
    if (isDefeated && resolved !== 'fall' && resolved !== 'butt_slide') return;

    activeAnim = resolved;
    isLoopingAnim = loop;
    animOnEndCallback = onEnd || null;
    animElapsed = 0;
    animDuration = (resolved === 'jump') ? 0.45 : (resolved === 'fall' ? 0.8 : 1.2);

    if (resolved === 'jump') {
      triggerWingFlapBurst();
    }
  };

  let chickenSeqTimer: number | null = null;
  let chickenSeqIdx = 0;
  let activeChickenSeq: ChickenAnimationName[] = [];

  const clearChickenSeq = (): void => {
    if (chickenSeqTimer !== null) {
      window.clearTimeout(chickenSeqTimer);
      chickenSeqTimer = null;
    }
  };

  const playAnimationSequence = (names: (ChickenAnimationName | string)[]): void => {
    clearChickenSeq();
    const resolvedList = names.map(normalizeChickenAnimName);
    if (resolvedList.length === 0) return;
    if (resolvedList.length === 1) {
      playAnimation(resolvedList[0], true);
      return;
    }
    activeChickenSeq = [...resolvedList];
    chickenSeqIdx = 0;

    const playNext = (): void => {
      clearChickenSeq();
      if (isDefeated || activeChickenSeq.length === 0) return;
      const nextName = activeChickenSeq[chickenSeqIdx % activeChickenSeq.length];
      chickenSeqIdx++;
      const isLoop = nextName !== 'jump' && nextName !== 'fall';
      playAnimation(nextName, isLoop);
      chickenSeqTimer = window.setTimeout(playNext, 3800);
    };

    playNext();
  };

  let baseFloorY = spawnPos.y;
  const setFloorY = (y: number): void => {
    baseFloorY = y;
  };

  // Roaming bounds
  let roamMinX = options.roamRange?.minX ?? (spawnPos.x - 1.1);
  let roamMaxX = options.roamRange?.maxX ?? (spawnPos.x + 1.1);
  if (spawnPos.x < roamMinX) roamMinX = spawnPos.x - 0.5;
  if (spawnPos.x > roamMaxX) roamMaxX = spawnPos.x + 0.5;
  if (roamMinX > roamMaxX) {
    const tmp = roamMinX;
    roamMinX = roamMaxX;
    roamMaxX = tmp;
  }
  let roamDirX = 1;
  let isRoamPaused = false;
  let roamPauseTimer: number | null = null;

  const walkOrRunAnim: ChickenAnimationName = behaviorMode === 'run' ? 'run' : 'walk';
  const moveSpeed = behaviorMode === 'run' ? 1.35 : 0.65;

  let isDefeated = false;
  let isStunned = false;

  // Initial animation
  if (options.isEditor) {
    if (options.initialAnimations && options.initialAnimations.length > 1) {
      playAnimationSequence(options.initialAnimations);
    } else {
      const initAnim = options.initialAnimations?.[0] || options.initialAnimation || (behaviorMode === 'sit' ? 'idle' : walkOrRunAnim);
      playAnimation(initAnim, true);
    }
  } else {
    if (behaviorMode === 'sit') {
      playAnimation('idle', true);
    } else {
      playAnimation(walkOrRunAnim, true);
    }
  }

  // Knockback physics & render loop
  let velX = 0;
  let velY = 0;
  let velZ = 0;
  let rotVelX = 0;
  let rotVelZ = 0;
  let targetRotZ = 0;
  let targetRotX = 0;

  const renderObserver = scene.onBeforeRenderObservable.add(() => {
    const delta = Math.min(scene.getEngine().getDeltaTime() / 1000, 0.033);
    animTime += delta;
    animElapsed += delta;

    if (!isLoopingAnim && animOnEndCallback && animElapsed >= animDuration) {
      const cb = animOnEndCallback;
      animOnEndCallback = null;
      cb();
    }

    // --- Update Falling Feathers ---
    for (let i = activeFeathers.length - 1; i >= 0; i--) {
      const f = activeFeathers[i];
      f.life += delta;

      if (!f.isGrounded) {
        // Upward velocity decelerates under gravity
        if (f.velY > 0) {
          f.velY -= 3.0 * delta;
        } else {
          f.velY = Math.max(-0.55, f.velY - 0.2 * delta);
        }

        f.pos.y += f.velY * delta;
        f.pos.x += Math.sin(f.life * f.wobbleSpeed + f.wobblePhase) * 0.45 * delta;
        f.pos.z += Math.cos(f.life * f.wobbleSpeed + f.wobblePhase) * 0.25 * delta;

        f.mesh.rotation.x += f.rotSpeed * delta;
        f.mesh.rotation.y += f.rotSpeed * 0.8 * delta;
        f.mesh.rotation.z = Math.sin(f.life * f.wobbleSpeed) * 0.6;

        if (f.pos.y <= f.floorY && f.velY <= 0) {
          f.pos.y = f.floorY;
          f.isGrounded = true;
          f.mesh.rotation.x = Math.PI / 2;
        }
      } else {
        f.fadeLife += delta * 0.65;
        f.mat.alpha = Math.max(0, 1.0 - f.fadeLife);

        if (f.fadeLife >= 1.0) {
          f.mesh.geometry?.dispose();
          f.mesh.dispose(false, true);
          f.mat.dispose();
          activeFeathers.splice(i, 1);
        }
      }
    }

    // --- Periodic Wing Flap Trigger in Sit/Idle ---
    if (!options.isEditor && !isDefeated && behaviorMode === 'sit') {
      if (animTime >= nextPeriodicFlapTime && !isFlappingWings) {
        triggerWingFlapBurst();
        nextPeriodicFlapTime = animTime + 7.0 + Math.random() * 4.0;
      }
    }

    // --- Animations: Stable Head + Natural Body Breathing & Flapping ---
    if (!isDefeated) {
      headNode.position.set(0, baseHeadY, baseHeadZ);
      headNode.rotation.set(0, 0, 0);

      if (isFlappingWings) {
        wingFlapTimer += delta;
        const flapProgress = wingFlapTimer / 1.25;

        if (flapProgress >= 1.0) {
          isFlappingWings = false;
        } else {
          const flapFreq = 26.0;
          const flapIntensity = Math.sin(flapProgress * Math.PI);
          const flutter = Math.sin(wingFlapTimer * flapFreq) * flapIntensity;

          bodyPivot.position.y = baseBodyY + flapIntensity * 0.04;
          bodyPivot.rotation.x = -flapIntensity * 0.05;

          leftWingPivot.rotation.z = 0.55 * flapIntensity + flutter * 0.35;
          rightWingPivot.rotation.z = -0.55 * flapIntensity - flutter * 0.35;
          leftWingPivot.rotation.y = -0.25 * flapIntensity;
          rightWingPivot.rotation.y = 0.25 * flapIntensity;
        }
      }

      if (activeAnim === 'walk') {
        const freq = 8.5;
        const legSwing = Math.sin(animTime * freq) * 0.40;
        leftLegPivot.rotation.x = legSwing;
        rightLegPivot.rotation.x = -legSwing;

        bodyPivot.position.y = baseBodyY + Math.abs(Math.sin(animTime * freq)) * 0.018;
        bodyPivot.rotation.z = Math.sin(animTime * freq) * 0.035;
        bodyPivot.rotation.x = -0.02;

        tailPivot.rotation.z = Math.sin(animTime * freq) * 0.05;
        if (!isFlappingWings) {
          leftWingPivot.rotation.z = 0.03 + Math.sin(animTime * freq) * 0.03;
          rightWingPivot.rotation.z = -0.03 - Math.sin(animTime * freq) * 0.03;
          leftWingPivot.rotation.y = 0;
          rightWingPivot.rotation.y = 0;
        }
      } else if (activeAnim === 'run') {
        const freq = 14.0;
        const legSwing = Math.sin(animTime * freq) * 0.60;
        leftLegPivot.rotation.x = legSwing;
        rightLegPivot.rotation.x = -legSwing;

        bodyPivot.position.y = baseBodyY + Math.abs(Math.sin(animTime * freq)) * 0.025;
        bodyPivot.rotation.x = -0.08;
        bodyPivot.rotation.z = Math.sin(animTime * freq) * 0.05;

        tailPivot.rotation.z = Math.sin(animTime * freq) * 0.10;
        if (!isFlappingWings) {
          leftWingPivot.rotation.z = 0.18 + Math.sin(animTime * 16.0) * 0.15;
          rightWingPivot.rotation.z = -0.18 - Math.sin(animTime * 16.0) * 0.15;
          leftWingPivot.rotation.y = -0.12;
          rightWingPivot.rotation.y = 0.12;
        }
      } else if (activeAnim === 'jump') {
        bodyPivot.position.y = baseBodyY + 0.08;
        leftLegPivot.rotation.x = 0.35;
        rightLegPivot.rotation.x = 0.35;
        if (!isFlappingWings) {
          leftWingPivot.rotation.z = 0.50 + Math.sin(animTime * 26.0) * 0.25;
          rightWingPivot.rotation.z = -0.50 - Math.sin(animTime * 26.0) * 0.25;
        }
      } else {
        const breathe = Math.sin(animTime * 2.2);

        if (!isFlappingWings) {
          bodyPivot.position.y = baseBodyY + breathe * 0.008;
          bodyPivot.rotation.set(0, 0, 0);

          chestMesh.scaling.set(
            1.0 + breathe * 0.02,
            1.0 + breathe * 0.015,
            1.0 + breathe * 0.02
          );

          tailPivot.rotation.z = Math.sin(animTime * 1.6) * 0.03;
          leftWingPivot.rotation.z = breathe * 0.015;
          rightWingPivot.rotation.z = -breathe * 0.015;
          leftWingPivot.rotation.y = 0;
          rightWingPivot.rotation.y = 0;
        }

        leftLegPivot.rotation.x = 0;
        rightLegPivot.rotation.x = 0;
      }
    }

    if (options.isEditor) return;

    // --- Physics & Settlement of Roasted Chicken ---
    if (isDefeated) {
      if (root.rotationQuaternion) {
        root.rotation = root.rotationQuaternion.toEulerAngles();
        root.rotationQuaternion = null;
      }

      velY -= 14.0 * delta;
      root.position.x += velX * delta;
      root.position.y += velY * delta;
      root.position.z += velZ * delta;

      rotVelZ = (targetRotZ - root.rotation.z) * 6.0;
      rotVelX = (targetRotX - root.rotation.x) * 6.0;
      root.rotation.z += rotVelZ * Math.min(1.0, delta);
      root.rotation.x += rotVelX * Math.min(1.0, delta);

      velX *= 0.95;
      velZ *= 0.95;

      const obstacles = obstacleManager.getAllObstacles();
      const chickenRadius = 0.35;
      for (const obs of obstacles) {
        if (obs.isDestroyed) continue;
        const bounds = obstacleManager.getObstacleBounds(obs);
        if (
          root.position.x >= bounds.min.x - chickenRadius &&
          root.position.x <= bounds.max.x + chickenRadius &&
          root.position.z >= bounds.min.z - chickenRadius &&
          root.position.z <= bounds.max.z + chickenRadius &&
          root.position.y < bounds.max.y + 0.1 &&
          root.position.y > bounds.min.y - 0.2
        ) {
          if (velX > 0) {
            root.position.x = bounds.min.x - chickenRadius;
            velX = -velX * 0.4;
          } else if (velX < 0) {
            root.position.x = bounds.max.x + chickenRadius;
            velX = -velX * 0.4;
          }
        }
      }

      // Settles upright flat onto floor as freshly served roast chicken
      const deadFloorY = baseFloorY + 0.02;
      if (velY <= 0 && root.position.y <= deadFloorY) {
        root.position.y = deadFloorY;
        velY = 0;
        velX *= 0.65;
        velZ *= 0.65;
        root.rotation.z = targetRotZ;
        root.rotation.x = targetRotX;
      }
    } else if (Math.abs(velX) > 0.01 || Math.abs(velY) > 0.01 || Math.abs(velZ) > 0.01 || root.position.y > baseFloorY + 0.001) {
      velY -= 12.0 * delta;
      root.position.x += velX * delta;
      root.position.y += velY * delta;
      root.position.z += velZ * delta;

      if (root.position.y <= baseFloorY) {
        root.position.y = baseFloorY;
        velY = 0;
        velX *= 0.82;
        velZ *= 0.82;
      }
    }

    // Roaming behavior
    if (!isDefeated && !isStunned && !isRoamPaused && (behaviorMode === 'roam' || behaviorMode === 'run')) {
      const targetRotY = roamDirX > 0 ? Math.PI / 2 : -Math.PI / 2;
      const rotDiff = getShortestAngleDiff(root.rotation.y, targetRotY);
      root.rotation.y += rotDiff * Math.min(1.0, 9.0 * delta);

      root.position.x += roamDirX * moveSpeed * delta;

      const obstacles = obstacleManager.getAllObstacles();
      const chickenRadius = 0.45;
      for (const obs of obstacles) {
        if (obs.isDestroyed) continue;
        const bounds = obstacleManager.getObstacleBounds(obs);
        const min = bounds.min;
        const max = bounds.max;

        if (
          root.position.x >= min.x - chickenRadius &&
          root.position.x <= max.x + chickenRadius &&
          root.position.z >= min.z - chickenRadius &&
          root.position.z <= max.z + chickenRadius &&
          root.position.y < max.y + 0.1 &&
          root.position.y > min.y - 0.2
        ) {
          if (roamDirX > 0) {
            root.position.x = min.x - chickenRadius;
            roamDirX = -1;
          } else {
            root.position.x = max.x + chickenRadius;
            roamDirX = 1;
          }
        }
      }

      if (roamDirX > 0 && root.position.x >= roamMaxX) {
        root.position.x = roamMaxX;
        isRoamPaused = true;
        roamPauseTimer = window.setTimeout(() => {
          if (!isDefeated && !isStunned) {
            roamDirX = -1;
            playAnimation(walkOrRunAnim, true);
            isRoamPaused = false;
          }
        }, 2200 + Math.random() * 1000);
      } else if (roamDirX < 0 && root.position.x <= roamMinX) {
        root.position.x = roamMinX;
        isRoamPaused = true;
        roamPauseTimer = window.setTimeout(() => {
          if (!isDefeated && !isStunned) {
            roamDirX = 1;
            playAnimation(walkOrRunAnim, true);
            isRoamPaused = false;
          }
        }, 2200 + Math.random() * 1000);
      }
    }
  });

  // Gunshot startled hop with feather burst
  const triggerNearShot = (): void => {
    if (isDefeated) return;
    playChickenCluck();
    triggerWingFlapBurst();

    if (behaviorMode === 'sit') {
      playAnimation('jump', false, () => {
        if (!isDefeated && behaviorMode === 'sit') {
          playAnimation('idle', true);
        }
      });
    } else if (!isStunned) {
      isRoamPaused = true;
      if (roamPauseTimer) {
        clearTimeout(roamPauseTimer);
        roamPauseTimer = null;
      }
      playAnimation('jump', false, () => {
        if (!isDefeated && !isStunned) {
          playAnimation(walkOrRunAnim, true);
          isRoamPaused = false;
        }
      });
    }
  };

  // Bullet hit impact: Transforms into delicious Cooked Roast Chicken!
  const triggerHit = (hitPoint: Vector3, shootDirection: Vector3): void => {
    spawnComicHitEffect(scene, hitPoint);
    playChickenSquawk();

    if (root.rotationQuaternion) {
      root.rotation = root.rotationQuaternion.toEulerAngles();
      root.rotationQuaternion = null;
    }

    if (isDefeated) {
      // Once killed and transformed into meat, do not respond to bullets or be shot again
      return;
    }

    // --- INSTANT COMIC TRANSFORMATION TO ROAST CHICKEN ---
    isDefeated = true;
    isStunned = true;
    isRoamPaused = true;
    if (roamPauseTimer) { clearTimeout(roamPauseTimer); roamPauseTimer = null; }

    // Disable raycast picking on all meshes so bullets pass through meat
    allMeshes.forEach((m) => {
      m.isPickable = false;
    });

    // Hide live chicken parts and reveal crispy roast chicken
    liveGroup.setEnabled(false);
    roastGroup.setEnabled(true);

    // Dramatic cartoon cloud of feathers bursting out
    triggerFeatherBurst(16);

    const dirX = Math.abs(shootDirection.x) > 0.05 ? shootDirection.x : (Math.random() > 0.5 ? 0.6 : -0.6);
    const dirZ = Math.abs(shootDirection.z) > 0.05 ? shootDirection.z : 0.4;

    velY = 2.4;
    velX = dirX * 2.0;
    velZ = dirZ * 2.0;

    targetRotZ = 0; // Sits flat and upright like freshly served roast chicken
    targetRotX = 0;
  };

  const dispose = (): void => {
    if (roamPauseTimer) clearTimeout(roamPauseTimer);
    clearChickenSeq();
    if (renderObserver) {
      scene.onBeforeRenderObservable.remove(renderObserver);
    }

    activeFeathers.forEach((f) => {
      f.mesh.geometry?.dispose();
      f.mesh.dispose(false, true);
      f.mat.dispose();
    });
    activeFeathers.length = 0;

    if (options.shadowGen) {
      allMeshes.forEach((m) => options.shadowGen?.removeShadowCaster(m));
    }
    allMaterials.forEach((mat) => mat.dispose(true, true));
    allMeshes.forEach((m) => {
      m.geometry?.dispose();
      m.dispose(false, true);
    });
    scaleNode.dispose(false, true);
    root.dispose(false, true);
  };

  return {
    rootNode: root,
    mainMesh,
    allMeshes,
    get isDefeated() {
      return isDefeated;
    },
    behaviorMode,
    get variant() {
      return currentVariant;
    },
    setVariant,
    playAnimation,
    playAnimationSequence,
    setFloorY,
    triggerHit,
    triggerNearShot,
    dispose,
  };
}

// Backward-compatible export
export const loadPugDog = loadChicken;
