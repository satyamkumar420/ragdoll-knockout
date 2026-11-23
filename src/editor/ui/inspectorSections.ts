import type { JsonLevelConfig, JsonPropItem, JsonTargetItem, JsonPugItem } from '../../config/levelTypes';
import { CHARACTER_ANIMATIONS, PUG_ANIMATIONS } from '../assetCatalog';
import { CHICKEN_VARIANTS, type ChickenVariant } from '../../chicken';
import { getSvgIcon } from './icons';
import { getDefaultWeaponPosition } from '../../character';

export function renderEmptyInspector(): string {
  return `
    <div style="text-align:center; padding:40px 10px; color:#94a3b8;">
      <div style="margin-bottom:8px; display:flex; justify-content:center;">${getSvgIcon('inspector', 36)}</div>
      <div style="font-size:14px; font-weight:700; color:#f1f5f9;">No Object Selected</div>
      <p style="font-size:12px; margin-top:6px;">Click any 3D object in the viewport or choose an asset from the palette to place & inspect.</p>
    </div>
  `;
}

function renderLockToggleBar(isLocked: boolean): string {
  return `
    <div style="margin-bottom:12px; display:flex;">
      <button id="insp-lock-btn" class="editor-btn ${isLocked ? 'editor-btn-danger active' : ''}" style="flex:1; justify-content:center; gap:6px; font-weight:700;">
        ${getSvgIcon(isLocked ? 'lock' : 'unlock', 14)}
        <span>${isLocked ? 'Locked (3D Transform Locked)' : 'Lock 3D Transform'}</span>
      </button>
    </div>
  `;
}

export function renderPropInspector(p: JsonPropItem): string {
  const rotDegX = Math.round(((p.rotationX || 0) * 180) / Math.PI);
  const rotDegY = Math.round(((p.rotationY || 0) * 180) / Math.PI);
  const rotDegZ = Math.round(((p.rotationZ || 0) * 180) / Math.PI);
  const isLocked = !!p.isLocked;
  const dis = isLocked ? 'disabled' : '';

  return `
    ${renderLockToggleBar(isLocked)}
    <div class="prop-row">
      <span class="prop-label">PROP NAME</span>
      <input type="text" id="prop-name-input" class="input-box" value="${p.name}" ${dis}>
    </div>
    <div class="prop-row">
      <span class="prop-label">POSITION (X, Y, Z)</span>
      <div class="vec3-inputs">
        <input type="number" step="0.1" id="prop-pos-x" class="input-box" value="${p.position[0]}" ${dis}>
        <input type="number" step="0.1" id="prop-pos-y" class="input-box" value="${p.position[1]}" ${dis}>
        <input type="number" step="0.1" id="prop-pos-z" class="input-box" value="${p.position[2]}" ${dis}>
      </div>
    </div>
    <div class="prop-row">
      <span class="prop-label">ROTATION DEGREES (X, Y, Z)</span>
      <div class="vec3-inputs">
        <input type="number" step="15" id="prop-rot-x" class="input-box" value="${rotDegX}" ${dis}>
        <input type="number" step="15" id="prop-rot-y" class="input-box" value="${rotDegY}" ${dis}>
        <input type="number" step="15" id="prop-rot-z" class="input-box" value="${rotDegZ}" ${dis}>
      </div>
    </div>
    <div class="prop-row">
      <span class="prop-label">SCALE</span>
      <input type="number" step="0.1" id="prop-scale" class="input-box" value="${p.scale ?? 1.0}" ${dis}>
    </div>
    <label class="checkbox-row">
      <input type="checkbox" id="prop-collision" ${p.hasCollision ? 'checked' : ''} ${dis}>
      <span>Bullet Physics Collision</span>
    </label>
    <label class="checkbox-row">
      <input type="checkbox" id="prop-shadow" ${p.castShadow !== false ? 'checked' : ''} ${dis}>
      <span>Cast Real-Time Shadow</span>
    </label>
    <div style="display:flex; gap:8px; margin-top:10px;">
      <button id="insp-dup-btn" class="editor-btn" style="flex:1;">
        ${getSvgIcon('copy', 14)} <span>Duplicate</span>
      </button>
      <button id="insp-del-btn" class="editor-btn editor-btn-danger" style="flex:1;">
        ${getSvgIcon('trash', 14)} <span>Delete</span>
      </button>
    </div>
  `;
}

