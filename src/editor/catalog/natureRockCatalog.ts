import type { AssetDef } from '../types';

export const NATURE_ROCK_ASSETS: AssetDef[] = [
  // Quarry & Rock Props
  { id: 'quarry_rock_large', name: 'Large Boulder', category: 'rocks', modelPath: 'quarry_rocks/rock_large.glb', defaultScale: 1.0, hasCollision: true, castShadow: true, icon: 'rock' },
  { id: 'quarry_cliff_rock', name: 'Cliff Rock Face', category: 'rocks', modelPath: 'quarry_rocks/cliff_rock.glb', defaultScale: 1.0, hasCollision: true, castShadow: true, icon: 'rock' },

  // Nature & Park Trees / Props
  { id: 'nature_tree_oak', name: 'Oak Tree', category: 'nature', modelPath: 'nature/tree_oak.glb', defaultScale: 1.0, hasCollision: true, castShadow: true, icon: 'scene' },
  { id: 'nature_tree_pine', name: 'Pine Tree', category: 'nature', modelPath: 'nature/tree_pine.glb', defaultScale: 1.0, hasCollision: true, castShadow: true, icon: 'scene' },
  { id: 'nature_tree_default', name: 'Lush Tree', category: 'nature', modelPath: 'nature/tree_default.glb', defaultScale: 1.0, hasCollision: true, castShadow: true, icon: 'scene' },
  { id: 'nature_tree_palm', name: 'Palm Tree', category: 'nature', modelPath: 'nature/tree_palm.glb', defaultScale: 1.0, hasCollision: true, castShadow: true, icon: 'scene' },
  { id: 'nature_tree_palm_bend', name: 'Curved Palm Tree', category: 'nature', modelPath: 'nature/tree_palm_bend.glb', defaultScale: 1.0, hasCollision: true, castShadow: true, icon: 'scene' },
  { id: 'nature_fence', name: 'Wooden Fence', category: 'nature', modelPath: 'nature/fence.glb', defaultScale: 1.0, hasCollision: true, castShadow: true, icon: 'layers' },
  { id: 'nature_campfire', name: 'Campfire', category: 'nature', modelPath: 'nature/campfire.glb', defaultScale: 1.0, hasCollision: false, castShadow: true, icon: 'scene' },
  { id: 'nature_bench', name: 'Park Bench', category: 'nature', modelPath: 'nature/bench.glb', defaultScale: 1.0, hasCollision: true, castShadow: true, icon: 'furniture' },

  // Ground, Shoreline & Water Terrain
  { id: 'nature_grass_tile', name: 'Lush Grass Tile', category: 'nature', modelPath: 'grass.glb', defaultScale: 1.0, hasCollision: true, castShadow: false, icon: 'scene', description: 'Modular green grass ground terrain tile' },
  { id: 'nature_grass_forest', name: 'Forest Grass Tile', category: 'nature', modelPath: 'grass_forest.glb', defaultScale: 1.0, hasCollision: true, castShadow: false, icon: 'scene', description: 'Dense dark emerald forest terrain grass tile' },
  { id: 'nature_grass_hill', name: 'Grass Hill Terrain', category: 'nature', modelPath: 'grass_hill.glb', defaultScale: 1.0, hasCollision: true, castShadow: false, icon: 'scene', description: 'Elevated grassy knoll terrain elevation tile' },
  { id: 'nature_water_island', name: 'Water Island Basin', category: 'nature', modelPath: 'water_island.glb', defaultScale: 1.0, hasCollision: true, castShadow: false, icon: 'scene', description: 'Stylized water basin island platform tile' },
  { id: 'nature_dock', name: 'Wooden Pier Dock', category: 'nature', modelPath: 'nature/dock.glb', defaultScale: 1.0, hasCollision: true, castShadow: true, icon: 'layers', description: 'Rustic wooden pier dock with support pilings' },
  { id: 'nature_platform_beach', name: 'Beach Sand Platform', category: 'nature', modelPath: 'nature/platform_beach.glb', defaultScale: 1.0, hasCollision: true, castShadow: false, icon: 'scene', description: 'Golden beach shoreline sand disc platform' },
];
