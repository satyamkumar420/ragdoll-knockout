import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { YouTubePlayablesService } from '../src/services/youtubePlayables';

describe('YouTube Playables Pause/Resume Lifecycle Tests', () => {
  let pauseCallback: (() => void) | null = null;
  let resumeCallback: (() => void) | null = null;

  beforeEach(() => {
    pauseCallback = null;
    resumeCallback = null;

    (globalThis as unknown as { window: unknown }).window = {
      ytgame: {
        IN_PLAYABLES_ENV: true,
        system: {
          isAudioEnabled: () => true,
          onAudioEnabledChange: () => {},
          onPause: (cb: () => void) => {
            pauseCallback = cb;
          },
          onResume: (cb: () => void) => {
            resumeCallback = cb;
          },
        },
      },
    };
  });

  // Happy-path tests
  it('happy path: onPause and onResume update getIsPaused state and trigger listeners', () => {
    const service = new YouTubePlayablesService();
    assert.strictEqual(service.getIsPaused(), false, 'Should start unpaused');

    let pausedTriggered = 0;
    let resumedTriggered = 0;

    service.onPause(() => {
      pausedTriggered++;
    });

    service.onResume(() => {
      resumedTriggered++;
    });

    // Simulate YouTube platform pausing the game (e.g. app minimize or tab blur)
    pauseCallback?.();
    assert.strictEqual(service.getIsPaused(), true, 'getIsPaused should be true after onPause');
    assert.strictEqual(pausedTriggered, 1, 'Pause listener should have fired once');
    assert.strictEqual(resumedTriggered, 0);

    // Simulate YouTube platform resuming the game
    resumeCallback?.();
    assert.strictEqual(service.getIsPaused(), false, 'getIsPaused should be false after onResume');
    assert.strictEqual(pausedTriggered, 1);
    assert.strictEqual(resumedTriggered, 1, 'Resume listener should have fired once');
  });

  it('happy path: unsubscribing from pause/resume listeners works cleanly', () => {
    const service = new YouTubePlayablesService();
    let count = 0;

    const unsubscribe = service.onPause(() => {
      count++;
    });

    pauseCallback?.();
    assert.strictEqual(count, 1);

    unsubscribe();
    pauseCallback?.();
    assert.strictEqual(count, 1, 'Count should not increment after unsubscribe');
  });

  // Failure-path / edge-case tests
  it('failure path: listener error does not break execution or prevent other listeners from firing', () => {
    const service = new YouTubePlayablesService();
    let secondListenerFired = false;

    service.onPause(() => {
      throw new Error('Crashing listener');
    });

    service.onPause(() => {
      secondListenerFired = true;
    });

    assert.doesNotThrow(() => {
      pauseCallback?.();
    });

    assert.strictEqual(secondListenerFired, true, 'Second listener should still fire even if first throws');
  });

  it('happy path: registering onPause listener when platform is already paused fires immediately', () => {
    const service = new YouTubePlayablesService();
    // Simulate YouTube platform pausing the game before late listener registration
    pauseCallback?.();
    assert.strictEqual(service.getIsPaused(), true);

    let lateListenerFired = false;
    service.onPause(() => {
      lateListenerFired = true;
    });

    assert.strictEqual(lateListenerFired, true, 'Late onPause listener must fire immediately if platform is already paused');
  });

  it('security / certification check: platform paused state blocks illegal internal unpause until onResume is fired', () => {
    const service = new YouTubePlayablesService();
    assert.strictEqual(service.getIsPaused(), false);

    // Platform pauses from outside
    pauseCallback?.();
    assert.strictEqual(service.getIsPaused(), true);

    // Simulate in-game attempt to resume while platform is still paused
    let gameResumeAllowed = false;
    const attemptInGameResume = () => {
      if (service.getIsPaused()) {
        return; // blocked!
      }
      gameResumeAllowed = true;
    };

    attemptInGameResume();
    assert.strictEqual(gameResumeAllowed, false, 'Internal resume MUST be blocked while platform pause is active');

    // Now platform resumes from outside
    resumeCallback?.();
    assert.strictEqual(service.getIsPaused(), false, 'Platform is now resumed');

    attemptInGameResume();
    assert.strictEqual(gameResumeAllowed, true, 'Internal resume is now permitted');
  });
});
