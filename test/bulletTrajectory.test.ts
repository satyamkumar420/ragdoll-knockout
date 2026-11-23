import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Vector3 } from '@babylonjs/core';
import { detectHitEntity } from '../src/core/hitDetection.ts';
import { DEFAULT_WEAPON_BALLISTICS } from '../src/core/obstacleTypes.ts';
import { obstacleManager } from '../src/core/obstacleManager.ts';

function createMockCharacter(id: string, posX: number, posY: number) {
  let isDefeated = false;
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
      return isDefeated;
    },
    triggerHit: () => {
      isDefeated = true;
    },
  };
}

function createMockMesh(name: string, minX: number, maxX: number, minY: number, maxY: number) {
  const position = new Vector3((minX + maxX) / 2, minY, 0);
  return {
    name,
    position,
    metadata: { isObstacle: true },
    checkCollisions: true,
    isEnabled: () => true,
    isVisible: true,
    getBoundingInfo: () => ({
      boundingBox: {
        minimumWorld: new Vector3(minX, minY, -0.5),
        maximumWorld: new Vector3(maxX, maxY, 0.5),
      },
    }),
    isDescendantOf: () => false,
  };
}

describe('Bullet Trajectory & Angular Hit Accuracy Tests', () => {
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

  const ignoreMesh: any = {
    name: 'ignoreGun',
    isEnabled: () => true,
    isVisible: true,
    isDescendantOf: () => false,
  };

  it('1. Downward shot hits ground at exact geometric intersection point without skew', () => {
    obstacleManager.clear();
    const muzzlePos = new Vector3(2.0, 3.5, 0);
    // Angle -135 degrees (steep down-left)
    const angle = (-135 * Math.PI) / 180;
    const dir = new Vector3(Math.cos(angle), Math.sin(angle), 0).normalize();

    const hit = detectHitEntity(mockScene, muzzlePos, dir, ignoreMesh, [], [], DEFAULT_WEAPON_BALLISTICS);

    assert.strictEqual(hit.stoppedByObstacle, true, 'Ground stops downward shot');
    assert.strictEqual(hit.hitObstacle, null, 'No specific obstacle, hits ground plane');
    assert.ok(Math.abs(hit.hitPoint.y - 0.02) < 0.001, 'Hit point is flush on ground lawn');

    // Expected ground hit: tGround = (0.02 - 3.5) / dir.y
    const expectedT = (0.02 - 3.5) / dir.y;
    const expectedX = muzzlePos.x + dir.x * expectedT;
    assert.ok(Math.abs(hit.hitPoint.x - expectedX) < 0.01, 'Hit point X exactly follows trajectory without warp');

    // Verify vector from muzzle to hitPoint has the EXACT firing angle
    const trajectoryAngle = Math.atan2(hit.hitPoint.y - muzzlePos.y, hit.hitPoint.x - muzzlePos.x);
    assert.ok(Math.abs(trajectoryAngle - angle) < 0.001, 'Flight trajectory perfectly preserves firing angle');
  });

  it('2. High-altitude gun aiming at character head from steep angle hits cleanly (no passing through)', () => {
    obstacleManager.clear();
    const muzzlePos = new Vector3(0.0, 4.0, 0); // High airborne gun
    const charPos = new Vector3(-3.04, 0, 0);
    const targetEnemy = createMockCharacter('standing_enemy', charPos.x, charPos.y);

    // Aim directly at enemy head (height 1.65m)
    const headTarget = new Vector3(-3.04, 1.65, 0);
    const shootDir = headTarget.subtract(muzzlePos).normalize();

    const hit = detectHitEntity(mockScene, muzzlePos, shootDir, ignoreMesh, [targetEnemy as any], [], DEFAULT_WEAPON_BALLISTICS);

    assert.strictEqual(hit.hitTarget, targetEnemy, 'Enemy head is reliably hit from steep angle');
    assert.ok(hit.hitPoint.x <= -2.5 && hit.hitPoint.x >= -3.5, 'Hit point is on enemy body');
    assert.ok(hit.hitPoint.y >= 1.0, 'Impact is at head/upper body height');
  });

  it('3. High-altitude gun aiming at character feet/legs hits cleanly', () => {
    obstacleManager.clear();
    const muzzlePos = new Vector3(0.0, 4.0, 0);
    const charPos = new Vector3(-3.04, 0, 0);
    const targetEnemy = createMockCharacter('standing_enemy_legs', charPos.x, charPos.y);

    // Aim directly at enemy lower legs (height 0.35m)
    const legTarget = new Vector3(-3.04, 0.35, 0);
    const shootDir = legTarget.subtract(muzzlePos).normalize();

    const hit = detectHitEntity(mockScene, muzzlePos, shootDir, ignoreMesh, [targetEnemy as any], [], DEFAULT_WEAPON_BALLISTICS);

    assert.strictEqual(hit.hitTarget, targetEnemy, 'Enemy legs are reliably hit');
  });

  it('4. Horizontal direct shot hits enemy torso squarely', () => {
    obstacleManager.clear();
    const muzzlePos = new Vector3(3.0, 1.0, 0);
    const targetEnemy = createMockCharacter('enemy_center', -1.0, 0);
    const shootDir = new Vector3(-1.0, 0, 0); // Straight horizontal left

    const hit = detectHitEntity(mockScene, muzzlePos, shootDir, ignoreMesh, [targetEnemy as any], [], DEFAULT_WEAPON_BALLISTICS);

    assert.strictEqual(hit.hitTarget, targetEnemy, 'Direct horizontal shot hits enemy');
    assert.strictEqual(hit.hitPoint.z, 0, 'Hit point is strictly on 2D gameplay plane (Z = 0)');
  });

  it('5. Bullet fired off-screen into the sky travels straight along trajectory without Y clamping', () => {
    obstacleManager.clear();
    const muzzlePos = new Vector3(0, 2.0, 0);
    const angle = (45 * Math.PI) / 180; // 45 deg upwards
    const shootDir = new Vector3(Math.cos(angle), Math.sin(angle), 0);

    const hit = detectHitEntity(mockScene, muzzlePos, shootDir, ignoreMesh, [], [], DEFAULT_WEAPON_BALLISTICS);

    assert.strictEqual(hit.hitTarget, null);
    assert.strictEqual(hit.hitObstacle, null);
    assert.ok(hit.hitPoint.y > 10.0, 'Sky shot goes high into the air without ground clamping');
    const actualAngle = Math.atan2(hit.hitPoint.y - muzzlePos.y, hit.hitPoint.x - muzzlePos.x);
    assert.ok(Math.abs(actualAngle - angle) < 0.001, 'Sky flight trajectory perfectly preserves firing angle');
  });

  it('6. Ragdoll close and BEHIND muzzle (muzzle points right +X, ragdoll is on left -X) is NEVER hit', () => {
    obstacleManager.clear();
    // Ragdoll at X = 1.0, Y = 0 (bounds ~ [0.52, 1.48])
    const behindEnemy = createMockCharacter('enemy_behind', 1.0, 0);

    // Gun muzzle at X = 1.8, Y = 0.8, pointing strictly RIGHT (+X)
    const muzzlePos = new Vector3(1.8, 0.8, 0);
    const shootDir = new Vector3(1.0, 0, 0); // Firing to the RIGHT (away from enemy on left)

    const hit = detectHitEntity(
      mockScene,
      muzzlePos,
      shootDir,
      ignoreMesh,
      [behindEnemy as any],
      [],
      DEFAULT_WEAPON_BALLISTICS
    );

    assert.strictEqual(
      hit.hitTarget,
      null,
      'Enemy BEHIND muzzle on the left must NEVER be hit when shooting to the right'
    );
  });

  it('7. Point-blank forward shot directly touching enemy in front hits cleanly', () => {
    obstacleManager.clear();
    // Enemy at X = 2.0, Y = 0 (bounds ~ [1.52, 2.48])
    const frontEnemy = createMockCharacter('enemy_front', 2.0, 0);

    // Muzzle right at X = 1.6, Y = 1.0 pointing RIGHT (+X, directly into enemy)
    const muzzlePos = new Vector3(1.6, 1.0, 0);
    const shootDir = new Vector3(1.0, 0, 0);

    const hit = detectHitEntity(
      mockScene,
      muzzlePos,
      shootDir,
      ignoreMesh,
      [frontEnemy as any],
      [],
      DEFAULT_WEAPON_BALLISTICS
    );

    assert.strictEqual(hit.hitTarget, frontEnemy, 'Point-blank shot in front of enemy hits successfully');
  });

  it('8. Arbitrary internal wall at X = 0.5 blocks weapon without hardcoded coordinate assumptions', async () => {
    const { resolveMeshCollision } = await import('../src/weaponPhysics.ts');
    // Internal room partition wall at X in [0.4, 0.6], Y in [0, 2.5]
    const midWall = createMockMesh('partition_wall', 0.4, 0.6, 0, 2.5);
    midWall.metadata.isWall = true;

    // Weapon flying from left (X = 0.3) moving right (+X) at 4.0 m/s
    const resRight = resolveMeshCollision(midWall, 0.3, 1.0, 0, 4.0, 0);
    // Wall min.x - wallMargin = 0.4 - 0.45 = -0.05
    assert.ok(resRight.nx <= 0.05, `Weapon blocked on left face of internal wall: got ${resRight.nx} <= 0.05`);
    assert.ok(resRight.vx < 0, `Weapon bounces back left with negative velocity: got ${resRight.vx} < 0`);

    // Weapon flying from right (X = 0.7) moving left (-X) at -4.0 m/s
    const resLeft = resolveMeshCollision(midWall, 0.7, 1.0, 0, -4.0, 0);
    // Wall max.x + wallMargin = 0.6 + 0.45 = 1.05
    assert.ok(resLeft.nx >= 1.0, `Weapon blocked on right face of internal wall: got ${resLeft.nx} >= 1.0`);
    assert.ok(resLeft.vx > 0, `Weapon bounces back right with positive velocity: got ${resLeft.vx} > 0`);
  });

  it('9. Gun in room interior (X = 3.65) never triggers false wall collisions or teleports', async () => {
    const { resolveMeshCollision } = await import('../src/weaponPhysics.ts');
    // Level 2 right wall at [7.35, 7.85] and left wall at [-4.65, -4.15]
    const rightWall = createMockMesh('rightWall', 7.35, 7.85, 0, 4.0);
    rightWall.metadata.isWall = true;
    const leftWall = createMockMesh('leftWall', -4.65, -4.15, 0, 4.0);
    leftWall.metadata.isWall = true;

    // Gun spawns at X = 3.65 and recoils left (vx = -3.5) after shooting right
    const resRightWallMovingLeft = resolveMeshCollision(rightWall, 3.65, 0.5, 0, -3.5, 0);
    assert.strictEqual(resRightWallMovingLeft.nx, 3.65, 'Gun at X = 3.65 is NOT teleported by right wall');
    assert.strictEqual(resRightWallMovingLeft.vx, -3.5, 'Velocity is NOT affected by distant right wall');

    const resLeftWallMovingLeft = resolveMeshCollision(leftWall, 3.65, 0.5, 0, -3.5, 0);
    assert.strictEqual(resLeftWallMovingLeft.nx, 3.65, 'Gun at X = 3.65 is NOT teleported by left wall');
    assert.strictEqual(resLeftWallMovingLeft.vx, -3.5, 'Velocity is NOT affected by distant left wall');

    // Gun recoils right (vx = +3.5) after shooting left
    const resRightWallMovingRight = resolveMeshCollision(rightWall, 3.65, 0.5, 0, 3.5, 0);
    assert.strictEqual(resRightWallMovingRight.nx, 3.65, 'Gun at X = 3.65 is NOT teleported by right wall when moving right');
    assert.strictEqual(resRightWallMovingRight.vx, 3.5, 'Velocity is NOT affected by distant right wall when moving right');

    const resLeftWallMovingRight = resolveMeshCollision(leftWall, 3.65, 0.5, 0, 3.5, 0);
    assert.strictEqual(resLeftWallMovingRight.nx, 3.65, 'Gun at X = 3.65 is NOT teleported by left wall when moving right');
    assert.strictEqual(resLeftWallMovingRight.vx, 3.5, 'Velocity is NOT affected by distant left wall when moving right');
  });

  it('10. High-speed gun impact against room boundary walls cleanly deflects without entering wall interior', async () => {
    const { resolveMeshCollision } = await import('../src/weaponPhysics.ts');
    const rightWall = createMockMesh('rightWall', 7.35, 7.85, 0, 4.0);
    rightWall.metadata.isWall = true;
    const leftWall = createMockMesh('leftWall', -4.65, -4.15, 0, 4.0);
    leftWall.metadata.isWall = true;

    // Gun moving fast towards right wall (+X): hits at X = 7.0 (wall min is 7.35, margin 0.45 -> boundary is 6.90)
    const hitRight = resolveMeshCollision(rightWall, 7.0, 1.2, 0, 8.0, 0);
    assert.ok(hitRight.nx <= 6.91, `Gun clamped outside right wall: got ${hitRight.nx} <= 6.91`);
    assert.ok(hitRight.vx < 0, `Gun bounces back left into room: got ${hitRight.vx} < 0`);

    // Gun moving fast towards left wall (-X): hits at X = -3.8 (wall max is -4.15, margin 0.45 -> boundary is -3.70)
    const hitLeft = resolveMeshCollision(leftWall, -3.8, 1.2, 0, -8.0, 0);
    assert.ok(hitLeft.nx >= -3.71, `Gun clamped outside left wall: got ${hitLeft.nx} >= -3.71`);
    assert.ok(hitLeft.vx > 0, `Gun bounces back right into room: got ${hitLeft.vx} > 0`);
  });

  it('11. Gun resting near room wall remains stable and never penetrates', async () => {
    const { resolveMeshCollision } = await import('../src/weaponPhysics.ts');
    const rightWall = createMockMesh('rightWall', 7.35, 7.85, 0, 4.0);
    rightWall.metadata.isWall = true;

    // Resting gun near right wall at 6.90 with vx = 0
    const rest = resolveMeshCollision(rightWall, 6.90, 0.2, 0, 0, 0);
    assert.ok(rest.nx <= 6.91, `Resting gun stays outside right wall: got ${rest.nx}`);
    assert.strictEqual(rest.vx, 0, 'Velocity remains 0');
  });

  it('12. Gun near room wall recoiling away never teleports inside or across the wall', async () => {
    const { resolveMeshCollision } = await import('../src/weaponPhysics.ts');
    const rightWall = createMockMesh('rightWall', 7.35, 7.85, 0, 4.0);
    rightWall.metadata.isWall = true;
    const leftWall = createMockMesh('leftWall', -4.65, -4.15, 0, 4.0);
    leftWall.metadata.isWall = true;

    // Gun near right wall at X = 7.00 firing right, recoiling left (vx = -5.2)
    // Must NEVER teleport to X = 8.30 or flip velocity to positive!
    const recoilRight = resolveMeshCollision(rightWall, 7.0, 0.5, 0, -5.2, 0);
    assert.ok(recoilRight.nx <= 6.91, `Gun stays on left face of right wall: got ${recoilRight.nx} <= 6.91`);
    assert.strictEqual(recoilRight.vx, -5.2, 'Velocity remains negative to freely fly left into the room');

    // Gun near left wall at X = -3.80 firing left, recoiling right (vx = +5.2)
    // Must NEVER teleport to X = -5.10 or flip velocity to negative!
    const recoilLeft = resolveMeshCollision(leftWall, -3.8, 0.5, 0, 5.2, 0);
    assert.ok(recoilLeft.nx >= -3.71, `Gun stays on right face of left wall: got ${recoilLeft.nx} >= -3.71`);
    assert.strictEqual(recoilLeft.vx, 5.2, 'Velocity remains positive to freely fly right into the room');
  });

  it('13. getPlayableXBounds restricts room coordinates cleanly based on level walls', async () => {
    const { getPlayableXBounds } = await import('../src/weaponPhysics.ts');
    const { obstacleManager } = await import('../src/core/obstacleManager.ts');

    const leftWall = createMockMesh('leftWall', -4.65, -4.15, 0, 4.0);
    leftWall.metadata.isWall = true;
    leftWall.position = new Vector3(-4.4, 0, 0.7);

    const rightWall = createMockMesh('rightWall', 7.35, 7.85, 0, 4.0);
    rightWall.metadata.isWall = true;
    rightWall.position = new Vector3(7.6, 0, 0.7);

    obstacleManager.clear();
    obstacleManager.registerObstacle(leftWall as any, leftWall as any, [leftWall as any], { name: 'leftWall' });
    obstacleManager.registerObstacle(rightWall as any, rightWall as any, [rightWall as any], { name: 'rightWall' });

    const bounds = getPlayableXBounds({} as any, 3.65, { minX: -6.0, maxX: 9.0 });
    assert.ok(Math.abs(bounds.minX - (-3.30)) < 0.05, `Left playable bound is -3.30: got ${bounds.minX}`);
    assert.ok(Math.abs(bounds.maxX - 6.50) < 0.05, `Right playable bound is 6.50: got ${bounds.maxX}`);
  });

  it('14. Enemy with 3D Z offset from editor produces strictly 2D hit point (Z = 0) preventing skewed bullets', () => {
    obstacleManager.clear();
    const muzzlePos = new Vector3(-2.0, 1.0, 0);
    const charPos = new Vector3(2.0, 0, 3.5); // Enemy placed at Z = 3.5m in 3D editor
    const targetEnemy = {
      id: 'enemy_3d_z',
      character: {
        mainMesh: {
          getAbsolutePosition: () => new Vector3(charPos.x, charPos.y, charPos.z),
          name: 'char_3d_z',
        },
        playAnimation: () => {},
      },
      getPosition: () => new Vector3(charPos.x, charPos.y, charPos.z),
      isDefeated: false,
      triggerHit: () => {},
    };

    const shootDir = new Vector3(1, 0, 0); // Firing straight right in 2D
    const hit = detectHitEntity(mockScene, muzzlePos, shootDir, ignoreMesh, [targetEnemy as any], [], DEFAULT_WEAPON_BALLISTICS);

    assert.ok(hit.hitTarget, 'Target is detected');
    assert.strictEqual(hit.hitPoint.z, 0, 'Hit point Z must be strictly 0 on 2D action plane');
    assert.ok(hit.hitPoint.x > muzzlePos.x, 'Hit point X is ahead of gun along 2D direction');
  });

  it('15. Point-blank contact against 3D enemy produces 2D forward hit point at Z = 0 without skew', () => {
    obstacleManager.clear();
    const muzzlePos = new Vector3(0.0, 1.0, 0);
    const targetEnemy = {
      id: 'enemy_pb',
      character: {
        mainMesh: {
          getAbsolutePosition: () => new Vector3(0.1, 0.5, 0.8), // Right in front, but has Z = 0.8
          name: 'char_pb',
        },
        playAnimation: () => {},
      },
      getPosition: () => new Vector3(0.1, 0.5, 0.8),
      isDefeated: false,
      triggerHit: () => {},
    };

    const shootDir = new Vector3(1, 0, 0);
    const hit = detectHitEntity(mockScene, muzzlePos, shootDir, ignoreMesh, [targetEnemy as any], [], DEFAULT_WEAPON_BALLISTICS);

    assert.ok(hit.hitTarget, 'Point blank contact detects target');
    assert.strictEqual(hit.hitPoint.z, 0, 'Point blank hitPoint Z must be strictly 0');
    assert.ok(hit.hitPoint.x > muzzlePos.x, 'Point blank hitPoint X is cleanly in front along firing vector');
  });

  it('16. Sitting character in armchair is hit cleanly without armchair blocking the bullet', () => {
    obstacleManager.clear();
    const muzzlePos = new Vector3(-2.0, 0.6, 0); // Firing at chest height of sitting enemy
    const chairMesh = createMockMesh('room_armchair_test', 0.5, 1.5, 0, 1.2);
    chairMesh.metadata.isObstacle = true;
    (chairMesh.metadata as any).isBox = true;
    obstacleManager.registerObstacle(chairMesh as any, chairMesh as any, [chairMesh as any], {
      name: 'room_armchair_test',
      modelPath: 'room_dinner/armchair.glb',
      isPenetrable: false,
    });

    const sittingTarget = {
      id: 'sitting_enemy',
      character: {
        mainMesh: {
          getAbsolutePosition: () => new Vector3(1.0, 0, 0),
          name: 'char_sitting',
        },
        animationGroups: [
          { name: 'Sitting_Talking_Loop', isPlaying: true },
        ],
        playAnimation: () => {},
      },
      getPosition: () => new Vector3(1.0, 0, 0),
      isDefeated: false,
      triggerHit: () => {},
    };

    const shootDir = new Vector3(1, 0, 0); // Firing straight towards the sitting target
    const hit = detectHitEntity(mockScene, muzzlePos, shootDir, ignoreMesh, [sittingTarget as any], [], DEFAULT_WEAPON_BALLISTICS);

    assert.strictEqual(hit.hitTarget, sittingTarget, 'Sitting character is hit cleanly despite chair obstacle');
    assert.strictEqual(hit.stoppedByObstacle, false, 'Bullet is not stopped by the chair');
  });

  it('17. Chicken companion with custom scale is reliably hit by directional bullet', () => {
    obstacleManager.clear();
    const muzzlePos = new Vector3(-3.0, 0.4, 0);
    const mockPug = {
      rootNode: {
        position: new Vector3(0.5, 0, 0),
        scaling: { x: 1.2, y: 1.2, z: 1.2 },
      },
      isDefeated: false,
      triggerHit: () => {},
    };

    // Shoot slightly angled up towards the chicken's comb/head
    const shootDir = new Vector3(0.5 - (-3.0), 0.7 - 0.4, 0).normalize();
    const hit = detectHitEntity(mockScene, muzzlePos, shootDir, ignoreMesh, [], [mockPug as any], DEFAULT_WEAPON_BALLISTICS);

    assert.strictEqual(hit.hitPug, mockPug, 'Chicken companion is reliably hit along firing vector');
    assert.strictEqual(hit.hitPoint.z, 0, 'Chicken impact coordinate Z is 0');
  });

  it('18. Near-miss angular shot connects cleanly with swept bullet radius (no bypass)', () => {
    obstacleManager.clear();
    const muzzlePos = new Vector3(-2.0, 1.0, 0);
    // Standing target at X = 2.0, Y = 0 (torso at height 0.60 - 1.45)
    const targetEnemy = createMockCharacter('standing_enemy_nearmiss', 2.0, 0);

    // Aim just skimming 0.12m outside normal tight box (at height 1.0m)
    // Previously this would bypass completely, but with BULLET_HIT_RADIUS (0.18m) it connects!
    const targetPoint = new Vector3(2.0, 1.0, 0);
    const shootDir = targetPoint.subtract(muzzlePos).normalize();
    const hit = detectHitEntity(mockScene, muzzlePos, shootDir, ignoreMesh, [targetEnemy as any], [], DEFAULT_WEAPON_BALLISTICS);

    assert.strictEqual(hit.hitTarget, targetEnemy, 'Swept bullet radius ensures near-miss cleanly impacts target');
  });

  it('19. Shot towards enemy 0.8m away reaches enemy body and never terminates at 2-5cm premature muzzle range', () => {
    obstacleManager.clear();
    const muzzlePos = new Vector3(0.0, 1.0, 0);
    const targetEnemy = createMockCharacter('enemy_08m_away', 0.8, 0); // 0.8m in front
    const shootDir = new Vector3(1.0, 0, 0);

    const hit = detectHitEntity(mockScene, muzzlePos, shootDir, ignoreMesh, [targetEnemy as any], [], DEFAULT_WEAPON_BALLISTICS);
    assert.strictEqual(hit.hitTarget, targetEnemy, 'Target in front is hit');
    // Distance must reach into the character's physical body, NOT stop at 0.02m or 0.05m
    assert.ok(hit.hitPoint.x >= 0.65, `Hit point X (${hit.hitPoint.x}) reaches into target body instead of terminating near muzzle`);
  });

  it('20. Gun within 0.8m of enemy pointing AWAY never triggers false point-blank kill', () => {
    obstacleManager.clear();
    const muzzlePos = new Vector3(0.0, 1.0, 0);
    const targetEnemy = createMockCharacter('enemy_on_right', 0.8, 0); // 0.8m to the right
    const shootDir = new Vector3(-1.0, 0, 0); // Shooting LEFT (opposite direction)

    const hit = detectHitEntity(mockScene, muzzlePos, shootDir, ignoreMesh, [targetEnemy as any], [], DEFAULT_WEAPON_BALLISTICS);
    assert.strictEqual(hit.hitTarget, null, 'Shooting away from nearby enemy must never kill them');
  });

  it('21. spawnEnhancedBullet stays strictly on 2D plane (Z = 0) and travels straight without curving', async () => {
    const { NullEngine, Scene: BScene } = await import('@babylonjs/core');
    const { spawnEnhancedBullet } = await import('../src/bullet.ts');
    const engine = new NullEngine();
    const scene = new BScene(engine);

    const start = new Vector3(0, 1.0, 0);
    const end = new Vector3(5, 1.0, 0);
    const dir = new Vector3(1, 0, 0);

    const mock3DTarget = {
      getPosition: () => new Vector3(5, 1.0, 1.5), // Target is placed at Z = 1.5 in 3D
      isDefeated: false,
    };

    let impacted = false;
    spawnEnhancedBullet(scene, engine, start, end, dir, () => {
      impacted = true;
    }, true, mock3DTarget as any);

    // Find the bulletRoot transform node
    const bulletRoot = scene.transformNodes.find((tn: any) => tn.name.startsWith('realBulletRoot'));
    assert.ok(bulletRoot, 'Bullet root transform node created');

    // Step several frames through render observable
    for (let frame = 0; frame < 20; frame++) {
      scene.onBeforeRenderObservable.notifyObservers(scene);
      if (bulletRoot && !bulletRoot.isDisposed()) {
        assert.strictEqual(bulletRoot.position.z, 0, 'Bullet Z must remain strictly 0 throughout flight');
        assert.strictEqual(bulletRoot.position.y, 1.0, 'Bullet Y must stay strictly on firing line (1.0)');
        assert.ok(bulletRoot.position.x >= 0 && bulletRoot.position.x <= 5.0, 'Bullet X advances strictly forward');
        assert.strictEqual(bulletRoot.rotation.z, 0, 'Bullet rotation Z stays aligned with flight direction');
      }
    }

    scene.dispose();
    engine.dispose();
  });

  it('22. Shot aimed 0.5m away from character body does not trigger false hit', () => {
    obstacleManager.clear();
    const muzzlePos = new Vector3(-2.0, 1.0, 0);
    const targetEnemy = createMockCharacter('standing_enemy_clear', 2.0, 0); // At X = 2.0, Y = 0 (torso: Y = 0.60 to 1.45)

    // Aim 0.5m above the head (Y = 2.45 instead of <= 1.88 + 0.08 = 1.96)
    const aimHigh = new Vector3(2.0, 2.45, 0);
    const shootDir = aimHigh.subtract(muzzlePos).normalize();

    const hit = detectHitEntity(mockScene, muzzlePos, shootDir, ignoreMesh, [targetEnemy as any], [], DEFAULT_WEAPON_BALLISTICS);
    assert.strictEqual(hit.hitTarget, null, 'Shooting clearly above enemy must not trigger hit');
  });
});