function renderAnimMultiSelectBox(
  title: string,
  iconName: 'film' | 'dog' | 'chicken',
  inputName: string,
  containerId: string,
  badgeId: string,
  pillsId: string,
  animations: { id: string; label: string }[],
  selectedIds: string[],
  disabled: boolean
): string {
  const dis = disabled ? 'disabled' : '';
  const selectedSet = new Set(selectedIds);

  const checkboxItems = animations.map((a) => {
    const isChecked = selectedSet.has(a.id);
    return `
      <label class="anim-checkbox-item ${isChecked ? 'selected' : ''}" data-anim-id="${a.id}" data-anim-label="${a.label.toLowerCase()}">
        <input type="checkbox" name="${inputName}" value="${a.id}" ${isChecked ? 'checked' : ''} ${dis}>
        <span class="anim-label-text">${a.label}</span>
      </label>
    `;
  }).join('');

  const pills = animations
    .filter((a) => selectedSet.has(a.id))
    .map((a) => `<span class="anim-pill-tag">${a.label}</span>`)
    .join('');

  return `
    <div class="prop-row">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
        <span class="prop-label" style="display:flex; align-items:center; gap:5px;">
          ${getSvgIcon(iconName, 14)} ${title}
        </span>
        <span class="badge-tag badge-default" id="${badgeId}">${selectedIds.length} selected</span>
      </div>
      <input type="text" class="input-box anim-search-box" data-target="${containerId}" placeholder="Filter animations..." ${dis}>
      <div id="${containerId}" class="anim-checkbox-container">
        ${checkboxItems}
      </div>
      <div id="${pillsId}" style="display:flex; flex-wrap:wrap; gap:4px; margin-top:6px;">
        ${pills}
      </div>
    </div>
  `;
}

