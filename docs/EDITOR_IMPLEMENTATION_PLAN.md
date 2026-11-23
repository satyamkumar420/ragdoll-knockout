# 🛠️ 3D In-Game Level Editor Architecture & Implementation Plan

> **Core Mantra:** Less code = Less gravity = Faster movement ⚡  
> **Reference Model:** `draw-bridge-puzzle` (`/home/sarthaks/Desktop/new-games/14-sep-game/draw-bridge-puzzle`)  
> **Target Project:** `Ragdoll Knockout`  
> **Output Standard:** Pure JSON configuration (`level-1.json`, `level-2.json`, etc.)  

---

## 📋 1. Executive Summary & Research from `draw-bridge-puzzle`

In `draw-bridge-puzzle`, the editor workflow is structured as follows:
1. **Mode Switcher:** Seamless toggle between `'play'` and `'editor'` modes via URL parameter (`?editor=true`), in-game editor button, and keyboard hotkeys.
2. **Three-Column Layout:**
   - **Top ToolBar:** Back button, Transform Tools, Snapping, Undo/Redo, Delete, Play Level, Panel visibility toggles.
   - **Left Panel (LevelManagerPanel):** Pinned active level card, list of default & custom levels, "+ New Level", Duplicate, and Delete.
   - **Center Viewport:** Interactive editing canvas with selection & direct manipulation.
   - **Right Panel (PropertyPanel):** Asset palette, Inspector for selected entity (Position, Rotation, Scale, specific properties), Scene environment settings, and JSON Import/Export.
3. **Data Serialization:** Every level is represented as a pure, serializable JSON schema that can be copied, exported as a `.json` file, or saved to `localStorage`.

In **`08-oct-game`**, we are porting this exact architecture to a full **3D Babylon.js** environment with real-time GLB asset placement, Havok collision previews, live character animation switching, and instant playtesting!

---

## 🏗️ 2. Architectural Design & Folder Structure

To strictly enforce the **≤ 400 lines per file** limit (max 500 lines) and avoid monolithic files, the editor is divided into modular Single Responsibility units:

```
src/
├── editor/
│   ├── types.ts                    # Editor tools, selection interfaces & asset types (~60 lines)
│   ├── assetCatalog.ts             # Registry of all 17+ GLB models, categories & metadata (~120 lines)
│   ├── editorState.ts              # Active level state, Undo/Redo history, LocalStorage sync (~180 lines)
│   ├── editorCamera.ts             # Free orbit/pan/zoom camera for 3D level inspection (~110 lines)
│   ├── gizmoController.ts          # Babylon GizmoManager (Translate, Rotate, Scale, Snap) (~220 lines)
│   ├── levelEditor.ts              # Main coordinator linking 3D scene, UI, and game engine (~260 lines)
│   ├── editorStyles.css            # Dark glassmorphism arcade styling (modular CSS) (~350 lines)
│   └── ui/
│       ├── editorToolbar.ts        # Top navigation toolbar & shortcuts (~160 lines)
│       ├── levelManagerPanel.ts    # Left panel: Level list, New level, Duplicate, Delete (~210 lines)
│       ├── propertyPanel.ts        # Right panel: Asset Palette, Inspector, Settings (~340 lines)
│       └── jsonModal.ts            # Import/Export JSON modal dialog (~120 lines)
```

---

## 🎨 3. GLB Asset Library & Reusability Palette

All 17+ downloaded & compressed GLB assets (`< 100 KB` each) are registered with friendly names, categories, and default transform settings:

| Category | GLB Models | Default Settings |
| :--- | :--- | :--- |
| **🍽️ Room & Dining** | `table.glb`, `chair.glb`, `food_dinner.glb`, `burger.glb`, `lamp.glb`, `wall.glb`, `wall_window.glb`, `carpet.glb`, `plant.glb`, `bookshelf.glb` | Collisions on walls/tables, shadows enabled |
| **🚗 City & Traffic** | `sedan.glb`, `cone.glb`, `building_a.glb`, `building_b.glb` | High-poly silhouettes, car collision enabled |
| **🪨 Quarry & Rocks** | `rock_large.glb`, `cliff_rock.glb` | Heavy obstacle boulders for push mechanics |
| **📦 Workshop & Props**| `race_car.glb`, `barrel.glb`, `box.glb` | Dynamic props for garage / workshop settings |
| **🧍 Target Characters**| Godot Mannequin | Selectable animations: `Dance_Loop`, `Sitting_Idle_Loop`, `Sitting_Talking_Loop`, `Push_Loop`, `Fixing_Kneeling`, `Driving_Loop`, `Crouch_Idle_Loop`, `Idle_Loop`, `PickUp_Table` |
| **🐶 Companions** | Pug Dog (`characters_pug.glb`) | Behaviors: `sit`, `roam`, `run` |
| **🔫 Gun Spawn** | Spawn Marker | Sets gun starting position & ammo count |

