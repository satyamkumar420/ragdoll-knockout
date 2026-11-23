import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Vector3 } from '@babylonjs/core';
import { obstacleManager } from '../src/core/obstacleManager';
import { detectHitEntity } from '../src/core/hitDetection';
import {
  DEFAULT_WEAPON_BALLISTICS,
  type WeaponBallistics,
} from '../src/core/obstacleTypes';
import { getSupportingSurfaceY } from '../src/ragdoll';
import {
  resolveMeshCollision,
  getSupportSurfaceHeight,
  getSupportSurfaceInfo,
} from '../src/weaponPhysics';

// Lightweight test mocks for Babylon scene, meshes, and controllers
function createMockMesh(name: string, minX: number, maxX: number, minY: number, maxY: number) {
  const position = new Vector3((minX + maxX) / 2, minY, 0);
  const mockMesh: any = {
    name,
    position,
    rotation: new Vector3(0, 0, 0),
    scaling: new Vector3(1, 1, 1),
    metadata: { isObstacle: true },
    checkCollisions: true,
    isEnabled: () => true,
    setEnabled: () => {},
    isVisible: true,
    getBoundingInfo: () => ({
      boundingBox: {
        minimumWorld: new Vector3(minX, minY, -0.5),
        maximumWorld: new Vector3(maxX, maxY, 0.5),
      },
    }),
    getChildMeshes: () => [],
    isDescendantOf: () => false,
  };
  return mockMesh;
}

