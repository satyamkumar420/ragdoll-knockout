import {
  Vector3,
  Color4,
  Color3,
  Scene,
  type ShadowGenerator,
} from '@babylonjs/core';
import type { RagdollController } from '../ragdoll';
import type {
  ChickenController,
  ChickenAnimationName,
  ChickenVariant,
  PugController,
  PugAnimationName,
} from '../chicken';

import type { ObstacleMaterialType } from '../core/obstacleTypes';
import type { MagicFxConfig } from '../core/magicFx';

export interface JsonPropItem {
  name: string;
  modelPath: string;
  position: [number, number, number];
  rotationY?: number;
  rotationX?: number;
  rotationZ?: number;
  scale?: number;
  hasCollision?: boolean;
  castShadow?: boolean;
  animationName?: string;
  animationSpeed?: number;
  isLocked?: boolean;
  material?: ObstacleMaterialType;
  durability?: number;
  isDestructible?: boolean;
  isMovable?: boolean;
  mass?: number;
  isPenetrable?: boolean;
  penetrationResistance?: number;
}

export interface JsonTargetItem {
  position: [number, number, number];
  rotationY?: number;
  scale?: number;
  animationName: string;
  animationNames?: string[];
  animationSpeed?: number;
  namePrefix?: string;
  isLocked?: boolean;
  swordModelPath?: string;
  weaponModelPath?: string;
  swordScale?: number;
  swordRotation?: [number, number, number];
  swordPosition?: [number, number, number];
  isPatrolling?: boolean;
  patrolRange?: [number, number];
  patrolSpeed?: number;
  magicFx?: boolean | 'arcane' | 'fire' | 'none' | MagicFxConfig;
}

export type { ChickenController, PugController, ChickenVariant, ChickenAnimationName };

export interface JsonPugItem {
  position: [number, number, number];
  rotationY?: number;
  behaviorMode: 'sit' | 'roam' | 'run';
  variant?: ChickenVariant;
  initialAnimation?: ChickenAnimationName | PugAnimationName;
  initialAnimations?: (ChickenAnimationName | PugAnimationName)[];
  roamRange?: { minX: number; maxX: number };
  isLocked?: boolean;
}

export type JsonChickenItem = JsonPugItem;

export interface JsonLevelConfig {
  id: number;
  name: string;
  subtitle?: string;
  skyColor: [number, number, number, number];
  grassColor?: [number, number, number];
  ammo: number;
  gunSpawnPos?: [number, number, number];
  gunRotation?: [number, number, number];
  gunScale?: number;
  cameraRadius?: number;
  cameraTarget?: [number, number, number];
  cameraAlpha?: number;
  cameraBeta?: number;
  environmentType?: 'park' | 'room' | 'custom' | 'island';
  props?: JsonPropItem[];
  targets: JsonTargetItem[];
  pugs?: JsonPugItem[];
}

export interface PropItemConfig {
  name: string;
  modelPath: string;
  position: Vector3;
  rotationY?: number;
  rotationX?: number;
  rotationZ?: number;
  scale?: number;
  hasCollision?: boolean;
  castShadow?: boolean;
  animationName?: string;
  animationSpeed?: number;
  material?: ObstacleMaterialType;
  durability?: number;
  isDestructible?: boolean;
  isMovable?: boolean;
  mass?: number;
  isPenetrable?: boolean;
  penetrationResistance?: number;
}


export interface CharacterTargetConfig {
  position: Vector3;
  rotationY?: number;
  scale?: number;
  animationName: string;
  animationNames?: string[];
  animationSpeed?: number;
  namePrefix?: string;
  swordModelPath?: string;
  weaponModelPath?: string;
  swordScale?: number;
  swordRotation?: Vector3;
  swordPosition?: Vector3;
  isPatrolling?: boolean;
  patrolRange?: [number, number];
  patrolSpeed?: number;
  magicFx?: boolean | 'arcane' | 'fire' | 'none' | MagicFxConfig;
}

export interface PugCompanionConfig {
  position: Vector3;
  rotationY?: number;
  behaviorMode: 'sit' | 'roam' | 'run';
  variant?: ChickenVariant;
  initialAnimation?: ChickenAnimationName | PugAnimationName;
  initialAnimations?: (ChickenAnimationName | PugAnimationName)[];
  roamRange?: { minX: number; maxX: number };
}

export type ChickenCompanionConfig = PugCompanionConfig;

export interface LevelConfig {
  id: number;
  name: string;
  subtitle?: string;
  skyColor: Color4;
  grassColor?: Color3;
  ammo: number;
  gunSpawnPos?: Vector3;
  gunRotation?: Vector3;
  gunScale?: number;
  cameraRadius?: number;
  cameraTarget?: Vector3;
  cameraAlpha?: number;
  cameraBeta?: number;
  props?: PropItemConfig[];
  targets: CharacterTargetConfig[];
  pugs?: PugCompanionConfig[];
  customSetup?: (scene: Scene, shadowGen?: ShadowGenerator) => { dispose: () => void } | void;
}

export interface LevelData {
  id: number;
  name: string;
  subtitle?: string;
  skyColor: Color4;
  grassColor?: Color3;
  ammo: number;
  gunSpawnPos?: Vector3;
  gunRotation?: Vector3;
  gunScale?: number;
  cameraRadius?: number;
  cameraTarget?: Vector3;
  cameraAlpha?: number;
  cameraBeta?: number;
  targets?: CharacterTargetConfig[];
  props?: PropItemConfig[];
  setup: (scene: Scene, shadowGen?: ShadowGenerator) => Promise<{
    controllers: RagdollController[];
    pugs?: PugController[];
    cleanup: () => void;
  }>;
}
