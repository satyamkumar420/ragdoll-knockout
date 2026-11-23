import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Vector3 } from '@babylonjs/core';
import { obstacleManager } from '../src/core/obstacleManager';
import { detectHitEntity } from '../src/core/hitDetection';
import {
  DEFAULT_WEAPON_BALLISTICS,
  type WeaponBallistics,
} from '../src/core/obstacleTypes';
import {
  resolveSphereVsAABB,
  resolveCircleVsCircle,
  intersectRayAABB,
} from '../src/core/collisionSystem';
import { resolveMeshCollision, getSupportSurfaceHeight, resolveObstacleCollisions } from '../src/weaponPhysics';
import { createCharacterRagdollController, clearActiveRagdolls } from '../src/ragdoll';

// Test mock helper
function createMockMesh(name: string, minX: number, maxX: number, minY: number, maxY: number, minZ = -0.5, maxZ = 0.5) {
  const position = new Vector3((minX + maxX) / 2, minY, (minZ + maxZ) / 2);
  const mockMesh: any = {
    name,
    position,
    rotation: new Vector3(0, 0, 0),
    scaling: new Vector3(1, 1, 1),
    metadata: { isObstacle: true },
    checkCollisions: true,
    isPickable: true,
    isEnabled: () => true,
    setEnabled: () => {},
    isVisible: true,
    getBoundingInfo: () => ({
      boundingBox: {
        minimumWorld: new Vector3(minX, minY, minZ),
        maximumWorld: new Vector3(maxX, maxY, maxZ),
      },
    }),
    getChildMeshes: () => [],
    isDescendantOf: () => false,
  };
  return mockMesh;
}

function createMockController(id: string, posX: number, posY: number, posZ = 0) {
  let defeated = false;
  let hitForce = 0;
  return {
    id,
    character: {
      mainMesh: {
        getAbsolutePosition: () => new Vector3(posX, posY, posZ),
        name: `char_${id}`,
      },
      playAnimation: () => {},
    },
    get isDefeated() {
      return defeated;
    },
    triggerHit: (_hitPoint: Vector3, _dir: Vector3, force = 32) => {
      defeated = true;
      hitForce = force;
    },
    getHitForce: () => hitForce,
  };
}

