import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { YouTubePlayablesService } from '../src/services/youtubePlayables';
import { i18n } from '../src/i18n/i18n';
import { safeStorage } from '../src/services/storage';

describe('YouTube Playables Cloud Save & Language Tests', () => {
  let savedPayload: string | null = null;
  let mockPlatformLang = 'en';

  beforeEach(() => {
    savedPayload = null;
    mockPlatformLang = 'en';
    safeStorage.clear();

    (globalThis as unknown as { window: unknown }).window = {
      ytgame: {
        IN_PLAYABLES_ENV: true,
        game: {
          firstFrameReady: () => {},
          gameReady: () => {},
          saveData: async (data: string) => {
            savedPayload = data;
          },
          loadData: async () => savedPayload,
        },
        system: {
          isAudioEnabled: () => true,
          onAudioEnabledChange: () => {},
          onPause: () => {},
          onResume: () => {},
          getLanguage: async () => mockPlatformLang,
        },
        engagement: {
          sendScore: async () => {},
        },
      },
    };
  });

  it('happy path: preferredLanguage persists across save and reload via YouTube Playables SDK', async () => {
    const service = new YouTubePlayablesService();

    // 1. Player switches language to Hindi ('hi')
    await service.saveData({ preferredLanguage: 'hi', unlockedLevel: 2 });
    assert.ok(savedPayload !== null, 'Data must be saved to YouTube SDK');

    const parsedSave = JSON.parse(savedPayload as string);
    assert.strictEqual(parsedSave.preferredLanguage, 'hi');
    assert.strictEqual(parsedSave.unlockedLevel, 2);

    // 2. Simulate refresh / reload: new instance reads from loadData()
    const reloadService = new YouTubePlayablesService();
    const loadedData = await reloadService.loadData();

    assert.ok(loadedData !== null);
    assert.strictEqual(loadedData?.preferredLanguage, 'hi');
    assert.strictEqual(loadedData?.unlockedLevel, 2);

    // 3. Verify i18n initializes with persisted language
    i18n.init(loadedData?.preferredLanguage, 'en');
    assert.strictEqual(i18n.getLanguage(), 'hi');
  });

  it('happy path: saved cloud language takes precedence over YouTube platform locale', async () => {
    mockPlatformLang = 'ja'; // Platform in Japanese
    const cloudLang = 'fr'; // User explicitly picked French

    i18n.init(cloudLang, mockPlatformLang);
    assert.strictEqual(i18n.getLanguage(), 'fr', 'Saved cloud language must override platform locale');
  });

  it('failure path: corrupted loadData payload falls back gracefully without crashing', async () => {
    (globalThis as unknown as { window: unknown }).window = {
      ytgame: {
        IN_PLAYABLES_ENV: true,
        game: {
          saveData: async () => {},
          loadData: async () => '{ INVALID_MALFORMED_JSON ...',
        },
        system: {
          isAudioEnabled: () => true,
          onAudioEnabledChange: () => {},
          onPause: () => {},
          onResume: () => {},
          getLanguage: async () => 'en',
        },
      },
    };

    const service = new YouTubePlayablesService();
    let loaded: unknown;
    await assert.doesNotReject(async () => {
      loaded = await service.loadData();
    });

    assert.strictEqual(loaded, null);
  });
});
