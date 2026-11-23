import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { YouTubePlayablesService } from '../src/services/youtubePlayables';

describe('YouTube Playables Audio Sync Tests', () => {
  let callCount = 0;
  let audioEnabledValue = true;
  let audioChangeCallback: ((enabled: boolean) => void) | null = null;
  let resumeCallback: (() => void) | null = null;

  beforeEach(() => {
    callCount = 0;
    audioEnabledValue = true;
    audioChangeCallback = null;
    resumeCallback = null;

    (globalThis as unknown as { window: unknown }).window = {
      ytgame: {
        IN_PLAYABLES_ENV: true,
        system: {
          isAudioEnabled: () => {
            callCount++;
            return audioEnabledValue;
          },
          onAudioEnabledChange: (cb: (enabled: boolean) => void) => {
            audioChangeCallback = cb;
          },
          onPause: () => {},
          onResume: (cb: () => void) => {
            resumeCallback = cb;
          },
        },
      },
    };
  });

  // Happy-path tests
  it('happy path: repeated isAudioEnabled() calls return cached state without polling SDK', () => {
    const service = new YouTubePlayablesService();
    const initialCalls = callCount;
    assert.strictEqual(initialCalls, 1, 'Initial query should happen exactly once on init');

    // Simulate multiple frame ticks / BGM sixteenth notes (e.g. 50 calls)
    for (let i = 0; i < 50; i++) {
      const isEnabled = service.isAudioEnabled();
      assert.strictEqual(isEnabled, true);
    }

    // Call count on the native SDK should NOT increase with each getter invocation
    assert.strictEqual(
      callCount,
      initialCalls,
      `Expected SDK isAudioEnabled not to be invoked in a loop, calls remained: ${callCount}`
    );
  });

  it('happy path: onAudioEnabledChange event updates state reactively without polling', () => {
    const service = new YouTubePlayablesService();

    // Platform triggers audio mute event
    audioChangeCallback?.(false);
    assert.strictEqual(service.isAudioEnabled(), false);

    // Platform triggers audio unmute event
    audioChangeCallback?.(true);
    assert.strictEqual(service.isAudioEnabled(), true);

    // Verify still no extra calls to SDK isAudioEnabled
    assert.strictEqual(callCount, 1);
  });

  // Failure-path / edge-case tests
  it('failure path: handles SDK throws on resume gracefully without crashing', () => {
    (globalThis as unknown as { window: unknown }).window = {
      ytgame: {
        IN_PLAYABLES_ENV: true,
        system: {
          isAudioEnabled: () => {
            throw new Error('SDK Audio Query Error');
          },
          onAudioEnabledChange: () => {},
          onPause: () => {},
          onResume: (cb: () => void) => {
            resumeCallback = cb;
          },
        },
      },
    };

    const service = new YouTubePlayablesService();
    assert.doesNotThrow(() => {
      resumeCallback?.();
      const val = service.isAudioEnabled();
      assert.strictEqual(typeof val, 'boolean');
    });
  });
});
