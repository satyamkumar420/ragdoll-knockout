import { Tools } from '@babylonjs/core';

export interface PreloadProgress {
  loaded: number;
  total: number;
  percent: number;
  currentAsset: string;
}

export type PreloadProgressCallback = (progress: PreloadProgress) => void;

export interface PreloadOptions {
  concurrency?: number;
  onProgress?: PreloadProgressCallback;
}

export interface PreloadSummary {
  total: number;
  loaded: number;
  failed: number;
}

/**
 * Manifest of all 3D GLB assets in the game to be preloaded at startup.
 */
export const PRELOAD_ASSETS_LIST: readonly string[] = [
  // Core game entities
  './assets/AnimationLibrary_Godot_Standard.glb',
  './assets/chicken.glb',
  './assets/Pistol.glb',

  // City & Traffic props
  './assets/models/city_traffic/building_a.glb',
  './assets/models/city_traffic/building_b.glb',
  './assets/models/city_traffic/cone.glb',
  './assets/models/city_traffic/delivery.glb',
  './assets/models/city_traffic/police.glb',
  './assets/models/city_traffic/sedan.glb',
  './assets/models/city_traffic/suv.glb',
  './assets/models/city_traffic/taxi.glb',

  // Buildings & Structures
  './assets/models/building1_large.glb',
  './assets/models/building1_small.glb',
  './assets/models/building2_large.glb',
  './assets/models/building2_small.glb',
  './assets/models/building3_big.glb',
  './assets/models/building3_small.glb',
  './assets/models/building4.glb',
  './assets/models/house1.glb',
  './assets/models/house2.glb',

  // Nature, Trees & Beach props
  './assets/models/nature/bench.glb',
  './assets/models/nature/campfire.glb',
  './assets/models/nature/dock.glb',
  './assets/models/nature/fence.glb',
  './assets/models/nature/platform_beach.glb',
  './assets/models/nature/tree_default.glb',
  './assets/models/nature/tree_oak.glb',
  './assets/models/nature/tree_palm.glb',
  './assets/models/nature/tree_palm_bend.glb',
  './assets/models/nature/tree_pine.glb',

  // Terrain & Environment
  './assets/models/grass.glb',
  './assets/models/grass_forest.glb',
  './assets/models/grass_hill.glb',
  './assets/models/water_island.glb',

  // Quarry & Rocks props
  './assets/models/quarry_rocks/cliff_rock.glb',
  './assets/models/quarry_rocks/rock_large.glb',

  // Room & Dinner props
  './assets/models/room_dinner/arcade_machine.glb',
  './assets/models/room_dinner/armchair.glb',
  './assets/models/room_dinner/bookshelf.glb',
  './assets/models/room_dinner/burger.glb',
  './assets/models/room_dinner/cabinet.glb',
  './assets/models/room_dinner/carpet.glb',
  './assets/models/room_dinner/chair.glb',
  './assets/models/room_dinner/couch.glb',
  './assets/models/room_dinner/donut.glb',
  './assets/models/room_dinner/door.glb',
  './assets/models/room_dinner/floor_tile.glb',
  './assets/models/room_dinner/food_dinner.glb',
  './assets/models/room_dinner/lamp.glb',
  './assets/models/room_dinner/pictureframe.glb',
  './assets/models/room_dinner/pizza.glb',
  './assets/models/room_dinner/plant.glb',
  './assets/models/room_dinner/soda_can.glb',
  './assets/models/room_dinner/table.glb',
  './assets/models/room_dinner/wall.glb',
  './assets/models/room_dinner/wall_window.glb',

  // Workshop & Garage props
  './assets/models/workshop/barrel.glb',
  './assets/models/workshop/box.glb',
  './assets/models/workshop/box_cardboard.glb',
  './assets/models/workshop/box_large.glb',
  './assets/models/workshop/chest.glb',
  './assets/models/workshop/machine.glb',
  './assets/models/workshop/race_car.glb',

  // Swords & Weapons & Tools
  './assets/models/axe_diamond.glb',
  './assets/models/axe_gold.glb',
  './assets/models/boombox.glb',
  './assets/models/swords/sword.glb',
  './assets/models/swords/sword_2.glb',
  './assets/models/swords/sword_shield.glb',
  './assets/models/swords/sword_wood.glb',
] as const;

/**
 * Core assets strictly required for initial startup and Level 1.
 */
export const CORE_ASSETS_LIST: readonly string[] = [
  './assets/AnimationLibrary_Godot_Standard.glb',
  './assets/chicken.glb',
  './assets/Pistol.glb',
  './assets/models/nature/fence.glb',
  './assets/models/nature/tree_default.glb',
  './assets/models/grass.glb',
  './assets/models/quarry_rocks/cliff_rock.glb',
] as const;

// In-memory cache for preloaded Blob URLs (URL strings only, no heavy raw Blobs retained in JS heap)
const blobUrlCache = new Map<string, string>();
let isInterceptorInitialized = false;

/**
 * Normalizes URL/path by stripping protocol, domain, query, and leading slashes.
 */
export function normalizeAssetPath(url: string): string {
  if (!url) return '';
  const clean = url
    .replace(/^[a-z]+:\/\/[^/]+/i, '')
    .split('?')[0]
    .split('#')[0]
    .replace(/^(\.\/|\/)+/, '');
  return clean.toLowerCase();
}

/**
 * Registers an asset in the cache under all its common path variations and aliases.
 */
