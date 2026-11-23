import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { audioManager, playCoinPickupSound } from '../src/audio';

describe('Coin Collect Audio Integration Tests', () => {
  // Happy-path test
  it('happy path: coin_collect.mp3 exists in public/assets/audio and is lightweight', () => {
    const audioPath = path.resolve(process.cwd(), 'public/assets/audio/coin_collect.mp3');
    assert.ok(fs.existsSync(audioPath), 'public/assets/audio/coin_collect.mp3 must exist');

    const stats = fs.statSync(audioPath);
    assert.ok(stats.size > 1000, 'Audio file should have valid non-empty byte size');
    assert.ok(stats.size < 50000, 'Audio file must be under 50KB budget for instant web loading');
  });

  // Happy-path test
  it('happy path: playCoinPickupSound executes safely across standard pitch ranges', () => {
    assert.doesNotThrow(() => {
      playCoinPickupSound(1.0);
      playCoinPickupSound(1.2);
      playCoinPickupSound(1.4);
    }, 'playCoinPickupSound should execute without error across standard pitch ranges');
  });

  // Failure-path / edge-case test
  it('failure path: handles extreme / boundary pitch multipliers safely without crashing', () => {
    assert.doesNotThrow(() => {
      audioManager.playCoinPickupSound(-1.0);
      audioManager.playCoinPickupSound(0);
      audioManager.playCoinPickupSound(100.0);
      audioManager.playCoinPickupSound(NaN);
    }, 'playCoinPickupSound must clamp and handle extreme or invalid pitch multipliers gracefully');
  });

  // Failure-path / edge-case test
  it('failure path: handles offline / unloaded audio buffers gracefully with fallback', async () => {
    // Calling preload when fetch fails or is mocked in Node environment must not throw
    await assert.doesNotReject(async () => {
      await audioManager.preloadWeaponAudio();
    }, 'preloadWeaponAudio must gracefully handle non-browser or failed fetches');
  });
});