export function renderTargetInspector(t: JsonTargetItem): string {
  const rotDegY = Math.round(((t.rotationY || 0) * 180) / Math.PI);
  const isLocked = !!t.isLocked;
  const dis = isLocked ? 'disabled' : '';

  const selectedAnimIds = t.animationNames && t.animationNames.length > 0
    ? t.animationNames
    : (t.animationName ? [t.animationName] : ['Dance_Loop']);

  const animBox = renderAnimMultiSelectBox(
    'TARGET ANIMATIONS',
    'film',
    'target-anim-check',
    'target-anim-list',
    'target-anim-count-badge',
    'target-anim-pills',
    CHARACTER_ANIMATIONS,
    selectedAnimIds,
    isLocked
  );
  const defWeaponPos = getDefaultWeaponPosition(t.weaponModelPath || t.swordModelPath, selectedAnimIds);

  const hasLocomotion = selectedAnimIds.some((a) => {
    const lower = (a || '').toLowerCase();
    return lower.includes('walk') || lower.includes('jog') || lower.includes('sprint') || lower.includes('run');
  });
  const isPatrolling = !!(t.isPatrolling && hasLocomotion);

  let curWalkDist = 4.0;
  if (t.patrolRange && Array.isArray(t.patrolRange) && t.patrolRange.length === 2) {
    curWalkDist = Math.round(Math.abs(t.patrolRange[1] - t.patrolRange[0]) * 10) / 10;
  }
  const patrolSpeed = t.patrolSpeed ?? 1.2;
  const posX = t.position[0];
  const halfDist = curWalkDist / 2;
  const minX = t.patrolRange ? Math.round(t.patrolRange[0] * 100) / 100 : Math.round((posX - halfDist) * 100) / 100;
  const maxX = t.patrolRange ? Math.round(t.patrolRange[1] * 100) / 100 : Math.round((posX + halfDist) * 100) / 100;

  return `
    ${renderLockToggleBar(isLocked)}
    ${animBox}
    <div class="prop-row">
      <span class="prop-label">ANIMATION SPEED</span>
      <input type="number" step="0.1" min="0.1" max="3" id="target-anim-speed" class="input-box" value="${t.animationSpeed ?? 1.0}" ${dis}>
    </div>
    <div class="prop-row">
      <span class="prop-label">POSITION (X, Y, Z)</span>
      <div class="vec3-inputs">
        <input type="number" step="0.1" id="target-pos-x" class="input-box" value="${t.position[0]}" ${dis}>
        <input type="number" step="0.1" id="target-pos-y" class="input-box" value="${t.position[1]}" ${dis}>
        <input type="number" step="0.1" id="target-pos-z" class="input-box" value="${t.position[2]}" ${dis}>
      </div>
    </div>
    <div class="prop-row">
      <span class="prop-label">FACING ROTATION Y (DEGREES)</span>
      <input type="number" step="15" id="target-rot-y" class="input-box" value="${rotDegY}" ${dis}>
    </div>
    <div class="prop-row">
      <span class="prop-label">CHARACTER SCALE</span>
      <input type="number" step="0.1" id="target-scale" class="input-box" value="${t.scale ?? 1.0}" ${dis}>
    </div>
    <div style="margin: 14px 0 10px 0; border-top: 1px solid rgba(255,255,255,0.12);"></div>
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
      <span class="prop-label" style="display:flex; align-items:center; gap:6px; color:#a855f7;">
        ${getSvgIcon('layers', 14)} WALKING PATROL SETTINGS
      </span>
      <span id="target-patrol-status-badge" style="font-size:10px; color:${hasLocomotion ? '#38bdf8' : '#f59e0b'};">
        ${hasLocomotion ? (isPatrolling ? 'Patrol Active' : 'Patrol Inactive') : 'Requires Walk Anim'}
      </span>
    </div>
    <label class="checkbox-row" style="${!hasLocomotion ? 'opacity:0.55;' : ''}">
      <input type="checkbox" id="target-patrol-enable" ${isPatrolling ? 'checked' : ''} ${(!hasLocomotion || isLocked) ? 'disabled' : ''}>
      <span>Enable Walking Patrol</span>
    </label>
    <div id="target-patrol-controls" style="${(!isPatrolling || !hasLocomotion) ? 'display:none;' : ''}">
      <div class="prop-row">
        <div style="display:flex; justify-content:space-between;">
          <span class="prop-label">WALK DISTANCE (METERS)</span>
          <span id="target-patrol-range-preview" style="font-size:10px; color:#a855f7;">Range: [${minX}, ${maxX}]</span>
        </div>
        <input type="number" step="0.5" min="0.5" max="30" id="target-patrol-distance" class="input-box" value="${curWalkDist}" ${(!hasLocomotion || isLocked) ? 'disabled' : ''}>
      </div>
      <div class="prop-row">
        <div style="display:flex; justify-content:space-between;">
          <span class="prop-label">WALK SPEED</span>
          <span style="font-size:10px; color:#64748b;">m/s</span>
        </div>
        <input type="number" step="0.1" min="0.2" max="5.0" id="target-patrol-speed" class="input-box" value="${patrolSpeed}" ${(!hasLocomotion || isLocked) ? 'disabled' : ''}>
      </div>
    </div>
    <div style="margin: 14px 0 10px 0; border-top: 1px solid rgba(255,255,255,0.12);"></div>
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
      <span class="prop-label" style="display:flex; align-items:center; gap:6px; color:#38bdf8;">
        ${getSvgIcon('gun', 14)} ATTACHED WEAPON & FX
      </span>
      <div style="display:flex; gap:4px;">
        <button id="target-weapon-flip-btn" class="editor-btn" style="padding: 2px 7px; font-size: 10px;" title="Flip weapon 180° horizontally" ${dis}>
          ${getSvgIcon('rotate', 11)} <span>Flip 180°</span>
        </button>
        <button id="target-weapon-reset-btn" class="editor-btn" style="padding: 2px 7px; font-size: 10px;" title="Reset weapon position, rotation and scale to default" ${dis}>
          ${getSvgIcon('undo', 11)} <span>Reset</span>
        </button>
      </div>
    </div>
    <div class="prop-row">
      <span class="prop-label">WEAPON MODEL</span>
      <select id="target-weapon-model" class="select-box" ${dis}>
        <option value="auto" ${(!t.weaponModelPath && !t.swordModelPath) ? 'selected' : ''}>Auto (From Animation)</option>
        <option value="none" ${(t.weaponModelPath === 'none' || t.swordModelPath === 'none') ? 'selected' : ''}>None (Unarmed)</option>
        <option value="Pistol.glb" ${(t.weaponModelPath === 'Pistol.glb' || t.swordModelPath === 'Pistol.glb') ? 'selected' : ''}>Tactical Pistol (Pistol.glb)</option>
        <option value="swords/sword.glb" ${(t.weaponModelPath === 'swords/sword.glb' || t.swordModelPath === 'swords/sword.glb') ? 'selected' : ''}>Knight Steel Sword (sword.glb)</option>
        <option value="swords/sword_2.glb" ${(t.weaponModelPath === 'swords/sword_2.glb' || t.swordModelPath === 'swords/sword_2.glb') ? 'selected' : ''}>Curved Saber (sword_2.glb)</option>
        <option value="swords/sword_wood.glb" ${(t.weaponModelPath === 'swords/sword_wood.glb' || t.swordModelPath === 'swords/sword_wood.glb') ? 'selected' : ''}>Practice Wooden Sword (sword_wood.glb)</option>
        <option value="swords/sword_shield.glb" ${(t.weaponModelPath === 'swords/sword_shield.glb' || t.swordModelPath === 'swords/sword_shield.glb') ? 'selected' : ''}>Sword & Shield (sword_shield.glb)</option>
        <option value="axe_diamond.glb" ${(t.weaponModelPath === 'axe_diamond.glb' || t.swordModelPath === 'axe_diamond.glb') ? 'selected' : ''}>Diamond Battleaxe (axe_diamond.glb)</option>
        <option value="axe_gold.glb" ${(t.weaponModelPath === 'axe_gold.glb' || t.swordModelPath === 'axe_gold.glb') ? 'selected' : ''}>Golden Battleaxe (axe_gold.glb)</option>
      </select>
    </div>
    <div class="prop-row">
      <div style="display:flex; justify-content:space-between;">
        <span class="prop-label">WEAPON OFFSET (X, Y, Z)</span>
        <span style="font-size:10px; color:#64748b;">Meters</span>
      </div>
      <div class="vec3-inputs">
        <input type="number" step="0.005" id="target-weapon-pos-x" class="input-box" value="${(t.swordPosition ? t.swordPosition[0] : defWeaponPos.x)}" placeholder="X" ${dis}>
        <input type="number" step="0.005" id="target-weapon-pos-y" class="input-box" value="${(t.swordPosition ? t.swordPosition[1] : defWeaponPos.y)}" placeholder="Y" ${dis}>
        <input type="number" step="0.005" id="target-weapon-pos-z" class="input-box" value="${(t.swordPosition ? t.swordPosition[2] : defWeaponPos.z)}" placeholder="Z" ${dis}>
      </div>
    </div>
    <div class="prop-row">
      <div style="display:flex; justify-content:space-between;">
        <span class="prop-label">WEAPON ROTATION (X, Y, Z)</span>
        <span style="font-size:10px; color:#64748b;">Degrees</span>
      </div>
      <div class="vec3-inputs">
        <input type="number" step="5" id="target-weapon-rot-x" class="input-box" value="${(t.swordRotation ? Math.round((t.swordRotation[0] * 180) / Math.PI) : 0)}" placeholder="X°" ${dis}>
        <input type="number" step="5" id="target-weapon-rot-y" class="input-box" value="${(t.swordRotation ? Math.round((t.swordRotation[1] * 180) / Math.PI) : 0)}" placeholder="Y°" ${dis}>
        <input type="number" step="5" id="target-weapon-rot-z" class="input-box" value="${(t.swordRotation ? Math.round((t.swordRotation[2] * 180) / Math.PI) : 0)}" placeholder="Z°" ${dis}>
      </div>
    </div>
    <div class="prop-row">
      <div style="display:flex; justify-content:space-between;">
        <span class="prop-label">WEAPON SCALE</span>
        <span style="font-size:10px; color:#64748b;">Multiplier</span>
      </div>
      <input type="number" step="0.05" min="0.1" max="5.0" id="target-weapon-scale" class="input-box" value="${t.swordScale ?? 1.0}" ${dis}>
    </div>
    <div class="prop-row">
      <span class="prop-label">MAGIC VFX</span>
      <select id="target-magic-fx" class="select-box" ${dis}>
        <option value="none" ${!t.magicFx ? 'selected' : ''}>None</option>
        <option value="arcane" ${(t.magicFx === 'arcane' || t.magicFx === true) ? 'selected' : ''}>Arcane Runes & Orbs</option>
        <option value="fire" ${t.magicFx === 'fire' ? 'selected' : ''}>Fire Magic Glow</option>
      </select>
    </div>
    <div style="display:flex; gap:8px; margin-top:12px;">
      <button id="insp-dup-btn" class="editor-btn" style="flex:1;">
        ${getSvgIcon('copy', 14)} <span>Duplicate</span>
      </button>
      <button id="insp-del-btn" class="editor-btn editor-btn-danger" style="flex:1;">
        ${getSvgIcon('trash', 14)} <span>Delete</span>
      </button>
    </div>
  `;
}

