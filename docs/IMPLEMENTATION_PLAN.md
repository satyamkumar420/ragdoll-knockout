# 🎮 Multi-Theme Level System & GLB Pipeline Implementation Plan

> **Core Philosophy:** *Less code = Less gravity = Faster movement ⚡*  
> **Repository:** `/home/sarthaks/Desktop/new-games/08-oct-game`  
> **Source Model Repository:** `Papyszoo/CC0-Public-Domain-Models` (CC0 Models)

---

## 🏗️ 1. Architecture & Folder Structure

To adhere to the **≤ 400 lines per file** standard and maintain clean separation of concerns:

```
src/
├── config/
│   ├── levelTypes.ts             # TypeScript interfaces (Props, Characters, Level Schema)
│   └── levels/                   # Declarative per-level configurations
│       ├── index.ts              # Export array of all levels
│       ├── level1-park.ts        # Level 1: Sunny Park Picnic
│       ├── level2-dinner.ts      # Level 2: Candlelight Dinner Table
│       ├── level3-traffic.ts     # Level 3: Stopping Runaway Car
│       ├── level4-quarry.ts      # Level 4: Heavy Stone Push
│       └── level5-workshop.ts    # Level 5: Garage Mechanic Fixing
│
├── core/
│   ├── levelLoader.ts            # Generic level loader (loads props, lights, targets)
│   ├── propLoader.ts             # GLB prop instantiation, physics bounding & shadows
│   └── devGizmo.ts               # Dev-only 'E' key Gizmo for live drag & transform copy
│
├── entities/
│   ├── character.ts              # Character mannequin, eyes, poses & animation player
│   ├── pug.ts                    # Pug dog companion behaviors
│   ├── weapon.ts                 # Gun physics, flip force, bounce logic
│   └── ragdoll.ts                # Havok ragdoll physics on knock-down
│
public/assets/models/             # COMPRESSED GLB Models (< 100KB each)
├── room_dinner/                  # table.glb, chair.glb, burger.glb, lamp.glb
├── city_traffic/                 # car.glb, traffic_cone.glb, streetlight.glb
├── quarry_rocks/                 # rock_large.glb, boulder.glb
└── workshop/                     # barrel.glb, toolbox.glb
```

---

## 🎭 2. Level Design Matrix & Storytelling

| Level | Name & Story | Environment & GLB Objects | Target Characters & Animations |
| :--- | :--- | :--- | :--- |
| **Level 1** | **Sunny Park Picnic**<br>Casual dance and park hangout | Stylized low-poly trees, bushes, white picket fence, green grass lawn | - Target 1 & 2: Dancing together (`Dance_Loop`)<br>- Pug: Sitting & grazing on grass (`Eating` / `sit`) |
| **Level 2** | **Candlelight Dinner Room**<br>Two diners enjoying dinner at a table | Wooden floor, Dining Table (`table.glb`), Wooden Chairs (`chair.glb`), Food plate/Burger (`burger.glb`), Ambient Lamp (`lamp.glb`) | - Target 1: Seated at table dining (`Sitting_Idle_Loop`)<br>- Target 2: Seated across table conversing (`Sitting_Talking_Loop`)<br>- Pug: Under table looking for food scraps |
| **Level 3** | **Downtown Traffic Jam**<br>Pedestrian attempting to stop a speeding car | Asphalt street, sidewalk curb, Sedan Car (`car.glb`), Traffic cones (`traffic_cone.glb`), Streetlight | - Target 1: Standing in front of car holding hands out to stop it (`Interact` / stopping pose)<br>- Target 2: Panicked bystander talking on phone (`Idle_Talking_Loop`)<br>- Pug: Alert on sidewalk |
| **Level 4** | **Quarry Boulder Push**<br>Heavy labor pushing a massive stone boulder | Rocky ground, Massive Stone Boulder (`rock_large.glb`), Rubble stones | - Target 1: Leaning forward pushing boulder with both hands (`Push_Loop`)<br>- Target 2: Standing on elevated rock directing (`Idle_Loop`)<br>- Pug: Running along perimeter (`run`) |
| **Level 5** | **Garage Mechanic Workshop**<br>Mechanic repairing vehicle engine | Workshop floor, Sports car chassis, Oil Barrels (`barrel.glb`), Toolboxes | - Target 1: Kneeling down fixing car engine (`Fixing_Kneeling`)<br>- Target 2: Holding clipboard/tool conversing (`Idle_Talking_Loop`)<br>- Target 3: Assisting worker<br>- Pug: Patrolling workshop (`roam`) |

