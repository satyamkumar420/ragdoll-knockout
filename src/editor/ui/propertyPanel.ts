import type { EditorStateManager } from '../editorState';
import { ASSET_CATALOG } from '../assetCatalog';
import type { AssetDef, SelectedObjectRef } from '../types';
import { getSvgIcon } from './icons';
import { getAssetPreview } from './assetPreviews';
import {
  renderEmptyInspector,
  renderPropInspector,
  renderTargetInspector,
  renderPugInspector,
  renderGunInspector,
  renderEnvInspector,
  renderJsonInspector,
  hexToRgba,
  hexToRgb,
} from './inspectorSections';
import type { Vector3 } from '@babylonjs/core';
import { getDefaultWeaponPosition } from '../../character';

export interface PropertyPanelCallbacks {
  onSpawnAsset: (asset: AssetDef) => void;
  onExportJson: () => void;
  onImportJson: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSyncCamera?: () => void;
  onCameraZoomChange?: (radius: number) => void;
}

type TabType = 'palette' | 'inspector' | 'env' | 'json';

function getInputValueNum(el: HTMLElement, id: string, fallback: number): number {
  const v = parseFloat((el.querySelector(id) as HTMLInputElement)?.value);
  return isNaN(v) ? fallback : v;
}

function renderAssetCards(assets: AssetDef[]): string {
  return assets.map((a) => `
    <div class="asset-card" data-asset-id="${a.id}" title="${a.name} - ${a.description || a.category}">
      <div class="asset-preview-box">${getAssetPreview(a.id)}</div>
      <div class="asset-title">${a.name}</div>
    </div>
  `).join('');
}

export class PropertyPanel {
  private element: HTMLElement;
  private state: EditorStateManager;
  private callbacks: PropertyPanelCallbacks;
  private activeTab: TabType = 'palette';
  private selectedCategory = 'all';
  private assetSearchQuery = '';
  private isVisible = true;

  constructor(state: EditorStateManager, callbacks: PropertyPanelCallbacks) {
    this.state = state;
    this.callbacks = callbacks;
    this.element = document.createElement('aside');
    this.element.className = 'editor-panel right-panel';
    this.render();
    this.setupListeners();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public toggle(): boolean {
    this.isVisible = !this.isVisible;
    this.element.classList.toggle('hidden', !this.isVisible);
    return this.isVisible;
  }

  public switchToTab(tab: TabType): void {
    this.activeTab = tab;
    this.render();
  }

  private render(): void {
    const sel = this.state.getSelection();

    this.element.innerHTML = `
      <div class="panel-tabs">
        <button class="tab-btn ${this.activeTab === 'palette' ? 'active' : ''}" data-tab="palette">
          <span style="display:inline-flex; align-items:center; gap:5px;">${getSvgIcon('palette', 13)} Assets</span>
        </button>
        <button class="tab-btn ${this.activeTab === 'inspector' ? 'active' : ''}" data-tab="inspector">
          <span style="display:inline-flex; align-items:center; gap:5px;">${getSvgIcon('inspector', 13)} Inspector</span>
        </button>
        <button class="tab-btn ${this.activeTab === 'env' ? 'active' : ''}" data-tab="env">
          <span style="display:inline-flex; align-items:center; gap:5px;">${getSvgIcon('scene', 13)} Scene</span>
        </button>
        <button class="tab-btn ${this.activeTab === 'json' ? 'active' : ''}" data-tab="json">
          <span style="display:inline-flex; align-items:center; gap:5px;">${getSvgIcon('json', 13)} JSON</span>
        </button>
      </div>
      <div class="panel-content">
        ${this.renderActiveTabContent(sel)}
      </div>
    `;
  }

  private renderActiveTabContent(sel: SelectedObjectRef | null): string {
    switch (this.activeTab) {
      case 'palette': return this.renderPaletteTab();
      case 'inspector': return this.renderInspectorTab(sel);
      case 'env': return this.renderEnvTab();
      case 'json': return this.renderJsonTab();
    }
  }

  private getFilteredAssets(): AssetDef[] {
    const q = this.assetSearchQuery.trim().toLowerCase();
    return ASSET_CATALOG.filter((a) => {
      const matchCat = this.selectedCategory === 'all' || a.category === this.selectedCategory;
      const matchQuery = !q || a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q) || (a.modelPath && a.modelPath.toLowerCase().includes(q));
      return matchCat && matchQuery;
    });
  }