export function renderPugInspector(p: JsonPugItem, isOnlyPug = false): string {
  const rotDegY = Math.round(((p.rotationY || 0) * 180) / Math.PI);
  const isLocked = !!p.isLocked;
  const dis = isLocked ? 'disabled' : '';
  const currentVariant: ChickenVariant = (!p.variant || p.variant === 'yellow') ? 'white' : p.variant;

  const selectedPugAnims = p.initialAnimations && p.initialAnimations.length > 0
    ? p.initialAnimations
    : (p.initialAnimation ? [p.initialAnimation] : ['idle']);

  const pugAnimBox = renderAnimMultiSelectBox(
    'CHICKEN ANIMATIONS',
    'chicken',
    'pug-anim-check',
    'pug-anim-list',
    'pug-anim-count-badge',
    'pug-anim-pills',
    PUG_ANIMATIONS,
    selectedPugAnims,
    isLocked
  );

  const variantCards = (Object.keys(CHICKEN_VARIANTS) as ChickenVariant[]).map((vKey) => {
    const v = CHICKEN_VARIANTS[vKey];
    const isActive = vKey === currentVariant;
    return `
      <button type="button" class="chicken-variant-card ${isActive ? 'active' : ''} ${dis}" data-variant="${vKey}" style="
        display:flex;
        flex-direction:column;
        align-items:center;
        gap:5px;
        padding:8px 4px;
        background:${isActive ? 'rgba(59, 130, 246, 0.22)' : 'rgba(30, 41, 59, 0.7)'};
        border:1.5px solid ${isActive ? '#60a5fa' : 'rgba(255, 255, 255, 0.12)'};
        border-radius:8px;
        cursor:${isLocked ? 'not-allowed' : 'pointer'};
        transition:all 0.15s ease;
        position:relative;
        box-shadow:${isActive ? '0 0 10px rgba(59, 130, 246, 0.4)' : 'none'};
      ">
        <div style="
          width:36px;
          height:36px;
          border-radius:50%;
          background:${v.previewHex.body};
          border:2px solid rgba(0,0,0,0.18);
          position:relative;
          display:flex;
          align-items:center;
          justify-content:center;
          box-shadow:inset 0 2px 4px rgba(255,255,255,0.4), 0 2px 5px rgba(0,0,0,0.25);
        ">
          <!-- Comb indicator on top -->
          <span style="
            position:absolute;
            top:-3px;
            width:10px;
            height:7px;
            border-radius:4px 4px 1px 1px;
            background:${v.previewHex.comb};
          "></span>
          <!-- Beak indicator in center -->
          <span style="
            width:7px;
            height:5px;
            clip-path:polygon(50% 100%, 0 0, 100% 0);
            background:${v.previewHex.beakFeet};
            margin-top:4px;
          "></span>
        </div>
        <span style="font-size:10.5px; font-weight:600; color:${isActive ? '#ffffff' : '#cbd5e1'}; text-align:center;">
          ${v.name}
        </span>
        ${isActive ? `
          <span style="
            position:absolute;
            top:3px;
            right:3px;
            width:6px;
            height:6px;
            border-radius:50%;
            background:#60a5fa;
            box-shadow:0 0 6px #60a5fa;
          "></span>
        ` : ''}
      </button>
    `;
  }).join('');

  return `
    ${renderLockToggleBar(isLocked)}
    <div class="prop-row" style="flex-direction:column; align-items:stretch; gap:6px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span class="prop-label" style="display:flex; align-items:center; gap:5px; margin:0;">
          ${getSvgIcon('chicken', 14)} CHICKEN VARIANT
        </span>
        <span style="font-size:10px; color:#38bdf8; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">Realtime 3D</span>
      </div>
      <div class="chicken-variant-grid" style="display:grid; grid-template-columns:repeat(3, 1fr); gap:6px;">
        ${variantCards}
      </div>
    </div>
    <div class="prop-row">
      <span class="prop-label" style="display:flex; align-items:center; gap:5px;">
        ${getSvgIcon('film', 14)} CHICKEN BEHAVIOR
      </span>
      <select id="pug-behavior-select" class="select-box" ${dis}>
        <option value="sit" ${p.behaviorMode === 'sit' ? 'selected' : ''}>Chirp & Peck (Sit)</option>
        <option value="roam" ${p.behaviorMode === 'roam' ? 'selected' : ''}>Roam & Wander</option>
        <option value="run" ${p.behaviorMode === 'run' ? 'selected' : ''}>Fast Run</option>
      </select>
    </div>
    ${pugAnimBox}
    <div class="prop-row">
      <span class="prop-label">POSITION (X, Y, Z)</span>
      <div class="vec3-inputs">
        <input type="number" step="0.1" id="pug-pos-x" class="input-box" value="${p.position[0]}" ${dis}>
        <input type="number" step="0.1" id="pug-pos-y" class="input-box" value="${p.position[1]}" ${dis}>
        <input type="number" step="0.1" id="pug-pos-z" class="input-box" value="${p.position[2]}" ${dis}>
      </div>
    </div>
    <div class="prop-row">
      <span class="prop-label">ROTATION Y (DEGREES)</span>
      <input type="number" step="15" id="pug-rot-y" class="input-box" value="${rotDegY}" ${dis}>
    </div>
    <div style="display:flex; gap:8px; margin-top:10px;">
      <button id="insp-del-btn" class="editor-btn ${isOnlyPug ? '' : 'editor-btn-danger'}" ${isOnlyPug ? 'disabled' : ''} style="flex:1; ${isOnlyPug ? 'opacity:0.5; cursor:not-allowed;' : ''}">
        ${getSvgIcon(isOnlyPug ? 'lock' : 'trash', 14)} <span>${isOnlyPug ? 'Level Companion (Required)' : 'Delete Chicken'}</span>
      </button>
    </div>
  `;
}