---

## 🗜️ 3. Mandatory GLB Download & Compression Pipeline (< 100 KB Limit)

> [!IMPORTANT]
> **Strict YouTube Playables Limit:** Every single `.glb` file **MUST be strictly under 100 KB** (`< 100 KB`). Heavy files are rejected or degrade loading times on YouTube Playables.

1. **Selective Download:**
   - Fetch only curated low-poly CC0 models from `Papyszoo/CC0-Public-Domain-Models` into `temp_models/`.
   - Prefer modular, low-poly kits (e.g. Kenney / Quaternius low-poly) with low draw call footprints.
2. **Mandatory Compression & Optimization:**
   - Run `glb-compressor` on each model:
     - Meshopt geometry optimization (weld, prune, dedup, reorder).
     - Textures compressed to WebP (quality: 85-90) and downscaled if needed to stay strictly under 100 KB.
     - 0% visual silhouette degradation while guaranteeing `< 100 KB` file size.
3. **Animation & Fidelity Preservation:**
   - Humanoid animations remain intact via Godot animation library.
   - Props keep crisp cartoon materials and clean bounding colliders.
4. **Save to Assets:**
   - Store models in `public/assets/models/<theme>/`.

---

## 📱 4. Multi-Device Responsiveness (Mobile, Tablet, Desktop)

- **Dynamic Camera Frustum & Framing:**
  - Automatic aspect-ratio detection in `scene.ts` (`camera.radius = 9.6 * (refAspect / aspect)`).
  - Ensures gun, characters, and props remain fully visible in:
    - Mobile Portrait (tall vertical screens e.g., 9:16)
    - Mobile Landscape (wide mobile e.g., 16:9, 20:9)
    - Tablets (iPad 4:3, 3:2)
    - Desktop Widescreen
- **Touch & Tap Controls:**
  - Full touch-friendly tapping on screen (`pointerdown`), no mouse-exclusive actions.
  - Safe-area insets (`env(safe-area-inset-top)`, etc.) for mobile notch screens.

---

## 🛠️ 4. Data-Driven Engine & Dev Mode Helper

- **Data-Driven Configuration:**
  - Each level exports a typed `LevelConfig` object containing:
    - ID, Name, Subtitle, Sky Color, Ground Color, Gun Spawn, Ammo.
    - Array of `props`: `{ model, position, rotation, scale, hasCollision, shadow }`.
    - Array of `targets`: `{ position, rotationY, initialAnimation, namePrefix }`.
    - `pug`: `{ position, behaviorMode, initialAnimation }`.
- **Generic Level Loader:**
  - One clean, reusable `loadLevelFromConfig` function handles asset instantiations, shadows, physics colliders, and clean disposal.
- **Babylon Gizmo Dev Mode:**
  - Pressing `E` key (or query flag `?dev=true`) activates Babylon's built-in `GizmoManager`.
  - Enables visual click-and-drag 3D positioning and console export for instant fine-tuning.

---

## 📋 5. Execution Phasing Checklist

- [ ] **Phase 1: Asset Acquisition & Compression**
  - Download selected models (`quaternius-furniture`, `quaternius-cars`, `kenney-nature-kit`, `quaternius-ultimate-food`, etc.).
  - Compress each model via `glb-compressor`.
  - Place models in `public/assets/models/`.
- [ ] **Phase 2: Core Architecture Setup**
  - Create `src/config/levelTypes.ts`.
  - Create `src/core/propLoader.ts` and `src/core/levelLoader.ts`.
  - Integrate `src/core/devGizmo.ts`.
- [ ] **Phase 3: Level Implementation**
  - Refactor Level 1 (Park) into `src/config/levels/level1-park.ts`.
  - Implement Level 2 (Dinner Room) with table, chairs, food, and sitting animations.
  - Implement Level 3 (Traffic Jam) with car, traffic cones, and stopping pose.
  - Implement Level 4 (Quarry Push) with boulder, rocks, and `Push_Loop`.
  - Implement Level 5 (Garage Workshop) with car chassis, barrels, and `Fixing_Kneeling`.
  - Export all from `src/config/levels/index.ts`.
- [ ] **Phase 4: Testing & Verification**
  - Verify all animations, ragdoll physics, and props load seamlessly.
  - Run `npm run build` and ensure zero type or bundling errors.
