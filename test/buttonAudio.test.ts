import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { audioManager, playButtonClick } from '../src/audio';
import { youtubePlayables } from '../src/services/youtubePlayables';

describe('Button Click Audio & YouTube Playables Mute Sync Tests', () => {
  // Happy-path test
  it('happy path: button_click.mp3 exists in public/assets/audio and is ultra-lightweight', () => {
    const audioPath = path.resolve(process.cwd(), 'public/assets/audio/button_click.mp3');
    assert.ok(fs.existsSync(audioPath), 'public/assets/audio/button_click.mp3 must exist');

    const stats = fs.statSync(audioPath);
    assert.ok(stats.size > 500, 'Audio file should have valid non-empty byte size');
    assert.ok(stats.size < 25000, 'Button click audio must be under 25KB budget for instant web loading');
  });

  // Happy-path test
  it('happy path: playButtonClick executes safely without throwing', () => {
    assert.doesNotThrow(() => {
      playButtonClick();
      playButtonClick();
    });
  });

  // YouTube Playables integration & mute respect tests
  it('happy path: respects YouTube Playables audio state when active', () => {
    if (youtubePlayables.isAudioEnabled() && !youtubePlayables.getIsPaused() && !audioManager.isMuted()) {
      assert.strictEqual(audioManager.isAudioActive(), true, 'Audio must be active when all conditions pass');
    }
  });

  // Failure-path / edge-case test: Mute state respect
  it('failure path: when game sound is muted, isAudioActive returns false and button click is silent', () => {
    audioManager.setSoundEnabled(false);
    assert.strictEqual(audioManager.isMuted(), true);
    assert.strictEqual(audioManager.isAudioActive(), false);

    assert.doesNotThrow(() => {
      playButtonClick();
    });

    // Re-enable sound for subsequent tests
    audioManager.setSoundEnabled(true);
    assert.strictEqual(audioManager.isMuted(), false);
    assert.strictEqual(audioManager.isAudioActive(), true);
  });

  // Failure-path / edge-case test: YouTube Playables mute respect
  it('failure path: when YouTube Playables platform disables audio, isAudioActive strictly returns false', () => {
    // Simulate YouTube platform setting audio disabled
    (youtubePlayables as unknown as { isPlatformAudioEnabled: boolean }).isPlatformAudioEnabled = false;

    assert.strictEqual(youtubePlayables.isAudioEnabled(), false);
    assert.strictEqual(audioManager.isAudioActive(), false, 'isAudioActive MUST be false when YouTube platform is muted');

    assert.doesNotThrow(() => {
      playButtonClick();
    });

    // Restore platform audio
    (youtubePlayables as unknown as { isPlatformAudioEnabled: boolean }).isPlatformAudioEnabled = true;
    assert.strictEqual(youtubePlayables.isAudioEnabled(), true);
    assert.strictEqual(audioManager.isAudioActive(), true);
  });

  // Failure-path / edge-case test: YouTube Playables paused respect
  it('failure path: when YouTube Playables is paused, isAudioActive strictly returns false', () => {
    (youtubePlayables as unknown as { isPlatformPaused: boolean }).isPlatformPaused = true;

    assert.strictEqual(youtubePlayables.getIsPaused(), true);
    assert.strictEqual(audioManager.isAudioActive(), false, 'isAudioActive MUST be false when YouTube platform is paused');

    assert.doesNotThrow(() => {
      playButtonClick();
    });

    // Restore platform paused state
    (youtubePlayables as unknown as { isPlatformPaused: boolean }).isPlatformPaused = false;
    assert.strictEqual(youtubePlayables.getIsPaused(), false);
    assert.strictEqual(audioManager.isAudioActive(), true);
  });

  // Loading state audio suppression tests
  it('failure path: while game is loading (isGameLoaded = false), isAudioActive strictly returns false and audio is suppressed', () => {
    audioManager.setGameLoaded(false);
    assert.strictEqual(audioManager.isLoaded(), false);
    assert.strictEqual(audioManager.isAudioActive(), false, 'isAudioActive MUST be false while game is loading');

    // Triggering sounds while loading must not throw and must stay silent
    assert.doesNotThrow(() => {
      playButtonClick();
      audioManager.startBgm();
    });

    // Verify BGM does not start while game is loading
    assert.strictEqual(audioManager.isAudioActive(), false);
  });

  it('happy path: once game loading completes (isGameLoaded = true), audio is enabled and active', () => {
    audioManager.setGameLoaded(true);
    assert.strictEqual(audioManager.isLoaded(), true);
    assert.strictEqual(audioManager.isAudioActive(), true, 'isAudioActive must be true once game finishes loading');
  });
});