  private renderPaletteTab(): string {
    return `
      <div class="palette-search-wrapper" style="margin-bottom: 8px;">
        <input type="text" class="asset-search-box input-box" placeholder="Search 70+ assets (axe, house, tree...)" value="${this.assetSearchQuery}" style="width:100%; font-size:11px; padding:6px 10px; border-radius:6px; background:rgba(15,23,42,0.85); border:1px solid rgba(255,255,255,0.15); color:#f8fafc; outline:none;" />
      </div>
      <div class="filter-pills">
        <button class="pill-btn ${this.selectedCategory === 'all' ? 'active' : ''}" data-cat="all">All (${ASSET_CATALOG.length})</button>
        <button class="pill-btn ${this.selectedCategory === 'nature' ? 'active' : ''}" data-cat="nature">Nature</button>
        <button class="pill-btn ${this.selectedCategory === 'room' ? 'active' : ''}" data-cat="room">Room</button>
        <button class="pill-btn ${this.selectedCategory === 'entity' ? 'active' : ''}" data-cat="entity">Entities</button>
        <button class="pill-btn ${this.selectedCategory === 'city' ? 'active' : ''}" data-cat="city">City</button>
        <button class="pill-btn ${this.selectedCategory === 'rocks' ? 'active' : ''}" data-cat="rocks">Rocks</button>
        <button class="pill-btn ${this.selectedCategory === 'workshop' ? 'active' : ''}" data-cat="workshop">Workshop</button>
      </div>
      <div class="asset-grid">
        ${renderAssetCards(this.getFilteredAssets())}
      </div>
    `;
  }

  private renderInspectorTab(sel: SelectedObjectRef | null): string {
    if (!sel) return renderEmptyInspector();
    const lvl = this.state.getLevel();

    if (sel.type === 'prop' && lvl.props && lvl.props[sel.index]) {
      return renderPropInspector(lvl.props[sel.index]);
    }
    if (sel.type === 'target' && lvl.targets[sel.index]) {
      return renderTargetInspector(lvl.targets[sel.index]);
    }
    if (sel.type === 'pug' && lvl.pugs && lvl.pugs[sel.index]) {
      return renderPugInspector(lvl.pugs[sel.index], (lvl.pugs?.length || 0) <= 1);
    }
    if (sel.type === 'gun') {
      return renderGunInspector(
        lvl.gunSpawnPos || [-2.2, 0.085, 0],
        lvl.ammo || 5,
        this.state.isSelectionLocked(),
        lvl.gunRotation,
        lvl.gunScale
      );
    }
    return '';
  }

  private renderEnvTab(): string {
    return renderEnvInspector(this.state.getLevel());
  }

  private renderJsonTab(): string {
    return renderJsonInspector();
  }

