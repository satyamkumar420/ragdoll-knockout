import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  PRELOAD_ASSETS_LIST,
  normalizeAssetPath,
  registerBlobMapping,
  getPreloadedBlobUrl,
  isAssetPreloaded,
  clearPreloadCache,
  preloadAllAssets,
} from '../src/core/assetPreloader.ts';

describe('AssetPreloader Tests', () => {
  beforeEach(() => {
    clearPreloadCache();
  });

  // --- Happy-path tests ---
  it('happy path: PRELOAD_ASSETS_LIST contains all 70 models and valid GLB paths', () => {
    assert.strictEqual(PRELOAD_ASSETS_LIST.length, 70);
    PRELOAD_ASSETS_LIST.forEach((path) => {
      assert.ok(path.endsWith('.glb'), `Expected path to end with .glb: ${path}`);
      assert.ok(path.startsWith('./assets/'), `Expected path to start with ./assets/: ${path}`);
    });
  });

  it('happy path: normalizeAssetPath strips protocols, query params, hashes, and leading slashes', () => {
    assert.strictEqual(
      normalizeAssetPath('http://localhost:5173/assets/models/room_dinner/table.glb?v=2#test'),
      'assets/models/room_dinner/table.glb'
    );
    assert.strictEqual(
      normalizeAssetPath('./assets/Pistol.glb'),
      'assets/pistol.glb'
    );
    assert.strictEqual(
      normalizeAssetPath('/assets/chicken.glb'),
      'assets/chicken.glb'
    );
  });

  it('happy path: registerBlobMapping resolves lookups for all asset aliases', () => {
    const fakeBlobUrl = 'blob:http://localhost:5173/mock-uuid-table';
    registerBlobMapping('./assets/models/room_dinner/table.glb', fakeBlobUrl);

    // Test all alias lookups
    assert.strictEqual(getPreloadedBlobUrl('./assets/models/room_dinner/table.glb'), fakeBlobUrl);
    assert.strictEqual(getPreloadedBlobUrl('/assets/models/room_dinner/table.glb'), fakeBlobUrl);
    assert.strictEqual(getPreloadedBlobUrl('assets/models/room_dinner/table.glb'), fakeBlobUrl);
    assert.strictEqual(getPreloadedBlobUrl('models/room_dinner/table.glb'), fakeBlobUrl);
    assert.strictEqual(getPreloadedBlobUrl('room_dinner/table.glb'), fakeBlobUrl);
    assert.strictEqual(getPreloadedBlobUrl('table.glb'), fakeBlobUrl);
    assert.strictEqual(isAssetPreloaded('table.glb'), true);
  });

  // --- Failure-path / edge-case tests ---
  it('failure path: handles empty or unknown asset paths gracefully without throwing', () => {
    assert.strictEqual(normalizeAssetPath(''), '');
    assert.strictEqual(getPreloadedBlobUrl('unknown_nonexistent_model.glb'), undefined);
    assert.strictEqual(isAssetPreloaded('unknown_model.glb'), false);
  });

  it('failure path: clearPreloadCache completely empties all cached entries', () => {
    registerBlobMapping('./assets/Pistol.glb', 'blob:pistol');
    assert.strictEqual(isAssetPreloaded('Pistol.glb'), true);

    clearPreloadCache();
    assert.strictEqual(isAssetPreloaded('Pistol.glb'), false);
    assert.strictEqual(getPreloadedBlobUrl('Pistol.glb'), undefined);
  });

  it('failure path: preloadAllAssets handles network fetch errors without throwing', async () => {
    // Mock global fetch to simulate network error
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as unknown as Response;
    };

    try {
      const summary = await preloadAllAssets({ concurrency: 4 });
      assert.strictEqual(summary.total, 70);
      assert.strictEqual(summary.loaded, 0);
      assert.strictEqual(summary.failed, 70);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