export function renderGunInspector(
  pos: [number, number, number],
  ammo: number,
  isLocked = false,
  rot?: [number, number, number],
  scale?: number
): string {
  const dis = isLocked ? 'disabled' : '';
  const rotDegX = Math.round(((rot?.[0] || 0) * 180) / Math.PI);
  const rotDegY = Math.round(((rot?.[1] || 0) * 180) / Math.PI);
  const rotDegZ = Math.round(((rot?.[2] || 0) * 180) / Math.PI);
  const gunScale = scale ?? 0.52;

  return `
    ${renderLockToggleBar(isLocked)}
    <div style="background:rgba(99,102,241,0.12); border:1px solid rgba(99,102,241,0.25); border-radius:6px; padding:6px 10px; margin-bottom:12px; font-size:11px; color:#c7d2fe; display:flex; align-items:center; gap:6px;">
      ${getSvgIcon('gun', 14)}
      <span>Primary Player Weapon (Required)</span>
    </div>
    <div class="prop-row">
      <span class="prop-label" style="display:flex; align-items:center; gap:5px;">
        GUN SPAWN POSITION (X, Y, Z)
      </span>
      <div class="vec3-inputs">
        <input type="number" step="0.1" id="gun-pos-x" class="input-box" value="${pos[0]}" ${dis}>
        <input type="number" step="0.1" id="gun-pos-y" class="input-box" value="${pos[1]}" ${dis}>
        <input type="number" step="0.1" id="gun-pos-z" class="input-box" value="${pos[2]}" ${dis}>
      </div>
    </div>
    <div class="prop-row">
      <span class="prop-label">GUN ROTATION (X, Y, Z DEGREES)</span>
      <div class="vec3-inputs">
        <input type="number" step="15" id="gun-rot-x" class="input-box" value="${rotDegX}" ${dis}>
        <input type="number" step="15" id="gun-rot-y" class="input-box" value="${rotDegY}" ${dis}>
        <input type="number" step="15" id="gun-rot-z" class="input-box" value="${rotDegZ}" ${dis}>
      </div>
    </div>
    <div class="prop-row">
      <span class="prop-label">GUN SCALE</span>
      <input type="number" step="0.05" min="0.1" max="5.0" id="gun-scale" class="input-box" value="${gunScale}" ${dis}>
    </div>
    <div class="prop-row">
      <span class="prop-label">AMMO BULLET COUNT</span>
      <input type="number" min="1" max="10" id="gun-ammo" class="input-box" value="${ammo}" ${dis}>
    </div>
  `;
}