  public updateTransformInputs(pos: Vector3, rot: Vector3, scale: Vector3): void {
    const sel = this.state.getSelection();
    if (!sel) return;

    const setVal = (id: string, val: string) => {
      const el = this.element.querySelector(id) as HTMLInputElement;
      if (el && document.activeElement !== el) el.value = val;
    };

    if (sel.type === 'prop') {
      setVal('#prop-pos-x', pos.x.toFixed(2));
      setVal('#prop-pos-y', pos.y.toFixed(2));
      setVal('#prop-pos-z', pos.z.toFixed(2));
      setVal('#prop-rot-x', Math.round((rot.x * 180) / Math.PI).toString());
      setVal('#prop-rot-y', Math.round((rot.y * 180) / Math.PI).toString());
      setVal('#prop-rot-z', Math.round((rot.z * 180) / Math.PI).toString());
      setVal('#prop-scale', scale.x.toFixed(2));
    } else if (sel.type === 'target') {
      setVal('#target-pos-x', pos.x.toFixed(2));
      setVal('#target-pos-y', pos.y.toFixed(2));
      setVal('#target-pos-z', pos.z.toFixed(2));
      setVal('#target-rot-y', Math.round((rot.y * 180) / Math.PI).toString());
      setVal('#target-scale', scale.x.toFixed(2));

      const distInput = this.element.querySelector('#target-patrol-distance') as HTMLInputElement | null;
      const walkDist = distInput ? parseFloat(distInput.value) || 4.0 : 4.0;
      const half = walkDist / 2;
      const minX = Math.round((pos.x - half) * 100) / 100;
      const maxX = Math.round((pos.x + half) * 100) / 100;
      const rangePreview = this.element.querySelector('#target-patrol-range-preview');
      if (rangePreview) {
        rangePreview.textContent = `Range: [${minX}, ${maxX}]`;
      }
    } else if (sel.type === 'pug') {
      setVal('#pug-pos-x', pos.x.toFixed(2));
      setVal('#pug-pos-y', pos.y.toFixed(2));
      setVal('#pug-pos-z', pos.z.toFixed(2));
      setVal('#pug-rot-y', Math.round((rot.y * 180) / Math.PI).toString());
    } else if (sel.type === 'gun') {
      setVal('#gun-pos-x', pos.x.toFixed(2));
      setVal('#gun-pos-y', pos.y.toFixed(2));
      setVal('#gun-pos-z', pos.z.toFixed(2));
    }
  }