function createMockController(id: string, posX: number, posY: number) {
  let defeated = false;
  let hitForce = 0;
  return {
    id,
    character: {
      mainMesh: {
        getAbsolutePosition: () => new Vector3(posX, posY, 0),
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

describe('Obstacle Collision & Damage System Tests', () => {
  const mockScene: any = {
    multiPickWithRay: () => [],
    onBeforeRenderObservable: {
      add: () => ({}),
      remove: () => {},
    },
    getEngine: () => ({
      getDeltaTime: () => 16.6,
    }),
  };

  const ignoreGunMesh = createMockMesh('gun', -3, -2.5, 0, 0.5);

  it('1. Shoot enemy with no obstacle in between: bullet hits enemy normally', () => {
    obstacleManager.clear();
    const muzzlePos = new Vector3(-3.0, 0.5, 0);
    const barrelDir = new Vector3(1.0, 0, 0); // Shooting rightwards

    const enemy = createMockController('enemy_open', 2.0, 0.0);
    const controllers = [enemy as any];
    const pugs: any[] = [];

    const hitResult = detectHitEntity(
      mockScene,
      muzzlePos,
      barrelDir,
      ignoreGunMesh,
      controllers,
      pugs,
      DEFAULT_WEAPON_BALLISTICS
    );

    assert.strictEqual(hitResult.hitTarget, enemy, 'Enemy should be hit');
    assert.strictEqual(hitResult.stoppedByObstacle, false, 'Not stopped by obstacle');
    assert.strictEqual(hitResult.isDirect, true, 'Hit must be direct');
    assert.ok(hitResult.hitPoint.x > 1.0 && hitResult.hitPoint.x <= 2.1, 'Hit point is near enemy');
  });

  it('2. Shoot enemy behind a solid wall: solid wall blocks bullet and enemy takes no damage', () => {
    obstacleManager.clear();
    const muzzlePos = new Vector3(-3.0, 0.5, 0);
    const barrelDir = new Vector3(1.0, 0, 0);

    // Wall placed at X = 0.0 (between muzzle at -3.0 and enemy at 2.5)
    const wallMesh = createMockMesh('room_wall', -0.1, 0.1, 0, 2.5);
    const wallObs = obstacleManager.registerObstacle(wallMesh, wallMesh, [wallMesh], {
      name: 'concrete_wall',
      material: 'concrete',
      durability: 0, // Indestructible
      isPenetrable: false,
      penetrationResistance: 120,
    });

    const enemy = createMockController('enemy_behind_wall', 2.5, 0.0);
    const controllers = [enemy as any];

    const hitResult = detectHitEntity(
      mockScene,
      muzzlePos,
      barrelDir,
      ignoreGunMesh,
      controllers,
      [],
      DEFAULT_WEAPON_BALLISTICS
    );

    assert.strictEqual(hitResult.hitObstacle, wallObs, 'Bullet must hit the wall');
    assert.strictEqual(hitResult.stoppedByObstacle, true, 'Bullet must be stopped by the wall');
    assert.strictEqual(hitResult.hitTarget, null, 'Enemy behind solid wall must NOT be hit');
    assert.strictEqual(enemy.isDefeated, false, 'Enemy must remain undefeated');
    assert.ok(hitResult.hitPoint.x < 0.1, 'Impact point must be at the wall surface');
  });

  it('3. Shoot destructible obstacle repeatedly: takes damage, breaks at 0 durability, then allows shot to pass', () => {
    obstacleManager.clear();
    const muzzlePos = new Vector3(-3.0, 0.5, 0);
    const barrelDir = new Vector3(1.0, 0, 0);

    // Sturdy wooden dining table at X = 1.0 (durability 90, stops bullets)
    const tableMesh = createMockMesh('diningTable', 0.8, 1.2, 0, 1.2);
    const tableObs = obstacleManager.registerObstacle(tableMesh, tableMesh, [tableMesh], {
      name: 'diningTable',
      material: 'wood',
      durability: 90,
      isDestructible: true,
      isPenetrable: false,
      penetrationResistance: 40,
    });

    const diner = createMockController('diner_behind_table', 2.3, 0.0);

    // Shot 1: Table blocks bullet and takes 50 damage
    const hit1 = detectHitEntity(
      mockScene,
      muzzlePos,
      barrelDir,
      ignoreGunMesh,
      [diner as any],
      [],
      DEFAULT_WEAPON_BALLISTICS
    );

    assert.strictEqual(hit1.hitObstacle, tableObs, 'Shot 1 hits table');
    assert.strictEqual(hit1.hitTarget, null, 'Diner is safe on Shot 1');

    // Apply impact to table (simulating main.ts)
    const impact1 = obstacleManager.applyImpact(tableObs, hit1.hitPoint, barrelDir, 50, 24);
    assert.strictEqual(impact1.destroyed, false, 'Table survives 1 shot');
    assert.strictEqual(tableObs.currentDurability, 40, 'Table durability reduced to 40');
    assert.strictEqual(tableObs.isDestroyed, false);

    // Shot 2: Table takes second shot (another 50 damage) and breaks!
    const hit2 = detectHitEntity(
      mockScene,
      muzzlePos,
      barrelDir,
      ignoreGunMesh,
      [diner as any],
      [],
      DEFAULT_WEAPON_BALLISTICS
    );

    assert.strictEqual(hit2.hitObstacle, tableObs, 'Shot 2 hits table');
    const impact2 = obstacleManager.applyImpact(tableObs, hit2.hitPoint, barrelDir, 50, 24);
    assert.strictEqual(impact2.destroyed, true, 'Table is destroyed on Shot 2');
    assert.strictEqual(tableObs.isDestroyed, true, 'Obstacle marked destroyed');

    // Shot 3: Path is now open! Bullet passes right through and knocks down diner!
    const hit3 = detectHitEntity(
      mockScene,
      muzzlePos,
      barrelDir,
      ignoreGunMesh,
      [diner as any],
      [],
      DEFAULT_WEAPON_BALLISTICS
    );

    assert.strictEqual(hit3.hitTarget, diner, 'Diner is now hit on Shot 3');
    assert.strictEqual(hit3.stoppedByObstacle, false, 'Bullet no longer stopped');
    diner.triggerHit(hit3.hitPoint, barrelDir, hit3.effectiveDamage);
    assert.strictEqual(diner.isDefeated, true, 'Diner is defeated');
  });

  it('4. Shoot lightweight movable obstacle: reacts with physical impulse according to mass', () => {
    obstacleManager.clear();
    const barrelDir = new Vector3(1.0, 0, 0);

    // Lightweight chair: mass 8kg
    const chairMesh = createMockMesh('chair', 0.0, 0.4, 0, 0.9);
    const chairObs = obstacleManager.registerObstacle(chairMesh, chairMesh, [chairMesh], {
      name: 'chair',
      material: 'wood',
      isMovable: true,
      mass: 8,
    });

    // Heavy crate: mass 40kg
    const heavyMesh = createMockMesh('heavyCrate', 0.0, 0.6, 0, 0.9);
    const heavyObs = obstacleManager.registerObstacle(heavyMesh, heavyMesh, [heavyMesh], {
      name: 'heavyCrate',
      material: 'metal',
      isMovable: true,
      mass: 40,
    });

    const force = 24;
    obstacleManager.applyImpact(chairObs, new Vector3(0, 0.5, 0), barrelDir, 10, force);
    obstacleManager.applyImpact(heavyObs, new Vector3(0, 0.5, 0), barrelDir, 10, force);

    // Velocity should be inversely proportional to mass: v = force / mass
    const chairVelX = chairObs.velocity.x;
    const heavyVelX = heavyObs.velocity.x;

    assert.ok(chairVelX > 2.0, `Chair should have high velocity (got ${chairVelX})`);
    assert.ok(heavyVelX < 1.0, `Heavy crate should have lower velocity (got ${heavyVelX})`);
    assert.ok(chairVelX > heavyVelX * 3.0, 'Light object moves significantly faster than heavy object');
  });

  it('5. Penetrable material: penetration occurs when weapon penetration power >= obstacle resistance', () => {
    obstacleManager.clear();
    const muzzlePos = new Vector3(-3.0, 0.5, 0);
    const barrelDir = new Vector3(1.0, 0, 0);

    // Penetrable light wooden chair: resistance 18
    const chairMesh = createMockMesh('chairLeft', 0.3, 0.6, 0, 0.9);
    const chairObs = obstacleManager.registerObstacle(chairMesh, chairMesh, [chairMesh], {
      name: 'chairLeft',
      material: 'wood',
      isPenetrable: true,
      penetrationResistance: 18,
    });

    const diner = createMockController('diner_on_chair', 1.0, 0.0);

    // Case A: Default weapon (penetrationPower = 0) stops at chair, diner is protected!
    const defaultHit = detectHitEntity(
      mockScene,
      muzzlePos,
      barrelDir,
      ignoreGunMesh,
      [diner as any],
      [],
      DEFAULT_WEAPON_BALLISTICS
    );
    assert.strictEqual(defaultHit.hitObstacle, chairObs, 'Default shot stops at chair surface');
    assert.strictEqual(defaultHit.hitTarget, null, 'Diner is protected with default 0-penetration weapon');
    assert.strictEqual(defaultHit.stoppedByObstacle, true);

    // Case B: High penetration weapon (penetration power 24 >= 18)
    const highPenBallistics: WeaponBallistics = {
      damage: 50,
      impactForce: 24,
      penetrationPower: 24,
      maxPenetrations: 1,
    };

    const penHit = detectHitEntity(
      mockScene,
      muzzlePos,
      barrelDir,
      ignoreGunMesh,
      [diner as any],
      [],
      highPenBallistics
    );

    assert.strictEqual(penHit.penetratedObstacles.length, 1, 'Chair penetrated with high-pen weapon');
    assert.strictEqual(penHit.penetratedObstacles[0].obstacle, chairObs);
    assert.strictEqual(penHit.hitTarget, diner, 'Diner hit with high-pen weapon');
    assert.ok(penHit.effectiveDamage < 50, 'Damage reduced after penetration');
  });

  it('6. Dynamic positions: distance sorting stays correct when characters move around obstacles', () => {
    obstacleManager.clear();
    const muzzlePos = new Vector3(-3.0, 0.5, 0);
    const barrelDir = new Vector3(1.0, 0, 0);

    // Obstacle at X = 0.0
    const obstacleMesh = createMockMesh('obstacle', -0.2, 0.2, 0, 1.5);
    obstacleManager.registerObstacle(obstacleMesh, obstacleMesh, [obstacleMesh], {
      name: 'barrier',
      material: 'concrete',
      isPenetrable: false,
      penetrationResistance: 100,
    });

    // Case A: Enemy is behind obstacle at X = 2.0 -> BLOCKED
    const enemyBehind = createMockController('enemy_posA', 2.0, 0.0);
    const hitA = detectHitEntity(
      mockScene,
      muzzlePos,
      barrelDir,
      ignoreGunMesh,
      [enemyBehind as any],
      [],
      DEFAULT_WEAPON_BALLISTICS
    );
    assert.strictEqual(hitA.hitTarget, null, 'Enemy behind barrier is blocked');
    assert.strictEqual(hitA.stoppedByObstacle, true);

    // Case B: Enemy steps in front of obstacle at X = -1.2 -> HIT DIRECTLY
    const enemyInFront = createMockController('enemy_posB', -1.2, 0.0);
    const hitB = detectHitEntity(
      mockScene,
      muzzlePos,
      barrelDir,
      ignoreGunMesh,
      [enemyInFront as any],
      [],
      DEFAULT_WEAPON_BALLISTICS
    );
    assert.strictEqual(hitB.hitTarget, enemyInFront, 'Enemy in front of barrier is hit directly');
    assert.strictEqual(hitB.isDirect, true);
    assert.strictEqual(hitB.stoppedByObstacle, false);
  });

  it('7. Data-driven extension: newly added obstacle types work instantly through configuration', () => {
    obstacleManager.clear();

    // Custom sci-fi forcefield obstacle
    const forcefieldMesh = createMockMesh('plasma_barrier', 0.5, 0.7, 0, 2.0);
    const forcefieldObs = obstacleManager.registerObstacle(
      forcefieldMesh,
      forcefieldMesh,
      [forcefieldMesh],
      {
        name: 'plasma_barrier',
        material: 'glass',
        durability: 120,
        isDestructible: true,
        isMovable: false,
        mass: 999,
        isPenetrable: false,
        penetrationResistance: 80,
        scoreReward: 50,
      }
    );

    assert.strictEqual(forcefieldObs.material, 'glass');
    assert.strictEqual(forcefieldObs.maxDurability, 120);
    assert.strictEqual(forcefieldObs.penetrationResistance, 80);
    assert.strictEqual(forcefieldObs.scoreReward, 50);

    const hit = detectHitEntity(
      mockScene,
      new Vector3(-2, 0.5, 0),
      new Vector3(1, 0, 0),
      ignoreGunMesh,
      [],
      [],
      DEFAULT_WEAPON_BALLISTICS
    );

    assert.strictEqual(hit.hitObstacle, forcefieldObs, 'Custom obstacle detected and stopped bullet');
  });

  it('8. Prevent tunneling: ultra-high speed ray-sweep reliably detects collision without skipping', () => {
    obstacleManager.clear();
    // Thin obstacle at X = 5.0 (width only 0.05 meters)
    const thinWall = createMockMesh('thin_sheet', 4.975, 5.025, 0, 2.0);
    const thinObs = obstacleManager.registerObstacle(thinWall, thinWall, [thinWall], {
      name: 'thin_sheet',
      material: 'metal',
      durability: 0,
      isPenetrable: false,
      penetrationResistance: 100,
    });

    const enemy = createMockController('enemy_far', 12.0, 0.0);

    // Bullet fired across a 25-meter range in a single frame
    const hit = detectHitEntity(
      mockScene,
      new Vector3(-5.0, 0.5, 0),
      new Vector3(1.0, 0, 0),
      ignoreGunMesh,
      [enemy as any],
      [],
      DEFAULT_WEAPON_BALLISTICS
    );

    assert.strictEqual(hit.hitObstacle, thinObs, 'Continuous sweep hits the thin wall without tunneling');
    assert.strictEqual(hit.hitTarget, null, 'Enemy is protected from tunneling bullet');
    assert.strictEqual(hit.stoppedByObstacle, true);
  });

  it('9. Supporting obstacle destroyed under character: support height drops to 0 (floor) so character falls', () => {
    obstacleManager.clear();
    // Barrel under character at [-0.5, 0, 0] with top at Y = 0.51
    const barrelMesh = createMockMesh('oilBarrel1', -0.85, -0.15, 0, 0.51);
    const barrelObs = obstacleManager.registerObstacle(barrelMesh, barrelMesh, [barrelMesh], {
      name: 'oilBarrel1',
      material: 'metal',
      durability: 50,
      isDestructible: true,
      isMovable: false,
    });

    // Character stands at [-0.5, 0.51, 0]
    const initialSupport = getSupportingSurfaceY(-0.5, 0.51, 0);
    assert.strictEqual(initialSupport, 0.51, 'Character is supported by top of barrel');

    // Bullet destroys the barrel
    const impact = obstacleManager.applyImpact(barrelObs, new Vector3(-0.5, 0.25, 0), new Vector3(1, 0, 0), 50, 20);
    assert.strictEqual(impact.destroyed, true, 'Barrel is destroyed');
    assert.strictEqual(barrelObs.isDestroyed, true, 'Barrel state marked destroyed');

    // Supporting surface height under character must now be 0 (ground lawn)
    const afterDestroySupport = getSupportingSurfaceY(-0.5, 0.51, 0);
    assert.strictEqual(afterDestroySupport, 0, 'Support drops to ground Y = 0 so gravity pulls character down');
  });

  it('10. Wall collisions: weapon is blocked by leftWall and rightWall without passing through', () => {
    // Left wall at X = -5.7 (min.x = -5.95, max.x = -5.45, minY = 0, maxY = 4.0)
    const leftWall = createMockMesh('leftWall', -5.95, -5.45, 0, 4.0);
    leftWall.metadata.isWall = true;

    // Weapon moving left into the wall: nx = -5.2, vx = -4.0
    const resLeft = resolveMeshCollision(leftWall, -5.2, 0.5, 0, -4.0, 0);
    // Wall max.x + margin = -5.45 + 0.45 = -5.0
    assert.ok(resLeft.nx >= -5.0, `Weapon clamped to room interior: got ${resLeft.nx}, expected >= -5.0`);
    assert.ok(resLeft.vx > 0, `Weapon bounces back towards right (+vx): got ${resLeft.vx}`);

    // Weapon moving fast past wall: nx = -6.2 (would tunnel outside)
    const resTunnel = resolveMeshCollision(leftWall, -6.2, 0.5, 0, -12.0, 0);
    assert.ok(resTunnel.nx >= -5.0, `Weapon prevented from tunneling outside room: got ${resTunnel.nx}`);
    assert.ok(resTunnel.vx > 0, `Weapon bounced positively: got ${resTunnel.vx}`);

    // Right wall at X = 6.0 (min.x = 5.75, max.x = 6.25, minY = 0, maxY = 4.0)
    const rightWall = createMockMesh('rightWall', 5.75, 6.25, 0, 4.0);
    rightWall.metadata.isWall = true;

    // Weapon moving right into wall: nx = 5.5, vx = 5.0
    const resRight = resolveMeshCollision(rightWall, 5.5, 0.5, 0, 5.0, 0);
    // Wall min.x - margin = 5.75 - 0.45 = 5.3
    assert.ok(resRight.nx <= 5.3, `Weapon clamped to room interior: got ${resRight.nx}, expected <= 5.3`);
    assert.ok(resRight.vx < 0, `Weapon bounces back towards left (-vx): got ${resRight.vx}`);
  });

  it('11. Wall stops bullets: bullet fired towards room wall stops on the wall surface', () => {
    obstacleManager.clear();
    const leftWall = createMockMesh('leftWall', -5.95, -5.45, 0, 4.0);
    leftWall.metadata.isWall = true;
    const wallObs = obstacleManager.registerObstacle(leftWall, leftWall, [leftWall], {
      name: 'leftWall',
      material: 'concrete',
      durability: 0,
      isPenetrable: false,
    });

    const muzzlePos = new Vector3(-2.0, 1.0, 0);
    const barrelDir = new Vector3(-1.0, 0, 0); // Shooting left towards leftWall

    const hit = detectHitEntity(
      mockScene,
      muzzlePos,
      barrelDir,
      ignoreGunMesh,
      [],
      [],
      DEFAULT_WEAPON_BALLISTICS
    );

    assert.strictEqual(hit.hitObstacle, wallObs, 'Bullet hits the room wall');
    assert.strictEqual(hit.stoppedByObstacle, true, 'Bullet is stopped by the wall');
    assert.ok(hit.hitPoint.x <= -5.0, 'Bullet impact is at the wall surface');
  });

  it('12. Prevent gun mid-air freezing: getSupportSurfaceHeight caps height <= 0.85m and ignores walls/tall props', () => {
    const wallMock = createMockMesh('leftWall', -5.95, -5.45, 0, 4.0);
    wallMock.metadata.isWall = true;
    const dummyRoot: any = { isDescendantOf: () => false };
    const sceneWithWall: any = {
      meshes: [wallMock],
      pickWithRay: () => null,
    };

    // When gun is high at X = -5.2, Y = 3.5, getSupportSurfaceHeight must NEVER return 4.0 (the wall top)
    const supY = getSupportSurfaceHeight(sceneWithWall, -5.2, 3.5, 0, wallMock, dummyRoot);
    assert.ok(supY <= 0.85, `Support height must be strictly <= 0.85m, got ${supY}`);
  });

  it('13. Multi-mesh composite bounds and gun placement after last ragdoll across all levels', async () => {
    // A. Multi-mesh composite obstacle bounds calculation
    const child1 = createMockMesh('car_body', 0.5, 1.5, 0, 0.4);
    child1.getTotalVertices = () => 100;
    const child2 = createMockMesh('car_roof', 0.8, 1.2, 0.4, 0.65);
    child2.getTotalVertices = () => 50;

    const dummyRoot: any = { name: 'carRoot', position: new Vector3(1.0, 0, 0) };
    const carObs = obstacleManager.registerObstacle(dummyRoot, child1, [child1, child2], {
      name: 'car',
      material: 'metal',
    });

    const bounds = obstacleManager.getObstacleBounds(carObs);
    assert.strictEqual(bounds.min.x, 0.5, 'Bounds min.x encompasses child1');
    assert.strictEqual(bounds.max.x, 1.5, 'Bounds max.x encompasses child1');
    assert.strictEqual(bounds.max.y, 0.65, 'Bounds max.y encompasses top child2');

    // B. Verify gun is placed after the last ragdoll in Level 1, 2, and 3
    const fs = await import('fs');
    const path = await import('path');
    const levelFiles = ['level-1.json', 'level-2.json', 'level-3.json'];
    for (const lf of levelFiles) {
      const filePath = path.resolve('src/config/levels', lf);
      const json = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const maxTargetX = Math.max(...json.targets.map((t: any) => t.position[0]));
      assert.ok(
        json.gunSpawnPos[0] > maxTargetX,
        `Level ${lf}: gunSpawnPos X (${json.gunSpawnPos[0]}) must be > last ragdoll X (${maxTargetX})`
      );
    }
    const l4Path = path.resolve('src/config/levels/level-4.json');
    const l4Json = JSON.parse(fs.readFileSync(l4Path, 'utf-8'));
    assert.ok(Array.isArray(l4Json.gunSpawnPos) && l4Json.gunSpawnPos.length === 3, 'Level 4 has valid gunSpawnPos');
  });

  it('14. Level 2 dining chairs face table and walls enclose room symmetrically', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const l2Path = path.resolve('src/config/levels/level-2.json');
    const l2 = JSON.parse(fs.readFileSync(l2Path, 'utf-8'));

    const chairLeft = l2.props.find((p: any) => p.name === 'chairLeft');
    const chairRight = l2.props.find((p: any) => p.name === 'chairRight');
    const table = l2.props.find((p: any) => p.name === 'diningTable');
    const window = l2.props.find((p: any) => p.name === 'backWallCenterWindow');

    assert.ok(chairLeft, 'chairLeft exists');
    assert.ok(chairRight, 'chairRight exists');
    assert.ok(table, 'table exists');
    assert.ok(window, 'backWallCenterWindow exists');

    // ChairLeft backrest is at -X, seat faces straight +X towards table (rotY = 0)
    assert.strictEqual(chairLeft.rotationY, 0, `chairLeft must face straight right towards table (rotY = 0)`);

    // ChairRight backrest is at +X, seat faces straight -X towards table (rotY ~ 3.14159)
    assert.ok(chairRight.rotationY >= 3.14, `chairRight must face straight left towards table (rotY ~ 3.14, got ${chairRight.rotationY})`);

    // Window must be centered behind dining table (X = 1.6)
    assert.strictEqual(window.position[0], table.position[0], 'Window is aligned with table center');

    // Symmetrical side walls around center X = 1.6
    const leftWall = l2.props.find((p: any) => p.name === 'leftWall');
    const rightWall = l2.props.find((p: any) => p.name === 'rightWall');
    const leftDist = Math.abs(table.position[0] - leftWall.position[0]);
    const rightDist = Math.abs(rightWall.position[0] - table.position[0]);
    assert.ok(Math.abs(leftDist - rightDist) < 0.1, `Side walls are symmetric: left=${leftDist}, right=${rightDist}`);
  });

  it('15. Prevent flickering: weapon resting on top of platform obstacle does not get horizontally ejected', () => {
    // Platform (e.g. dining table) at X = 0.5 to 1.5, Y = 0 to 0.65
    const platformMesh = createMockMesh('diningTable', 0.5, 1.5, 0, 0.65);
    platformMesh.metadata.isObstacle = true;

    // Weapon resting on top of the table at X = 1.0, Y = 0.65 + 0.085 = 0.735
    const res = resolveMeshCollision(platformMesh, 1.0, 0.735, 0, 0, 0);

    // Must NOT be pushed off horizontally (nx remains 1.0, vx remains 0)
    assert.strictEqual(res.nx, 1.0, 'Weapon X position must not be displaced when resting on top of platform');
    assert.strictEqual(res.vx, 0, 'No velocity impulse applied when resting on top of platform');

    // But when weapon is at the SIDE of the table (e.g. X = 0.4, Y = 0.3), side collision still deflects
    const sideRes = resolveMeshCollision(platformMesh, 0.4, 0.3, 0, 2.0, 0);
    assert.ok(sideRes.nx < 0.5, 'Weapon is blocked from entering table body from the side');
    assert.ok(sideRes.vx < 0, 'Weapon bounces back when hitting table from the side');
  });

  it('15b. Gun landing on narrow/unstable prop (chair, car) vs stable table identifies stability and landing surface', () => {
    obstacleManager.clear();
    const chairMesh = createMockMesh('chair', 0.5, 0.9, 0, 0.8);
    obstacleManager.registerObstacle(chairMesh, chairMesh, [chairMesh], { name: 'chair', material: 'wood' });

    const carMesh = createMockMesh('raceCar', 1.5, 3.0, 0, 0.65);
    obstacleManager.registerObstacle(carMesh, carMesh, [carMesh], { name: 'raceCar', material: 'metal' });

    const tableMesh = createMockMesh('diningTable', 4.0, 5.5, 0, 0.77);
    obstacleManager.registerObstacle(tableMesh, tableMesh, [tableMesh], { name: 'diningTable', material: 'wood' });

    // 1. Chair: Over chair at X = 0.7, Y = 0.85 -> detects surface at 0.8, marked as unstable
    const chairInfo = getSupportSurfaceInfo(mockScene, 0.7, 0.85, 0, ignoreGunMesh, ignoreGunMesh);
    assert.strictEqual(chairInfo.isStable, false, 'Chair is marked as unstable prop');
    assert.strictEqual(chairInfo.surfaceY, 0.8, 'Chair surface is detected at height 0.8');

    // 2. Car: Over car at X = 2.0, Y = 0.70 -> detects surface at 0.65, marked as unstable
    const carInfo = getSupportSurfaceInfo(mockScene, 2.0, 0.70, 0, ignoreGunMesh, ignoreGunMesh);
    assert.strictEqual(carInfo.isStable, false, 'Car is marked as unstable prop');
    assert.strictEqual(carInfo.surfaceY, 0.65, 'Car surface is detected at height 0.65');

    // 3. Table: Over dining table at X = 4.8, Y = 0.80 -> detects surface at 0.77, marked as stable
    const tableInfo = getSupportSurfaceInfo(mockScene, 4.8, 0.80, 0, ignoreGunMesh, ignoreGunMesh);
    assert.strictEqual(tableInfo.isStable, true, 'Table is marked as stable platform');
    assert.strictEqual(tableInfo.surfaceY, 0.77, 'Table surface is detected at height 0.77');

    // 4. In air beyond chair edge: Gun past X = 1.1 falls to ground (surfaceY = 0)
    const floorInfo = getSupportSurfaceInfo(mockScene, 1.1, 0.85, 0, ignoreGunMesh, ignoreGunMesh);
    assert.strictEqual(floorInfo.surfaceY, 0, 'Once past obstacle edge, support drops to ground floor');
  });

  it('16. Verified CC0 public domain GLB models exist on disk and are registered in ASSET_CATALOG', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { ASSET_CATALOG } = await import('../src/editor/assetCatalog');

    const expectedModels = [
      'nature/tree_oak.glb',
      'nature/tree_pine.glb',
      'nature/tree_default.glb',
      'nature/fence.glb',
      'nature/campfire.glb',
      'nature/bench.glb',
      'city_traffic/police.glb',
      'city_traffic/suv.glb',
      'city_traffic/delivery.glb',
      'city_traffic/taxi.glb',
      'workshop/machine.glb',
      'workshop/box_large.glb',
      'workshop/box_cardboard.glb',
      'workshop/chest.glb',
      'room_dinner/pizza.glb',
      'room_dinner/donut.glb',
      'room_dinner/soda_can.glb',
      'room_dinner/arcade_machine.glb',
    ];

    for (const m of expectedModels) {
      const fullPath = path.resolve('public/assets/models', m);
      assert.ok(fs.existsSync(fullPath), `Model file exists: ${m}`);
      const stats = fs.statSync(fullPath);
      assert.ok(stats.size > 1000, `Model file is non-empty: ${m} (${stats.size} bytes)`);

      const inCatalog = ASSET_CATALOG.some((a) => a.modelPath === m);
      assert.ok(inCatalog, `Model is registered in ASSET_CATALOG: ${m}`);
    }
  });

  it('17. Cars, taxis, police cruisers, and buildings are permanent and NEVER hidden or destroyed upon bullet impacts', () => {
    obstacleManager.clear();
    const barrelDir = new Vector3(1.0, 0, 0);

    // Register a taxi and a police cruiser
    const taxiMesh = createMockMesh('getawayTaxi', 0.5, 1.5, 0, 1.5);
    const taxiObs = obstacleManager.registerObstacle(taxiMesh, taxiMesh, [taxiMesh], {
      name: 'getawayTaxi',
      material: 'metal',
      durability: 3, // Even if given durability in config, it MUST remain permanent & indestructible
      isDestructible: true,
    });

    assert.strictEqual(taxiObs.isDestructible, false, 'Vehicles must be marked indestructible');
    assert.strictEqual(taxiObs.maxDurability, 0, 'Vehicles must have 0 durability (infinite/indestructible)');

    // Shoot the taxi 10 times with heavy damage
    for (let shot = 0; shot < 10; shot++) {
      const impact = obstacleManager.applyImpact(taxiObs, new Vector3(0.5, 0.5, 0), barrelDir, 100, 30);
      assert.strictEqual(impact.destroyed, false, `Taxi must NEVER be destroyed on shot ${shot + 1}`);
      assert.strictEqual(taxiObs.isDestroyed, false, 'Taxi state must never be marked destroyed');
      assert.strictEqual(taxiMesh.isVisible, true, 'Taxi mesh must NEVER be hidden');
    }

    // Register a building
    const bldgMesh = createMockMesh('cityBuilding', -1.0, 1.0, 3.0, 3.5);
    const bldgObs = obstacleManager.registerObstacle(bldgMesh, bldgMesh, [bldgMesh], {
      name: 'buildingLeft',
      material: 'concrete',
    });

    assert.strictEqual(bldgObs.isDestructible, false, 'Buildings must be indestructible');
    const bldgImpact = obstacleManager.applyImpact(bldgObs, new Vector3(-1.0, 1.0, 3.0), barrelDir, 200, 50);
    assert.strictEqual(bldgImpact.destroyed, false, 'Building must never be destroyed');
    assert.strictEqual(bldgMesh.isVisible, true, 'Building mesh must NEVER be hidden');
  });
});



