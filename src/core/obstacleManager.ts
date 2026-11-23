import {
  Vector3,
  type Scene,
  type AbstractMesh,
  type TransformNode,
} from '@babylonjs/core';
import {
  type ObstacleConfig,
  type ObstacleState,
  OBSTACLE_MATERIALS,
} from './obstacleTypes';
import { playMaterialImpactSound, playObstacleBreakSound } from '../audio';
import { triggerMeshShudder, spawnImpactFX, spawnDestructionShatter } from './obstacleFx';
import { isPermanentObstacle, inferPhysicalDefaults } from './obstacleDefaults';

export { isPermanentObstacle, inferPhysicalDefaults };

export class ObstacleManager {
  private obstacles: Map<string, ObstacleState> = new Map();
  private meshToObstacleId: Map<AbstractMesh, string> = new Map();
  private scene: Scene | null = null;
  private renderObserver: any = null;

  public init(scene: Scene): void {
    this.scene = scene;
    if (this.renderObserver) {
      scene.onBeforeRenderObservable.remove(this.renderObserver);
    }
    this.renderObserver = scene.onBeforeRenderObservable.add(() => {
      this.updatePhysics();
    });
  }

  public clear(): void {
    this.obstacles.clear();
    this.meshToObstacleId.clear();
  }

  public dispose(): void {
    if (this.scene && this.renderObserver) {
      this.scene.onBeforeRenderObservable.remove(this.renderObserver);
      this.renderObserver = null;
    }
    this.clear();
    this.scene = null;
  }

  public inferPhysicalDefaults(...identifiers: (string | undefined | null)[]): Required<ObstacleConfig> {
    return inferPhysicalDefaults(...identifiers);
  }