  private setupListeners(): void {
    this.element.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      const tabBtn = target.closest('.tab-btn') as HTMLElement;
      if (tabBtn) {
        this.activeTab = (tabBtn.dataset.tab as TabType) || 'palette';
        if (this.activeTab === 'env' || this.activeTab === 'json') {
          this.state.setSelection(null);
        }
        this.render();
        return;
      }

      const pillBtn = target.closest('.pill-btn') as HTMLElement;
      if (pillBtn) {
        this.selectedCategory = pillBtn.dataset.cat || 'all';
        this.render();
        return;
      }

      const assetCard = target.closest('.asset-card') as HTMLElement;
      if (assetCard) {
        const assetId = assetCard.dataset.assetId;
        const asset = ASSET_CATALOG.find((a) => a.id === assetId);
        if (asset) this.callbacks.onSpawnAsset(asset);
        return;
      }

      if (target.closest('#insp-lock-btn')) {
        this.state.toggleSelectionLock();
        return;
      }
      if (target.closest('#target-weapon-reset-btn')) {
        const sel = this.state.getSelection();
        if (sel?.type === 'target') {
          const t = this.state.getLevel().targets[sel.index];
          const anims = t.animationNames && t.animationNames.length > 0
            ? t.animationNames
            : (t.animationName ? [t.animationName] : []);
          const defPos = getDefaultWeaponPosition(t.weaponModelPath || t.swordModelPath, anims);
          this.state.updateTarget(sel.index, {
            swordPosition: [defPos.x, defPos.y, defPos.z],
            swordRotation: [0, 0, 0],
            swordScale: 1.0,
          }, true);
          this.render();
        }
        return;
      }
      if (target.closest('#target-weapon-flip-btn')) {
        const sel = this.state.getSelection();
        if (sel?.type === 'target') {
          const t = this.state.getLevel().targets[sel.index];
          const curRot = t.swordRotation ? [...t.swordRotation] : [0, 0, 0];
          curRot[1] = (curRot[1] + Math.PI) % (2 * Math.PI);
          this.state.updateTarget(sel.index, {
            swordRotation: [curRot[0], curRot[1], curRot[2]],
          }, true);
          this.render();
        }
        return;
      }
      if (target.closest('#insp-dup-btn')) this.callbacks.onDuplicate();
      if (target.closest('#insp-del-btn')) this.callbacks.onDelete();
      const variantCard = target.closest<HTMLElement>('.chicken-variant-card');
      if (variantCard && !variantCard.classList.contains('disabled')) {
        const variant = variantCard.dataset.variant as 'white' | 'yellow' | 'green';
        const sel = this.state.getSelection();
        if (variant && sel?.type === 'pug') {
          this.state.updatePug(sel.index, { variant }, true);
          this.render();
        }
        return;
      }
      if (target.closest('#json-export-btn')) this.callbacks.onExportJson();
      if (target.closest('#json-import-btn')) this.callbacks.onImportJson();
      if (target.closest('#env-sync-cam-btn')) {
        this.callbacks.onSyncCamera?.();
        const btn = target.closest('#env-sync-cam-btn') as HTMLElement;
        if (btn) {
          const original = btn.innerHTML;
          btn.innerHTML = `${getSvgIcon('check', 13)} <span>View Set!</span>`;
          setTimeout(() => { if (btn) btn.innerHTML = original; }, 1200);
        }
        return;
      }
      if (target.closest('#json-save-btn')) {
        this.state.saveCurrentLevelToStorage();
        const btn = this.element.querySelector('#json-save-btn') as HTMLElement;
        if (btn) btn.innerHTML = `${getSvgIcon('check', 14)} <span>Saved!</span>`;
        setTimeout(() => { if (btn) btn.innerHTML = `${getSvgIcon('save', 14)} <span>Save to Storage</span>`; }, 1400);
      }
    });

    this.element.addEventListener('input', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('asset-search-box')) {
        this.handleAssetSearch((target as HTMLInputElement).value);
        return;
      }
      if (target.classList.contains('anim-search-box')) {
        this.handleAnimSearch(target as HTMLInputElement);
        return;
      }
      this.handleFormChange(target, false);
    });

    this.element.addEventListener('change', (e) => {
      const target = e.target as HTMLElement;
      if (target.getAttribute('name') === 'target-anim-check' || target.getAttribute('name') === 'pug-anim-check') {
        this.handleAnimCheckboxChange(target as HTMLInputElement);
        return;
      }
      this.handleFormChange(target, true);
    });

    this.state.subscribe((event) => {
      if (event.type === 'selection_changed') {
        if (event.selection && this.activeTab !== 'inspector') this.activeTab = 'inspector';
        this.render();
      } else if (event.type === 'level_updated') {
        const isUserTyping = this.element.contains(document.activeElement);
        if (!isUserTyping) {
          this.render();
        }
      }
    });
  }

  private handleAssetSearch(query: string): void {
    this.assetSearchQuery = query;
    const grid = this.element.querySelector('.asset-grid');
    if (grid) grid.innerHTML = renderAssetCards(this.getFilteredAssets());
  }

  private handleAnimSearch(input: HTMLInputElement): void {
    const listId = input.dataset.target;
    if (!listId) return;
    const container = this.element.querySelector(`#${listId}`);
    if (!container) return;
    const q = input.value.trim().toLowerCase();
    const items = container.querySelectorAll<HTMLElement>('.anim-checkbox-item');
    items.forEach((item) => {
      const label = item.dataset.animLabel || '';
      item.style.display = (!q || label.includes(q)) ? 'flex' : 'none';
    });
  }

  private handleAnimCheckboxChange(checkbox: HTMLInputElement): void {
    const isTarget = checkbox.name === 'target-anim-check';
    const listId = isTarget ? 'target-anim-list' : 'pug-anim-list';
    const badgeId = isTarget ? 'target-anim-count-badge' : 'pug-anim-count-badge';
    const pillsId = isTarget ? 'target-anim-pills' : 'pug-anim-pills';

    const container = this.element.querySelector(`#${listId}`);
    if (!container) return;

    let checkedBoxes = Array.from(container.querySelectorAll<HTMLInputElement>(`input[name="${checkbox.name}"]:checked`));

    // Ensure at least one animation remains selected
    if (checkedBoxes.length === 0) {
      checkbox.checked = true;
      checkedBoxes = [checkbox];
    }

    const itemLabel = checkbox.closest('.anim-checkbox-item');
    if (itemLabel) {
      itemLabel.classList.toggle('selected', checkbox.checked);
    }

    // Update count badge
    const badge = this.element.querySelector(`#${badgeId}`);
    if (badge) {
      badge.textContent = `${checkedBoxes.length} selected`;
    }

    // Update pills
    const pillsContainer = this.element.querySelector(`#${pillsId}`);
    if (pillsContainer) {
      const allCheckedItems = Array.from(container.querySelectorAll<HTMLElement>('.anim-checkbox-item')).filter(
        (el) => (el.querySelector('input') as HTMLInputElement)?.checked
      );
      pillsContainer.innerHTML = allCheckedItems.map((item) => {
        const text = item.querySelector('.anim-label-text')?.textContent || '';
        return `<span class="anim-pill-tag">${text}</span>`;
      }).join('');
    }

    const sel = this.state.getSelection();
    if (isTarget && sel?.type === 'target') {
      const animNames = checkedBoxes.map((cb) => cb.value);
      const hasLocomotion = animNames.some((a) => {
        const lower = (a || '').toLowerCase();
        return lower.includes('walk') || lower.includes('jog') || lower.includes('sprint') || lower.includes('run');
      });

      const lvl = this.state.getLevel();
      const curTarget = lvl.targets[sel.index];
      const px = curTarget.position[0];
      const curDist = curTarget.patrolRange ? Math.abs(curTarget.patrolRange[1] - curTarget.patrolRange[0]) : 4.0;
      const halfDist = Math.max(0.2, curDist / 2);
      const minX = Math.round((px - halfDist) * 100) / 100;
      const maxX = Math.round((px + halfDist) * 100) / 100;

      // When walk animation is removed, deactivate patrol completely
      const isPatrolActive = hasLocomotion ? (curTarget.isPatrolling ?? true) : false;

      this.state.updateTarget(sel.index, {
        animationName: animNames[0],
        animationNames: animNames,
        isPatrolling: isPatrolActive,
        patrolRange: isPatrolActive ? (curTarget.patrolRange || [minX, maxX]) : undefined,
        patrolSpeed: isPatrolActive ? (curTarget.patrolSpeed || 1.2) : undefined,
      }, true);

      // Dynamically update inspector controls if present
      const patrolCheck = this.element.querySelector('#target-patrol-enable') as HTMLInputElement | null;
      const patrolControls = this.element.querySelector('#target-patrol-controls') as HTMLElement | null;
      const badge = this.element.querySelector('#target-patrol-status-badge') as HTMLElement | null;
      const distInput = this.element.querySelector('#target-patrol-distance') as HTMLInputElement | null;
      const speedInput = this.element.querySelector('#target-patrol-speed') as HTMLInputElement | null;
      const rangePreview = this.element.querySelector('#target-patrol-range-preview') as HTMLElement | null;

      if (patrolCheck) {
        patrolCheck.disabled = !hasLocomotion;
        patrolCheck.checked = isPatrolActive;
      }
      if (distInput) distInput.disabled = !hasLocomotion;
      if (speedInput) speedInput.disabled = !hasLocomotion;
      if (patrolControls) {
        patrolControls.style.display = (isPatrolActive && hasLocomotion) ? 'block' : 'none';
      }
      if (badge) {
        badge.style.color = hasLocomotion ? '#38bdf8' : '#f59e0b';
        badge.textContent = hasLocomotion ? (isPatrolActive ? 'Patrol Active' : 'Patrol Inactive') : 'Requires Walk Anim';
      }
      if (rangePreview) {
        rangePreview.textContent = `Range: [${minX}, ${maxX}]`;
      }
    } else if (!isTarget && sel?.type === 'pug') {
      const pugAnims = checkedBoxes.map((cb) => cb.value as never);
      this.state.updatePug(sel.index, {
        initialAnimation: pugAnims[0],
        initialAnimations: pugAnims,
      }, true);
    }
  }

  private handleFormChange(target: HTMLElement, pushHistory: boolean): void {
    const sel = this.state.getSelection();
    const lvl = this.state.getLevel();
    const getNum = (id: string, fallback: number) => getInputValueNum(this.element, id, fallback);

    if (sel?.type === 'prop' && lvl.props && lvl.props[sel.index]) {
      const p = lvl.props[sel.index];
      const name = (this.element.querySelector('#prop-name-input') as HTMLInputElement)?.value || p.name;
      const px = getNum('#prop-pos-x', p.position[0]);
      const py = getNum('#prop-pos-y', p.position[1]);
      const pz = getNum('#prop-pos-z', p.position[2]);
      const rxDeg = getNum('#prop-rot-x', Math.round(((p.rotationX ?? 0) * 180) / Math.PI));
      const ryDeg = getNum('#prop-rot-y', Math.round(((p.rotationY ?? 0) * 180) / Math.PI));
      const rzDeg = getNum('#prop-rot-z', Math.round(((p.rotationZ ?? 0) * 180) / Math.PI));
      const scale = getNum('#prop-scale', p.scale ?? 1.0);
      const col = (this.element.querySelector('#prop-collision') as HTMLInputElement)?.checked ?? false;
      const sha = (this.element.querySelector('#prop-shadow') as HTMLInputElement)?.checked ?? true;

      this.state.updateProp(sel.index, {
        name,
        position: [px, py, pz],
        rotationX: (rxDeg * Math.PI) / 180,
        rotationY: (ryDeg * Math.PI) / 180,
        rotationZ: (rzDeg * Math.PI) / 180,
        scale,
        hasCollision: col,
        castShadow: sha,
      }, pushHistory);
      return;
    }

    if (sel?.type === 'target' && lvl.targets[sel.index]) {
      const t = lvl.targets[sel.index];
      const checkedBoxes = Array.from(this.element.querySelectorAll<HTMLInputElement>('input[name="target-anim-check"]:checked')).map((cb) => cb.value);
      const animNames = checkedBoxes.length > 0 ? checkedBoxes : (t.animationNames || [t.animationName]);
      const anim = animNames[0] || t.animationName;
      const speed = getNum('#target-anim-speed', t.animationSpeed ?? 1.0);
      const px = getNum('#target-pos-x', t.position[0]);
      const py = getNum('#target-pos-y', t.position[1]);
      const pz = getNum('#target-pos-z', t.position[2]);
      const ryDeg = getNum('#target-rot-y', Math.round(((t.rotationY ?? 0) * 180) / Math.PI));
      const scale = getNum('#target-scale', t.scale ?? 1.0);

      // Weapon model selection
      const weaponModelSelect = this.element.querySelector('#target-weapon-model') as HTMLSelectElement | null;
      let weaponModelPath: string | undefined = undefined;
      if (weaponModelSelect) {
        const val = weaponModelSelect.value;
        weaponModelPath = val === 'auto' ? undefined : (val === 'none' ? 'none' : val);
      } else {
        weaponModelPath = t.weaponModelPath || t.swordModelPath;
      }

      // Weapon position offset (in meters)
      const defWPos = getDefaultWeaponPosition(weaponModelPath, animNames);
      const curWPos = t.swordPosition || [defWPos.x, defWPos.y, defWPos.z];
      const wpx = getNum('#target-weapon-pos-x', curWPos[0]);
      const wpy = getNum('#target-weapon-pos-y', curWPos[1]);
      const wpz = getNum('#target-weapon-pos-z', curWPos[2]);

      // Weapon rotation offset (in degrees converted to radians)
      const curWRot = t.swordRotation || [0, 0, 0];
      const wrxDeg = getNum('#target-weapon-rot-x', Math.round(((curWRot[0] || 0) * 180) / Math.PI));
      const wryDeg = getNum('#target-weapon-rot-y', Math.round(((curWRot[1] || 0) * 180) / Math.PI));
      const wrzDeg = getNum('#target-weapon-rot-z', Math.round(((curWRot[2] || 0) * 180) / Math.PI));

      // Weapon scale multiplier
      const wScale = Math.max(0.05, getNum('#target-weapon-scale', t.swordScale ?? 1.0));

      // Magic VFX selection
      const magicSelect = this.element.querySelector('#target-magic-fx') as HTMLSelectElement | null;
      let magicFx: 'arcane' | 'fire' | undefined = undefined;
      if (magicSelect) {
        const val = magicSelect.value;
        magicFx = val === 'none' ? undefined : (val as 'arcane' | 'fire');
      } else {
        magicFx = typeof t.magicFx === 'string' && t.magicFx !== 'none'
          ? (t.magicFx as 'arcane' | 'fire')
          : (t.magicFx ? 'arcane' : undefined);
      }

      // Patrol & Walk distance handling
      const hasLocomotion = animNames.some((a) => {
        const lower = (a || '').toLowerCase();
        return lower.includes('walk') || lower.includes('jog') || lower.includes('sprint') || lower.includes('run');
      });
      const patrolEnableCheckbox = this.element.querySelector('#target-patrol-enable') as HTMLInputElement | null;
      const isPatrolEnabled = hasLocomotion && (patrolEnableCheckbox ? patrolEnableCheckbox.checked : false);

      const curDist = t.patrolRange ? Math.abs(t.patrolRange[1] - t.patrolRange[0]) : 4.0;
      const walkDistance = Math.max(0.5, getNum('#target-patrol-distance', curDist));
      const walkSpeed = Math.max(0.2, getNum('#target-patrol-speed', t.patrolSpeed ?? 1.2));

      const halfDist = walkDistance / 2;
      const minX = Math.round((px - halfDist) * 100) / 100;
      const maxX = Math.round((px + halfDist) * 100) / 100;

      const patrolControls = this.element.querySelector('#target-patrol-controls') as HTMLElement | null;
      if (patrolControls) {
        patrolControls.style.display = (isPatrolEnabled && hasLocomotion) ? 'block' : 'none';
      }
      const badge = this.element.querySelector('#target-patrol-status-badge') as HTMLElement | null;
      if (badge) {
        badge.style.color = hasLocomotion ? '#38bdf8' : '#f59e0b';
        badge.textContent = hasLocomotion ? (isPatrolEnabled ? 'Patrol Active' : 'Patrol Inactive') : 'Requires Walk Anim';
      }
      const rangePreview = this.element.querySelector('#target-patrol-range-preview');
      if (rangePreview) {
        rangePreview.textContent = `Range: [${minX}, ${maxX}]`;
      }

      this.state.updateTarget(sel.index, {
        animationName: anim,
        animationNames: animNames,
        animationSpeed: speed,
        position: [px, py, pz],
        rotationY: (ryDeg * Math.PI) / 180,
        scale,
        weaponModelPath,
        swordModelPath: weaponModelPath,
        swordPosition: [wpx, wpy, wpz],
        swordRotation: [(wrxDeg * Math.PI) / 180, (wryDeg * Math.PI) / 180, (wrzDeg * Math.PI) / 180],
        swordScale: wScale,
        magicFx,
        isPatrolling: isPatrolEnabled,
        patrolRange: isPatrolEnabled ? [minX, maxX] : undefined,
        patrolSpeed: isPatrolEnabled ? walkSpeed : undefined,
      }, pushHistory);
      return;
    }

    if (sel?.type === 'pug' && lvl.pugs && lvl.pugs[sel.index]) {
      const pg = lvl.pugs[sel.index];
      const beh = (this.element.querySelector('#pug-behavior-select') as HTMLSelectElement)?.value as 'sit' | 'roam' | 'run' || pg.behaviorMode;
      const checkedPugBoxes = Array.from(this.element.querySelectorAll<HTMLInputElement>('input[name="pug-anim-check"]:checked')).map((cb) => cb.value as never);
      const pugAnims = checkedPugBoxes.length > 0 ? checkedPugBoxes : (pg.initialAnimations || (pg.initialAnimation ? [pg.initialAnimation] : ['idle']));
      const anim = pugAnims[0] || pg.initialAnimation;
      const px = getNum('#pug-pos-x', pg.position[0]);
      const py = getNum('#pug-pos-y', pg.position[1]);
      const pz = getNum('#pug-pos-z', pg.position[2]);
      const ryDeg = getNum('#pug-rot-y', Math.round(((pg.rotationY ?? 0) * 180) / Math.PI));

      this.state.updatePug(sel.index, {
        behaviorMode: beh,
        variant: pg.variant || 'white',
        initialAnimation: anim,
        initialAnimations: pugAnims,
        position: [px, py, pz],
        rotationY: (ryDeg * Math.PI) / 180,
      }, pushHistory);
      return;
    }

    if (sel?.type === 'gun' || target.id.startsWith('gun-')) {
      const cur = lvl.gunSpawnPos || [-2.2, 0.085, 0];
      const px = getNum('#gun-pos-x', cur[0]);
      const py = getNum('#gun-pos-y', cur[1]);
      const pz = 0; // Strictly 0 in 2D gameplay
      const curRot = lvl.gunRotation || [0, 0, 0];
      const rzDeg = getNum('#gun-rot-z', Math.round(((curRot[2] || 0) * 180) / Math.PI));
      const rz = (rzDeg * Math.PI) / 180;
      const curScale = lvl.gunScale ?? 0.52;
      const scale = Math.max(0.1, getNum('#gun-scale', curScale));
      const ammo = Math.max(1, Math.round(getNum('#gun-ammo', lvl.ammo || 5)));
      this.state.updateGun([px, py, pz], [0, 0, rz], ammo, pushHistory, scale);
      return;
    }

    if (target.id.startsWith('env-')) {
      const name = (this.element.querySelector('#env-name-input') as HTMLInputElement)?.value || lvl.name;
      const subInput = this.element.querySelector('#env-sub-input') as HTMLInputElement | null;
      const sub = subInput ? subInput.value : (lvl.subtitle || '');
      const envType = (this.element.querySelector('#env-type-select') as HTMLSelectElement)?.value as 'room' | 'park' | 'custom';
      const skyHex = (this.element.querySelector('#env-sky-color') as HTMLInputElement)?.value || '#8ec5ed';
      const grassHex = (this.element.querySelector('#env-grass-color') as HTMLInputElement)?.value || '#54a84c';
      const camRadVal = parseFloat((this.element.querySelector('#env-cam-radius') as HTMLInputElement)?.value);
      const safeRadius = !isNaN(camRadVal) && camRadVal > 0 ? camRadVal : lvl.cameraRadius;

      if (target.id === 'env-cam-radius' && !isNaN(camRadVal) && camRadVal > 0) {
        this.callbacks.onCameraZoomChange?.(camRadVal);
      }

      this.state.setLevel({
        ...lvl,
        name,
        subtitle: sub,
        environmentType: envType,
        skyColor: hexToRgba(skyHex),
        grassColor: hexToRgb(grassHex),
        cameraRadius: safeRadius,
      }, pushHistory);
    }
  }

  public update(): void {
    this.render();
  }
}
