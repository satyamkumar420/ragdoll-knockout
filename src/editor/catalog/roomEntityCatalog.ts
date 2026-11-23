import type { AssetDef } from '../types';

export const ENTITY_ROOM_ASSETS: AssetDef[] = [
  // Entity Spawners
  {
    id: 'entity_target',
    name: 'Target Character',
    category: 'entity',
    isEntity: true,
    entityType: 'target',
    icon: 'user',
    description: 'Mannequin ragdoll target with customizable animations',
    defaultScale: 1.0,
  },
  {
    id: 'entity_pug',
    name: 'Chicken Mascot Companion',
    category: 'entity',
    isEntity: true,
    entityType: 'pug',
    icon: 'chicken',
    description: 'Chickensoft mascot companion with 3 color variants & 14 animations',
    defaultScale: 0.50,
  },
  {
    id: 'entity_gun',
    name: 'Gun Spawn Point',
    category: 'entity',
    isEntity: true,
    entityType: 'gun',
    icon: 'gun',
    description: 'Starting position where player weapon drops',
    defaultScale: 1.0,
  },
  {
    id: 'prop_static_pistol',
    name: 'Static Pistol',
    category: 'entity',
    modelPath: 'Pistol.glb',
    defaultScale: 1.89,
    hasCollision: true,
    castShadow: true,
    icon: 'gun',
    description: 'Static decorative display pistol - stays in fixed position and scale',
  },

  // Room & Dining Props
  { id: 'room_table', name: 'Dining Table', category: 'room', modelPath: 'room_dinner/table.glb', defaultScale: 1.0, hasCollision: true, castShadow: true, icon: 'furniture' },
  { id: 'room_chair', name: 'Dining Chair', category: 'room', modelPath: 'room_dinner/chair.glb', defaultScale: 1.0, hasCollision: true, castShadow: true, icon: 'furniture' },
  { id: 'room_couch', name: 'Living Couch', category: 'room', modelPath: 'room_dinner/couch.glb', defaultScale: 1.0, hasCollision: true, castShadow: true, icon: 'furniture' },
  { id: 'room_armchair', name: 'Armchair', category: 'room', modelPath: 'room_dinner/armchair.glb', defaultScale: 1.0, hasCollision: true, castShadow: true, icon: 'furniture' },
  { id: 'room_food_dinner', name: 'Dinner Plate', category: 'room', modelPath: 'room_dinner/food_dinner.glb', defaultScale: 1.0, hasCollision: false, castShadow: true, icon: 'box' },
  { id: 'room_burger', name: 'Burger and Drink', category: 'room', modelPath: 'room_dinner/burger.glb', defaultScale: 1.0, hasCollision: false, castShadow: true, icon: 'box' },
  { id: 'room_lamp', name: 'Table Lamp', category: 'room', modelPath: 'room_dinner/lamp.glb', defaultScale: 1.0, hasCollision: false, castShadow: true, icon: 'scene' },
  { id: 'room_wall', name: 'Room Wall', category: 'room', modelPath: 'room_dinner/wall.glb', defaultScale: 1.0, hasCollision: true, castShadow: true, icon: 'layers' },
  { id: 'room_wall_window', name: 'Window Wall', category: 'room', modelPath: 'room_dinner/wall_window.glb', defaultScale: 1.0, hasCollision: true, castShadow: true, icon: 'layers' },
  { id: 'room_door', name: 'Room Door', category: 'room', modelPath: 'room_dinner/door.glb', defaultScale: 1.0, hasCollision: true, castShadow: true, icon: 'layers' },
  { id: 'room_floor_tile', name: 'Floor Tile', category: 'room', modelPath: 'room_dinner/floor_tile.glb', defaultScale: 1.0, hasCollision: true, castShadow: false, icon: 'layers' },
  { id: 'room_carpet', name: 'Round Carpet', category: 'room', modelPath: 'room_dinner/carpet.glb', defaultScale: 1.0, hasCollision: false, castShadow: false, icon: 'palette' },
  { id: 'room_plant', name: 'Potted Plant', category: 'room', modelPath: 'room_dinner/plant.glb', defaultScale: 1.0, hasCollision: false, castShadow: true, icon: 'furniture' },
  { id: 'room_bookshelf', name: 'Bookshelf', category: 'room', modelPath: 'room_dinner/bookshelf.glb', defaultScale: 1.0, hasCollision: true, castShadow: true, icon: 'furniture' },
  { id: 'room_cabinet', name: 'Cabinet Storage', category: 'room', modelPath: 'room_dinner/cabinet.glb', defaultScale: 1.0, hasCollision: true, castShadow: true, icon: 'furniture' },
  { id: 'room_pictureframe', name: 'Wall Picture Frame', category: 'room', modelPath: 'room_dinner/pictureframe.glb', defaultScale: 1.0, hasCollision: false, castShadow: true, icon: 'layers' },

  // Food & Entertainment
  { id: 'room_pizza', name: 'Pizza Plate', category: 'room', modelPath: 'room_dinner/pizza.glb', defaultScale: 1.0, hasCollision: false, castShadow: true, icon: 'box' },
  { id: 'room_donut', name: 'Glazed Donut', category: 'room', modelPath: 'room_dinner/donut.glb', defaultScale: 1.0, hasCollision: false, castShadow: true, icon: 'box' },
  { id: 'room_soda', name: 'Soda Can', category: 'room', modelPath: 'room_dinner/soda_can.glb', defaultScale: 1.0, hasCollision: false, castShadow: true, icon: 'box' },
  { id: 'room_arcade_machine', name: 'Arcade Machine', category: 'room', modelPath: 'room_dinner/arcade_machine.glb', defaultScale: 1.0, hasCollision: true, castShadow: true, icon: 'box' },

  // Audio Props
  {
    id: 'room_boombox',
    name: 'Retro Boombox',
    category: 'room',
    modelPath: 'boombox.glb',
    defaultScale: 1.0,
    hasCollision: true,
    castShadow: true,
    icon: 'box',
    description: 'Vintage portable dual-speaker cassette boombox',
  },
];