export function rgbaToHex(rgba: [number, number, number, number]): string {
  const r = Math.round(rgba[0] * 255).toString(16).padStart(2, '0');
  const g = Math.round(rgba[1] * 255).toString(16).padStart(2, '0');
  const b = Math.round(rgba[2] * 255).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

export function rgbToHex(rgb: [number, number, number]): string {
  const r = Math.round(rgb[0] * 255).toString(16).padStart(2, '0');
  const g = Math.round(rgb[1] * 255).toString(16).padStart(2, '0');
  const b = Math.round(rgb[2] * 255).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

export function hexToRgba(hex: string): [number, number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [Number(r.toFixed(2)), Number(g.toFixed(2)), Number(b.toFixed(2)), 1.0];
}

export function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [Number(r.toFixed(2)), Number(g.toFixed(2)), Number(b.toFixed(2))];
}

export function renderEnvInspector(lvl: JsonLevelConfig): string {
  const skyHex = rgbaToHex(lvl.skyColor);
  const grassHex = lvl.grassColor ? rgbToHex(lvl.grassColor) : '#54a84c';

  return `
    <div class="prop-row">
      <span class="prop-label">LEVEL NAME</span>
      <input type="text" id="env-name-input" class="input-box" value="${lvl.name}">
    </div>
    <div class="prop-row">
      <span class="prop-label">LEVEL SUBTITLE (OPTIONAL)</span>
      <input type="text" id="env-sub-input" class="input-box" placeholder="Optional hint (leave empty for none)" value="${lvl.subtitle || ''}">
    </div>
    <div class="prop-row">
      <span class="prop-label">ENVIRONMENT SCENERY TYPE</span>
      <select id="env-type-select" class="select-box">
        <option value="room" ${lvl.environmentType === 'room' ? 'selected' : ''}>Room / Interior Studio</option>
        <option value="park" ${lvl.environmentType === 'park' ? 'selected' : ''}>Park / Outdoor Garden</option>
        <option value="custom" ${lvl.environmentType === 'custom' ? 'selected' : ''}>Custom Minimal Studio</option>
      </select>
    </div>
    <div class="prop-row">
      <span class="prop-label">SKY / BACKGROUND COLOR</span>
      <input type="color" id="env-sky-color" class="input-box" style="height:38px; padding:2px;" value="${skyHex}">
    </div>
    <div class="prop-row">
      <span class="prop-label">GROUND / FLOOR COLOR</span>
      <input type="color" id="env-grass-color" class="input-box" style="height:38px; padding:2px;" value="${grassHex}">
    </div>
    <div class="prop-row">
      <span class="prop-label">CAMERA ZOOM / DISTANCE</span>
      <div style="display:flex; gap:8px; align-items:center;">
        <input type="number" step="0.5" min="2" max="60" id="env-cam-radius" class="input-box" value="${lvl.cameraRadius ?? 9.6}">
        <button id="env-sync-cam-btn" class="editor-btn" title="Capture current editor camera zoom and view" style="white-space:nowrap; padding:6px 10px; font-size:11px;">
          ${getSvgIcon('camera', 13)} <span>Set View</span>
        </button>
      </div>
    </div>
  `;
}

export function renderJsonInspector(): string {
  return `
    <div style="padding:10px 0; display:flex; flex-direction:column; gap:12px;">
      <button id="json-export-btn" class="editor-btn editor-btn-primary" style="padding:10px; font-size:13px;">
        ${getSvgIcon('download', 16)} <span>Export Level JSON</span>
      </button>
      <button id="json-import-btn" class="editor-btn" style="padding:10px; font-size:13px;">
        ${getSvgIcon('upload', 16)} <span>Import / Load JSON</span>
      </button>
      <button id="json-save-btn" class="editor-btn" style="padding:10px; font-size:13px;">
        ${getSvgIcon('save', 16)} <span>Save to Storage</span>
      </button>
    </div>
  `;
}