describe('Complete Physics & Collision System Audit Tests', () => {
  const renderCallbacks = new Set<() => void>();
  const mockScene: any = {
    multiPickWithRay: () => [],
    onBeforeRenderObservable: {
      add: (cb: () => void) => {
        renderCallbacks.add(cb);
        return cb;
      },
      remove: (cb: () => void) => {
        renderCallbacks.delete(cb);
      },
    },
    getEngine: () => ({
      getDeltaTime: () => 16.6,
    }),
  };

  const ignoreGunMesh = createMockMesh('gun', -3, -2.5, 0, 0.5);

  it('1. High-speed bullet hitting thin obstacle (thickness 0.02m) without tunneling', () => {
    obstacleManager.clear();
    const thinSheet = createMockMesh('razor_thin_barrier', 2.0, 2.02, 0, 2.0);
    const obs = obstacleManager.registerObstacle(thinSheet, thinSheet, [thinSheet], {
      name: 'razor_thin_barrier',
      material: 'metal',
      durability: 0,
    });

    const targetBehind = createMockController('enemy_behind', 4.0, 0);

    const hit = detectHitEntity(
      mockScene,
      new Vector3(-2.0, 0.5, 0),
      new Vector3(1.0, 0, 0),
      ignoreGunMesh,
      [targetBehind as any],
      [],
      DEFAULT_WEAPON_BALLISTICS
    );

    assert.strictEqual(hit.hitObstacle, obs, 'Thin obstacle is reliably detected');
    assert.strictEqual(hit.stoppedByObstacle, true, 'Bullet is stopped by thin obstacle');
    assert.strictEqual(hit.hitTarget, null, 'Target behind thin barrier is protected');
    assert.ok(Math.abs(hit.hitPoint.x - 2.0) <= 0.05, 'Impact point is on thin obstacle surface');
  });

  it('2. Bullet hits obstacle positioned directly in front of ragdoll', () => {
    obstacleManager.clear();
    const coverShield = createMockMesh('ballistic_shield', 1.0, 1.2, 0, 2.0);
    const shieldObs = obstacleManager.registerObstacle(coverShield, coverShield, [coverShield], {
      name: 'ballistic_shield',
      material: 'metal',
      durability: 100,
    });

    const protectedEnemy = createMockController('enemy_behind_shield', 1.8, 0);

    const hit = detectHitEntity(
      mockScene,
      new Vector3(-2.0, 0.5, 0),
      new Vector3(1.0, 0, 0),
      ignoreGunMesh,
      [protectedEnemy as any],
      [],
      DEFAULT_WEAPON_BALLISTICS
    );

    assert.strictEqual(hit.hitObstacle, shieldObs, 'Shield is hit first');
    assert.strictEqual(hit.stoppedByObstacle, true);
    assert.strictEqual(hit.hitTarget, null, 'Enemy is protected behind shield');
    assert.strictEqual(protectedEnemy.isDefeated, false);
  });

  it('3. Bullet correctly interacts with multiple objects along path (penetration & stop)', () => {
    obstacleManager.clear();
    // Penetrable wooden fence at X = 0.0
    const fenceMesh = createMockMesh('wooden_fence', -0.05, 0.05, 0, 1.5);
    const fenceObs = obstacleManager.registerObstacle(fenceMesh, fenceMesh, [fenceMesh], {
      name: 'wooden_fence',
      material: 'wood',
      isPenetrable: true,
      penetrationResistance: 15,
    });

    // Solid concrete block at X = 2.0
    const blockMesh = createMockMesh('concrete_block', 1.9, 2.1, 0, 1.5);
    const blockObs = obstacleManager.registerObstacle(blockMesh, blockMesh, [blockMesh], {
      name: 'concrete_block',
      material: 'concrete',
      isPenetrable: false,
    });

    const targetBehindBlock = createMockController('target_far', 3.5, 0);

    const ballistics: WeaponBallistics = {
      damage: 60,
      impactForce: 20,
      penetrationPower: 25, // Can penetrate fence (15), but not concrete
      maxPenetrations: 2,
    };

    const hit = detectHitEntity(
      mockScene,
      new Vector3(-2.0, 0.5, 0),
      new Vector3(1.0, 0, 0),
      ignoreGunMesh,
      [targetBehindBlock as any],
      [],
      ballistics
    );

    assert.strictEqual(hit.penetratedObstacles.length, 1, 'Fence was penetrated');
    assert.strictEqual(hit.penetratedObstacles[0].obstacle, fenceObs);
    assert.strictEqual(hit.hitObstacle, blockObs, 'Bullet was stopped at concrete block');
    assert.strictEqual(hit.stoppedByObstacle, true);
    assert.strictEqual(hit.hitTarget, null, 'Target behind concrete block is safe');
  });

  it('4. Ragdoll-to-Ragdoll collision prevents bodies from overlapping or passing through', () => {
    const r1 = { x: 0.0, z: 0.0, radius: 0.45, mass: 1 };
    const r2 = { x: 0.3, z: 0.0, radius: 0.45, mass: 1 }; // Overlapping by 0.6m

    const res = resolveCircleVsCircle(r1, r2);

    assert.strictEqual(res.collided, true, 'Ragdolls must detect overlap');
    assert.ok(res.dx1 < 0, 'Ragdoll 1 is pushed left (-x)');
    assert.ok(res.dx2 > 0, 'Ragdoll 2 is pushed right (+x)');

    // New positions after pushout
    const newX1 = r1.x + res.dx1;
    const newX2 = r2.x + res.dx2;
    const newDist = Math.abs(newX2 - newX1);
    assert.ok(newDist >= 0.899, `Separated distance (${newDist}) must equal or exceed sum of radii (0.90)`);
  });

  it('5. Ragdoll high-speed impact against solid wall resolves without tunneling to outside', () => {
    // Wall at X = -5.7 (min: -5.95, max: -5.45)
    const wallBox = {
      min: new Vector3(-5.95, 0, -2.0),
      max: new Vector3(-5.45, 4.0, 2.0),
    };

    // Ragdoll flying left into wall at -6.0 m/s
    const res = resolveSphereVsAABB(-5.2, 1.0, 0, -6.0, 0, 0.52, wallBox, 0.2);

    assert.strictEqual(res.collided, true, 'Collision detected with wall');
    // Wall maxX + radius = -5.45 + 0.52 = -4.93
    assert.ok(res.x >= -4.94, `Ragdoll kept inside room (x = ${res.x} >= -4.94)`);
    assert.ok(res.vx > 0, `Velocity bounced back positively (vx = ${res.vx} > 0)`);

    // Extreme high-speed tunneling test: initial position already inside wall volume (-5.8)
    const resTunnel = resolveSphereVsAABB(-5.8, 1.0, 0, -14.0, 0, 0.52, wallBox, 0.2);
    assert.strictEqual(resTunnel.collided, true);
    assert.ok(resTunnel.x >= -4.94, `Ragdoll prevented from popping out on far side: got ${resTunnel.x}`);
    assert.ok(resTunnel.vx > 0);
  });

  it('6. Gun resting on top surface of obstacle does NOT get pushed horizontally (jitter fix)', () => {
    // Table at X = 1.6 (min.x = 1.0, max.x = 2.2, min.y = 0, max.y = 0.85)
    const tableMesh = createMockMesh('table', 1.0, 2.2, 0, 0.85);

    // Gun resting on top of table: nx = 1.5, posY = 0.88, vx = 0
    const res = resolveMeshCollision(tableMesh, 1.5, 0.88, 0, 0, 0);

    // When on top surface, posX MUST NOT be ejected sideways to max.x + margin!
    assert.strictEqual(res.nx, 1.5, 'Gun horizontal position remains undisturbed on top of table');
    assert.strictEqual(res.vx, 0, 'Gun horizontal velocity remains 0');
  });

  it('7. Ray intersection on Axis-Aligned Bounding Box provides exact surface normal and distance', () => {
    // Box from X: 1.0 to 3.0, Y: 0 to 2.0
    const hit = intersectRayAABB(0, 1.0, 1.0, 0, 1.0, 3.0, 0, 2.0);

    assert.strictEqual(hit.hit, true, 'Ray hits front face of box');
    assert.strictEqual(hit.tMin, 1.0, 'Distance to entry point is exactly 1.0');
    assert.strictEqual(hit.normalX, -1, 'Collision normal points backwards towards ray origin');
    assert.strictEqual(hit.normalY, 0);
  });

  it('8. Multi-body simultaneous collision stability', () => {
    // 3 ragdolls lined up touching each other
    const rA = { x: 0.0, z: 0.0, radius: 0.4, mass: 1 };
    const rB = { x: 0.3, z: 0.0, radius: 0.4, mass: 1 };
    const rC = { x: 0.6, z: 0.0, radius: 0.4, mass: 1 };

    // Resolve A vs B, then B vs C
    const ab = resolveCircleVsCircle(rA, rB);
    rA.x += ab.dx1;
    rB.x += ab.dx2;

    const bc = resolveCircleVsCircle(rB, rC);
    rB.x += bc.dx1;
    rC.x += bc.dx2;

    assert.ok(rA.x < rB.x, 'Relative order preserved');
    assert.ok(rB.x < rC.x, 'Relative order preserved');
    assert.ok(!isNaN(rA.x) && !isNaN(rB.x) && !isNaN(rC.x), 'Positions are finite and stable');
  });

  it('9. Physics stability across variable frame rates (15 FPS vs 60 FPS vs 120 FPS)', () => {
    const wallBox = {
      min: new Vector3(-5.95, 0, -2.0),
      max: new Vector3(-5.45, 4.0, 2.0),
    };

    const frameRates = [15, 60, 120];
    for (const fps of frameRates) {
      const delta = 1 / fps;
      const speed = -4.0;
      const initialX = -5.0;
      const newX = initialX + speed * delta;

      const res = resolveSphereVsAABB(newX, 1.0, 0, speed, 0, 0.52, wallBox, 0.2);
      assert.ok(res.x >= -4.95, `Stable at ${fps} FPS: x = ${res.x} >= -4.95`);
      assert.ok(res.vx >= 0, `Velocity stable at ${fps} FPS`);
    }
  });

  it('10. Newly added custom obstacle blocks objects correctly through data-driven registration', () => {
    obstacleManager.clear();
    const barrier = createMockMesh('titanium_bunker', 0.5, 0.9, 0, 2.5);
    const bunkerObs = obstacleManager.registerObstacle(barrier, barrier, [barrier], {
      name: 'titanium_bunker',
      material: 'metal',
      durability: 0,
      isPenetrable: false,
    });

    assert.strictEqual(bunkerObs.isPenetrable, false);
    assert.strictEqual(bunkerObs.material, 'metal');

    const hit = detectHitEntity(
      mockScene,
      new Vector3(-2.0, 1.0, 0),
      new Vector3(1.0, 0, 0),
      ignoreGunMesh,
      [],
      [],
      DEFAULT_WEAPON_BALLISTICS
    );

    assert.strictEqual(hit.hitObstacle, bunkerObs, 'Custom obstacle blocks bullet completely');
    assert.strictEqual(hit.stoppedByObstacle, true);
  });

  it('11. Seated character on chair falls naturally away from table when shot', () => {
    obstacleManager.clear();
    clearActiveRagdolls();
    renderCallbacks.clear();
    const chairLeftMesh = createMockMesh('chairLeft', 0.25, 0.65, 0, 0.9);
    obstacleManager.registerObstacle(chairLeftMesh, chairLeftMesh, [chairLeftMesh], {
      name: 'chairLeft',
      material: 'wood',
    });

    let currentAnim = 'Sitting_Talking_Loop';
    const mockCharLeft: any = {
      rootNode: {
        position: new Vector3(0.75, 0, 0),
        rotation: new Vector3(0, 1.57, 0),
      },
      mainMesh: {
        getAbsolutePosition: () => new Vector3(0.75, 0, 0),
        onDisposeObservable: { add: () => {} },
      },
      animationGroups: [
        { name: 'Sitting_Talking_Loop', isPlaying: true },
      ],
      playAnimation: (anim: string) => {
        currentAnim = anim;
      },
    };

    const ctrlLeft = createCharacterRagdollController(mockCharLeft, mockScene);
    assert.strictEqual(ctrlLeft.isDefeated, false);

    // Shoot the diner seated on the left chair:
    // Even if bullet direction is coming from any angle, left diner must topple towards left (-X) away from table!
    ctrlLeft.triggerHit(new Vector3(0.75, 0.8, 0), new Vector3(1, 0, 0), 25);
    assert.strictEqual(ctrlLeft.isDefeated, true);
    assert.strictEqual(currentAnim, 'Death01');

    // Simulate physics step
    renderCallbacks.forEach((cb) => cb());

    // Left diner position must move towards left (X < 0.75), NOT towards the table (X > 0.75)!
    assert.ok(mockCharLeft.rootNode.position.x < 0.75, `Left diner knocked towards left: got ${mockCharLeft.rootNode.position.x} < 0.75`);
  });

  it('12. Seated character stands up and plays Idle_Talking_Loop when supporting chair is destroyed', () => {
    obstacleManager.clear();
    clearActiveRagdolls();
    renderCallbacks.clear();
    const chairRightMesh = createMockMesh('chairRight', 2.55, 2.95, 0, 0.9);
    const chairObs = obstacleManager.registerObstacle(chairRightMesh, chairRightMesh, [chairRightMesh], {
      name: 'chairRight',
      material: 'wood',
      durability: 45,
    });

    let currentAnim = 'Sitting_Talking_Loop';
    const mockCharRight: any = {
      rootNode: {
        position: new Vector3(2.45, 0, 0),
        rotation: new Vector3(0, -1.57, 0),
      },
      mainMesh: {
        getAbsolutePosition: () => new Vector3(2.45, 0, 0),
        onDisposeObservable: { add: () => {} },
      },
      animationGroups: [
        {
          name: 'Sitting_Talking_Loop',
          get isPlaying() {
            return currentAnim === 'Sitting_Talking_Loop';
          },
        },
        {
          name: 'Idle_Talking_Loop',
          get isPlaying() {
            return currentAnim === 'Idle_Talking_Loop';
          },
        },
      ],
      playAnimation: (anim: string) => {
        currentAnim = anim;
      },
    };

    const ctrlRight = createCharacterRagdollController(mockCharRight, mockScene);
    assert.strictEqual(ctrlRight.isDefeated, false);
    assert.strictEqual(currentAnim, 'Sitting_Talking_Loop');

    // Step 1: Normal render while chair is intact
    renderCallbacks.forEach((cb) => cb());
    assert.strictEqual(currentAnim, 'Sitting_Talking_Loop', 'Remains seated while chair intact');

    // Step 2: Chair is destroyed by bullet/physics
    chairObs.isDestroyed = true;

    // Next render frame:
    renderCallbacks.forEach((cb) => cb());

    // Character must stand up and talk!
    assert.strictEqual(currentAnim, 'Idle_Talking_Loop', 'Transitions to Idle_Talking_Loop when chair is destroyed');
    assert.strictEqual(ctrlRight.isDefeated, false, 'Character is alive and standing');
  });

  it('13. Killed ragdoll next to dining table never enters inside the table bounds', () => {
    obstacleManager.clear();
    clearActiveRagdolls();
    renderCallbacks.clear();

    // Level 2 Dining table from X = 0.91 to X = 2.29, Y = 0 to 0.77
    const tableMesh = createMockMesh('diningTable', 0.91, 2.29, 0, 0.77);
    obstacleManager.registerObstacle(tableMesh, tableMesh, [tableMesh], {
      name: 'diningTable',
      material: 'wood',
    });

    const mockChar: any = {
      rootNode: {
        position: new Vector3(0.75, 0, 0),
        rotation: new Vector3(0, 1.57, 0),
      },
      mainMesh: {
        getAbsolutePosition: () => new Vector3(0.75, 0, 0),
        onDisposeObservable: { add: () => {} },
      },
      animationGroups: [
        { name: 'Sitting_Talking_Loop', isPlaying: true },
      ],
      playAnimation: () => {},
    };

    const ctrl = createCharacterRagdollController(mockChar, mockScene);

    // Bullet hits diner towards the table (+X direction)
    ctrl.triggerHit(new Vector3(0.75, 0.5, 0), new Vector3(1, 0, 0), 30);
    assert.strictEqual(ctrl.isDefeated, true);

    // Step physics for multiple frames
    for (let f = 0; f < 10; f++) {
      renderCallbacks.forEach((cb) => cb());
    }

    // Must be completely outside the table (X <= 0.91 - 0.45 = 0.46)
    assert.ok(
      mockChar.rootNode.position.x < 0.91,
      `Ragdoll is strictly to the left of the table: got ${mockChar.rootNode.position.x} < 0.91`
    );
    assert.ok(
      mockChar.rootNode.position.x < 0.50,
      `Ragdoll pushed safely outside table margin: got ${mockChar.rootNode.position.x} < 0.50`
    );
  });

  it('14. Killed ragdoll on top of obstacle (Level 3 barrel/car) topples off dynamically to the floor without penetrating inside', () => {
    obstacleManager.clear();
    clearActiveRagdolls();
    renderCallbacks.clear();

    // Level 3 barrel at [-0.5, 0, 0] with top at Y = 0.55
    const barrelMesh = createMockMesh('oilBarrel1', -1.05, 0.05, 0, 0.55);
    obstacleManager.registerObstacle(barrelMesh, barrelMesh, [barrelMesh], {
      name: 'oilBarrel1',
      material: 'metal',
    });

    const mockChar: any = {
      rootNode: {
        position: new Vector3(-0.5, 0.51, 0),
        rotation: new Vector3(0, 3.14, 0),
      },
      mainMesh: {
        getAbsolutePosition: () => new Vector3(-0.5, 0.51, 0),
        onDisposeObservable: { add: () => {} },
      },
      animationGroups: [
        { name: 'Dance_Loop', isPlaying: true },
      ],
      playAnimation: () => {},
    };

    const ctrl = createCharacterRagdollController(mockChar, mockScene);

    // Bullet hits crew standing on top of barrel
    ctrl.triggerHit(new Vector3(-0.5, 0.8, 0), new Vector3(0.5, 0, 0), 20);
    assert.strictEqual(ctrl.isDefeated, true);

    // Step physics for multiple frames (allowing dynamic tumble and gravity to settle on floor)
    for (let f = 0; f < 40; f++) {
      renderCallbacks.forEach((cb) => cb());
    }

    // Must dynamically topple off to the floor (Y = 0), NEVER remain suspended in mid-air (Y > 0.4)!
    assert.strictEqual(
      mockChar.rootNode.position.y,
      0,
      `Ragdoll lands on floor Y = 0: got Y = ${mockChar.rootNode.position.y}`
    );
    // Must be pushed outside the barrel geometry (X > 0.05), never inside (-1.05 <= X <= 0.05)
    assert.ok(
      mockChar.rootNode.position.x > 0.05,
      `Ragdoll is safely outside barrel geometry on the floor: got X = ${mockChar.rootNode.position.x} > 0.05`
    );
  });

  it('15. Level 3 elevated enemy on barrel (X = 2.3) topples naturally beside perch and never teleports across obstacles', () => {
    obstacleManager.clear();
    clearActiveRagdolls();
    renderCallbacks.clear();

    // Setup all 3 Level 3 obstacles in sequence
    const barrel1 = createMockMesh('oilBarrel1', -1.05, 0.05, 0, 0.55);
    obstacleManager.registerObstacle(barrel1, barrel1, [barrel1], { name: 'oilBarrel1', material: 'metal' });

    const car = createMockMesh('raceCar', 0.35, 1.55, 0, 0.7);
    obstacleManager.registerObstacle(car, car, [car], { name: 'raceCar', material: 'metal' });

    const barrel2 = createMockMesh('oilBarrel2', 1.85, 2.75, 0, 0.55);
    obstacleManager.registerObstacle(barrel2, barrel2, [barrel2], { name: 'oilBarrel2', material: 'metal' });

    // l3_crew3 perched on oilBarrel2 at X = 2.3
    const mockChar: any = {
      rootNode: {
        position: new Vector3(2.3, 0.47, 0),
        rotation: new Vector3(0, 3.14, 0),
      },
      mainMesh: {
        getAbsolutePosition: () => new Vector3(2.3, 0.47, 0),
        onDisposeObservable: { add: () => {} },
      },
      animationGroups: [{ name: 'Dance_Loop', isPlaying: true }],
      playAnimation: () => {},
    };

    const ctrl = createCharacterRagdollController(mockChar, mockScene);

    // Shot from right side towards left
    ctrl.triggerHit(new Vector3(2.3, 0.8, 0), new Vector3(-1, 0, 0), 22);
    assert.strictEqual(ctrl.isDefeated, true);

    // Step physics
    for (let f = 0; f < 40; f++) {
      renderCallbacks.forEach((cb) => cb());
    }

    // Must land on floor Y = 0
    assert.strictEqual(mockChar.rootNode.position.y, 0, `Enemy lands on floor: got Y = ${mockChar.rootNode.position.y}`);
    // Must land right beside oilBarrel2 (around 1.7 to 2.2), NEVER teleport across raceCar or to -1.53!
    assert.ok(
      mockChar.rootNode.position.x >= 1.7 && mockChar.rootNode.position.x <= 2.4,
      `Enemy lands right next to oilBarrel2 [1.7, 2.4]: got X = ${mockChar.rootNode.position.x}`
    );
  });

  it('16. Shot enemy plays Death01 animation and cancels any active combat sequence', () => {
    let playedAnim = '';
    let playedLoop: boolean | undefined = undefined;
    let playedSpeed: number | undefined = undefined;

    const mockChar: any = {
      rootNode: {
        position: new Vector3(0.35, 0, 0),
        rotation: new Vector3(0, 1.57, 0),
      },
      mainMesh: {
        getAbsolutePosition: () => new Vector3(0.35, 0, 0),
        onDisposeObservable: { add: () => {} },
      },
      animationGroups: [
        { name: 'Punch_Jab', isPlaying: true },
        { name: 'Death01', isPlaying: false },
      ],
      playAnimation: (anim: string, loop?: boolean, speed?: number) => {
        playedAnim = anim;
        playedLoop = loop;
        playedSpeed = speed;
      },
    };

    const ctrl = createCharacterRagdollController(mockChar, mockScene);
    ctrl.triggerHit(new Vector3(0.35, 0.8, 0), new Vector3(-1, 0, 0), 22);

    assert.strictEqual(ctrl.isDefeated, true);
    assert.strictEqual(playedAnim, 'Death01', 'Death01 animation must be triggered on bullet hit');
    assert.strictEqual(playedLoop, false, 'Death01 animation must NOT loop');
    assert.strictEqual(playedSpeed, 1.35, 'Death01 animation speed should be 1.35x for punchy knockdown');
  });

  it('17. Defeated ragdoll in death position repels weapon along entire fallen body span without clipping', () => {
    // Character root at X = 1.0, head at X = 2.4 (lying on ground towards +X)
    const mockDefeatedChar: any = {
      character: {
        rootNode: {
          position: new Vector3(1.0, 0, 0),
        },
        mainMesh: {
          getAbsolutePosition: () => new Vector3(1.0, 0, 0),
        },
        headNode: {
          getAbsolutePosition: () => new Vector3(2.4, 0.15, 0),
        },
      },
      isDefeated: true,
    };

    // Test A: Gun tries to enter near the head (X = 2.2, Y = 0.20, moving left)
    const resHead = resolveObstacleCollisions(2.2, 0.20, 0, -2.0, 0, mockScene, [mockDefeatedChar as any]);
    // Head span max is 2.4 + 0.40 = 2.80; with gunRadius (0.22) = 3.02
    assert.ok(resHead.posX >= 2.80, `Gun pushed outside head span: got ${resHead.posX} >= 2.80`);
    assert.ok(resHead.velX > 0, 'Gun bounces away from head');

    // Test B: Gun tries to enter near the hips (X = 0.9, Y = 0.15, moving right)
    const resHips = resolveObstacleCollisions(0.9, 0.15, 0, 2.0, 0, mockScene, [mockDefeatedChar as any]);
    // Root span min is 1.0 - 0.40 = 0.60; with gunRadius (0.22) = 0.38
    assert.ok(resHips.posX <= 0.45, `Gun pushed outside hips span: got ${resHips.posX} <= 0.45`);
    assert.ok(resHips.velX < 0, 'Gun bounces away from hips');
  });

  it('18. Chair blocks weapon from the side and never allows weapon to penetrate interior', () => {
    obstacleManager.clear();
    const chairMesh = createMockMesh('chairRight', 2.5, 3.0, 0, 0.90);
    const chairObs = obstacleManager.registerObstacle(chairMesh, chairMesh, [chairMesh], {
      name: 'chairRight',
      material: 'wood',
    });

    // Weapon approaches chair from right side (X = 3.1, Y = 0.5, moving left at -3.0 m/s)
    const res = resolveObstacleCollisions(3.1, 0.5, 0, -3.0, 0, mockScene, [], []);
    // Chair max.x = 3.0; gunRadius = 0.22; expected X >= 3.22
    assert.ok(res.posX >= 3.20, `Weapon blocked outside chair: got ${res.posX} >= 3.20`);
    assert.ok(res.velX > 0, `Weapon bounces positively back to the right: got ${res.velX} > 0`);

    // Weapon approaches chair from left side (X = 2.4, Y = 0.6, moving right at 3.0 m/s)
    const resLeft = resolveObstacleCollisions(2.4, 0.6, 0, 3.0, 0, mockScene, [], []);
    // Chair min.x = 2.5; expected X <= 2.28
    assert.ok(resLeft.posX <= 2.30, `Weapon blocked on left of chair: got ${resLeft.posX} <= 2.30`);
    assert.ok(resLeft.velX < 0, 'Weapon bounces negatively back to the left');
  });
});


