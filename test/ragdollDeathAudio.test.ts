import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { audioManager, playRagdollDeathSound } from '../src/audio';

describe('Ragdoll Death Audio Integration Tests', () => {
  // Happy-path test
  it('happy path: all 8 ragdoll death audio files exist in public/assets/audio/ragdoll and are lightweight', () => {
    const ragdollAudioDir = path.resolve(process.cwd(), 'public/assets/audio/ragdoll');
    assert.ok(fs.existsSync(ragdollAudioDir), 'Ragdoll audio directory must exist');

    for (let i = 1; i <= 8; i++) {
      const fileName = `ragdoll_death_${i}.mp3`;
      const filePath = path.join(ragdollAudioDir, fileName);
      assert.ok(fs.existsSync(filePath), `${fileName} must exist`);

      const stats = fs.statSync(filePath);
      assert.ok(stats.size > 1000, `${fileName} should have valid non-empty byte size`);
      assert.ok(stats.size < 120000, `${fileName} must be under 120KB for fast web game loading`);
    }
  });

  // Happy-path test
  it('happy path: playRagdollDeathSound executes safely for variants 1 through 8 and random variant', () => {
    assert.doesNotThrow(() => {
      // Test explicit variants 1 to 8
      for (let i = 1; i <= 8; i++) {
        playRagdollDeathSound(i);
      }
      // Test random variant selection
      playRagdollDeathSound();
    }, 'playRagdollDeathSound should execute without throwing across all variants');
  });

  // Failure-path / edge-case test
  it('failure path: handles invalid or out-of-bounds variant indices gracefully', () => {
    assert.doesNotThrow(() => {
      audioManager.playRagdollDeathSound(-1);
      audioManager.playRagdollDeathSound(0);
      audioManager.playRagdollDeathSound(9);
      audioManager.playRagdollDeathSound(999);
      audioManager.playRagdollDeathSound(NaN);
      audioManager.playRagdollDeathSound(Infinity);
    }, 'playRagdollDeathSound must fallback cleanly when provided invalid variant values');
  });
});