export function registerBlobMapping(rawPath: string, blobUrl: string, _blob?: Blob): void {
  blobUrlCache.set(rawPath, blobUrl);

  const clean = normalizeAssetPath(rawPath);
  const aliases = new Set<string>([
    rawPath,
    clean,
    `./${clean}`,
    `/${clean}`,
  ]);

  if (clean.startsWith('assets/')) {
    const withoutAssets = clean.slice('assets/'.length);
    aliases.add(withoutAssets);
    aliases.add(`./${withoutAssets}`);
    aliases.add(`/${withoutAssets}`);

    if (withoutAssets.startsWith('models/')) {
      const withoutModels = withoutAssets.slice('models/'.length);
      aliases.add(withoutModels);
      aliases.add(`./${withoutModels}`);
      aliases.add(`/${withoutModels}`);
    }
  }

  // Add filename-only alias (e.g. Pistol.glb)
  const filename = clean.split('/').pop();
  if (filename) aliases.add(filename);

  aliases.forEach((alias) => {
    blobUrlCache.set(alias, blobUrl);
    blobUrlCache.set(alias.toLowerCase(), blobUrl);
  });
}

/**
 * Retrieves preloaded Blob URL for an asset path if available.
 */
export function getPreloadedBlobUrl(url: string): string | undefined {
  if (blobUrlCache.has(url)) return blobUrlCache.get(url);
  const clean = normalizeAssetPath(url);
  if (blobUrlCache.has(clean)) return blobUrlCache.get(clean);

  // Fallback to filename lookup
  const filename = clean.split('/').pop();
  if (filename && blobUrlCache.has(filename)) {
    return blobUrlCache.get(filename);
  }
  return undefined;
}

/**
 * Checks whether an asset has already been preloaded into cache.
 */
export function isAssetPreloaded(url: string): boolean {
  return getPreloadedBlobUrl(url) !== undefined;
}

/**
 * Initializes Babylon.js Tools.PreprocessUrl hook to intercept model loading
 * and redirect requests to in-memory Blob URLs with 0 network latency.
 */
export function initBabylonAssetPreloader(): void {
  if (isInterceptorInitialized) return;
  isInterceptorInitialized = true;

  const originalPreprocessUrl = Tools.PreprocessUrl;
  Tools.PreprocessUrl = (url: string): string => {
    const cachedBlobUrl = getPreloadedBlobUrl(url);
    if (cachedBlobUrl) return cachedBlobUrl;
    return originalPreprocessUrl ? originalPreprocessUrl(url) : url;
  };
}

/**
 * Loads a single asset over fetch, converts to Blob, and caches it.
 */
async function preloadSingleAsset(path: string): Promise<boolean> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(path);
      if (!response.ok) {
        if (attempt === 3) {
          console.warn(`[AssetPreloader] Failed to fetch ${path}: ${response.statusText}`);
          return false;
        }
        await new Promise((res) => setTimeout(res, attempt * 150));
        continue;
      }
      const blob = await response.blob();
      const blobUrl = typeof URL !== 'undefined' && URL.createObjectURL
        ? URL.createObjectURL(blob)
        : path;

      registerBlobMapping(path, blobUrl);
      return true;
    } catch (err) {
      if (attempt === 3) {
        console.warn(`[AssetPreloader] Error preloading ${path}:`, err);
        return false;
      }
      await new Promise((res) => setTimeout(res, attempt * 150));
    }
  }
  return false;
}

/**
 * Preloads a specific list of assets concurrently in bounded batches.
 */
async function preloadAssetList(
  items: readonly string[],
  options: PreloadOptions = {}
): Promise<PreloadSummary> {
  initBabylonAssetPreloader();

  const total = items.length;
  let loaded = 0;
  let failed = 0;
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 4, 16));
  const queue = [...items];

  const worker = async (): Promise<void> => {
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;

      const success = await preloadSingleAsset(current);
      if (success) {
        loaded++;
      } else {
        failed++;
      }

      if (options.onProgress) {
        const percent = Math.round(((loaded + failed) / total) * 100);
        options.onProgress({
          loaded: loaded + failed,
          total,
          percent,
          currentAsset: current,
        });
      }
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, total) }, () => worker());
  await Promise.all(workers);

  return { total, loaded, failed };
}

/**
 * Preloads essential core assets needed for immediate Level 1 gameplay.
 */
export async function preloadCoreAssets(options: PreloadOptions = {}): Promise<PreloadSummary> {
  return preloadAssetList(CORE_ASSETS_LIST, options);
}

/**
 * Lazily loads remaining 3D game models in the background without blocking gameplay.
 */
export function startBackgroundAssetPreload(): void {
  const remaining = PRELOAD_ASSETS_LIST.filter((path) => !isAssetPreloaded(path));
  if (remaining.length === 0) return;
  void preloadAssetList(remaining, { concurrency: 2 });
}

/**
 * Preloads all assets in PRELOAD_ASSETS_LIST concurrently in bounded batches.
 */
export async function preloadAllAssets(options: PreloadOptions = {}): Promise<PreloadSummary> {
  return preloadAssetList(PRELOAD_ASSETS_LIST, options);
}

/**
 * Resets the in-memory cache and revokes all created Blob URLs.
 */
export function clearPreloadCache(): void {
  if (typeof URL !== 'undefined' && URL.revokeObjectURL) {
    const revoked = new Set<string>();
    blobUrlCache.forEach((url) => {
      if (url.startsWith('blob:') && !revoked.has(url)) {
        URL.revokeObjectURL(url);
        revoked.add(url);
      }
    });
  }
  blobUrlCache.clear();
}