*Clicking any asset card in the palette instantly spawns it into the 3D scene at the center of the camera focus!*

---

## 🕹️ 4. Key Features & Workflow

### 1. Viewport Interaction & 3D Controls
- **Orbit Camera:** Left-drag / Right-drag to orbit and pan around the room; mouse wheel to zoom.
- **Mesh Picking:** Left-click on any prop, character, or pug in the 3D scene to select it.
- **Gizmo Controls:**
  - `W`: Position Gizmo (translate arrows along X, Y, Z).
  - `E`: Rotation Gizmo (pitch, yaw, roll rings).
  - `R`: Scale Gizmo (uniform / axis scaling).
- **Grid Snapping:** Toggle 0.25m / 0.5m / 1.0m snapping for aligned placement of walls and furniture.
- **Ground Grid:** Faint 3D grid plane visible during editing for spatial depth perception.

### 2. Inspector Panel (Real-Time Tweaking)
- **Position `[X, Y, Z]`:** Fine-tune numeric values with step buttons or direct text input.
- **Rotation `[X, Y, Z]`:** Numeric inputs in degrees.
- **Scale:** Scale factor slider + numeric box.
- **Prop Specifics:**
  - `hasCollision` checkbox (toggle Havok physics box so bullets bounce off).
  - `castShadow` checkbox.
- **Character Specifics:**
  - Animation dropdown: Live updates the 3D character's animation in the viewport (`Dance_Loop`, `Sitting_Idle_Loop`, `Push_Loop`, etc.).
- **Actions:** Duplicate (`Ctrl+D`), Delete (`Delete` key).

### 3. Level Manager & Persistence
- List all default levels (`Level 1`, `Level 2`) and user-created custom levels (`Custom Level 1`, etc.).
- "+ New Level" creates a clean room or park canvas.
- "Duplicate Level" clones the current level for quick iterative design.
- "Save Level" persists changes into `localStorage`.
- "Play / Test Level" immediately switches to Play mode so you can shoot the gun, test physics, and verify targets.

### 4. Pure JSON Export / Import
- **Export:** Downloads formatted `<level-name>.json` (matches `src/config/levels/level-1.json`) and copies to clipboard.
- **Import:** Modal to paste any JSON config and instantly load it into the editor.

---

## ⚡ 5. Execution Phasing Plan

### Phase 1: Editor Core & Types
- [ ] Create `src/editor/types.ts` (tool types, selection interfaces).
- [ ] Create `src/editor/assetCatalog.ts` (catalog of 17 GLB props + characters + pug).
- [ ] Create `src/editor/editorState.ts` (level state management, history stacks, local storage).

### Phase 2: 3D Viewport, Camera & Gizmos
- [ ] Create `src/editor/editorCamera.ts` (free orbit camera toggle).
- [ ] Create `src/editor/gizmoController.ts` (Babylon `GizmoManager`, snapping, raycast picking).

### Phase 3: UI Components & Styling
- [ ] Create `src/editor/editorStyles.css` (dark arcade glassmorphism, responsive panels).
- [ ] Create `src/editor/ui/editorToolbar.ts` (top toolbar, shortcuts, play button).
- [ ] Create `src/editor/ui/levelManagerPanel.ts` (left panel, level list, new/duplicate/delete).
- [ ] Create `src/editor/ui/propertyPanel.ts` (asset palette, object inspector, settings, JSON).
- [ ] Create `src/editor/ui/jsonModal.ts` (import/export dialog).

### Phase 4: Integration & Play Mode Switcher
- [ ] Create `src/editor/levelEditor.ts` (ties together scene, UI, and state).
- [ ] Integrate Editor toggle into `index.html` (Editor button in top HUD) and `src/main.ts`.
- [ ] Add Playtest mode that seamlessly tests custom and edited levels.

### Phase 5: Verification & Quality Check
- [ ] Test adding, moving, rotating, and scaling props.
- [ ] Test switching character animations (`Push_Loop`, `Sitting_Idle_Loop`, `Fixing_Kneeling`).
- [ ] Test JSON export and verify output validity against `JsonLevelConfig`.
- [ ] Verify `npm run build` succeeds with zero TypeScript or bundling errors.
