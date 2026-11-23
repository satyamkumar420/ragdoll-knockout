import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { NullEngine, Scene, SceneLoader } from '@babylonjs/core';
import '@babylonjs/loaders';
import { audioManager, playGunshot, playSlidePull, playSlideRelease, playMagIn, playMagOut, playClipFill } from '../src/audio';

describe('Weapon Animation and Audio Integration Tests', () => {
  it('happy path: Pistol.glb loads with all 8 native AnimationGroups in BabylonJS', async () => {
    const glbPath = path.resolve(process.cwd(), 'public/assets/Pistol.glb');
    assert.ok(fs.existsSync(glbPath), 'public/assets/Pistol.glb must exist');

    const buffer = fs.readFileSync(glbPath);
    const base64 = 'data:base64,' + buffer.toString('base64');

    const engine = new NullEngine();
    const scene = new Scene(engine);

    const result = await SceneLoader.ImportMeshAsync('', '', base64, scene);
    assert.ok(result.meshes.length > 0, 'Meshes should be loaded');

    const agMap = new Map<string, any>();
    for (const ag of result.animationGroups) {
      agMap.set(ag.name, ag);
    }

    const expectedAnimations = [
      'Fire',
      'Slide Pull',
      'Slide Release',
      'Hammer Pull',
      'Hammer Release',
      'Mag Out',
      'Mag In',
      'RESET'
    ];

    for (const animName of expectedAnimations) {
      assert.ok(agMap.has(animName), `AnimationGroup "${animName}" must be present in Pistol.glb`);
      const ag = agMap.get(animName);
      assert.ok(ag.targetedAnimations.length > 0, `AnimationGroup "${animName}" must target submeshes`);
    }

    // Verify submeshes exist
    const meshNames = result.meshes.map((m) => m.name);
    assert.ok(meshNames.includes('Pistol'), 'Frame mesh should exist');
    assert.ok(meshNames.includes('slide'), 'Slide mesh should exist');
    assert.ok(meshNames.includes('hammer'), 'Hammer mesh should exist');
    assert.ok(meshNames.includes('magazine (loaded)'), 'Magazine mesh should exist');
  });

  it('happy path: weapon audio files exist and are within lightweight storage budget', () => {
    const audioDir = path.resolve(process.cwd(), 'public/assets/audio/weapon');
    assert.ok(fs.existsSync(audioDir), 'public/assets/audio/weapon folder must exist');

    const expectedAudioFiles = [
      'gunshot.mp3',
      'slide_pull.mp3',
      'slide_release.mp3',
      'mag_in.mp3',
      'mag_out.mp3',
      'clip_fill.mp3'
    ];

    let totalSizeBytes = 0;
    for (const file of expectedAudioFiles) {
      const fullPath = path.join(audioDir, file);
      assert.ok(fs.existsSync(fullPath), `${file} must exist`);
      const stat = fs.statSync(fullPath);
      totalSizeBytes += stat.size;
    }

    // Must be ultra lightweight (< 200KB for all weapon audio combined)
    assert.ok(
      totalSizeBytes < 200 * 1024,
      `Total weapon audio size (${(totalSizeBytes / 1024).toFixed(1)} KB) should be under 200 KB`
    );
  });

  it('happy path: audio functions execute safely without crashing in any environment', () => {
    assert.doesNotThrow(() => {
      playGunshot();
      playSlidePull();
      playSlideRelease();
      playMagIn();
      playMagOut();
      playClipFill();
    });
  });

  it('failure path: handles non-existent animation names gracefully without throwing', async () => {
    const glbPath = path.resolve(process.cwd(), 'public/assets/Pistol.glb');
    const buffer = fs.readFileSync(glbPath);
    const base64 = 'data:base64,' + buffer.toString('base64');

    const engine = new NullEngine();
    const scene = new Scene(engine);

    const result = await SceneLoader.ImportMeshAsync('', '', base64, scene);
    const agMap = new Map<string, any>();
    for (const ag of result.animationGroups) {
      agMap.set(ag.name, ag);
    }

    const playAnim = (name: string): boolean => {
      const ag = agMap.get(name);
      if (!ag) return false;
      ag.play();
      return true;
    };

    assert.equal(playAnim('NonExistentAnim'), false, 'Non-existent animation must return false');
    assert.equal(playAnim('Fire'), true, 'Existing animation must return true');
  });

  it('happy path: 3-shot cycle tracks count and resetShotCount resets cadence on ragdoll hit', async () => {
    const { loadPlayerWeapon } = await import('../src/weapon');
    const glbPath = path.resolve(process.cwd(), 'public/assets/Pistol.glb');
    const buffer = fs.readFileSync(glbPath);
    const base64 = 'data:base64,' + buffer.toString('base64');

    const engine = new NullEngine();
    const scene = new Scene(engine);

    const weapon = await loadPlayerWeapon(scene, undefined, undefined, base64);
    assert.equal(weapon.getShotCount(), 0, 'Initial shot count should be 0');

    // 1st shot
    weapon.triggerFlipAndShoot();
    assert.equal(weapon.getShotCount(), 1, 'Shot count should be 1 after 1 shot');

    // 2nd shot
    weapon.triggerFlipAndShoot();
    assert.equal(weapon.getShotCount(), 2, 'Shot count should be 2 after 2 shots');

    // 3rd shot (triggers burst reload cycle)
    weapon.triggerFlipAndShoot();
    assert.equal(weapon.getShotCount(), 3, 'Shot count should be 3 after 3 shots');

    // Simulate ragdoll hit (resets count to 0)
    weapon.resetShotCount();
    assert.equal(weapon.getShotCount(), 0, 'Shot count should be reset to 0 after ragdoll hit');
  });

  it('happy path: rapid tapping during reload maintains reload state and does not shoot premature bullets', async () => {
    const { loadPlayerWeapon } = await import('../src/weapon');
    const glbPath = path.resolve(process.cwd(), 'public/assets/Pistol.glb');
    const buffer = fs.readFileSync(glbPath);
    const base64 = 'data:base64,' + buffer.toString('base64');

    const engine = new NullEngine();
    const scene = new Scene(engine);

    const weapon = await loadPlayerWeapon(scene, undefined, undefined, base64);
    assert.equal(weapon.isReloading(), false, 'Should not be reloading initially');

    // Trigger reload sequence
    weapon.playReloadSequence(1.0);
    assert.equal(weapon.isReloading(), true, 'Should be reloading after playReloadSequence');

    // Rapidly tap 5 times during reload
    for (let i = 0; i < 5; i++) {
      const res = weapon.triggerFlipAndShoot();
      assert.equal(res.didShoot, false, `Tap ${i + 1} during reload must have didShoot = false`);
      assert.equal(weapon.isReloading(), true, `Tap ${i + 1} must not cancel reload`);
      assert.equal(weapon.getShotCount(), 0, `Tap ${i + 1} must not increment shot count`);
    }

    // Wait for reload sequence to naturally finish
    await new Promise((resolve) => setTimeout(resolve, 850));
    assert.equal(weapon.isReloading(), false, 'Reload should be finished after duration');

    // Next tap after reload must shoot normally
    const postReloadRes = weapon.triggerFlipAndShoot();
    assert.equal(postReloadRes.didShoot, true, 'Post-reload tap must shoot normally');
    assert.equal(weapon.getShotCount(), 1, 'Shot count should increment to 1 on post-reload shot');
  });
});