  public registerObstacle(
    rootNode: TransformNode,
    mainMesh: AbstractMesh,
    allMeshes: AbstractMesh[],
    config: ObstacleConfig = {}
  ): ObstacleState {
    const id = config.id || `obs_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const inferred = inferPhysicalDefaults(config.modelPath, config.name, rootNode.name, mainMesh.name, id);
    const isPermanent = isPermanentObstacle(config.modelPath, config.name, rootNode.name, mainMesh.name, id);

    const material = config.material ?? inferred.material;
    const maxDurability = isPermanent ? 0 : (config.durability !== undefined ? config.durability : inferred.durability);
    const isDestructible = isPermanent ? false : (config.isDestructible !== undefined ? config.isDestructible : (maxDurability > 0));
    const isMovable = isPermanent ? false : (config.isMovable !== undefined ? config.isMovable : inferred.isMovable);
    const mass = isPermanent ? Math.max(50000, config.mass ?? inferred.mass) : Math.max(1, config.mass ?? inferred.mass);
    const penetrationResistance = isPermanent
      ? 250
      : (config.penetrationResistance ?? (
          config.material ? OBSTACLE_MATERIALS[config.material].penetrationResistance : inferred.penetrationResistance
        ));
    const isPenetrable = isPermanent ? false : (config.isPenetrable ?? false);
    const scoreReward = isPermanent ? 0 : (config.scoreReward ?? inferred.scoreReward);

    const restingY = rootNode.position.y;

    const state: ObstacleState = {
      id,
      name: config.name || rootNode.name,
      modelPath: config.modelPath,
      rootNode,
      mesh: mainMesh,
      allMeshes,
      material,
      maxDurability,
      currentDurability: maxDurability,
      isDestructible,
      isMovable,
      mass,
      isPenetrable,
      penetrationResistance,
      scoreReward,
      isDestroyed: false,
      velocity: new Vector3(0, 0, 0),
      angularVelocityY: 0,
      restingY,
    };

    this.obstacles.set(id, state);

    // Map each child mesh to this obstacle state for instant lookup
    allMeshes.forEach((m) => {
      this.meshToObstacleId.set(m, id);
      m.metadata = {
        ...(m.metadata || {}),
        isObstacle: true,
        obstacleId: id,
        obstacleMaterial: material,
      };
    });

    return state;
  }

  public unregisterObstacle(id: string): void {
    const obs = this.obstacles.get(id);
    if (!obs) return;

    obs.allMeshes.forEach((m) => {
      this.meshToObstacleId.delete(m);
      if (m.metadata) {
        m.metadata.isObstacle = false;
        delete m.metadata.obstacleId;
        delete m.metadata.obstacleMaterial;
      }
    });

    this.obstacles.delete(id);
  }

  public getObstacle(id: string): ObstacleState | undefined {
    return this.obstacles.get(id);
  }

  public getObstacleByMesh(mesh: AbstractMesh): ObstacleState | undefined {
    const id = this.meshToObstacleId.get(mesh) || mesh.metadata?.obstacleId;
    if (!id) return undefined;
    return this.obstacles.get(id);
  }

  public getAllObstacles(): ObstacleState[] {
    return Array.from(this.obstacles.values());
  }

  public getObstacleBounds(obs: ObstacleState): { min: Vector3; max: Vector3 } {
    const currentPos = obs.rootNode?.position;
    if (
      obs.cachedBounds &&
      obs.cachedPosition &&
      currentPos &&
      obs.cachedPosition.equalsWithEpsilon(currentPos, 0.01) &&
      (!obs.isMovable || (obs.velocity.lengthSquared() < 0.0001 && Math.abs(obs.angularVelocityY) < 0.01))
    ) {
      return obs.cachedBounds;
    }

    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    let hasValidMesh = false;

    const meshesToCheck = obs.allMeshes && obs.allMeshes.length > 0 ? obs.allMeshes : [obs.mesh];

    for (let i = 0; i < meshesToCheck.length; i++) {
      const m = meshesToCheck[i];
      if (!m) continue;
      m.computeWorldMatrix?.(false);
      const bInfo = m.getBoundingInfo?.();
      if (!bInfo) continue;

      const minW = bInfo.boundingBox.minimumWorld;
      const maxW = bInfo.boundingBox.maximumWorld;

      if (maxW.x !== minW.x || maxW.y !== minW.y || maxW.z !== minW.z) {
        hasValidMesh = true;
        if (minW.x < minX) minX = minW.x;
        if (minW.y < minY) minY = minW.y;
        if (minW.z < minZ) minZ = minW.z;
        if (maxW.x > maxX) maxX = maxW.x;
        if (maxW.y > maxY) maxY = maxW.y;
        if (maxW.z > maxZ) maxZ = maxW.z;
      }
    }

    if (!hasValidMesh) {
      const b = obs.mesh?.getBoundingInfo?.();
      if (b) {
        const minW = b.boundingBox.minimumWorld;
        const maxW = b.boundingBox.maximumWorld;
        if (maxW.y !== minW.y || maxW.x !== minW.x) {
          const res = {
            min: minW.clone(),
            max: maxW.clone(),
          };
          obs.cachedBounds = res;
          return res;
        }
      }
      const pos = obs.rootNode?.position || new Vector3(0, 0, 0);
      const res = {
        min: new Vector3(pos.x - 0.45, pos.y, pos.z - 0.45),
        max: new Vector3(pos.x + 0.45, pos.y + 0.65, pos.z + 0.45),
      };
      obs.cachedBounds = res;
      return res;
    }

    // For pier docks (e.g. nature/dock.glb), vertical pilings at the outer edges reach Y ~ 1.0,
    // while the actual walking deck plank surface is at local Y ~ 0.488.
    // Calibrate maxY to the deck surface so bullets fly freely across the pier walkway
    // and characters/ragdolls stand and settle cleanly on top of the planks.
    const isDock =
      (obs.name && obs.name.toLowerCase().includes('dock')) ||
      (obs.mesh?.name && obs.mesh.name.toLowerCase().includes('dock')) ||
      (obs.rootNode?.name && obs.rootNode.name.toLowerCase().includes('dock'));
    if (isDock) {
      const rootPos = obs.rootNode?.position;
      const rootScale = obs.rootNode?.scaling;
      const baseY = rootPos ? rootPos.y : minY;
      const scaleY = rootScale ? rootScale.y : 1.0;
      const deckSurfaceY = baseY + 0.488 * scaleY;
      maxY = Math.min(maxY, deckSurfaceY + 0.02);
    }

    const res = {
      min: new Vector3(minX, minY, minZ),
      max: new Vector3(maxX, maxY, maxZ),
    };
    if (currentPos) {
      obs.cachedPosition = currentPos.clone();
    }
    obs.cachedBounds = res;
    return res;
  }

  /**
   * Applies realistic physics impulse and damage to the obstacle.
   * Real-world permanent objects (cars, buildings, walls) NEVER get destroyed or hidden.
   */
  public applyImpact(
    state: ObstacleState,
    hitPoint: Vector3,
    direction: Vector3,
    damage: number,
    force: number
  ): { destroyed: boolean; damageApplied: number; pointsAwarded: number } {
    if (state.isDestroyed) {
      return { destroyed: false, damageApplied: 0, pointsAwarded: 0 };
    }

    // 1. Play realistic material collision audio
    playMaterialImpactSound(state.material);

    // 2. Spawn material-specific impact sparks & debris
    spawnImpactFX(this.scene, hitPoint, direction, state.material);

    // 3. Apply physical impulse to movable objects according to mass
    if (state.isMovable && !isPermanentObstacle(state.name, state.modelPath, state.id) && state.mass > 0) {
      const speed = Math.min(force / state.mass, 4.5);
      state.velocity.x += direction.x * speed;
      state.velocity.y += Math.max(0.4, speed * 0.25);
      state.velocity.z += direction.z * speed;
      state.angularVelocityY += (Math.random() - 0.5) * Math.min(3.0, 15.0 / state.mass);
    }

    // 4. Visual impact comic shudder/shake ONLY for small non-permanent props
    if (state.isMovable && !isPermanentObstacle(state.name, state.modelPath, state.id)) {
      triggerMeshShudder(this.scene, state);
    }

    let destroyed = false;
    let pointsAwarded = 0;

    // 5. Apply durability damage to destructible obstacles ONLY
    // Cars, houses, buildings, and permanent structures are INDESTRUCTIBLE and NEVER disappear/hide
    if (
      !isPermanentObstacle(state.name, state.modelPath, state.id) &&
      state.isDestructible &&
      state.maxDurability > 0
    ) {
      state.currentDurability -= damage;

      if (state.currentDurability <= 0) {
        destroyed = true;
        state.isDestroyed = true;
        pointsAwarded = state.scoreReward > 0 ? state.scoreReward : 20;

        // Sound & Shatter burst
        playObstacleBreakSound();
        spawnDestructionShatter(this.scene, state, hitPoint, direction);

        // Hide and disable collisions on destructible debris (e.g. chairs, crates)
        state.allMeshes.forEach((m) => {
          m.checkCollisions = false;
          m.isVisible = false;
          if (typeof m.setEnabled === 'function') {
            m.setEnabled(false);
          }
          if (m.metadata) m.metadata.isObstacle = false;
        });
      }
    }

    return { destroyed, damageApplied: damage, pointsAwarded };
  }

  /**
   * Physics loop for movable obstacles (knocking tables, chairs, barrels around with realistic friction)
   */
  private updatePhysics(): void {
    if (!this.scene) return;
    const delta = this.scene.getEngine().getDeltaTime() / 1000;
    if (delta <= 0 || delta > 0.1) return;

    this.obstacles.forEach((state) => {
      // Dynamic moving obstacles only (chairs, tables, barrels pushed by bullets)
      // Permanent obstacles (houses, buildings, walls) never have velocity and are never touched here!
      if (state.isDestroyed || !state.isMovable || isPermanentObstacle(state.name, state.modelPath, state.id)) return;

      const speedSq = state.velocity.lengthSquared();
      const hasLinear = speedSq > 0.0001;
      const hasAngular = Math.abs(state.angularVelocityY) > 0.01;

      if (!hasLinear && !hasAngular) return;

      const root = state.rootNode;

      // Integrate motion
      root.position.addInPlace(state.velocity.scale(delta));
      if (root.rotation) {
        root.rotation.y += state.angularVelocityY * delta;
      }

      // Prevent moving obstacles from entering other solid obstacles
      this.obstacles.forEach((other) => {
        if (other.id === state.id || other.isDestroyed) return;
        const bInfo = other.mesh.getBoundingInfo?.();
        if (!bInfo) return;
        const min = bInfo.boundingBox.minimumWorld;
        const max = bInfo.boundingBox.maximumWorld;
        const radius = 0.38;
        if (
          root.position.x >= min.x - radius &&
          root.position.x <= max.x + radius &&
          root.position.z >= min.z - radius &&
          root.position.z <= max.z + radius &&
          root.position.y < max.y + 0.1 &&
          root.position.y > min.y - 0.2
        ) {
          const dMinX = Math.abs(root.position.x - (min.x - radius));
          const dMaxX = Math.abs(max.x + radius - root.position.x);
          root.position.x = dMinX <= dMaxX ? min.x - radius : max.x + radius;
          state.velocity.x *= -0.2;
        }
      });

      // Gravity & Ground clamp
      if (root.position.y > state.restingY) {
        state.velocity.y -= 9.8 * delta;
      } else {
        root.position.y = state.restingY;
        state.velocity.y = 0;

        // Ground lawn friction
        const friction = Math.pow(0.85, delta * 60);
        state.velocity.x *= friction;
        state.velocity.z *= friction;
        state.angularVelocityY *= friction;
      }
    });
  }
}

export const obstacleManager = new ObstacleManager();
