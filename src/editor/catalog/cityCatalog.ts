import type { AssetDef } from '../types';

export const CITY_ASSETS: AssetDef[] = [
  // Vehicles & Street Props
  { id: 'city_sedan', name: 'Sedan Car', category: 'city', modelPath: 'city_traffic/sedan.glb', defaultScale: 1.0, hasCollision: true, castShadow: true, icon: 'car' },
  { id: 'city_cone', name: 'Traffic Cone', category: 'city', modelPath: 'city_traffic/cone.glb', defaultScale: 1.0, hasCollision: false, castShadow: true, icon: 'box' },
  { id: 'city_police', name: 'Police Cruiser', category: 'city', modelPath: 'city_traffic/police.glb', defaultScale: 1.0, hasCollision: true, castShadow: true, icon: 'car' },
  { id: 'city_suv', name: 'Offroad SUV', category: 'city', modelPath: 'city_traffic/suv.glb', defaultScale: 1.0, hasCollision: true, castShadow: true, icon: 'car' },
  { id: 'city_delivery', name: 'Delivery Van', category: 'city', modelPath: 'city_traffic/delivery.glb', defaultScale: 1.0, hasCollision: true, castShadow: true, icon: 'car' },
  { id: 'city_taxi', name: 'City Taxi', category: 'city', modelPath: 'city_traffic/taxi.glb', defaultScale: 1.0, hasCollision: true, castShadow: true, icon: 'car' },

  // Commercial & Highrise Buildings
  { id: 'city_building_a', name: 'Building A', category: 'city', modelPath: 'city_traffic/building_a.glb', defaultScale: 1.0, hasCollision: true, castShadow: true, icon: 'layers' },
  { id: 'city_building_b', name: 'Building B', category: 'city', modelPath: 'city_traffic/building_b.glb', defaultScale: 1.0, hasCollision: true, castShadow: true, icon: 'layers' },
  { id: 'city_building1_large', name: 'Department Store Large', category: 'city', modelPath: 'building1_large.glb', defaultScale: 1.0, hasCollision: true, castShadow: true, icon: 'layers', description: 'Large commercial department store building' },
  { id: 'city_building1_small', name: 'Corner Store Small', category: 'city', modelPath: 'building1_small.glb', defaultScale: 1.0, hasCollision: true, castShadow: true, icon: 'layers', description: 'Compact retail convenience shop building' },
  { id: 'city_building2_large', name: 'Modern Office Large', category: 'city', modelPath: 'building2_large.glb', defaultScale: 1.0, hasCollision: true, castShadow: true, icon: 'layers', description: 'Expansive contemporary commercial office complex' },
  { id: 'city_building2_small', name: 'Modern Office Small', category: 'city', modelPath: 'building2_small.glb', defaultScale: 1.0, hasCollision: true, castShadow: true, icon: 'layers', description: 'Compact modern urban office building' },
  { id: 'city_building3_big', name: 'Brick Highrise Big', category: 'city', modelPath: 'building3_big.glb', defaultScale: 1.0, hasCollision: true, castShadow: true, icon: 'layers', description: 'Tall red-brick residential highrise building' },
  { id: 'city_building3_small', name: 'Brick Townhouse Small', category: 'city', modelPath: 'building3_small.glb', defaultScale: 1.0, hasCollision: true, castShadow: true, icon: 'layers', description: 'Multi-story brick brownstone townhouse' },
  { id: 'city_building4', name: 'Glass Tower Building', category: 'city', modelPath: 'building4.glb', defaultScale: 1.0, hasCollision: true, castShadow: true, icon: 'layers', description: 'Modern blue glass highrise city tower' },

  // Residential Houses
  { id: 'city_house1', name: 'Suburban Villa House 1', category: 'city', modelPath: 'house1.glb', defaultScale: 1.0, hasCollision: true, castShadow: true, icon: 'layers', description: 'Pitched-roof suburban family house with chimney' },
  { id: 'city_house2', name: 'Two-Story Residence 2', category: 'city', modelPath: 'house2.glb', defaultScale: 1.0, hasCollision: true, castShadow: true, icon: 'layers', description: 'Contemporary two-story residential house' },
];
